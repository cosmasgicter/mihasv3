// @vitest-environment jsdom
/**
 * Property-based test — selected institution scope persistence.
 *
 * Feature: enterprise-tenant-authority, Property 23
 *
 * Property 23: Selected institution scope persists across refresh — persisting
 * a selected institution then rehydrating (a fresh mount of `CapabilityContext`)
 * yields the same selected institution. Clearing the selection (`null`) removes
 * it from `sessionStorage` so a fresh mount rehydrates to no selection.
 *
 * `CapabilityContext` persists `selectedInstitutionId` under the shared key
 * `'beanola:admin:selected-institution'` and rehydrates it via its `useState`
 * initializer on mount. Its reconcile effect would drop a *stale, out-of-scope*
 * id, so each run places the chosen id in the mocked actor's scope (alongside a
 * distinct sibling, so the single-institution auto-lock branch never rewrites
 * it). What remains under test is the persist → rehydrate round-trip itself.
 *
 * **Validates: Requirements 11.4**
 */
import React, { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as fc from 'fast-check'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mirrors the shared key in CapabilityContext / InstitutionScopeContext.
const STORAGE_KEY = 'beanola:admin:selected-institution'

// Mutable holder the mocked capability service reads, so each property run can
// place an arbitrary institution id in the actor's scope.
let mockInstitutions: Array<{
  id: string
  code: string
  name: string
  capabilities: string[]
}> = []

// An `admin` role enables the capability query inside the provider.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'admin' } }),
}))

// Backend capability set: non-super-admin scoped to the run's institutions.
vi.mock('@/services/admin/capabilities', () => ({
  adminCapabilityService: {
    getCapabilities: vi.fn(async () => ({
      role: 'admin',
      is_super_admin: false,
      all_access: false,
      capabilities: [] as string[],
      institutions: mockInstitutions,
    })),
  },
}))

// Imported after the mocks so the provider binds to the mocked dependencies.
import { CapabilityProvider, useCapabilities } from '@/contexts/CapabilityContext'

afterEach(() => {
  window.sessionStorage.clear()
  vi.clearAllMocks()
})

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(CapabilityProvider, null, children),
    )
  }
}

// Arbitrary institution id over the *realistic* input space. Institution ids
// are server-issued opaque identifiers (UUIDs), so we draw UUIDs plus arbitrary
// non-blank alphanumeric/hyphen ids. We deliberately exclude empty/whitespace
// ids (the context treats a falsy selection as "none") and reserved object keys
// like `__proto__`/`constructor` — those are not valid institution ids and only
// exercise unrelated object-literal key semantics, not the persistence round
// trip under test (R11.4).
const opaqueIdArb = fc
  .stringMatching(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/)
  .filter((s) => s !== '__proto__' && s !== 'constructor' && s !== 'prototype')
const institutionIdArb = fc.oneof(fc.uuid(), opaqueIdArb)

describe('Property 23: selected institution scope persists across refresh', () => {
  it('persist-then-rehydrate yields the same selected institution', async () => {
    await fc.assert(
      fc.asyncProperty(institutionIdArb, async (institutionId) => {
        window.sessionStorage.clear()

        // Keep the chosen id in scope alongside a distinct sibling so neither
        // reconcile branch (single-institution auto-lock, stale-id clear) fires.
        const sibling = `${institutionId}:sibling`
        mockInstitutions = [
          { id: institutionId, code: '', name: '', capabilities: ['tenant.profile.read'] },
          { id: sibling, code: '', name: '', capabilities: ['tenant.profile.read'] },
        ]

        const client = new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
        const wrapper = makeWrapper(client)

        // First mount: select the institution → persists to sessionStorage.
        const first = renderHook(() => useCapabilities(), { wrapper })
        await waitFor(() => expect(first.result.current.isLoading).toBe(false))
        act(() => {
          first.result.current.setSelectedInstitutionId(institutionId)
        })
        expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(institutionId)
        expect(first.result.current.selectedInstitutionId).toBe(institutionId)
        first.unmount()

        // Fresh mount (simulated refresh): rehydrates from sessionStorage.
        const second = renderHook(() => useCapabilities(), { wrapper })
        // The useState initializer reads sessionStorage synchronously on mount.
        expect(second.result.current.selectedInstitutionId).toBe(institutionId)
        // After capabilities resolve, the in-scope id is retained (not cleared).
        await waitFor(() => expect(second.result.current.isLoading).toBe(false))
        expect(second.result.current.selectedInstitutionId).toBe(institutionId)
        expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(institutionId)
        second.unmount()

        client.clear()
      }),
      { numRuns: 100 },
    )
  })

  it('clearing the selection (null) removes it so a fresh mount has no selection', async () => {
    await fc.assert(
      fc.asyncProperty(institutionIdArb, async (institutionId) => {
        window.sessionStorage.clear()

        const sibling = `${institutionId}:sibling`
        mockInstitutions = [
          { id: institutionId, code: '', name: '', capabilities: ['tenant.profile.read'] },
          { id: sibling, code: '', name: '', capabilities: ['tenant.profile.read'] },
        ]

        const client = new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
        const wrapper = makeWrapper(client)

        const first = renderHook(() => useCapabilities(), { wrapper })
        await waitFor(() => expect(first.result.current.isLoading).toBe(false))
        act(() => {
          first.result.current.setSelectedInstitutionId(institutionId)
        })
        expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(institutionId)

        act(() => {
          first.result.current.setSelectedInstitutionId(null)
        })
        expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()
        expect(first.result.current.selectedInstitutionId).toBeNull()
        first.unmount()

        // Fresh mount: nothing persisted → no selection rehydrated.
        const second = renderHook(() => useCapabilities(), { wrapper })
        expect(second.result.current.selectedInstitutionId).toBeNull()
        await waitFor(() => expect(second.result.current.isLoading).toBe(false))
        expect(second.result.current.selectedInstitutionId).toBeNull()
        second.unmount()

        client.clear()
      }),
      { numRuns: 100 },
    )
  })
})
