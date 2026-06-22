import { describe, expect, it } from 'vitest'
import { Building2, School } from 'lucide-react'

import {
  resolveTenantNavItem,
  TENANT_NAV_PATH,
  TENANT_PROFILE_READ,
} from '@/components/navigation/tenantNav'

/**
 * Feature: enterprise-tenant-authority — capability-gated tenant navigation.
 *
 * Unit coverage for the single shared decision that desktop, mobile, and the
 * app-layout bottom nav all derive from (R13.1, R13.2, R13.3, R13.4).
 */

type Caps = {
  isSuperAdmin: boolean
  isTenantAdmin: boolean
  can: (capability: string) => boolean
}

const caps = (over: Partial<Caps>): Caps => ({
  isSuperAdmin: false,
  isTenantAdmin: false,
  can: () => false,
  ...over,
})

describe('resolveTenantNavItem', () => {
  it('R13.1: a super-admin sees the platform "Tenants" item', () => {
    const item = resolveTenantNavItem(caps({ isSuperAdmin: true, can: () => true }))
    expect(item).not.toBeNull()
    expect(item?.label).toBe('Tenants')
    expect(item?.to).toBe(TENANT_NAV_PATH)
    expect(item?.icon).toBe(Building2)
  })

  it('R13.2: a tenant-admin with tenant.profile.read sees the "My School" item', () => {
    const item = resolveTenantNavItem(
      caps({
        isTenantAdmin: true,
        can: (capability) => capability === TENANT_PROFILE_READ,
      }),
    )
    expect(item).not.toBeNull()
    expect(item?.label).toBe('My School')
    expect(item?.to).toBe(TENANT_NAV_PATH)
    expect(item?.icon).toBe(School)
  })

  it('R13.2/R13.3: a tenant-admin without tenant.profile.read sees no tenant item', () => {
    const item = resolveTenantNavItem(caps({ isTenantAdmin: true, can: () => false }))
    expect(item).toBeNull()
  })

  it('R13.3: a no-access actor sees no tenant item', () => {
    expect(resolveTenantNavItem(caps({}))).toBeNull()
  })

  it('super-admin takes precedence over the tenant-admin branch', () => {
    // A super-admin must always get the platform management item, never "My School".
    const item = resolveTenantNavItem(
      caps({ isSuperAdmin: true, isTenantAdmin: true, can: () => true }),
    )
    expect(item?.label).toBe('Tenants')
  })
})
