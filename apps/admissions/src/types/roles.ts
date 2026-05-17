/**
 * Canonical role hierarchy — mirror of backend/apps/accounts/permissions.py:ROLE_HIERARCHY.
 *
 * Drift-guard test at apps/admissions/tests/unit/rolesBackendMirror.test.ts
 * keeps this in sync with the backend by reading permissions.py at test time.
 *
 * Use the typed helpers (hasRole, isAdmin, isSuperAdmin, isReviewer, isStudent)
 * instead of raw `user.role === 'admin'` string comparisons. Ad-hoc string
 * comparisons drift over time; helper calls are typed and grep-able.
 */

export type Role = 'super_admin' | 'admin' | 'reviewer' | 'student';

export const ROLE_HIERARCHY: Record<Role, number> = {
  super_admin: 4,
  admin: 3,
  reviewer: 2,
  student: 1,
};

interface RoleHolder {
  role?: string | null;
}

export function hasRole(
  actor: RoleHolder | null | undefined,
  required: Role,
): boolean {
  const actorLevel = ROLE_HIERARCHY[actor?.role as Role] ?? 0;
  return actorLevel >= ROLE_HIERARCHY[required];
}

export function isStudent(actor: RoleHolder | null | undefined): boolean {
  return hasRole(actor, 'student');
}

export function isReviewer(actor: RoleHolder | null | undefined): boolean {
  return hasRole(actor, 'reviewer');
}

export function isAdmin(actor: RoleHolder | null | undefined): boolean {
  return hasRole(actor, 'admin');
}

export function isSuperAdmin(actor: RoleHolder | null | undefined): boolean {
  return hasRole(actor, 'super_admin');
}
