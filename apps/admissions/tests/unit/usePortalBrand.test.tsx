import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Unit tests for `usePortalBrand` — the runtime portal-brand selector over
 * `/api/v1/catalog/context/`.
 *
 * Covers task 22.1 brand logic:
 *  - white-label host → institution brand + offering filter scoped to that
 *    institution (R3.1, R10.6)
 *  - shared portal → Beanola brand, no offering pre-filter / no favouritism
 *    (R3.2, R3.6)
 *  - the Beanola fallback is preserved while context resolves or fails (R3.2)
 *  - no school name is hard-coded: the brand is whatever runtime context carries
 *
 * Validates: Requirements R3.1, R3.2, R3.6, R10.6
 */

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockRequest = vi.fn()
vi.mock('@/services/client', async () => {
  const actual = await vi.importActual<typeof import('@/services/client')>('@/services/client')
  return {
    ...actual,
    apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
    AuthenticationError: class extends Error {},
  }
})

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

import { usePortalBrand, type PortalBrand } from '@/hooks/usePortalBrand'

describe('usePortalBrand', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let latest: PortalBrand | null = null
  let queryClient: QueryClient

  function Harness() {
    latest = usePortalBrand()
    return null
  }

  async function render() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <Harness />
        </QueryClientProvider>
      )
    })
    // Flush the async context query and its resulting re-render.
    for (let i = 0; i < 10 && (latest === null || latest.isLoading); i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
    }
  }

  beforeEach(() => {
    latest = null
    mockRequest.mockReset()
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    queryClient.clear()
  })

  it('resolves the institution brand and scopes offerings on a white-label host', async () => {
    mockRequest.mockResolvedValueOnce({
      portal_type: 'white_label',
      institution_id: 'inst-mihas',
      institution_code: 'MIHAS',
      brand: { name: 'MIHAS Admissions', owner: 'Beanola Technologies' },
    })

    await render()

    expect(latest!.isWhiteLabel).toBe(true)
    expect(latest!.brandName).toBe('MIHAS Admissions')
    // Offerings are filtered to the resolved institution (R10.6).
    expect(latest!.offeringInstitutionId).toBe('inst-mihas')
  })

  it('uses the Beanola brand and no offering filter on the shared portal', async () => {
    mockRequest.mockResolvedValueOnce({
      portal_type: 'shared',
      institution_id: null,
      brand: { name: 'Beanola Admissions', owner: 'Beanola Technologies' },
    })

    await render()

    expect(latest!.isWhiteLabel).toBe(false)
    expect(latest!.brandName).toBe('Beanola Admissions')
    // No single-school favouritism: offerings are not pre-filtered (R3.6).
    expect(latest!.offeringInstitutionId).toBeUndefined()
  })

  it('falls back to the Beanola brand (never a leaked school) when context fails', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network down'))

    await render()

    expect(latest!.isWhiteLabel).toBe(false)
    expect(latest!.brandName).toBe('Beanola Admissions')
    expect(latest!.offeringInstitutionId).toBeUndefined()
  })

  it('does not hard-code a school name: brand derives purely from runtime context', async () => {
    mockRequest.mockResolvedValueOnce({
      portal_type: 'white_label',
      institution_id: 'inst-future-9000',
      institution_code: 'ZZZ',
      brand: { name: 'Zedland College of Future Studies', owner: 'Beanola Technologies' },
    })

    await render()

    expect(latest!.brandName).toBe('Zedland College of Future Studies')
    expect(latest!.offeringInstitutionId).toBe('inst-future-9000')
  })
})
