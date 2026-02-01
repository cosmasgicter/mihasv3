/**
 * Session Manager
 * 
 * Provides session management functionality for the custom auth system.
 * Handles device session tracking, activity updates, and session invalidation.
 * 
 * Requirements:
 * - 5.1: Create session record with device info and IP on login
 * - 5.2: Deactivate current session on logout
 * - 5.3: Invalidate all sessions when refresh token is revoked
 * - 5.4: Track last activity timestamp for each session
 * - 5.5: Auto-deactivate sessions inactive for 30 days
 * - 5.6: Allow users to view their active sessions
 * - 5.7: Allow users to deactivate sessions on other devices
 * - 5.8: Log all session events to audit_logs table
 * 
 * IMPORTANT: Never log PII (emails, names, phone numbers) in session events.
 * Use user IDs and session IDs only.
 */

import { query } from './db';
import { SessionQueries, AuditQueries, DeviceInfo, SessionRecord, SessionDisplayRecord } from './queries';

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating a new session
 */
export interface CreateSessionInput {
  userId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Result of session creation
 */
export interface CreateSessionResult {
  id: string;
  userId: string;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * Result of session deactivation
 */
export interface DeactivateSessionResult {
  success: boolean;
  sessionId: string;
}

/**
 * Result of deactivating all sessions
 */
export interface DeactivateAllSessionsResult {
  success: boolean;
  deactivatedCount: number;
  sessionIds: string[];
}

/**
 * Result of getting active sessions
 */
export interface GetActiveSessionsResult {
  sessions: SessionDisplayRecord[];
  count: number;
}

/**
 * Result of auto-deactivation cleanup
 */
export interface CleanupExpiredSessionsResult {
  success: boolean;
  deactivatedCount: number;
  sessionIds: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a UUID for session ID
 * Uses crypto.randomUUID() which is available in Bun
 */
function generateSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Parse device info from user agent string
 * Extracts browser, OS, and device type information
 */
export function parseDeviceInfo(userAgent: string | null): DeviceInfo {
  if (!userAgent) {
    return {
      browser: 'Unknown',
      os: 'Unknown',
      device_type: 'unknown',
      is_mobile: false,
    };
  }

  const ua = userAgent.toLowerCase();
  
  // Detect browser
  let browser = 'Unknown';
  let browser_version = '';
  
  if (ua.includes('firefox')) {
    browser = 'Firefox';
    const match = userAgent.match(/Firefox\/(\d+)/i);
    browser_version = match ? match[1] : '';
  } else if (ua.includes('edg/')) {
    browser = 'Edge';
    const match = userAgent.match(/Edg\/(\d+)/i);
    browser_version = match ? match[1] : '';
  } else if (ua.includes('chrome')) {
    browser = 'Chrome';
    const match = userAgent.match(/Chrome\/(\d+)/i);
    browser_version = match ? match[1] : '';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
    const match = userAgent.match(/Version\/(\d+)/i);
    browser_version = match ? match[1] : '';
  } else if (ua.includes('opera') || ua.includes('opr/')) {
    browser = 'Opera';
    const match = userAgent.match(/(?:Opera|OPR)\/(\d+)/i);
    browser_version = match ? match[1] : '';
  }

  // Detect OS
  let os = 'Unknown';
  let os_version = '';
  
  if (ua.includes('windows')) {
    os = 'Windows';
    if (ua.includes('windows nt 10')) os_version = '10';
    else if (ua.includes('windows nt 11')) os_version = '11';
    else if (ua.includes('windows nt 6.3')) os_version = '8.1';
    else if (ua.includes('windows nt 6.2')) os_version = '8';
    else if (ua.includes('windows nt 6.1')) os_version = '7';
  } else if (ua.includes('mac os x')) {
    os = 'macOS';
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/i);
    os_version = match ? match[1].replace('_', '.') : '';
  } else if (ua.includes('linux')) {
    os = 'Linux';
    if (ua.includes('ubuntu')) os_version = 'Ubuntu';
    else if (ua.includes('fedora')) os_version = 'Fedora';
    else if (ua.includes('debian')) os_version = 'Debian';
  } else if (ua.includes('android')) {
    os = 'Android';
    const match = userAgent.match(/Android (\d+)/i);
    os_version = match ? match[1] : '';
  } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    os = 'iOS';
    const match = userAgent.match(/OS (\d+)/i);
    os_version = match ? match[1] : '';
  }

  // Detect device type
  let device_type: DeviceInfo['device_type'] = 'desktop';
  const is_mobile = ua.includes('mobile') || ua.includes('android') || 
                    ua.includes('iphone') || ua.includes('ipod');
  const is_tablet = ua.includes('tablet') || ua.includes('ipad');
  
  if (is_tablet) {
    device_type = 'tablet';
  } else if (is_mobile) {
    device_type = 'mobile';
  }

  return {
    browser,
    browser_version,
    os,
    os_version,
    device_type,
    is_mobile: is_mobile || is_tablet,
  };
}

// ============================================================================
// Session Manager Functions
// ============================================================================

/**
 * Create a new session record
 * Requirement 5.1: Create session record with device info and IP on login
 * Requirement 5.8: Log session creation to audit_logs
 * 
 * @param input - Session creation input with user ID, device info, IP, and user agent
 * @returns Created session details
 */
export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const { userId, deviceInfo, ipAddress, userAgent } = input;
  const sessionId = generateSessionId();

  // Create the session record
  const createQuery = SessionQueries.create(
    sessionId,
    userId,
    deviceInfo,
    ipAddress,
    userAgent
  );

  const result = await query<{
    id: string;
    user_id: string;
    is_active: boolean;
    last_activity: Date;
    created_at: Date;
    expires_at: Date;
  }>(createQuery.text, createQuery.values);

  if (result.rows.length === 0) {
    throw new Error('Failed to create session');
  }

  const session = result.rows[0];

  // Log session creation to audit_logs (Requirement 5.8)
  const auditQuery = AuditQueries.logSessionEvent(
    userId,
    'session_create',
    sessionId,
    ipAddress,
    userAgent,
    {
      device_type: deviceInfo.device_type,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
    }
  );

  // Fire and forget audit log - don't fail session creation if audit fails
  query(auditQuery.text, auditQuery.values).catch((err) => {
    console.error('[SessionManager] Failed to log session creation:', err.message);
  });

  return {
    id: session.id,
    userId: session.user_id,
    isActive: session.is_active,
    lastActivity: new Date(session.last_activity),
    createdAt: new Date(session.created_at),
    expiresAt: new Date(session.expires_at),
  };
}

/**
 * Update session last activity timestamp
 * Requirement 5.4: Track last activity timestamp for each session
 * 
 * @param sessionId - The session ID to update
 * @returns Whether the update was successful
 */
export async function updateActivity(sessionId: string): Promise<boolean> {
  const updateQuery = SessionQueries.updateActivity(sessionId);
  
  const result = await query<{ id: string; last_activity: Date }>(
    updateQuery.text,
    updateQuery.values
  );

  return result.rowCount > 0;
}

/**
 * Deactivate a specific session
 * Requirement 5.2: Deactivate current session on logout
 * Requirement 5.7: Allow users to deactivate sessions on other devices
 * Requirement 5.8: Log session deactivation to audit_logs
 * 
 * @param sessionId - The session ID to deactivate
 * @param userId - The user ID (for audit logging)
 * @param ipAddress - Client IP address (for audit logging)
 * @param userAgent - Client user agent (for audit logging)
 * @returns Deactivation result
 */
export async function deactivateSession(
  sessionId: string,
  userId: string,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<DeactivateSessionResult> {
  const deactivateQuery = SessionQueries.deactivate(sessionId);
  
  const result = await query<{ id: string }>(
    deactivateQuery.text,
    deactivateQuery.values
  );

  const success = result.rowCount > 0;

  // Log session deactivation to audit_logs (Requirement 5.8)
  if (success) {
    const auditQuery = AuditQueries.logSessionEvent(
      userId,
      'session_revoke',
      sessionId,
      ipAddress,
      userAgent
    );

    // Fire and forget audit log
    query(auditQuery.text, auditQuery.values).catch((err) => {
      console.error('[SessionManager] Failed to log session deactivation:', err.message);
    });
  }

  return {
    success,
    sessionId,
  };
}

/**
 * Deactivate all sessions for a user
 * Requirement 5.3: Invalidate all sessions when refresh token is revoked
 * Requirement 5.8: Log session revocation to audit_logs
 * 
 * @param userId - The user ID whose sessions to deactivate
 * @param ipAddress - Client IP address (for audit logging)
 * @param userAgent - Client user agent (for audit logging)
 * @returns Deactivation result with count and session IDs
 */
export async function deactivateAllSessions(
  userId: string,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<DeactivateAllSessionsResult> {
  const deactivateQuery = SessionQueries.deactivateAllForUser(userId);
  
  const result = await query<{ id: string }>(
    deactivateQuery.text,
    deactivateQuery.values
  );

  const sessionIds = result.rows.map(row => row.id);
  const deactivatedCount = result.rowCount;

  // Log session revocation to audit_logs (Requirement 5.8)
  if (deactivatedCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(
      userId,
      'session_revoke_all',
      null, // No specific session ID for revoke-all
      ipAddress,
      userAgent,
      { deactivated_count: deactivatedCount }
    );

    // Fire and forget audit log
    query(auditQuery.text, auditQuery.values).catch((err) => {
      console.error('[SessionManager] Failed to log session revoke-all:', err.message);
    });
  }

  return {
    success: true,
    deactivatedCount,
    sessionIds,
  };
}

/**
 * Get all active sessions for a user
 * Requirement 5.6: Allow users to view their active sessions
 * 
 * @param userId - The user ID to get sessions for
 * @param currentSessionId - Optional current session ID to mark as current
 * @returns List of active sessions with display information
 */
export async function getActiveSessions(
  userId: string,
  currentSessionId?: string
): Promise<GetActiveSessionsResult> {
  const getQuery = SessionQueries.getActiveForUser(userId);
  
  const result = await query<{
    id: string;
    user_id: string;
    device_info: string | DeviceInfo;
    ip_address: string | null;
    user_agent: string | null;
    last_activity: Date;
    created_at: Date;
    expires_at: Date;
  }>(getQuery.text, getQuery.values);

  const sessions: SessionDisplayRecord[] = result.rows.map(row => {
    // Parse device_info if it's a string (from JSON column)
    let deviceInfo: DeviceInfo;
    if (typeof row.device_info === 'string') {
      try {
        deviceInfo = JSON.parse(row.device_info);
      } catch {
        deviceInfo = { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' };
      }
    } else {
      deviceInfo = row.device_info || { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' };
    }

    return {
      id: row.id,
      user_id: row.user_id,
      device_info: deviceInfo,
      ip_address: row.ip_address,
      last_activity: new Date(row.last_activity),
      created_at: new Date(row.created_at),
      is_current: currentSessionId ? row.id === currentSessionId : undefined,
    };
  });

  return {
    sessions,
    count: sessions.length,
  };
}

/**
 * Deactivate all sessions except the current one
 * Requirement 5.7: Allow users to deactivate sessions on other devices
 * Requirement 5.8: Log session revocation to audit_logs
 * 
 * @param userId - The user ID whose sessions to deactivate
 * @param currentSessionId - The current session ID to keep active
 * @param ipAddress - Client IP address (for audit logging)
 * @param userAgent - Client user agent (for audit logging)
 * @returns Deactivation result with count and session IDs
 */
export async function deactivateOtherSessions(
  userId: string,
  currentSessionId: string,
  ipAddress: string | null = null,
  userAgent: string | null = null
): Promise<DeactivateAllSessionsResult> {
  const deactivateQuery = SessionQueries.deactivateAllExcept(userId, currentSessionId);
  
  const result = await query<{ id: string }>(
    deactivateQuery.text,
    deactivateQuery.values
  );

  const sessionIds = result.rows.map(row => row.id);
  const deactivatedCount = result.rowCount;

  // Log session revocation to audit_logs (Requirement 5.8)
  if (deactivatedCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(
      userId,
      'session_revoke_all',
      currentSessionId, // Keep track of which session initiated the revoke
      ipAddress,
      userAgent,
      { 
        deactivated_count: deactivatedCount,
        kept_session: currentSessionId,
      }
    );

    // Fire and forget audit log
    query(auditQuery.text, auditQuery.values).catch((err) => {
      console.error('[SessionManager] Failed to log session revoke-others:', err.message);
    });
  }

  return {
    success: true,
    deactivatedCount,
    sessionIds,
  };
}

/**
 * Cleanup expired and inactive sessions
 * Requirement 5.5: Auto-deactivate sessions inactive for 30 days
 * 
 * This function should be called periodically (e.g., via cron job or on-demand)
 * to clean up stale sessions.
 * 
 * @returns Cleanup result with count of deactivated sessions
 */
export async function cleanupExpiredSessions(): Promise<CleanupExpiredSessionsResult> {
  const cleanupQuery = SessionQueries.deactivateExpired();
  
  const result = await query<{ id: string; user_id: string }>(
    cleanupQuery.text,
    cleanupQuery.values
  );

  const sessionIds = result.rows.map(row => row.id);
  const deactivatedCount = result.rowCount;

  // Log cleanup to console (not audit_logs since this is a system operation)
  if (deactivatedCount > 0) {
    console.log(`[SessionManager] Cleaned up ${deactivatedCount} expired sessions`);
  }

  return {
    success: true,
    deactivatedCount,
    sessionIds,
  };
}

/**
 * Check if a session is valid (active and not expired)
 * 
 * @param sessionId - The session ID to check
 * @returns Whether the session is valid
 */
export async function isSessionValid(sessionId: string): Promise<boolean> {
  const checkQuery = SessionQueries.isValid(sessionId);
  
  const result = await query<{ is_valid: boolean }>(
    checkQuery.text,
    checkQuery.values
  );

  return result.rows.length > 0 && result.rows[0].is_valid === true;
}

/**
 * Get session by ID
 * 
 * @param sessionId - The session ID to retrieve
 * @returns Session record or null if not found
 */
export async function getSessionById(sessionId: string): Promise<SessionRecord | null> {
  const getQuery = SessionQueries.findById(sessionId);
  
  const result = await query<{
    id: string;
    user_id: string;
    device_info: string | DeviceInfo;
    ip_address: string | null;
    user_agent: string | null;
    is_active: boolean;
    last_activity: Date;
    created_at: Date;
    expires_at: Date;
  }>(getQuery.text, getQuery.values);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  
  // Parse device_info if it's a string
  let deviceInfo: DeviceInfo;
  if (typeof row.device_info === 'string') {
    try {
      deviceInfo = JSON.parse(row.device_info);
    } catch {
      deviceInfo = { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' };
    }
  } else {
    deviceInfo = row.device_info || { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' };
  }

  return {
    id: row.id,
    user_id: row.user_id,
    device_info: deviceInfo,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    is_active: row.is_active,
    last_activity: new Date(row.last_activity),
    created_at: new Date(row.created_at),
    expires_at: new Date(row.expires_at),
  };
}

/**
 * Count active sessions for a user
 * 
 * @param userId - The user ID to count sessions for
 * @returns Number of active sessions
 */
export async function countActiveSessions(userId: string): Promise<number> {
  const countQuery = SessionQueries.countActiveForUser(userId);
  
  const result = await query<{ count: string | number }>(
    countQuery.text,
    countQuery.values
  );

  if (result.rows.length === 0) {
    return 0;
  }

  // PostgreSQL returns count as string, convert to number
  const count = result.rows[0].count;
  return typeof count === 'string' ? parseInt(count, 10) : count;
}

/**
 * Extend session expiration
 * 
 * @param sessionId - The session ID to extend
 * @param days - Number of days to extend (default: 30)
 * @returns Whether the extension was successful
 */
export async function extendSessionExpiration(
  sessionId: string,
  days: number = 30
): Promise<boolean> {
  const extendQuery = SessionQueries.extendExpiration(sessionId, days);
  
  const result = await query<{ id: string; expires_at: Date }>(
    extendQuery.text,
    extendQuery.values
  );

  return result.rowCount > 0;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createSession,
  updateActivity,
  deactivateSession,
  deactivateAllSessions,
  getActiveSessions,
  deactivateOtherSessions,
  cleanupExpiredSessions,
  isSessionValid,
  getSessionById,
  countActiveSessions,
  extendSessionExpiration,
  parseDeviceInfo,
};
