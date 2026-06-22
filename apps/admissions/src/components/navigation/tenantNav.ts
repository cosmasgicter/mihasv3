/**
 * Centralized capability-gated tenant navigation decision
 * (enterprise-tenant-authority, R13.1–R13.4).
 *
 * Desktop (`DesktopSidebar`), mobile (`MobileBottomNav`), and the canonical
 * bottom navigation built in `AppLayout` all derive the tenant nav entry from
 * this single source so the three surfaces stay in parity (R13.4). The rule is:
 *
 *   - Super_Admin                         → platform "Tenants" management item.
 *   - Tenant_Admin holding `tenant.profile.read` → school-specific "My School" item.
 *   - anyone else                         → no tenant nav item.
 *
 * Both items point at `/admin/tenants`; the page itself renders the correct
 * console (SuperAdminTenantConsole vs TenantAdminSchoolConsole) from the same
 * capability set. The backend re-enforces every authority decision — this layer
 * is purely a usability mirror.
 */
import { Building2, School, type LucideIcon } from 'lucide-react'

import { useCapabilities, type CapabilityValue } from '@/contexts/CapabilityContext'

/** Shared destination for both the platform and the school-specific entry. */
export const TENANT_NAV_PATH = '/admin/tenants'

/** Capability a tenant-admin must hold to see the "My School" entry (R13.2). */
export const TENANT_PROFILE_READ = 'tenant.profile.read'

export interface TenantNavItem {
  to: string
  label: string
  icon: LucideIcon
}

type TenantNavCapabilities = Pick<
  CapabilityValue,
  'isSuperAdmin' | 'isTenantAdmin' | 'can'
>

/**
 * Pure decision used by every nav surface. Returns the single tenant nav item
 * the actor may see, or `null` when none applies. Kept pure (no hooks) so it is
 * trivially unit/property testable and shared verbatim across desktop + mobile.
 */
export function resolveTenantNavItem(caps: TenantNavCapabilities): TenantNavItem | null {
  // R13.1 / R13.3: platform tenant management (and global create/manage links)
  // are super-admin only.
  if (caps.isSuperAdmin) {
    return { to: TENANT_NAV_PATH, label: 'Tenants', icon: Building2 }
  }

  // R13.2: a tenant-admin holding tenant.profile.read sees a school-specific
  // item instead of the platform tenant-management item.
  if (caps.isTenantAdmin && caps.can(TENANT_PROFILE_READ)) {
    return { to: TENANT_NAV_PATH, label: 'My School', icon: School }
  }

  return null
}

/** Hook wrapper so nav components derive the item from live capabilities. */
export function useTenantNavItem(): TenantNavItem | null {
  const caps = useCapabilities()
  return resolveTenantNavItem(caps)
}
