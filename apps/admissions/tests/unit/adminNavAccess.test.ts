import { describe, expect, it } from 'vitest'

import { canSeeAdminNavPath, filterAdminNavItems } from '@/components/navigation/adminNavAccess'

const tenantCaps = { isSuperAdmin: false }
const superCaps = { isSuperAdmin: true }

describe('adminNavAccess', () => {
  it('keeps scoped admin routes visible for tenant admins', () => {
    expect(canSeeAdminNavPath(tenantCaps, '/admin/dashboard')).toBe(true)
    expect(canSeeAdminNavPath(tenantCaps, '/admin/applications')).toBe(true)
    expect(canSeeAdminNavPath(tenantCaps, '/admin/users')).toBe(true)
    expect(canSeeAdminNavPath(tenantCaps, '/admin/tenants')).toBe(true)
  })

  it('hides platform-only routes from tenant admins', () => {
    for (const path of [
      '/admin/programs',
      '/admin/intakes',
      '/admin/program-fees',
      '/admin/audit',
      '/admin/settings',
    ]) {
      expect(canSeeAdminNavPath(tenantCaps, path), path).toBe(false)
    }
  })

  it('normalizes platform-only links before checking tenant visibility', () => {
    expect(canSeeAdminNavPath(tenantCaps, '/admin/settings/')).toBe(false)
    expect(canSeeAdminNavPath(tenantCaps, '/admin/audit?page=2')).toBe(false)
    expect(canSeeAdminNavPath(tenantCaps, '/admin/programs#offerings')).toBe(false)
  })

  it('keeps platform-only routes visible for super admins', () => {
    expect(canSeeAdminNavPath(superCaps, '/admin/programs')).toBe(true)
    expect(canSeeAdminNavPath(superCaps, '/admin/settings')).toBe(true)
  })

  it('filters mixed href/to nav items consistently', () => {
    const filtered = filterAdminNavItems(
      [
        { href: '/admin/dashboard', label: 'Dashboard' },
        { href: '/admin/audit', label: 'Audit' },
        { to: '/admin/users', label: 'Users' },
        { to: '/admin/program-fees', label: 'Fees' },
      ],
      tenantCaps,
    )

    expect(filtered.map((item) => item.label)).toEqual(['Dashboard', 'Users'])
  })
})
