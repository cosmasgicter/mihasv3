/**
 * Audit Logger Module
 * 
 * Provides secure audit logging for authentication and authorization events.
 * All logged data is sanitized to remove PII and sensitive information.
 * 
 * REQUIREMENTS:
 * - 9.4: THE Auth_System SHALL log all authentication events to audit_logs table
 * - 9.7: THE Auth_System SHALL sanitize all logged context (no passwords, tokens, secrets)
 * - 8.8: THE Auth_System SHALL log authorization failures to audit_logs
 * 
 * SECURITY NOTES:
 * - Never log passwords, tokens, or secrets
 * - Never log PII (emails, names, phone numbers) in the changes field
 * - Use entity IDs for reference, not user-identifiable information
 * - Sanitize all context data before logging
 */

import { query, QueryConfig } from './_db';
import { AuditQueries, AuditLogInput, AuditEntityType } from './_queries';
import { sanitizeError } from './_errorHandler';

/**
 * Execute a query from a QueryConfig object
 */
async function executeQuery<T = Record<string, unknown>>(config: QueryConfig): Promise<T[]> {
  const result = await query<T>(config.text, config.values);
  return result.rows;
}

/**
 * Sensitive field patterns that should never be logged
 * These patterns are used to detect and remove sensitive data from log context
 */
const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /hash/i,
  /salt/i,
  /bearer/i,
  /cookie/i,
  /session_id/i,
  /refresh/i,
  /access/i,
];

/**
 * PII field patterns that should never be logged
 */
const PII_PATTERNS = [
  /email/i,
  /phone/i,
  /address/i,
  /name/i,
  /ssn/i,
  /national_id/i,
  /passport/i,
  /birth/i,
];

/**
 * Check if a field name contains sensitive data
 */
function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Check if a field name contains PII
 */
function isPIIField(fieldName: string): boolean {
  return PII_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Sanitize a value for logging
 * Removes or masks sensitive information
 */
function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    // Use the error sanitizer to remove PII patterns from strings
    return sanitizeError(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (typeof value === 'object') {
    return sanitizeContext(value as Record<string, unknown>);
  }

  return value;
}

/**
 * Sanitize context object for logging
 * Removes sensitive fields and PII from the context
 * 
 * Requirement 9.7: Sanitize all logged context (no passwords, tokens, secrets)
 * 
 * @param context - Raw context object
 * @returns Sanitized context safe for logging
 */
export function sanitizeContext(context: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!context || typeof context !== 'object') {
    return null;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    // Skip sensitive fields entirely
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    // Mask PII fields
    if (isPIIField(key)) {
      sanitized[key] = '[PII_REDACTED]';
      continue;
    }

    // Recursively sanitize nested objects
    sanitized[key] = sanitizeValue(value);
  }

  return sanitized;
}

/**
 * Extract safe request metadata for logging
 * Only includes non-sensitive request information
 */
function extractRequestMetadata(
  ipAddress?: string | null,
  userAgent?: string | null
): { ip_address: string | null; user_agent: string | null } {
  return {
    // Sanitize IP address (remove if it looks like internal/sensitive)
    ip_address: ipAddress ? sanitizeError(ipAddress).replace('[IP]', ipAddress) : null,
    // Truncate user agent to prevent log bloat
    user_agent: userAgent ? userAgent.substring(0, 500) : null,
  };
}

/**
 * Authentication event types
 */
export type AuthEventType =
  | 'user_login'
  | 'user_logout'
  | 'user_register'
  | 'password_change'
  | 'password_reset'
  | 'token_refresh'
  | 'auth_failure'
  | 'account_locked'
  | 'account_unlocked';


/**
 * Log an authentication event
 * 
 * Requirement 9.4: Log all authentication events to audit_logs table
 * Requirement 9.7: Sanitize all logged context
 * 
 * @param actorId - User ID performing the action (null for failed logins)
 * @param event - Type of authentication event
 * @param success - Whether the event was successful
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @param additionalInfo - Additional context (will be sanitized)
 * 
 * @example
 * await logAuthEvent('user-123', 'user_login', true, '192.168.1.1', 'Mozilla/5.0...');
 * 
 * @example
 * // Failed login - no actor ID
 * await logAuthEvent(null, 'auth_failure', false, '192.168.1.1', 'Mozilla/5.0...', {
 *   reason: 'invalid_credentials'
 * });
 */
export async function logAuthEvent(
  actorId: string | null,
  event: AuthEventType,
  success: boolean,
  ipAddress?: string | null,
  userAgent?: string | null,
  additionalInfo?: Record<string, unknown>
): Promise<void> {
  try {
    // Sanitize any additional info
    const sanitizedInfo = additionalInfo ? sanitizeContext(additionalInfo) : null;
    
    // Build the changes object
    const changes: Record<string, unknown> = {
      success,
      timestamp: new Date().toISOString(),
    };

    if (sanitizedInfo) {
      Object.assign(changes, sanitizedInfo);
    }

    const metadata = extractRequestMetadata(ipAddress, userAgent);

    const input: AuditLogInput = {
      actor_id: actorId,
      action: event,
      entity_type: 'user',
      entity_id: actorId,
      changes,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent,
    };

    await executeQuery(AuditQueries.log(input));
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error('[AuditLogger] Failed to log auth event:', sanitizeError(
      error instanceof Error ? error.message : String(error)
    ));
  }
}

/**
 * Log an authorization failure
 * 
 * Requirement 8.8: Log authorization failures to audit_logs
 * Requirement 9.7: Sanitize all logged context
 * 
 * @param actorId - User ID who attempted the action
 * @param attemptedAction - The action that was attempted
 * @param entityType - Type of entity being accessed
 * @param entityId - ID of the entity being accessed
 * @param requiredPermission - The permission that was required
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * 
 * @example
 * await logAuthorizationFailure(
 *   'user-123',
 *   'delete_user',
 *   'user',
 *   'user-456',
 *   'users:delete',
 *   '192.168.1.1',
 *   'Mozilla/5.0...'
 * );
 */
export async function logAuthorizationFailure(
  actorId: string,
  attemptedAction: string,
  entityType: AuditEntityType,
  entityId: string | null,
  requiredPermission: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  try {
    const metadata = extractRequestMetadata(ipAddress, userAgent);

    await executeQuery(AuditQueries.logAuthorizationFailure(
      actorId,
      attemptedAction,
      entityType,
      entityId,
      requiredPermission,
      metadata.ip_address,
      metadata.user_agent
    ));
  } catch (error) {
    // Log error but don't throw - audit logging should not break the main flow
    console.error('[AuditLogger] Failed to log authorization failure:', sanitizeError(
      error instanceof Error ? error.message : String(error)
    ));
  }
}

/**
 * Log a session event
 * 
 * @param actorId - User ID performing the action
 * @param action - Session action type
 * @param sessionId - ID of the affected session
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 * @param additionalInfo - Additional context (will be sanitized)
 */
export async function logSessionEvent(
  actorId: string,
  action: 'session_create' | 'session_revoke' | 'session_revoke_all',
  sessionId: string | null,
  ipAddress?: string | null,
  userAgent?: string | null,
  additionalInfo?: Record<string, unknown>
): Promise<void> {
  try {
    const sanitizedInfo = additionalInfo ? sanitizeContext(additionalInfo) : undefined;
    const metadata = extractRequestMetadata(ipAddress, userAgent);

    await executeQuery(AuditQueries.logSessionEvent(
      actorId,
      action,
      sessionId,
      metadata.ip_address,
      metadata.user_agent,
      sanitizedInfo || undefined
    ));
  } catch (error) {
    console.error('[AuditLogger] Failed to log session event:', sanitizeError(
      error instanceof Error ? error.message : String(error)
    ));
  }
}

/**
 * Log a generic audit event
 * 
 * @param input - Audit log input (will be sanitized)
 */
export async function logAuditEvent(input: AuditLogInput): Promise<void> {
  try {
    const sanitizedInput: AuditLogInput = {
      ...input,
      changes: input.changes ? sanitizeContext(input.changes) || undefined : undefined,
    };

    await executeQuery(AuditQueries.log(sanitizedInput));
  } catch (error) {
    console.error('[AuditLogger] Failed to log audit event:', sanitizeError(
      error instanceof Error ? error.message : String(error)
    ));
  }
}


/**
 * Log a security event (for Arcjet blocks, suspicious activity, etc.)
 * 
 * @param actorId - User ID if known
 * @param eventType - Type of security event
 * @param details - Event details (will be sanitized)
 * @param ipAddress - Client IP address
 * @param userAgent - Client user agent
 */
export async function logSecurityEvent(
  actorId: string | null,
  eventType: string,
  details: Record<string, unknown>,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  try {
    const sanitizedDetails = sanitizeContext(details);
    const metadata = extractRequestMetadata(ipAddress, userAgent);

    const input: AuditLogInput = {
      actor_id: actorId,
      action: `security_${eventType}`,
      entity_type: 'user',
      entity_id: actorId,
      changes: sanitizedDetails || undefined,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent,
    };

    await executeQuery(AuditQueries.log(input));
  } catch (error) {
    console.error('[AuditLogger] Failed to log security event:', sanitizeError(
      error instanceof Error ? error.message : String(error)
    ));
  }
}

/**
 * Convenience function to log successful login
 */
export async function logLogin(
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null,
  sessionId?: string
): Promise<void> {
  await logAuthEvent(userId, 'user_login', true, ipAddress, userAgent, {
    session_created: !!sessionId,
  });
}

/**
 * Convenience function to log failed login
 */
export async function logFailedLogin(
  reason: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  await logAuthEvent(null, 'auth_failure', false, ipAddress, userAgent, {
    reason: sanitizeError(reason),
  });
}

/**
 * Convenience function to log logout
 */
export async function logLogout(
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  await logAuthEvent(userId, 'user_logout', true, ipAddress, userAgent);
}

/**
 * Convenience function to log token refresh
 */
export async function logTokenRefresh(
  userId: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  await logAuthEvent(userId, 'token_refresh', true, ipAddress, userAgent);
}

/**
 * Convenience function to log account lock
 */
export async function logAccountLocked(
  userId: string,
  reason: string,
  lockDurationMinutes: number,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  await logAuthEvent(userId, 'account_locked', true, ipAddress, userAgent, {
    reason: sanitizeError(reason),
    lock_duration_minutes: lockDurationMinutes,
  });
}

/**
 * Convenience function to log account unlock
 */
export async function logAccountUnlocked(
  userId: string,
  unlockedBy: string,
  ipAddress?: string | null,
  userAgent?: string | null
): Promise<void> {
  await logAuthEvent(userId, 'account_unlocked', true, ipAddress, userAgent, {
    unlocked_by: unlockedBy,
  });
}
