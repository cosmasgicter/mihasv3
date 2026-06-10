import { isSuperAdmin } from '@/types/roles'
import type { User } from '@/types/auth'

/**
 * Dashboard scope resolution (R11.4, R11.5, R11.6).
 *
 * The backend `AdminDashboardView` already bounds every aggregate through
 * `AccessScopeService` and emits a `no_school_access` flag for a non-super-admin
 * caller who has no membership/grant scope. This pure resolver turns the
 * caller's role + that flag into the single dashboard mode the UI renders, so
 * the page never has to re-implement scope logic inline:
 *
 * - `global`   — Super_Admin: cross-school widgets (platform-wide totals plus
 *   the per-institution settlement/audit surfaces under Tenants).
 * - `scoped`   — School_Staff with at least one membership/grant: the same
 *   widgets, but every count is already bounded to their school(s); framed as
 *   "your school", with no cross-school affordances.
 * - `no-scope` — School_Staff with no membership/grant: an explicit
 *   "No school access assigned" state with a support path. The backend returns
 *   correct zeros for an empty scope, so the UI MUST NOT render those counts —
 *   they could be misread as platform-wide totals (R11.6).
 */
export type DashboardScope = 'global' | 'scoped' | 'no-scope'

export interface DashboardScopeInput {
  /** The authenticated caller, used to detect Super_Admin. */
  user: Pick<User, 'role'> | null | undefined
  /** The backend `no_school_access` flag from `GET /api/v1/admin/dashboard/`. */
  noSchoolAccess: boolean
}

export function resolveDashboardScope({ user, noSchoolAccess }: DashboardScopeInput): DashboardScope {
  // Super-admins are always global; the no-scope flag never applies to them
  // because the backend grants them all-access scope before computing it.
  if (isSuperAdmin(user)) {
    return 'global'
  }
  if (noSchoolAccess) {
    return 'no-scope'
  }
  return 'scoped'
}

export function isNoScope(scope: DashboardScope): boolean {
  return scope === 'no-scope'
}

export function isGlobalScope(scope: DashboardScope): boolean {
  return scope === 'global'
}
