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
        first_name, last_name, phone, is_active,
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
        first_name, last_name, phone, is_active,
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
        id, email, role, first_name, last_name,
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
        id, email, role, first_name, last_name,
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
        id, email, role, first_name, last_name,
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
        true, NOW(), NOW(), NOW() + INTERVAL '1 hour'
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
      WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
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
      WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
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
        AND (expires_at < NOW() OR last_activity < NOW() - INTERVAL '1 hour')
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


// ============================================================================
// Application Query Builders
// Task 1: Extend Query Builders for Applications
// ============================================================================

/**
 * Application status enumeration
 */
export const APPLICATION_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  PENDING_DOCUMENTS: 'pending_documents',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ApplicationStatus = typeof APPLICATION_STATUS[keyof typeof APPLICATION_STATUS];

/**
 * Payment status enumeration
 */
export const PAYMENT_STATUS = {
  PENDING_REVIEW: 'pending_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

/**
 * Application record from applications table
 */
export interface ApplicationRecord {
  id: string;
  application_number: string;
  user_id: string;
  full_name: string;
  nrc_number: string | null;
  passport_number: string | null;
  date_of_birth: string;
  sex: 'Male' | 'Female';
  phone: string;
  email: string;
  residence_town: string;
  next_of_kin_name: string | null;
  next_of_kin_phone: string | null;
  program: string;
  intake: string;
  institution: string;
  result_slip_url: string | null;
  extra_kyc_url: string | null;
  application_fee: number;
  payment_method: string | null;
  payer_name: string | null;
  payer_phone: string | null;
  amount: number | null;
  paid_at: string | null;
  momo_ref: string | null;
  pop_url: string | null;
  payment_status: PaymentStatus;
  payment_verified_at: string | null;
  payment_verified_by: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
  public_tracking_code: string | null;
  reviewed_by: string | null;
  review_started_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Application with related data
 */
export interface ApplicationWithDetails extends ApplicationRecord {
  documents?: DocumentRecord[];
  grades?: GradeRecord[];
  status_history?: StatusHistoryRecord[];
}

/**
 * Query builders for applications table operations
 */
export const ApplicationQueries = {
  /**
   * Find all applications (admin only)
   */
  findAll: (limit: number = 100, offset: number = 0): QueryConfig => ({
    text: `
      SELECT *
      FROM applications
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset],
  }),

  /**
   * Find applications by user ID
   */
  findByUserId: (userId: string): QueryConfig => ({
    text: `
      SELECT *
      FROM applications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    values: [userId],
  }),

  /**
   * Find application by ID
   */
  findById: (id: string): QueryConfig => ({
    text: `
      SELECT *
      FROM applications
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Find application by ID with ownership check
   */
  findByIdForUser: (id: string, userId: string): QueryConfig => ({
    text: `
      SELECT *
      FROM applications
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    values: [id, userId],
  }),

  /**
   * Find applications pending review (admin)
   */
  findPendingReview: (): QueryConfig => ({
    text: `
      SELECT *
      FROM applications
      WHERE status = 'submitted'
      ORDER BY submitted_at ASC
    `,
    values: [],
  }),

  /**
   * Find applications by status
   */
  findByStatus: (status: ApplicationStatus): QueryConfig => ({
    text: `
      SELECT *
      FROM applications
      WHERE status = $1
      ORDER BY created_at DESC
    `,
    values: [status],
  }),

  /**
   * Update application status (admin review)
   */
  updateStatus: (
    id: string,
    status: ApplicationStatus,
    reviewedBy: string,
    notes?: string
  ): QueryConfig => ({
    text: `
      UPDATE applications
      SET 
        status = $2,
        reviewed_by = $3,
        review_started_at = COALESCE(review_started_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, status, reviewedBy],
  }),

  /**
   * Update application (general update)
   */
  update: (id: string, data: Partial<ApplicationRecord>): QueryConfig => {
    const fields: string[] = [];
    const values: unknown[] = [id];
    let paramIndex = 2;

    // Build dynamic update query
    const allowedFields = [
      'full_name', 'nrc_number', 'passport_number', 'date_of_birth', 'sex',
      'phone', 'email', 'residence_town', 'next_of_kin_name', 'next_of_kin_phone',
      'program', 'intake', 'institution', 'result_slip_url', 'extra_kyc_url',
      'payment_method', 'payer_name', 'payer_phone', 'amount', 'paid_at',
      'momo_ref', 'pop_url', 'payment_status', 'status', 'submitted_at'
    ];

    for (const field of allowedFields) {
      if (field in data) {
        fields.push(`${field} = $${paramIndex}`);
        values.push((data as Record<string, unknown>)[field]);
        paramIndex++;
      }
    }

    fields.push('updated_at = NOW()');

    return {
      text: `
        UPDATE applications
        SET ${fields.join(', ')}
        WHERE id = $1
        RETURNING *
      `,
      values,
    };
  },

  /**
   * Update payment status
   */
  updatePaymentStatus: (
    id: string,
    paymentStatus: PaymentStatus,
    verifiedBy: string | null
  ): QueryConfig => ({
    text: `
      UPDATE applications
      SET 
        payment_status = $2,
        payment_verified_by = $3,
        payment_verified_at = CASE WHEN $2 = 'verified' THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, paymentStatus, verifiedBy],
  }),

  /**
   * Submit application
   */
  submit: (id: string): QueryConfig => ({
    text: `
      UPDATE applications
      SET 
        status = 'submitted',
        submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `,
    values: [id],
  }),

  /**
   * Delete application (soft delete not implemented - hard delete)
   */
  delete: (id: string): QueryConfig => ({
    text: `
      DELETE FROM applications
      WHERE id = $1
      RETURNING id
    `,
    values: [id],
  }),

  /**
   * Check ownership
   */
  checkOwnership: (id: string, userId: string): QueryConfig => ({
    text: `
      SELECT EXISTS(
        SELECT 1 FROM applications
        WHERE id = $1 AND user_id = $2
      ) as is_owner
    `,
    values: [id, userId],
  }),

  /**
   * Get application summary (minimal fields)
   */
  getSummary: (): QueryConfig => ({
    text: `
      SELECT id, status, created_at
      FROM applications
      ORDER BY created_at DESC
    `,
    values: [],
  }),

  /**
   * Count applications by status
   */
  countByStatus: (status: ApplicationStatus): QueryConfig => ({
    text: `
      SELECT COUNT(*) as count
      FROM applications
      WHERE status = $1
    `,
    values: [status],
  }),

  /**
   * Count all applications
   */
  count: (): QueryConfig => ({
    text: `SELECT COUNT(*) as count FROM applications`,
    values: [],
  }),
};

// ============================================================================
// Document Query Builders
// Task 2: Extend Query Builders for Documents
// ============================================================================

/**
 * Document verification status
 */
export const DOCUMENT_VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
} as const;

export type DocumentVerificationStatus = typeof DOCUMENT_VERIFICATION_STATUS[keyof typeof DOCUMENT_VERIFICATION_STATUS];

/**
 * Document record from application_documents table
 */
export interface DocumentRecord {
  id: string;
  application_id: string;
  document_type: string;
  document_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  system_generated: boolean;
  verification_status: DocumentVerificationStatus;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating a document
 */
export interface DocumentCreateInput {
  id: string;
  applicationId: string;
  documentType: string;
  documentName: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  systemGenerated?: boolean;
}

/**
 * Query builders for application_documents table
 */
export const DocumentQueries = {
  /**
   * Find all documents
   */
  findAll: (limit: number = 100, offset: number = 0): QueryConfig => ({
    text: `
      SELECT *
      FROM application_documents
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset],
  }),

  /**
   * Find documents by application ID
   */
  findByApplicationId: (applicationId: string): QueryConfig => ({
    text: `
      SELECT *
      FROM application_documents
      WHERE application_id = $1
      ORDER BY created_at DESC
    `,
    values: [applicationId],
  }),

  /**
   * Find document by ID
   */
  findById: (id: string): QueryConfig => ({
    text: `
      SELECT *
      FROM application_documents
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Create document record
   */
  create: (doc: DocumentCreateInput): QueryConfig => ({
    text: `
      INSERT INTO application_documents (
        id, application_id, document_type, document_name,
        file_url, file_size, mime_type, system_generated,
        verification_status, uploaded_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW(), NOW())
      RETURNING *
    `,
    values: [
      doc.id,
      doc.applicationId,
      doc.documentType,
      doc.documentName,
      doc.fileUrl,
      doc.fileSize || null,
      doc.mimeType || null,
      doc.systemGenerated || false,
    ],
  }),

  /**
   * Update verification status
   */
  updateVerification: (
    id: string,
    status: DocumentVerificationStatus,
    verifiedBy: string,
    notes?: string
  ): QueryConfig => ({
    text: `
      UPDATE application_documents
      SET 
        verification_status = $2,
        verified_by = $3,
        verified_at = NOW(),
        verification_notes = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, status, verifiedBy, notes || null],
  }),

  /**
   * Delete document
   */
  delete: (id: string): QueryConfig => ({
    text: `
      DELETE FROM application_documents
      WHERE id = $1
      RETURNING id, file_url
    `,
    values: [id],
  }),

  /**
   * Count documents by application
   */
  countByApplication: (applicationId: string): QueryConfig => ({
    text: `
      SELECT COUNT(*) as count
      FROM application_documents
      WHERE application_id = $1
    `,
    values: [applicationId],
  }),
};

// ============================================================================
// Grade Query Builders
// ============================================================================

/**
 * Grade record from application_grades table
 */
export interface GradeRecord {
  id: string;
  application_id: string;
  subject_id: string;
  grade: number;
  created_at: string;
}

/**
 * Query builders for application_grades table
 */
export const GradeQueries = {
  /**
   * Find all grades
   */
  findAll: (limit: number = 100, offset: number = 0): QueryConfig => ({
    text: `
      SELECT *
      FROM application_grades
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset],
  }),

  /**
   * Find grades by application ID
   */
  findByApplicationId: (applicationId: string): QueryConfig => ({
    text: `
      SELECT g.*, s.name as subject_name
      FROM application_grades g
      LEFT JOIN subjects s ON s.id = g.subject_id
      WHERE g.application_id = $1
    `,
    values: [applicationId],
  }),

  /**
   * Create or update grade
   */
  upsert: (applicationId: string, subjectId: string, grade: number): QueryConfig => ({
    text: `
      INSERT INTO application_grades (id, application_id, subject_id, grade, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
      ON CONFLICT (application_id, subject_id) DO UPDATE SET grade = $3
      RETURNING *
    `,
    values: [applicationId, subjectId, grade],
  }),

  /**
   * Delete grades for application
   */
  deleteByApplication: (applicationId: string): QueryConfig => ({
    text: `
      DELETE FROM application_grades
      WHERE application_id = $1
      RETURNING id
    `,
    values: [applicationId],
  }),
};

// ============================================================================
// Status History Query Builders
// ============================================================================

/**
 * Status history record
 */
export interface StatusHistoryRecord {
  id: string;
  application_id: string;
  status: ApplicationStatus;
  changed_by: string;
  notes: string | null;
  created_at: string;
}

/**
 * Query builders for application_status_history table
 */
export const StatusHistoryQueries = {
  /**
   * Create status history entry
   */
  create: (
    applicationId: string,
    status: ApplicationStatus,
    changedBy: string,
    notes?: string
  ): QueryConfig => ({
    text: `
      INSERT INTO application_status_history (
        id, application_id, status, changed_by, notes, created_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
      RETURNING *
    `,
    values: [applicationId, status, changedBy, notes || null],
  }),

  /**
   * Find history by application ID
   */
  findByApplicationId: (applicationId: string): QueryConfig => ({
    text: `
      SELECT *
      FROM application_status_history
      WHERE application_id = $1
      ORDER BY created_at DESC
    `,
    values: [applicationId],
  }),
};

// ============================================================================
// Catalog Query Builders
// Task 3: Extend Query Builders for Catalog
// ============================================================================

/**
 * Program record
 */
export interface ProgramRecord {
  id: string;
  name: string;
  description: string | null;
  duration_years: number;
  department: string | null;
  qualification_level: string | null;
  entry_requirements: string | null;
  fees_per_year: number | null;
  institution_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  institution_name?: string;
  institution_slug?: string;
  institution_full_name?: string;
}

/**
 * Intake record
 */
export interface IntakeRecord {
  id: string;
  name: string;
  year: number;
  semester: string | null;
  start_date: string;
  end_date: string;
  application_deadline: string;
  total_capacity: number;
  available_spots: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Subject record
 */
export interface SubjectRecord {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Query builders for catalog tables (programs, intakes, subjects)
 */
export const CatalogQueries = {
  /**
   * Get all programs
   * Note: Programs table doesn't have institution_id - institutions are separate entities
   */
  getPrograms: (): QueryConfig => ({
    text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, is_active,
        created_at, updated_at
      FROM programs
      ORDER BY created_at DESC
    `,
    values: [],
  }),

  /**
   * Get active programs only
   */
  getActivePrograms: (): QueryConfig => ({
    text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, is_active,
        created_at, updated_at
      FROM programs
      WHERE is_active = true
      ORDER BY name ASC
    `,
    values: [],
  }),

  /**
   * Get program by ID
   */
  getProgramById: (id: string): QueryConfig => ({
    text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, is_active,
        created_at, updated_at
      FROM programs
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Get all intakes
   */
  getIntakes: (): QueryConfig => ({
    text: `
      SELECT *
      FROM intakes
      ORDER BY created_at DESC
    `,
    values: [],
  }),

  /**
   * Get active intakes only
   */
  getActiveIntakes: (): QueryConfig => ({
    text: `
      SELECT *
      FROM intakes
      WHERE is_active = true AND application_deadline > NOW()
      ORDER BY start_date ASC
    `,
    values: [],
  }),

  /**
   * Get intake by ID
   */
  getIntakeById: (id: string): QueryConfig => ({
    text: `
      SELECT *
      FROM intakes
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),

  /**
   * Get all subjects (grade 12)
   */
  getSubjects: (): QueryConfig => ({
    text: `
      SELECT *
      FROM subjects
      WHERE is_active = true
      ORDER BY name ASC
    `,
    values: [],
  }),

  /**
   * Get subject by ID
   */
  getSubjectById: (id: string): QueryConfig => ({
    text: `
      SELECT *
      FROM subjects
      WHERE id = $1
      LIMIT 1
    `,
    values: [id],
  }),
};

// ============================================================================
// Notification Query Builders
// Task 4: Extend Query Builders for Notifications
// ============================================================================

/**
 * Notification preferences record
 */
export interface NotificationPreferencesRecord {
  id: string;
  user_id: string;
  email_enabled: boolean;
  push_enabled: boolean;
  sms_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Push subscription record
 */
export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  created_at: string;
}

/**
 * Query builders for notification tables
 */
export const NotificationQueries = {
  /**
   * Get notification preferences for user
   */
  getPreferences: (userId: string): QueryConfig => ({
    text: `
      SELECT *
      FROM user_notification_preferences
      WHERE user_id = $1
      LIMIT 1
    `,
    values: [userId],
  }),

  /**
   * Create or update notification preferences
   */
  upsertPreferences: (
    userId: string,
    emailEnabled: boolean,
    pushEnabled: boolean,
    smsEnabled: boolean
  ): QueryConfig => ({
    text: `
      INSERT INTO user_notification_preferences (
        id, user_id, email_enabled, push_enabled, sms_enabled, created_at, updated_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        email_enabled = $2,
        push_enabled = $3,
        sms_enabled = $4,
        updated_at = NOW()
      RETURNING *
    `,
    values: [userId, emailEnabled, pushEnabled, smsEnabled],
  }),

  /**
   * Get push subscription for user
   */
  getPushSubscription: (userId: string): QueryConfig => ({
    text: `
      SELECT *
      FROM push_subscriptions
      WHERE user_id = $1
      LIMIT 1
    `,
    values: [userId],
  }),

  /**
   * Create push subscription
   */
  createPushSubscription: (
    userId: string,
    endpoint: string,
    keys: { p256dh: string; auth: string }
  ): QueryConfig => ({
    text: `
      INSERT INTO push_subscriptions (id, user_id, endpoint, keys, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        endpoint = $2,
        keys = $3
      RETURNING *
    `,
    values: [userId, endpoint, JSON.stringify(keys)],
  }),

  /**
   * Delete push subscription
   */
  deletePushSubscription: (userId: string): QueryConfig => ({
    text: `
      DELETE FROM push_subscriptions
      WHERE user_id = $1
      RETURNING id
    `,
    values: [userId],
  }),

  /**
   * Get users with push enabled for notification
   */
  getUsersWithPushEnabled: (): QueryConfig => ({
    text: `
      SELECT ps.*, np.email_enabled
      FROM push_subscriptions ps
      JOIN user_notification_preferences np ON np.user_id = ps.user_id
      WHERE np.push_enabled = true
    `,
    values: [],
  }),
};

// ============================================================================
// Payment Query Builders
// Task 5: Extend Query Builders for Payments
// ============================================================================

/**
 * Query builders for payment-related operations
 */
export const PaymentQueries = {
  /**
   * Get application for receipt generation
   * Includes ownership check for non-admin users
   */
  getApplicationForReceipt: (applicationId: string, userId: string, isAdmin: boolean): QueryConfig => {
    if (isAdmin) {
      return {
        text: `
          SELECT 
            a.*,
            CONCAT(p.first_name, ' ', p.last_name) as applicant_name,
            p.email as applicant_email,
            p.phone as applicant_phone
          FROM applications a
          JOIN profiles p ON p.id = a.user_id
          WHERE a.id = $1
          LIMIT 1
        `,
        values: [applicationId],
      };
    }
    return {
      text: `
        SELECT 
          a.*,
          CONCAT(p.first_name, ' ', p.last_name) as applicant_name,
          p.email as applicant_email,
          p.phone as applicant_phone
        FROM applications a
        JOIN profiles p ON p.id = a.user_id
        WHERE a.id = $1 AND a.user_id = $2
        LIMIT 1
      `,
      values: [applicationId, userId],
    };
  },

  /**
   * Get payment history for user
   */
  getPaymentHistory: (userId: string): QueryConfig => ({
    text: `
      SELECT 
        id, application_number, amount, payment_method,
        payment_status, paid_at, payment_verified_at
      FROM applications
      WHERE user_id = $1 AND amount IS NOT NULL
      ORDER BY paid_at DESC NULLS LAST
    `,
    values: [userId],
  }),

  /**
   * Update payment info
   */
  updatePayment: (
    applicationId: string,
    paymentMethod: string,
    amount: number,
    payerName: string,
    payerPhone: string,
    momoRef?: string,
    popUrl?: string
  ): QueryConfig => ({
    text: `
      UPDATE applications
      SET 
        payment_method = $2,
        amount = $3,
        payer_name = $4,
        payer_phone = $5,
        momo_ref = $6,
        pop_url = $7,
        paid_at = NOW(),
        payment_status = 'pending_review',
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [applicationId, paymentMethod, amount, payerName, payerPhone, momoRef || null, popUrl || null],
  }),
};

// ============================================================================
// Additional Exports
// ============================================================================

export {
  ApplicationQueries as applicationQueries,
  DocumentQueries as documentQueries,
  GradeQueries as gradeQueries,
  StatusHistoryQueries as statusHistoryQueries,
  CatalogQueries as catalogQueries,
  NotificationQueries as notificationQueries,
  PaymentQueries as paymentQueries,
};
