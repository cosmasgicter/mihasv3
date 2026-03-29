import { describe, expect, it } from 'vitest'

import {
  getAdminDisplayName,
  shouldLoadAdminDashboard,
} from '@/pages/admin/lib/dashboardBootstrap'

describe('adminDashboardBootstrap', () => {
  it('allows dashboard data loading as soon as the authenticated user is known', () => {
    expect(shouldLoadAdminDashboard(null)).toBe(false)

    expect(shouldLoadAdminDashboard({
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    })).toBe(true)
  })

  it('uses profile name when available', () => {
    expect(getAdminDisplayName(
      { id: 'profile-1', role: 'admin', full_name: 'Admissions Lead' } as any,
      { id: 'admin-1', email: 'admin@example.com', role: 'admin' } as any,
    )).toBe('Admissions Lead')
  })

  it('falls back to auth user details when profile hydration is still pending', () => {
    expect(getAdminDisplayName(
      null,
      { id: 'admin-1', email: 'ops.team@example.com', role: 'admin' } as any,
    )).toBe('ops.team')
  })

  it('falls back to Admin instead of student-only copy when no user name is available', () => {
    expect(getAdminDisplayName(
      null,
      { id: 'admin-1', email: '', role: 'admin' } as any,
    )).toBe('Admin')
  })
})
