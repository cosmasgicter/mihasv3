/**
 * Role-Based Permissions Module
 * 
 * Provides deterministic permission sets for each user role without database lookup.
 * Permissions are embedded in JWT tokens for fast authorization decisions.
 * 
 * REQUIREMENTS:
 * - 8.1: THE Auth_System SHALL support roles: super_admin, admin, reviewer, student
 * - 8.2: WHEN generating tokens, THE JWT_Manager SHALL embed role-specific permissions in the payload
 * - 8.3: THE Auth_System SHALL define deterministic permission sets for each role without database lookup
 * - 8.4: WHEN a protected route is accessed, THE Auth_System SHALL verify permissions from the token payload
 * - 8.8: THE Auth_System SHALL log all authorization failures to audit_logs
 * 
 * SECURITY NOTES:
 * - Permissions are deterministic and never require database lookup
 * - Role changes require re-authentication to update token claims
 * - All authorization failures are logged to audit_logs without PII
 * - Permission checks use the permissions array from the JWT payload
 */

import type { VercelRequest } from "@vercel/node";
import { AuditQueries, type AuditEntityType } from "../queries";

/**
 * User role constants
 * Requirement 8.1: THE Auth_System SHALL support roles: super_admin, admin, reviewer, student
 */
export const USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  ADMISSIONS_OFFICER: "admissions_officer",
  REGISTRAR: "registrar",
  FINANCE_OFFICER: "finance_officer",
  ACADEMIC_HEAD: "academic_head",
  REVIEWER: "reviewer",
  STUDENT: "student",
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

/**
 * All valid user roles as an array
 * Useful for validation and iteration
 */
export const ALL_USER_ROLES: readonly UserRole[] = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.ADMISSIONS_OFFICER,
  USER_ROLES.REGISTRAR,
  USER_ROLES.FINANCE_OFFICER,
  USER_ROLES.ACADEMIC_HEAD,
  USER_ROLES.REVIEWER,
  USER_ROLES.STUDENT,
] as const;

/**
 * Permission string type for type safety
 * Format: "resource:action" (e.g., "users:read", "applications:write")
 */
export type Permission = string;

/**
 * Role-based permission mapping
 * 
 * Requirement 8.2: WHEN generating tokens, THE JWT_Manager SHALL embed role-specific permissions in the payload
 * Requirement 8.3: THE Auth_System SHALL define deterministic permission sets for each role without database lookup
 * 
 * Permission naming convention:
 * - resource:action - General permission (e.g., "users:read")
 * - resource:action_own - Permission limited to own resources (e.g., "applications:read_own")
 * 
 * IMPORTANT: These permissions are deterministic and embedded in JWT tokens.
 * Any changes here require users to re-authenticate to get updated permissions.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  /**
   * Super Admin - Full system access
   * Can manage all users, applications, programs, payments, documents, analytics, and settings
   */
  super_admin: [
    // User management
    "users:read",
    "users:write",
    "users:delete",
    // Application management
    "applications:read",
    "applications:write",
    "applications:review",
    // Program management
    "programs:read",
    "programs:write",
    // Payment management
    "payments:read",
    "payments:verify",
    // Document management
    "documents:read",
    "documents:verify",
    // Analytics access
    "analytics:read",
    // System settings
    "settings:read",
    "settings:write",
  ],

  /**
   * Admin - Administrative access without full system control
   * Can read users, manage applications, verify payments/documents, view analytics
   */
  admin: [
    // User management (read only)
    "users:read",
    // Application management
    "applications:read",
    "applications:write",
    "applications:review",
    // Program management (read only)
    "programs:read",
    // Payment management
    "payments:read",
    "payments:verify",
    // Document management
    "documents:read",
    "documents:verify",
    // Analytics access
    "analytics:read",
  ],

  /**
   * Admissions Officer - operational application review access
   */
  admissions_officer: [
    "applications:read",
    "applications:review",
    "applications:write",
    "documents:read",
    "documents:verify",
    "payments:read",
  ],

  /**
   * Registrar - academic records and application oversight
   */
  registrar: [
    "applications:read",
    "applications:review",
    "programs:read",
    "documents:read",
    "analytics:read",
  ],

  /**
   * Finance Officer - payment verification access
   */
  finance_officer: [
    "applications:read",
    "payments:read",
    "payments:verify",
    "documents:read",
  ],

  /**
   * Academic Head - review access plus analytics visibility
   */
  academic_head: [
    "applications:read",
    "applications:review",
    "programs:read",
    "documents:read",
    "analytics:read",
  ],

  /**
   * Reviewer - Limited access for application review
   * Can read and review applications, read documents
   */
  reviewer: [
    // Application review
    "applications:read",
    "applications:review",
    // Document access (read only)
    "documents:read",
  ],

  /**
   * Student - Access to own resources only
   * Can manage own applications, documents, payments, and profile
   */
  student: [
    // Own application management
    "applications:create",
    "applications:read_own",
    "applications:update_own",
    // Own document management
    "documents:upload_own",
    "documents:read_own",
    // Own payment management
    "payments:make_own",
    "payments:read_own",
    // Own profile management
    "profile:read_own",
    "profile:update_own",
  ],
};

/**
 * Get permissions for a given role
 * 
 * Returns a copy of the permissions array to prevent mutation.
 * Returns empty array for invalid roles.
 * 
 * @param role - User role to get permissions for
 * @returns Array of permission strings
 * 
 * @example
 * const permissions = getPermissionsForRole("admin");
 * // ["users:read", "applications:read", ...]
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  const permissions = ROLE_PERMISSIONS[role];
  
  if (!permissions) {
    console.warn(`[PERMISSIONS] Unknown role requested: ${role}`);
    return [];
  }
  
  // Return a copy to prevent mutation of the original array
  return [...permissions];
}

/**
 * Check if a role is valid
 * 
 * @param role - Role string to validate
 * @returns true if the role is valid
 * 
 * @example
 * isValidRole("admin") // true
 * isValidRole("invalid") // false
 */
export function isValidRole(role: string): role is UserRole {
  return ALL_USER_ROLES.includes(role as UserRole);
}

/**
 * Check if a user has a specific permission
 * 
 * Requirement 8.4: WHEN a protected route is accessed, THE Auth_System SHALL verify permissions from the token payload
 * 
 * This function checks the permissions array from the JWT payload,
 * not the role directly. This allows for deterministic authorization
 * without database lookup.
 * 
 * @param userPermissions - Array of permissions from the user's JWT token
 * @param requiredPermission - Permission string to check for
 * @returns true if the user has the required permission
 * 
 * @example
 * const userPermissions = ["users:read", "applications:write"];
 * hasPermission(userPermissions, "users:read"); // true
 * hasPermission(userPermissions, "users:delete"); // false
 */
export function hasPermission(
  userPermissions: Permission[],
  requiredPermission: Permission
): boolean {
  if (!Array.isArray(userPermissions)) {
    return false;
  }
  
  return userPermissions.includes(requiredPermission);
}

/**
 * Check if a user has all of the specified permissions
 * 
 * @param userPermissions - Array of permissions from the user's JWT token
 * @param requiredPermissions - Array of permission strings to check for
 * @returns true if the user has all required permissions
 * 
 * @example
 * const userPermissions = ["users:read", "applications:write", "applications:read"];
 * hasAllPermissions(userPermissions, ["users:read", "applications:read"]); // true
 * hasAllPermissions(userPermissions, ["users:read", "users:delete"]); // false
 */
export function hasAllPermissions(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  if (!Array.isArray(userPermissions) || !Array.isArray(requiredPermissions)) {
    return false;
  }
  
  return requiredPermissions.every((permission) =>
    userPermissions.includes(permission)
  );
}

/**
 * Check if a user has any of the specified permissions
 * 
 * @param userPermissions - Array of permissions from the user's JWT token
 * @param requiredPermissions - Array of permission strings to check for
 * @returns true if the user has at least one of the required permissions
 * 
 * @example
 * const userPermissions = ["users:read", "applications:write"];
 * hasAnyPermission(userPermissions, ["users:delete", "applications:write"]); // true
 * hasAnyPermission(userPermissions, ["users:delete", "settings:write"]); // false
 */
export function hasAnyPermission(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  if (!Array.isArray(userPermissions) || !Array.isArray(requiredPermissions)) {
    return false;
  }
  
  return requiredPermissions.some((permission) =>
    userPermissions.includes(permission)
  );
}

/**
 * Check if a role has a specific permission
 * 
 * Convenience function that combines role lookup and permission check.
 * Useful when you have the role but not the permissions array.
 * 
 * @param role - User role to check
 * @param requiredPermission - Permission string to check for
 * @returns true if the role has the required permission
 * 
 * @example
 * roleHasPermission("admin", "users:read"); // true
 * roleHasPermission("student", "users:read"); // false
 */
export function roleHasPermission(
  role: UserRole,
  requiredPermission: Permission
): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  
  if (!permissions) {
    return false;
  }
  
  return permissions.includes(requiredPermission);
}

/**
 * Extract IP address from request
 * Handles various proxy headers for accurate IP detection
 * 
 * @param req - Vercel request object
 * @returns IP address string or null
 */
function extractIpAddress(req: VercelRequest): string | null {
  // Check for forwarded headers (common in proxy setups)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    // Take the first IP in the chain (original client)
    return ips.split(",")[0].trim();
  }
  
  // Check for real IP header (Vercel/Cloudflare)
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  
  // Fallback to socket remote address
  return req.socket?.remoteAddress || null;
}

/**
 * Extract user agent from request
 * 
 * @param req - Vercel request object
 * @returns User agent string or null
 */
function extractUserAgent(req: VercelRequest): string | null {
  const userAgent = req.headers["user-agent"];
  return userAgent ? (Array.isArray(userAgent) ? userAgent[0] : userAgent) : null;
}

/**
 * Log authorization failure to audit_logs
 * 
 * Requirement 8.8: THE Auth_System SHALL log all authorization failures to audit_logs
 * 
 * Logs the authorization failure without exposing PII.
 * Uses the AuditQueries.logAuthorizationFailure query builder.
 * 
 * @param actorId - User ID of the actor attempting the action
 * @param attemptedAction - Description of the action that was attempted
 * @param entityType - Type of entity being accessed
 * @param entityId - ID of the entity being accessed (if applicable)
 * @param requiredPermission - Permission that was required but missing
 * @param req - Vercel request object for IP and user agent extraction
 * 
 * @example
 * await logAuthorizationFailure(
 *   "user-uuid",
 *   "delete_user",
 *   "user",
 *   "target-user-uuid",
 *   "users:delete",
 *   req
 * );
 */
export async function logAuthorizationFailure(
  actorId: string,
  attemptedAction: string,
  entityType: AuditEntityType,
  entityId: string | null,
  requiredPermission: Permission,
  req: VercelRequest
): Promise<void> {
  try {
    const ipAddress = extractIpAddress(req);
    const userAgent = extractUserAgent(req);
    
    const auditQuery = AuditQueries.logAuthorizationFailure(
      actorId,
      attemptedAction,
      entityType,
      entityId,
      requiredPermission,
      ipAddress,
      userAgent
    );
    
    // Lazy import to avoid circular dependencies and test issues
    const { query } = await import("../db");
    await query(auditQuery.text, auditQuery.values);
    
    // Log to console for monitoring (without PII)
    console.log(
      "[PERMISSIONS] Authorization failure logged:",
      `actor=${actorId.substring(0, 8)}...`,
      `action=${attemptedAction}`,
      `entity=${entityType}`,
      `required=${requiredPermission}`
    );
  } catch (error) {
    // Log error but don't throw - audit logging should not break the request
    console.error(
      "[PERMISSIONS] Failed to log authorization failure:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Check permission and log failure if denied
 * 
 * Combines permission check with automatic audit logging on failure.
 * This is the recommended way to check permissions in route handlers.
 * 
 * @param userPermissions - Array of permissions from the user's JWT token
 * @param requiredPermission - Permission string to check for
 * @param actorId - User ID for audit logging
 * @param attemptedAction - Description of the action for audit logging
 * @param entityType - Type of entity being accessed
 * @param entityId - ID of the entity being accessed (if applicable)
 * @param req - Vercel request object for IP and user agent extraction
 * @returns true if the user has the required permission
 * 
 * @example
 * const allowed = await checkPermissionWithAudit(
 *   user.permissions,
 *   "users:delete",
 *   user.userId,
 *   "delete_user",
 *   "user",
 *   targetUserId,
 *   req
 * );
 * if (!allowed) {
 *   return res.status(403).json({ success: false, error: "Insufficient permissions" });
 * }
 */
export async function checkPermissionWithAudit(
  userPermissions: Permission[],
  requiredPermission: Permission,
  actorId: string,
  attemptedAction: string,
  entityType: AuditEntityType,
  entityId: string | null,
  req: VercelRequest
): Promise<boolean> {
  const allowed = hasPermission(userPermissions, requiredPermission);
  
  if (!allowed) {
    await logAuthorizationFailure(
      actorId,
      attemptedAction,
      entityType,
      entityId,
      requiredPermission,
      req
    );
  }
  
  return allowed;
}

/**
 * Get a human-readable description of a permission
 * 
 * Useful for error messages and UI display.
 * 
 * @param permission - Permission string
 * @returns Human-readable description
 * 
 * @example
 * getPermissionDescription("users:delete"); // "Delete users"
 */
export function getPermissionDescription(permission: Permission): string {
  const [resource, action] = permission.split(":");
  
  if (!resource || !action) {
    return permission;
  }
  
  // Capitalize first letter and format
  const formatWord = (word: string) =>
    word.charAt(0).toUpperCase() + word.slice(1).replace(/_/g, " ");
  
  return `${formatWord(action)} ${resource}`;
}

/**
 * Get all permissions for display (grouped by resource)
 * 
 * Useful for admin UI to display permission structure.
 * 
 * @returns Object with resources as keys and permission arrays as values
 * 
 * @example
 * const grouped = getAllPermissionsGrouped();
 * // { users: ["users:read", "users:write", "users:delete"], ... }
 */
export function getAllPermissionsGrouped(): Record<string, Permission[]> {
  const allPermissions = new Set<Permission>();
  
  // Collect all unique permissions from all roles
  for (const permissions of Object.values(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      allPermissions.add(permission);
    }
  }
  
  // Group by resource
  const grouped: Record<string, Permission[]> = {};
  
  for (const permission of allPermissions) {
    const [resource] = permission.split(":");
    if (resource) {
      if (!grouped[resource]) {
        grouped[resource] = [];
      }
      grouped[resource].push(permission);
    }
  }
  
  // Sort permissions within each group
  for (const resource of Object.keys(grouped)) {
    grouped[resource].sort();
  }
  
  return grouped;
}
