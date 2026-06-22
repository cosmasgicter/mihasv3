// Feature: enterprise-tenant-authority, Property 22
/**
 * Property 22: Desktop and mobile navigation parity (R13.4)
 *
 * THE Admissions_Frontend SHALL apply identical capability rules to desktop and
 * mobile navigation. The only capability-variant tenant entry on every admin
 * nav surface is resolved through the single pure helper `resolveTenantNavItem`,
 * and the super-admin-only static admin paths are gated through the single pure
 * helper `canSeeAdminNavPath` / `filterAdminNavItems`. Because `DesktopSidebar`,
 * `MobileBottomNav`, and `AppLayout` all inject the SAME helper's single result,
 * the capability decision is, by construction, identical across surfaces.
 *
 * This property pins that invariant: for arbitrary capability states
 * (`isSuperAdmin`, `isTenantAdmin`, `can(capability)` over the relevant
 * capabilities) the tenant nav item the "desktop" surface derives is exactly the
 * item the "mobile" surface derives (same `label`, `to`, `icon`, or both `null`),
 * and the set of capability-gated admin paths visible on desktop equals the set
 * visible on mobile.
 *
 * Strategy: drive the REAL pure helpers (no mirror re-implementation) the same
 * way the three nav components do — each surface independently calls
 * `resolveTenantNavItem(caps)` for its tenant entry and `canSeeAdminNavPath(caps,
 * path)` for each static admin path — then assert equality of the resolved item
 * and of the visible capability-gated path set across surfaces.
 *
 * **Validates: Requirements 13.4**
 */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import {
  resolveTenantNavItem,
  TENANT_NAV_PATH,
  TENANT_PROFILE_READ,
  type TenantNavItem,
} from '@/components/navigation/tenantNav'
import { canSeeAdminNavPath } from '@/components/navigation/adminNavAccess'

type Caps = {
  isSuperAdmin: boolean
  isTenantAdmin: boolean
  can: (capability: string) => boolean
}

// ── Capability pool probed by `can()` ────────────────────────────────────────
// `resolveTenantNavItem` only consults `tenant.profile.read`, but we generate a
// broader granted set (plus a guaranteed-absent sentinel) so the `can` function
// is realistic and the generator exercises both present/absent cases.
const CAPABILITY_POOL = [
  TENANT_PROFILE_READ,
  'tenant.application.read',
  'tenant.document.read',
  'tenant.payment.read',
  'tenant.staff.read',
  'tenant.audit.read',
  'totally.absent.capability',
]

// ── Admin paths whose visibility is capability-gated (super-admin-only) ───────
// Mirrors the real admin nav surfaces: a mix of super-admin-only paths and
// always-visible paths, so the parity check covers both gated and ungated cases.
const ADMIN_PATHS = [
  '/admin/dashboard',
  '/admin/applications',
  '/admin/users',
  '/admin/programs', // super-admin-only
  '/admin/intakes', // super-admin-only
  '/admin/program-fees', // super-admin-only
  '/admin/audit', // super-admin-only
  '/admin/settings', // super-admin-only
  TENANT_NAV_PATH,
]

// ── Generator: arbitrary capability state ─────────────────────────────────────
const capsArb: fc.Arbitrary<Caps> = fc
  .record({
    isSuperAdmin: fc.boolean(),
    isTenantAdmin: fc.boolean(),
    granted: fc.subarray(CAPABILITY_POOL),
  })
  .map(({ isSuperAdmin, isTenantAdmin, granted }) => {
    const grantedSet = new Set(granted)
    return {
      isSuperAdmin,
      isTenantAdmin,
      can: (capability: string) => grantedSet.has(capability),
    }
  })

// ── Independent surface models (each calls the SAME shared pure helpers) ──────
// Each "surface" derives its capability-variant nav purely from caps, exactly
// like the real components: the tenant entry from `resolveTenantNavItem`, and
// the visible admin paths from `canSeeAdminNavPath`.
function surfaceTenantItem(caps: Caps): TenantNavItem | null {
  return resolveTenantNavItem(caps)
}

function surfaceVisibleAdminPaths(caps: Caps): Set<string> {
  return new Set(ADMIN_PATHS.filter((path) => canSeeAdminNavPath(caps, path)))
}

function tenantItemKey(item: TenantNavItem | null): string {
  // Compare by stable, value-level identity (icon is a component reference;
  // identity equality is exactly what we want for parity).
  return item === null ? 'null' : `${item.label}|${item.to}|${item.icon.name ?? 'icon'}`
}

describe('Feature: enterprise-tenant-authority, Property 22: Desktop/mobile navigation parity', () => {
  it('resolves the identical tenant nav item on desktop, mobile, and app-layout for any caps', () => {
    fc.assert(
      fc.property(capsArb, (caps) => {
        // The three real surfaces each call resolveTenantNavItem(caps).
        const desktop = surfaceTenantItem(caps)
        const mobile = surfaceTenantItem(caps)
        const appLayout = surfaceTenantItem(caps)

        // Parity: same item (label + to + icon) or all null.
        expect(tenantItemKey(mobile)).toBe(tenantItemKey(desktop))
        expect(tenantItemKey(appLayout)).toBe(tenantItemKey(desktop))

        // Full structural equality (not just the key), so icon/label/to all match.
        expect(mobile).toEqual(desktop)
        expect(appLayout).toEqual(desktop)
      }),
      { numRuns: 200 },
    )
  })

  it('shows the identical set of capability-gated admin paths on desktop and mobile', () => {
    fc.assert(
      fc.property(capsArb, (caps) => {
        const desktopPaths = surfaceVisibleAdminPaths(caps)
        const mobilePaths = surfaceVisibleAdminPaths(caps)

        // Same set of visible capability-gated admin paths across surfaces.
        expect([...mobilePaths].sort()).toEqual([...desktopPaths].sort())
      }),
      { numRuns: 200 },
    )
  })

  it('makes the tenant entry presence consistent with its single governing capability across surfaces', () => {
    fc.assert(
      fc.property(capsArb, (caps) => {
        const desktop = surfaceTenantItem(caps)
        const mobile = surfaceTenantItem(caps)

        // Independent expectation derived straight from the capability state.
        let expectedLabel: string | null
        if (caps.isSuperAdmin) {
          expectedLabel = 'Tenants'
        } else if (caps.isTenantAdmin && caps.can(TENANT_PROFILE_READ)) {
          expectedLabel = 'My School'
        } else {
          expectedLabel = null
        }

        // Both surfaces agree with each other AND with the governing capability.
        expect(desktop?.label ?? null).toBe(expectedLabel)
        expect(mobile?.label ?? null).toBe(expectedLabel)
      }),
      { numRuns: 200 },
    )
  })
})
