/**
 * Backward-compatible re-export of the canonical role helpers.
 *
 * The single source of truth is now @/types/roles. This file is kept as a
 * shim so existing imports continue to work without changes. New code should
 * import from @/types/roles directly.
 *
 * Drift-guard test at apps/admissions/tests/unit/rolesBackendMirror.test.ts
 * keeps the canonical hierarchy in sync with backend/apps/accounts/permissions.py.
 */

import { hasRole, isAdmin, isReviewer, isStudent, isSuperAdmin, ROLE_HIERARCHY, type Role } from '@/types/roles'

export type { Role } from '@/types/roles'
export { ROLE_HIERARCHY, hasRole, isAdmin, isReviewer, isStudent, isSuperAdmin } from '@/types/roles'

// Legacy alias kept for back-compat.
export const ADMIN_ROLES = ['admin', 'super_admin'] as const

export type AdminRole = (typeof ADMIN_ROLES)[number]

/**
 * @deprecated Prefer `isAdmin({ role })` from `@/types/roles`.
 * Kept as a thin wrapper for back-compat.
 */
export function isAdminRole(role?: string | null): role is AdminRole {
  return isAdmin({ role })
}
