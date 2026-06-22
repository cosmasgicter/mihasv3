// Feature: enterprise-tenant-authority, Property 21
/**
 * Property 21: Frontend capability derivation
 *
 * For all Capability_Endpoint payloads, the frontend `CapabilityContext` /
 * `useCapabilities` derives:
 *   - `isSuperAdmin` true iff the payload's `is_super_admin` flag is set;
 *   - `isTenantAdmin` true iff the actor is NOT a super-admin AND at least one
 *     institution carries a non-empty capability list;
 *   - `capabilities` equal to the payload's platform-level capability list;
 *   - `institutionCapabilities` equal to the payload's per-institution map;
 *   - `can(c)` true iff `c` is in the platform list (super-admin) or in the
 *     effective institution's tenant set (tenant-admin);
 *   - `canForInstitution(i, c)` true iff `c` is in institution `i`'s set;
 * and the shared capability-gated navigation item (`resolveTenantNavItem`)
 * renders if and only if its governing capability is present:
 *   - Super_Admin                          → platform "Tenants" item;
 *   - Tenant_Admin holding tenant.profile.read (for the effective institution)
 *                                          → school-specific "My School" item;
 *   - anyone else                          → no tenant nav item.
 *
 * Strategy: drive the REAL provider (no mirror re-implementation) by rendering
 * `useCapabilities` through `CapabilityProvider` with a mocked capability
 * service that returns each generated payload, then assert the derived shape
 * and the nav decision against an independent derivation from the payload.
 *
 * **Validates: Requirements 11.1, 11.2, 12.3, 12.4, 12.5, 12.6, 13.1, 13.2, 13.3**
 */
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as fc from 'fast-check'

// ── Mocks (hoisted) ─────────────────────────────────────────────────────────
// The provider enables its capability query only for admin actors and reads the
// resolved set from `adminCapabilityService.getCapabilities()`. We hold a stable
// mock fn and feed it a fresh payload each property run.
const mocks = vi.hoisted(() => ({ getCapabilities: vi.fn() }))

vi.mock('@/services/admin/capabilities', () => ({
  adminCapabilityService: { getCapabilities: mocks.getCapabilities },
}))

// Always an admin actor so the query is enabled. Super-admin authority is NOT
// taken from this role string — it is derived from the payload's
// `is_super_admin` flag (R11.1) — so a constant `admin` role is correct here.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-user', role: 'admin' } }),
}))

import { CapabilityProvider, useCapabilities } from '@/contexts/CapabilityContext'
import type { AdminCapabilitySet } from '@/services/admin/capabilities'
import {
  resolveTenantNavItem,
  TENANT_PROFILE_READ,
} from '@/components/navigation/tenantNav'

// ── Capability catalogue (subset of the canonical 17 + 17 from R2.5/R2.6) ────
const PLATFORM_POOL = [
  'platform.tenant.read_all',
  'platform.tenant.create',
  'platform.tenant.update',
  'platform.tenant.deactivate',
  'platform.domain.manage',
  'platform.user.manage_all',
  'platform.audit.read_all',
  'platform.settings.manage',
]

const TENANT_POOL = [
  'tenant.profile.read',
  'tenant.profile.request_change',
  'tenant.application.read',
  'tenant.application.review',
  'tenant.document.read',
  'tenant.document.verify',
  'tenant.payment.read',
  'tenant.staff.read',
  'tenant.audit.read',
]

// Capabilities probed by can()/canForInstitution(): every known string plus a
// guaranteed-absent sentinel, so both present and absent cases are exercised.
const PROBE_CAPS = [...PLATFORM_POOL, ...TENANT_POOL, 'totally.absent.capability']

// ── Generators ───────────────────────────────────────────────────────────────
const institutionArb = fc.record({
  id: fc.uuid(),
  code: fc.string({ minLength: 1, maxLength: 6 }),
  name: fc.string({ minLength: 1, maxLength: 20 }),
  capabilities: fc.subarray(TENANT_POOL),
})

const payloadArb: fc.Arbitrary<AdminCapabilitySet> = fc
  .record({
    is_super_admin: fc.boolean(),
    capabilities: fc.subarray(PLATFORM_POOL),
    institutions: fc.uniqueArray(institutionArb, {
      maxLength: 4,
      selector: (i) => i.id,
    }),
  })
  .map(({ is_super_admin, capabilities, institutions }) => ({
    role: 'admin',
    is_super_admin,
    all_access: is_super_admin,
    capabilities,
    institutions,
  }))

// ── Independent (mirror-free) expectations derived straight from the payload ──
function expectedInstitutionMap(payload: AdminCapabilitySet): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const inst of payload.institutions) map[inst.id] = inst.capabilities
  return map
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, createElement(CapabilityProvider, null, children))
}

afterEach(() => {
  cleanup()
  mocks.getCapabilities.mockReset()
})

describe('Feature: enterprise-tenant-authority, Property 21: Frontend capability derivation', () => {
  it('derives flags, can()/canForInstitution(), and nav item from any capability payload', async () => {
    await fc.assert(
      fc.asyncProperty(payloadArb, async (payload) => {
        // Isolate every run: clear the persisted scope and use a fresh query
        // client so the provider refetches the new payload (no cache bleed).
        window.sessionStorage.clear()
        mocks.getCapabilities.mockResolvedValue(payload)

        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const { result, unmount } = renderHook(() => useCapabilities(), {
          wrapper: makeWrapper(client),
        })

        const instMap = expectedInstitutionMap(payload)
        const scopedIds = Object.keys(instMap)
        const expectedSuperAdmin = payload.is_super_admin
        const expectedTenantAdmin =
          !expectedSuperAdmin && scopedIds.some((id) => (instMap[id]?.length ?? 0) > 0)

        // Wait for the query to settle. A single-institution tenant-admin is
        // auto-locked to its only institution by the provider's reconcile
        // effect, so wait for that selection before asserting can().
        await waitFor(() => {
          expect(result.current.isLoading).toBe(false)
          expect(result.current.isSuperAdmin).toBe(expectedSuperAdmin)
          if (!expectedSuperAdmin && scopedIds.length === 1) {
            expect(result.current.selectedInstitutionId).toBe(scopedIds[0])
          }
        })

        const caps = result.current

        // R11.1: flags derive from the backend payload, not role strings.
        expect(caps.isSuperAdmin).toBe(expectedSuperAdmin)
        expect(caps.isTenantAdmin).toBe(expectedTenantAdmin)

        // R11.1: capabilities / institutionCapabilities equal the payload.
        expect(caps.capabilities).toEqual(payload.capabilities)
        expect(caps.institutionCapabilities).toEqual(instMap)

        // R11.2 / R12.3-12.6: canForInstitution(i, c) iff c ∈ institution i's set.
        for (const id of scopedIds) {
          for (const c of PROBE_CAPS) {
            expect(caps.canForInstitution(id, c)).toBe(instMap[id]!.includes(c))
          }
        }
        // An unknown institution id can never grant a capability.
        for (const c of PROBE_CAPS) {
          expect(caps.canForInstitution('unknown-institution-id', c)).toBe(false)
        }

        // R11.2: can(c) correctness for the effective authority.
        // - super-admin → platform list membership;
        // - single-institution tenant-admin → that institution's set;
        // - multi-institution tenant-admin with no selection / no-access → false.
        const effectiveId =
          !expectedSuperAdmin && scopedIds.length === 1 ? scopedIds[0]! : null
        for (const c of PROBE_CAPS) {
          let expectedCan: boolean
          if (expectedSuperAdmin) {
            expectedCan = payload.capabilities.includes(c)
          } else if (effectiveId) {
            expectedCan = instMap[effectiveId]!.includes(c)
          } else {
            expectedCan = false
          }
          expect(caps.can(c)).toBe(expectedCan)
        }

        // R13.1 / R13.2 / R13.3: nav item renders iff its governing capability
        // is present. Derive the expectation independently from the payload.
        const navItem = resolveTenantNavItem(caps)
        if (expectedSuperAdmin) {
          // R13.1: super-admin always sees the platform "Tenants" item.
          expect(navItem?.label).toBe('Tenants')
        } else {
          const canProfileRead = effectiveId
            ? instMap[effectiveId]!.includes(TENANT_PROFILE_READ)
            : false
          if (expectedTenantAdmin && canProfileRead) {
            // R13.2: tenant-admin with tenant.profile.read sees "My School".
            expect(navItem?.label).toBe('My School')
          } else {
            // R13.3: no governing capability → no tenant nav item.
            expect(navItem).toBeNull()
          }
        }

        unmount()
        client.clear()
      }),
      { numRuns: 100 },
    )
  })
})
