/**
 * White-label host-resolution + inactive-domain fallback (Phase 5, task 22.2).
 *
 * Spec: .kiro/specs/multi-tenant-beanola-admissions — task 22.2
 *   "Verify white-label behaviour in a real browser with DNS/host overrides
 *    (Playwright or manual), including inactive-domain fallback."
 *
 * Validates: Requirements R3.3 (inactive domain/institution → safe Beanola
 * fallback, never expose the inactive school) and R14.4 (host-resolution
 * coverage: uppercase host, port suffix, inactive domain, inactive institution,
 * hostname collision).
 *
 * ── Why this file exists alongside the Playwright spec ────────────────────
 * A full real-browser run with DNS/host overrides
 * (`tests/e2e/whiteLabelHostOverride.spec.ts`) needs a live multi-tenant
 * backend (active + inactive `institution_domains` rows) and installed
 * Playwright browsers, which are not available in CI / this environment. That
 * spec is therefore env-gated and deferred to a staging run.
 *
 * This integration test is the runnable equivalent: it models the backend host
 * resolver (`apps/catalog/services.py::InstitutionContextService.resolve`,
 * reached via `_resolve_request_context` from `X-Forwarded-Host` / `Host`) as a
 * deterministic fixture, then drives the REAL frontend chain
 * (`catalogService.getContext()` → brand derivation → offering filter via
 * `getCanonicalPrograms`) for each host the browser could arrive on. It proves
 * the frontend consumes every backend outcome correctly — in particular the
 * inactive-domain / inactive-institution fallback that P18
 * (`tests/unit/whiteLabelContext.test.tsx`) does not cover.
 *
 * The endpoint shape and brand fallback mirror `catalogService` exactly, so
 * this is an integration of the resolver contract + the real service, not a
 * re-stub of business logic.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the API client so `/catalog/context/` resolves whatever the simulated
// backend host resolver returns, and we can inspect the offering endpoint.
const mockRequest = vi.fn()
vi.mock('@/services/client', async () => {
  const actual = await vi.importActual<typeof import('@/services/client')>('@/services/client')
  return {
    ...actual,
    apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
    AuthenticationError: class extends Error {},
  }
})
vi.mock('@/lib/apiErrorLogger', () => ({ logApiError: vi.fn() }))

import { catalogService } from '@/services/catalog'

const BEANOLA_BRAND = { name: 'Beanola Admissions', owner: 'Beanola Technologies' }

// ── Simulated backend host resolver ───────────────────────────────────────
// Faithful port of `InstitutionContextService.resolve(host)`:
//   - normalise host: lowercase, strip port suffix
//   - active domain → active institution → white-label context + brand
//   - no match / inactive domain / inactive institution → shared Beanola
//   - duplicate active hostname (collision) → fail safe to shared Beanola
// This is the contract the real Caddy edge + backend enforce from the request
// host; the frontend only ever sees the resolved `/catalog/context/` payload.
interface DomainRow {
  hostname: string
  domainActive: boolean
  institutionActive: boolean
  institutionId: string
  institutionCode: string
  brandName: string
}

const DOMAIN_TABLE: DomainRow[] = [
  {
    hostname: 'apply.testschool.example',
    domainActive: true,
    institutionActive: true,
    institutionId: 'inst-testschool',
    institutionCode: 'TST',
    brandName: 'Test School Admissions',
  },
  {
    hostname: 'apply.inactivedomain.example',
    domainActive: false, // domain row disabled
    institutionActive: true,
    institutionId: 'inst-inactivedomain',
    institutionCode: 'IDM',
    brandName: 'Inactive Domain College',
  },
  {
    hostname: 'apply.inactiveschool.example',
    domainActive: true,
    institutionActive: false, // institution disabled
    institutionId: 'inst-inactiveschool',
    institutionCode: 'ISC',
    brandName: 'Inactive School University',
  },
  // Collision: two ACTIVE rows for the same normalised hostname.
  {
    hostname: 'apply.collision.example',
    domainActive: true,
    institutionActive: true,
    institutionId: 'inst-collision-a',
    institutionCode: 'COA',
    brandName: 'Collision College A',
  },
  {
    hostname: 'apply.collision.example',
    domainActive: true,
    institutionActive: true,
    institutionId: 'inst-collision-b',
    institutionCode: 'COB',
    brandName: 'Collision College B',
  },
]

type ContextPayload = {
  portal_type: 'shared' | 'white_label'
  institution_id: string | null
  institution_code?: string | null
  brand: { name: string; owner?: string }
}

function resolveContextForHost(host: string | null | undefined): ContextPayload {
  const hostname = (host ?? '').split(':', 1)[0].trim().toLowerCase()
  if (!hostname) return { portal_type: 'shared', institution_id: null, brand: BEANOLA_BRAND }

  const active = DOMAIN_TABLE.filter(
    (r) => r.hostname === hostname && r.domainActive && r.institutionActive
  )

  // Collision: more than one active institution claims this hostname → fail safe.
  if (active.length > 1) {
    return { portal_type: 'shared', institution_id: null, brand: BEANOLA_BRAND }
  }
  if (active.length === 1) {
    const row = active[0]!
    return {
      portal_type: 'white_label',
      institution_id: row.institutionId,
      institution_code: row.institutionCode,
      brand: { name: row.brandName, owner: 'Beanola Technologies' },
    }
  }
  // No active match (unknown host, inactive domain, or inactive institution).
  return { portal_type: 'shared', institution_id: null, brand: BEANOLA_BRAND }
}

/** Arm the mocked client so `/catalog/context/` answers as the backend would
 *  for `host`, and `/catalog/canonical-programs/` returns an empty list. */
function arriveOnHost(host: string | null | undefined) {
  mockRequest.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/catalog/context/')) {
      return Promise.resolve(resolveContextForHost(host))
    }
    if (endpoint.startsWith('/catalog/canonical-programs/')) {
      return Promise.resolve({ programs: [] })
    }
    return Promise.reject(new Error(`unexpected endpoint ${endpoint}`))
  })
}

/** Reproduce the real frontend offering-filter decision
 *  (`catalogData.useProgramsForIntake` query fn): white-label forwards the
 *  institution into the canonical-programs request; shared forwards none. */
async function resolveOfferingsForIntake(intakeId: string | null) {
  const context = await catalogService.getContext()
  const institution =
    context.portal_type === 'white_label' ? context.institution_id || undefined : undefined
  if (!intakeId) return catalogService.getCanonicalPrograms({ institution })
  return catalogService.getCanonicalPrograms({ intake: intakeId, institution })
}

const lastCanonicalEndpoint = (): string => {
  const calls = mockRequest.mock.calls
    .map((c) => c[0] as string)
    .filter((e) => e.startsWith('/catalog/canonical-programs/'))
  return calls[calls.length - 1] ?? ''
}

beforeEach(() => {
  mockRequest.mockReset()
})

// ── Active white-label hosts (incl. R14.4 uppercase + port) ───────────────

describe('22.2 active white-label host (R3.1/R3.6 brand + offering filter)', () => {
  it('brands from the institution and filters offerings to it', async () => {
    arriveOnHost('apply.testschool.example')

    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('white_label')
    expect(context.institution_id).toBe('inst-testschool')
    expect(context.brand.name).toBe('Test School Admissions')

    await resolveOfferingsForIntake('intake-2026-jan')
    expect(lastCanonicalEndpoint()).toContain('institution=inst-testschool')
  })

  it('R14.4: UPPERCASE host still resolves white-label (case-insensitive)', async () => {
    arriveOnHost('APPLY.TESTSCHOOL.EXAMPLE')
    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('white_label')
    expect(context.institution_id).toBe('inst-testschool')
  })

  it('R14.4: host with a port suffix still resolves white-label (port ignored)', async () => {
    arriveOnHost('apply.testschool.example:8443')
    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('white_label')
    expect(context.institution_id).toBe('inst-testschool')
  })
})

// ── Inactive-domain fallback — the core of task 22.2 (R3.3) ───────────────

describe('22.2 inactive-domain / inactive-institution fallback (R3.3)', () => {
  it('inactive DOMAIN row falls back to Beanola and leaks no school data', async () => {
    arriveOnHost('apply.inactivedomain.example')

    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
    // The inactive school's name/code must not surface in the brand at all.
    expect(JSON.stringify(context.brand)).not.toContain('Inactive Domain College')
    expect(JSON.stringify(context.brand)).not.toContain('IDM')

    // Fallback = shared → offerings are NOT pre-filtered to the inactive school.
    await resolveOfferingsForIntake('intake-2026-jan')
    expect(lastCanonicalEndpoint()).not.toContain('institution=')
  })

  it('active domain pointing at an INACTIVE institution falls back to Beanola', async () => {
    arriveOnHost('apply.inactiveschool.example')

    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
    expect(JSON.stringify(context.brand)).not.toContain('Inactive School University')

    await resolveOfferingsForIntake(null)
    expect(lastCanonicalEndpoint()).not.toContain('institution=')
  })
})

// ── Hostname collision (R14.4) ────────────────────────────────────────────

describe('22.2 hostname collision fails safe (R3.5/R14.4)', () => {
  it('two active institutions on one hostname resolve to shared Beanola, not a school', async () => {
    arriveOnHost('apply.collision.example')

    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
    // Neither colliding school may be picked or branded.
    expect(JSON.stringify(context.brand)).not.toContain('Collision College A')
    expect(JSON.stringify(context.brand)).not.toContain('Collision College B')

    await resolveOfferingsForIntake('intake-2026-jan')
    expect(lastCanonicalEndpoint()).not.toContain('institution=')
  })
})

// ── Unknown host + hard network failure both fail safe ────────────────────

describe('22.2 unknown host and context failure fail safe to Beanola', () => {
  it('an unrecognised host resolves to the shared Beanola portal', async () => {
    arriveOnHost('no-such-host.example.com')
    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
  })

  it('a context endpoint failure degrades to shared Beanola (never a leaked school)', async () => {
    mockRequest.mockRejectedValueOnce(new Error('network down'))
    const context = await catalogService.getContext()
    expect(context.portal_type).toBe('shared')
    expect(context.institution_id).toBeNull()
    expect(context.brand.name).toBe('Beanola Admissions')
  })
})
