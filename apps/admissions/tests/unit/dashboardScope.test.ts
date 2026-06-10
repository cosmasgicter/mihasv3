/**
 * Task 23.3 — Scoped vs global dashboards + no-scope empty state (R11.4, R11.5, R11.6).
 *
 * Unit coverage for the pure `resolveDashboardScope` resolver that turns the
 * caller's role + the backend `no_school_access` flag into the single dashboard
 * mode the admin Dashboard renders:
 *
 *   - Super_Admin            → 'global'   (cross-school widgets, R11.4)
 *   - School_Staff w/ scope  → 'scoped'   (scoped widgets only, R11.5)
 *   - School_Staff no scope  → 'no-scope' (no-access state, never zeros, R11.6)
 */
import { describe, it, expect } from 'vitest'

import {
  resolveDashboardScope,
  isNoScope,
  isGlobalScope,
} from '@/pages/admin/lib/dashboardScope'

describe('resolveDashboardScope', () => {
  it('returns "global" for a super_admin (R11.4)', () => {
    expect(
      resolveDashboardScope({ user: { role: 'super_admin' }, noSchoolAccess: false }),
    ).toBe('global')
  })

  it('keeps super_admin global even if the no-scope flag is somehow set', () => {
    // The backend never sets no_school_access for a super-admin, but the
    // resolver must be defensive: role dominates.
    expect(
      resolveDashboardScope({ user: { role: 'super_admin' }, noSchoolAccess: true }),
    ).toBe('global')
  })

  it('returns "scoped" for school staff (admin) with at least one membership/grant (R11.5)', () => {
    expect(
      resolveDashboardScope({ user: { role: 'admin' }, noSchoolAccess: false }),
    ).toBe('scoped')
    expect(
      resolveDashboardScope({ user: { role: 'reviewer' }, noSchoolAccess: false }),
    ).toBe('scoped')
  })

  it('returns "no-scope" for school staff with no membership/grant (R11.6)', () => {
    expect(
      resolveDashboardScope({ user: { role: 'admin' }, noSchoolAccess: true }),
    ).toBe('no-scope')
    expect(
      resolveDashboardScope({ user: { role: 'reviewer' }, noSchoolAccess: true }),
    ).toBe('no-scope')
  })

  it('treats a null/undefined user (no role) as a no-scope non-super-admin', () => {
    expect(resolveDashboardScope({ user: null, noSchoolAccess: true })).toBe('no-scope')
    expect(resolveDashboardScope({ user: undefined, noSchoolAccess: false })).toBe('scoped')
  })

  it('exposes ergonomic guards', () => {
    expect(isNoScope('no-scope')).toBe(true)
    expect(isNoScope('scoped')).toBe(false)
    expect(isGlobalScope('global')).toBe(true)
    expect(isGlobalScope('scoped')).toBe(false)
  })
})
