/**
 * Typed Query Builders
 * 
 * Provides comprehensive typed query builders for common database operations.
 * All queries use plain SQL with parameterized placeholders ($1, $2, etc.)
 * to prevent SQL injection.
 * 
 * Requirements:
 * - 6.7: Provide typed query builders for common operations (users, sessions)
 * - 6.10: Flag any vendor-specific SQL for migration review
 * 
 * IMPORTANT: Never include PII in query strings or error messages.
 * All parameter values are passed separately to prevent SQL injection.
 */

import { QueryConfig } from './db';

// ============================================================================
// TypeScript Interfaces for Database Records
// ============================================================================

/**
 * User role enumeration
 * Matches the role values stored in profiles.role column
 */
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  REVIEWER: 'reviewer',
  STUDENT: 'student',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/**
 * User profile record from profiles table
 * Includes auth-related columns added by auth_security_hardening migration
 */
export interface UserRecord {
  id: string;
  email: string;
  password_hash: string | null;
  refresh_token_hash: string | null;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
  password_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Minimal user record for auth operations
 * Used when we don't need full profile data
 */
export interface UserAuthRecord {
  id: string;
  email: string;
  password_hash: string | null;
  refresh_token_hash: string | null;
  role: UserRole;
  is_active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
}

/**
 * User record for public display (no sensitive fields)
 */
export interface UserPublicRecord {
  id: string;
  email: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Device info stored as JSONB in device_sessions table
 */
export interface DeviceInfo {
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  device_type?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  is_mobile?: boolean;
}

/**
 * Device session record from device_sessions table
 */
export interface SessionRecord {
  id: string;
  user_id: string;
  device_info: DeviceInfo;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_activity: Date;
  created_at: Date;
  expires_at: Date;
}

/**
 * Session record for display (includes parsed device info)
 */
export interface SessionDisplayRecord {
  id: string;
  user_id: string;
  device_info: DeviceInfo;
  ip_address: string | null;
  last_activity: Date;
  created_at: Date;
  is_current?: boolean;
}

/**
 * Audit log action types
 */
export type AuditAction =
  | 'user_login'
  | 'user_logout'
  | 'user_register'
  | 'password_change'
  | 'password_reset'
  | 'token_refresh'
  | 'session_create'
  | 'session_revoke'
  | 'session_revoke_all'
  | 'auth_failure'
  | 'authorization_failure'
  | 'account_locked'
  | 'account_unlocked'
  | 'role_change'
  | 'profile_update'
  | 'create'
  | 'update'
  | 'delete'
  | 'view';

/**
 * Audit log entity types
 */
export type AuditEntityType =
  | 'user'
  | 'session'
  | 'application'
  | 'document'
  | 'payment'
  | 'program'
  | 'intake'
  | 'setting'
  | 'notification';

/**
 * Audit log record from audit_logs table
 * NOTE: Never store PII in the changes field
 */
export interface AuditLogRecord {
  id: string;
  actor_id: string | null;
  action: AuditAction | string;
  entity_type: AuditEntityType | string;
  entity_id: string | null;
  changes: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
}

/**
 * Input for creating audit log entries
 * Sanitized version without auto-generated fields
 */
export interface AuditLogInput {
  actor_id: string | null;
  action: AuditAction | string;
  entity_type: AuditEntityType | string;
  entity_id: string | null;
  changes?: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
}

// ============================================================================
// User Query Builders
// Requirement 6.7: Provide typed query builders for common operations (users)
// ============================================================================

/**
 * Query builders for profiles table operations
 * All queries use parameterized placeholders to prevent SQL injection
 */
export const UserQueries = {
  /**
   * Find user by email address
   * Used during login to retrieve user credentials
   */
  findByEmail: (email: string): QueryConfig => ({
    text: `
      SELECT 
        id, email, password_hash, refresh_token_hash, role,
        first_name, last_name, full_name, phone, is_active,
        failed_login_attempts, locked_until, password_changed_at,
        created_at, updated_at
      FROM profiles
      WHERE email = $1
      LIMIT 1
    `,
    values: [email],
  }),

  /**
   * Find user by ID
   * Used for session validation and profile retrieval
   */
  findById: (id: string): QueryConfig => ({
    text: `
      SELECT 
        id, email, password_hash, refresh_token_hash, role,
        first_name, last_name, full_name, phone, is_active,
        failed_login_attempts, locked_until, password_changed_at,
        created_at, updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Find user by ID (public fields only)
   * Used when sensitive auth fields are not needed
   */
  findByIdPublic: (id: string): QueryConfig => ({
    text: `
      SELECT 
        id, email, role, first_name, last_name, full_name,
        is_active, created_at, updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Find user by refresh token hash
   * Used during token refresh to validate the refresh token
   */
  findByRefreshToken: (tokenHash: string): QueryConfig => ({
    text: `
      SELECT id, email, role, is_active, refresh_token_hash
      FROM profiles
      WHERE refresh_token_hash = $1 AND is_active = true
      LIMIT 1
    `,
    values: [tokenHash],
  }),

  /**
   * Create new user with password hash
   * Used during registration
   * 
   * -- VENDOR: PostgreSQL specific - gen_random_uuid() function
   * -- For Neon migration: gen_random_uuid() is supported
   */
  create: (
    id: string,
    email: string,
    passwordHash: string,
    role: UserRole,
    firstName: string,
    lastName: string
  ): QueryConfig => ({
    text: `
      INSERT INTO profiles (
        id, email, password_hash, role, first_name, last_name,
        is_active, failed_login_attempts, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, 0, NOW(), NOW())
      RETURNING id, email, role, is_active, created_at
    `,
    values: [id, email, passwordHash, role, firstName, lastName],
  }),

  /**
   * Create user without password (for legacy migration)
   * Used when migrating users from Supabase Auth
   */
  createWithoutPassword: (
    id: string,
    email: string,
    role: UserRole,
    firstName: string,
    lastName: string
  ): QueryConfig => ({
    text: `
      INSERT INTO profiles (
        id, email, role, first_name, last_name,
        is_active, failed_login_attempts, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, true, 0, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING id, email, role, is_active
    `,
    values: [id, email, role, firstName, lastName],
  }),

  /**
   * Update user's password hash
   * Used during password change or reset
   */
  updatePassword: (id: string, passwordHash: string): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        password_hash = $2,
        password_changed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id, passwordHash],
  }),

  /**
   * Update user's refresh token hash
   * Used during login and token rotation
   * Pass null to revoke the refresh token
   */
  updateRefreshToken: (id: string, tokenHash: string | null): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        refresh_token_hash = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id, tokenHash],
  }),

  /**
   * Increment failed login attempts
   * Used when login fails to track brute force attempts
   */
  incrementFailedAttempts: (id: string): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING failed_login_attempts
    `,
    values: [id],
  }),

  /**
   * Reset failed login attempts and unlock account
   * Used after successful login
   */
  resetFailedAttempts: (id: string): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id],
  }),

  /**
   * Lock user account until specified time
   * Used after too many failed login attempts
   */
  lockAccount: (id: string, lockUntil: Date): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        locked_until = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, locked_until
    `,
    values: [id, lockUntil],
  }),

  /**
   * Unlock user account
   * Used by admin to manually unlock an account
   */
  unlockAccount: (id: string): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        locked_until = NULL,
        failed_login_attempts = 0,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id],
  }),

  /**
   * Update user role
   * Used by admin to change user permissions
   */
  updateRole: (id: string, role: UserRole): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        role = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, role
    `,
    values: [id, role],
  }),

  /**
   * Deactivate user account
   * Soft delete - preserves data but prevents login
   */
  deactivate: (id: string): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        is_active = false,
        refresh_token_hash = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id],
  }),

  /**
   * Reactivate user account
   */
  reactivate: (id: string): QueryConfig => ({
    text: `
      UPDATE profiles
      SET 
        is_active = true,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id],
  }),

  /**
   * List users with pagination
   * Used by admin for user management
   * 
   * -- VENDOR: PostgreSQL specific - LIMIT/OFFSET syntax
   * -- For Neon migration: LIMIT/OFFSET is standard SQL, supported
   */
  list: (limit: number, offset: number): QueryConfig => ({
    text: `
      SELECT 
        id, email, role, first_name, last_name, full_name,
        is_active, created_at, updated_at
      FROM profiles
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset],
  }),

  /**
   * List users by role with pagination
   */
  listByRole: (role: UserRole, limit: number, offset: number): QueryConfig => ({
    text: `
      SELECT 
        id, email, role, first_name, last_name, full_name,
        is_active, created_at, updated_at
      FROM profiles
      WHERE role = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    values: [role, limit, offset],
  }),

  /**
   * Count total users
   */
  count: (): QueryConfig => ({
    text: `SELECT COUNT(*) as count FROM profiles`,
    values: [],
  }),

  /**
   * Count users by role
   */
  countByRole: (role: UserRole): QueryConfig => ({
    text: `SELECT COUNT(*) as count FROM profiles WHERE role = $1`,
    values: [role],
  }),

  /**
   * Check if email exists
   * Used during registration to prevent duplicates
   */
  emailExists: (email: string): QueryConfig => ({
    text: `SELECT EXISTS(SELECT 1 FROM profiles WHERE email = $1) as exists`,
    values: [email],
  }),
};

// ============================================================================
// Session Query Builders
// Requirement 6.7: Provide typed query builders for common operations (sessions)
// ============================================================================

/**
 * Query builders for device_sessions table operations
 */
export const SessionQueries = {
  /**
   * Create new device session
   * Used when user logs in from a new device
   * 
   * -- VENDOR: PostgreSQL specific - gen_random_uuid(), INTERVAL syntax
   * -- For Neon migration: Both are supported in Neon Postgres
   */
  create: (
    id: string,
    userId: string,
    deviceInfo: DeviceInfo,
    ipAddress: string | null,
    userAgent: string | null
  ): QueryConfig => ({
    text: `
      INSERT INTO device_sessions (
        id, user_id, device_info, ip_address, user_agent,
        is_active, last_activity, created_at, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        true, NOW(), NOW(), NOW() + INTERVAL '30 days'
      )
      RETURNING id, user_id, is_active, last_activity, created_at, expires_at
    `,
    values: [id, userId, JSON.stringify(deviceInfo), ipAddress, userAgent],
  }),

  /**
   * Find session by ID
   */
  findById: (id: string): QueryConfig => ({
    text: `
      SELECT 
        id, user_id, device_info, ip_address, user_agent,
        is_active, last_activity, created_at, expires_at
      FROM device_sessions
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Update session last activity timestamp
   * Called on each authenticated request to track activity
   */
  updateActivity: (id: string): QueryConfig => ({
    text: `
      UPDATE device_sessions
      SET last_activity = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING id, last_activity
    `,
    values: [id],
  }),

  /**
   * Deactivate a specific session
   * Used when user logs out or revokes a session
   */
  deactivate: (id: string): QueryConfig => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE id = $1
      RETURNING id
    `,
    values: [id],
  }),

  /**
   * Deactivate all sessions for a user
   * Used when user changes password or revokes all sessions
   */
  deactivateAllForUser: (userId: string): QueryConfig => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE user_id = $1 AND is_active = true
      RETURNING id
    `,
    values: [userId],
  }),

  /**
   * Deactivate all sessions except current
   * Used when user wants to log out other devices
   */
  deactivateAllExcept: (userId: string, currentSessionId: string): QueryConfig => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE user_id = $1 AND id != $2 AND is_active = true
      RETURNING id
    `,
    values: [userId, currentSessionId],
  }),

  /**
   * Get all active sessions for a user
   * Used to display active sessions in security settings
   */
  getActiveForUser: (userId: string): QueryConfig => ({
    text: `
      SELECT 
        id, user_id, device_info, ip_address, user_agent,
        last_activity, created_at, expires_at
      FROM device_sessions
      WHERE user_id = $1 AND is_active = true
      ORDER BY last_activity DESC
    `,
    values: [userId],
  }),

  /**
   * Count active sessions for a user
   */
  countActiveForUser: (userId: string): QueryConfig => ({
    text: `
      SELECT COUNT(*) as count
      FROM device_sessions
      WHERE user_id = $1 AND is_active = true
    `,
    values: [userId],
  }),

  /**
   * Deactivate expired sessions
   * Used by cleanup job to remove stale sessions
   * 
   * -- VENDOR: PostgreSQL specific - INTERVAL syntax
   * -- For Neon migration: INTERVAL is standard SQL, supported
   */
  deactivateExpired: (): QueryConfig => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE is_active = true 
        AND (expires_at < NOW() OR last_activity < NOW() - INTERVAL '30 days')
      RETURNING id, user_id
    `,
    values: [],
  }),

  /**
   * Delete old inactive sessions
   * Used by cleanup job to remove old session records
   * 
   * -- VENDOR: PostgreSQL specific - INTERVAL syntax
   * -- For Neon migration: INTERVAL is standard SQL, supported
   */
  deleteOldInactive: (daysOld: number): QueryConfig => ({
    text: `
      DELETE FROM device_sessions
      WHERE is_active = false 
        AND created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `,
    values: [daysOld],
  }),

  /**
   * Check if session is valid (active and not expired)
   */
  isValid: (id: string): QueryConfig => ({
    text: `
      SELECT EXISTS(
        SELECT 1 FROM device_sessions
        WHERE id = $1 
          AND is_active = true 
          AND expires_at > NOW()
      ) as is_valid
    `,
    values: [id],
  }),

  /**
   * Extend session expiration
   * Used to keep active sessions alive
   * 
   * -- VENDOR: PostgreSQL specific - INTERVAL syntax
   * -- For Neon migration: INTERVAL is standard SQL, supported
   */
  extendExpiration: (id: string, days: number): QueryConfig => ({
    text: `
      UPDATE device_sessions
      SET 
        expires_at = NOW() + INTERVAL '1 day' * $2,
        last_activity = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING id, expires_at
    `,
    values: [id, days],
  }),
};

// ============================================================================
// Audit Log Query Builders
// Requirement 6.7: Provide typed query builders for common operations
// ============================================================================

/**
 * Query builders for audit_logs table operations
 * 
 * IMPORTANT: Never store PII (emails, names, phone numbers) in audit logs.
 * Use entity IDs and sanitized action descriptions only.
 */
export const AuditQueries = {
  /**
   * Log an audit event
   * Used to record security and state change events
   * 
   * NOTE: The changes parameter should never contain PII.
   * Sanitize all data before passing to this query.
   */
  log: (input: AuditLogInput): QueryConfig => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, created_at
    `,
    values: [
      input.actor_id,
      input.action,
      input.entity_type,
      input.entity_id,
      input.changes ? JSON.stringify(input.changes) : null,
      input.ip_address || null,
      input.user_agent || null,
    ],
  }),

  /**
   * Log authentication event (login, logout, etc.)
   * Convenience method for auth-specific events
   */
  logAuthEvent: (
    actorId: string | null,
    action: 'user_login' | 'user_logout' | 'user_register' | 'password_change' | 'password_reset' | 'token_refresh' | 'auth_failure',
    success: boolean,
    ipAddress: string | null,
    userAgent: string | null,
    additionalInfo?: Record<string, unknown>
  ): QueryConfig => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'user', $1, $3, $4, $5, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      action,
      JSON.stringify({ success, ...additionalInfo }),
      ipAddress,
      userAgent,
    ],
  }),

  /**
   * Log authorization failure
   * Used when a user attempts to access a resource without permission
   */
  logAuthorizationFailure: (
    actorId: string,
    attemptedAction: string,
    entityType: AuditEntityType,
    entityId: string | null,
    requiredPermission: string,
    ipAddress: string | null,
    userAgent: string | null
  ): QueryConfig => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, 'authorization_failure', $2, $3, $4, $5, $6, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      entityType,
      entityId,
      JSON.stringify({
        attempted_action: attemptedAction,
        required_permission: requiredPermission,
      }),
      ipAddress,
      userAgent,
    ],
  }),

  /**
   * Log session event (create, revoke, etc.)
   */
  logSessionEvent: (
    actorId: string,
    action: 'session_create' | 'session_revoke' | 'session_revoke_all',
    sessionId: string | null,
    ipAddress: string | null,
    userAgent: string | null,
    additionalInfo?: Record<string, unknown>
  ): QueryConfig => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'session', $3, $4, $5, $6, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      action,
      sessionId,
      additionalInfo ? JSON.stringify(additionalInfo) : null,
      ipAddress,
      userAgent,
    ],
  }),

  /**
   * Find audit log by ID
   */
  findById: (id: string): QueryConfig => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Get audit logs for a specific entity
   */
  getForEntity: (
    entityType: AuditEntityType,
    entityId: string,
    limit: number = 50
  ): QueryConfig => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    values: [entityType, entityId, limit],
  }),

  /**
   * Get audit logs by actor (user)
   */
  getByActor: (actorId: string, limit: number = 50): QueryConfig => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE actor_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    values: [actorId, limit],
  }),

  /**
   * Get audit logs by action type
   */
  getByAction: (action: AuditAction, limit: number = 50): QueryConfig => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    values: [action, limit],
  }),

  /**
   * Get recent audit logs with pagination
   * Used by admin for audit trail review
   * 
   * -- VENDOR: PostgreSQL specific - LIMIT/OFFSET syntax
   * -- For Neon migration: LIMIT/OFFSET is standard SQL, supported
   */
  getRecent: (limit: number, offset: number): QueryConfig => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset],
  }),

  /**
   * Get audit logs within a date range
   * 
   * -- VENDOR: PostgreSQL specific - TIMESTAMPTZ comparison
   * -- For Neon migration: TIMESTAMPTZ is supported
   */
  getByDateRange: (
    startDate: Date,
    endDate: Date,
    limit: number = 100
  ): QueryConfig => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    values: [startDate, endDate, limit],
  }),

  /**
   * Count audit logs by action type
   * Used for security analytics
   */
  countByAction: (action: AuditAction): QueryConfig => ({
    text: `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = $1
    `,
    values: [action],
  }),

  /**
   * Count failed auth attempts in time window
   * Used for security monitoring
   * 
   * -- VENDOR: PostgreSQL specific - INTERVAL syntax
   * -- For Neon migration: INTERVAL is standard SQL, supported
   */
  countFailedAuthInWindow: (windowMinutes: number): QueryConfig => ({
    text: `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = 'auth_failure'
        AND created_at > NOW() - INTERVAL '1 minute' * $1
    `,
    values: [windowMinutes],
  }),

  /**
   * Delete old audit logs
   * Used by cleanup job to manage table size
   * 
   * -- VENDOR: PostgreSQL specific - INTERVAL syntax
   * -- For Neon migration: INTERVAL is standard SQL, supported
   */
  deleteOlderThan: (daysOld: number): QueryConfig => ({
    text: `
      DELETE FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `,
    values: [daysOld],
  }),
};

// ============================================================================
// Exports
// ============================================================================

export {
  UserQueries as userQueries,
  SessionQueries as sessionQueries,
  AuditQueries as auditQueries,
};
