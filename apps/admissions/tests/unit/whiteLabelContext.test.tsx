/**
 * Exploration — Property P18: white-label host filters offerings + brands from
 * runtime context.
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions (Phase 0, task 1.11;
 * scaffold from task 1.2).
 * Design Testing Strategy P18:
 *   "UI: white-label host filters offerings + brands from runtime context"
 *   → apps/admissions/tests/unit/whiteLabelContext.test.tsx
 *
 * Phase 0 is an exploration baseline. This file exercises the two halves of
 * R3/R10.6 against the CURRENT implementation:
 *
 *   1. Brand resolution — `catalogService.getContext()` normalises the runtime
 *      `/catalog/context/` payload into `{ portal_type, institution_id, brand }`
 *      and falls back to the Beanola shared brand on error (no hard-coded
 *      school). (services/catalog.ts)
 *   2. Offering filtering — `catalogData.useProgramsForIntake`'s query fn
 *      resolves the runtime context and, on a white-label host, forwards that
 *      institution into the canonical-programs request (`{ institution }`),
 *      while the shared portal forwards no institution. (data/catalog.ts →
 *      catalogService.getCanonicalPrograms → buildQueryString)
 *
 * Both halves PASS against current code, so P18 is a passing baseline. Phase 5
 * task 23.4 finalises this file as the durable white-label runtime
 * brand + offering-filtering regression for the shared catalog context, and
 * adds the inactive-domain safe-fallback case (R3.3). Example-based unit file
 * (consistent with the design's P18 placement under tests/unit/); no
 * property-based assertions.
 *
 * **Validates: Requirements R14.8** (and R3.1, R3.2, R3.3, R3.6, R10.6 via P18)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the API client so getContext()/getCanonicalPrograms() resolve
// deterministic payloads and we can inspect the exact endpoints requested.
const mockRequest = vi.fn()
vi.mock('@/services/client', async () => {
  const actual = await vi.importActual<typeof import('@/services/client')>('@/services/client')
  return {
    ...actual,
    apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
    AuthenticationError: class extends Error {},
  }
})

// Silence the service's expected error log on the deliberate failure path
// (the fallback test below triggers logApiError by design).
vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}))

import { catalogService } from '@/services/catalog'

beforeEach(() => {
  mockRequest.mockReset()
})

// ── Half 1: brand derives from runtime context, fails safe to Beanola ─────

describe('P18 (baseline): white-label catalog context brand resolution', () => {
  it('returns white_label context with the institution brand from runtime payload', async () => {
    mockRequest.mockResolvedValueOnce({
      portal_type: 'white_label',
      institution_id: 'inst-mihas',
      institution_code: 'MIHAS',
      brand: { name: 'MIHAS Admissions', owner: 'Beanola Technologies' },
    })

    const context = await catalogService.getContext()

    expect(context.portal_type).toBe('white_label')
    expect(context.institution_id).toBe('inst-mihas')
    // Brand name derives from runtime context, not a hard-coded school name.
    expect(context.brand.name).toBe('MIHAS Admissions')
  })

  it('returns shared Beanola context when the host is not a white-label domain', async () => {
    mockRequest.mockResolvedValueOnce({
      portal_type: 'shared',
      institution_id: null,
      brand: { name: 'Beanola Admissions', owner: 'Beanola Technologies' },
    })

    const context = await catalogService.getContext()

    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
  })

  it('falls back to the shared Beanola brand (never a leaked school) on context failure', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network down'))

    const context = await catalogService.getContext()

    // Fail-safe: shared portal, no institution, Beanola brand.
    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
  })

  it('does not hard-code a school name: the brand is whatever the runtime payload carries', async () => {
    // A future/unknown school the frontend has never heard of must brand purely
    // from runtime context — proving no school name is baked into the client.
    mockRequest.mockResolvedValueOnce({
      portal_type: 'white_label',
      institution_id: 'inst-future-9000',
      institution_code: 'ZZZ',
      brand: { name: 'Zedland College of Future Studies', owner: 'Beanola Technologies' },
    })

    const context = await catalogService.getContext()

    expect(context.portal_type).toBe('white_label')
    expect(context.institution_id).toBe('inst-future-9000')
    expect(context.brand.name).toBe('Zedland College of Future Studies')
  })
})

// ── Half 2: offerings are filtered to the white-label institution ─────────

describe('P18 (baseline): white-label offering filtering from runtime context', () => {
  /**
   * The offering filter lives in `catalogData.useProgramsForIntake`'s query
   * fn, which is the React-Query wrapper around the service. The hook itself
   * needs a React render harness, but the filtering decision is a pure call
   * sequence — `getContext()` then `getCanonicalPrograms({ intake, institution })`
   * — that we reproduce here verbatim to assert the institution is forwarded
   * on white-label and omitted on shared.
   */
  const resolveOfferingsForIntake = async (intakeId: string | null) => {
    const context = await catalogService.getContext()
    const institution =
      context.portal_type === 'white_label' ? context.institution_id || undefined : undefined
    if (!intakeId) return catalogService.getCanonicalPrograms({ institution })
    return catalogService.getCanonicalPrograms({ intake: intakeId, institution })
  }

  it('forwards the white-label institution into the canonical-programs request', async () => {
    mockRequest
      // 1st call: getContext() → white-label MIHAS
      .mockResolvedValueOnce({
        portal_type: 'white_label',
        institution_id: 'inst-mihas',
        brand: { name: 'MIHAS Admissions' },
      })
      // 2nd call: getCanonicalPrograms(...) → offerings list
      .mockResolvedValueOnce({ programs: [] })

    await resolveOfferingsForIntake('intake-2026-jan')

    expect(mockRequest).toHaveBeenCalledTimes(2)
    const offeringsEndpoint = mockRequest.mock.calls[1]![0] as string
    // The white-label institution restricts the candidate offerings.
    expect(offeringsEndpoint).toContain('/catalog/canonical-programs/')
    expect(offeringsEndpoint).toContain('institution=inst-mihas')
    expect(offeringsEndpoint).toContain('intake=intake-2026-jan')
  })

  it('forwards NO institution on the shared Beanola portal (no school favouritism)', async () => {
    mockRequest
      // 1st call: getContext() → shared portal
      .mockResolvedValueOnce({
        portal_type: 'shared',
        institution_id: null,
        brand: { name: 'Beanola Admissions' },
      })
      // 2nd call: getCanonicalPrograms(...) → offerings list
      .mockResolvedValueOnce({ programs: [] })

    await resolveOfferingsForIntake('intake-2026-jan')

    expect(mockRequest).toHaveBeenCalledTimes(2)
    const offeringsEndpoint = mockRequest.mock.calls[1]![0] as string
    expect(offeringsEndpoint).toContain('/catalog/canonical-programs/')
    // No institution filter → the shared portal shows all schools' offerings.
    expect(offeringsEndpoint).not.toContain('institution=')
    expect(offeringsEndpoint).toContain('intake=intake-2026-jan')
  })

  it('uses the runtime institution even when the frontend has never seen that school', async () => {
    mockRequest
      .mockResolvedValueOnce({
        portal_type: 'white_label',
        institution_id: 'inst-future-9000',
        brand: { name: 'Zedland College of Future Studies' },
      })
      .mockResolvedValueOnce({ programs: [] })

    await resolveOfferingsForIntake(null)

    const offeringsEndpoint = mockRequest.mock.calls[1]![0] as string
    expect(offeringsEndpoint).toContain('/catalog/canonical-programs/')
    expect(offeringsEndpoint).toContain('institution=inst-future-9000')
  })

  it('does not filter offerings when an inactive white-label domain falls back to shared (R3.3)', async () => {
    // The backend resolves an inactive domain/institution to a SAFE shared
    // context (Beanola brand, null institution) rather than the inactive
    // school. The client must then forward NO institution filter — it must
    // never expose the inactive school's offerings.
    mockRequest
      .mockResolvedValueOnce({
        portal_type: 'shared',
        institution_id: null,
        brand: { name: 'Beanola Admissions', owner: 'Beanola Technologies' },
      })
      .mockResolvedValueOnce({ programs: [] })

    await resolveOfferingsForIntake('intake-2026-jan')

    const offeringsEndpoint = mockRequest.mock.calls[1]![0] as string
    expect(offeringsEndpoint).toContain('/catalog/canonical-programs/')
    expect(offeringsEndpoint).not.toContain('institution=')
  })
})
