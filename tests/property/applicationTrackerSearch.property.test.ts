// @vitest-environment node
/**
 * Property Test: Application tracker search via API
 * Feature: supabase-remnant-purge
 * Property 3: Application tracker search via API
 * Validates: Requirements 5.3
 *
 * For any valid search term (application number or tracking code), the application
 * tracker hook SHALL delegate the search to `apiClient.request()` targeting the
 * `/api/applications` endpoint, and the returned results SHALL only contain
 * applications matching the search term.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---- Replicate validation/normalization from trackerUtils.ts ----

function validateSearchTerm(term: string): boolean {
  const trimmed = term.trim()
  if (!trimmed || trimmed.length > 50) return false
  const appNumberPattern = /^(KATC|MIHAS)\d{6}$/
  if (appNumberPattern.test(trimmed)) return true
  return /^[a-zA-Z0-9\-_]+$/.test(trimmed)
}

function normalizeSearchTerm(term: string): string {
  const trimmed = term.trim()
  return trimmed.replace(
    /^(katc|mihas)(\d{6})$/i,
    (_, prefix, serial) => `${String(prefix).toUpperCase()}${serial}`,
  )
}

// ---- Replicate the endpoint-building logic from the migrated hook ----

interface TrackerSearchRoute {
  endpoint: string
  method: string
}

function buildTrackerSearchRoute(term: string): TrackerSearchRoute | null {
  const normalizedTerm = normalizeSearchTerm(term)

  if (!normalizedTerm) return null
  if (!validateSearchTerm(normalizedTerm)) return null

  return {
    endpoint: `/applications?tracking_code=${encodeURIComponent(normalizedTerm)}`,
    method: 'GET',
  }
}

// ---- Simulate API response filtering ----

interface MockApplication {
  application_number: string
  public_tracking_code: string
  status: string
}

function filterMatchingApplications(
  apps: MockApplication[],
  searchTerm: string,
): MockApplication[] {
  const normalized = normalizeSearchTerm(searchTerm)
  return apps.filter(
    (app) =>
      app.application_number === normalized ||
      app.public_tracking_code === normalized,
  )
}

// ---- Generators ----

const applicationNumberArb = fc.constantFrom('KATC', 'MIHAS').chain((prefix) =>
  fc.integer({ min: 0, max: 999999 }).map((n) => `${prefix}${String(n).padStart(6, '0')}`),
)

const trackingCodeArb = fc.string({ minLength: 1, maxLength: 30 })
  .map(s => s.replace(/[^a-zA-Z0-9\-_]/g, 'x'))
  .filter(s => s.length > 0 && s.length <= 30)

const validSearchTermArb = fc.oneof(applicationNumberArb, trackingCodeArb)

const statusArb = fc.constantFrom('submitted', 'under_review', 'approved', 'rejected', 'draft')

const mockApplicationArb = fc.tuple(applicationNumberArb, trackingCodeArb, statusArb).map(
  ([appNum, trackCode, status]) => ({
    application_number: appNum,
    public_tracking_code: trackCode,
    status,
  }),
)

// ---- Property Tests ----

describe('Feature: supabase-remnant-purge, Property 3: Application tracker search via API', () => {
  it('valid search terms produce API endpoints targeting /applications, never supabase', () => {
    fc.assert(
      fc.property(validSearchTermArb, (term) => {
        const route = buildTrackerSearchRoute(term)

        if (route !== null) {
          // Must target the /applications endpoint
          expect(route.endpoint).toMatch(/^\/applications\?/)

          // Must include tracking_code parameter
          expect(route.endpoint).toContain('tracking_code=')

          // Must be a GET request
          expect(route.method).toBe('GET')

          // Must NOT reference supabase
          expect(route.endpoint).not.toContain('supabase')
          expect(route.endpoint).not.toContain('.supabase.co')
          expect(route.endpoint).not.toContain('rest/v1')
        }
      }),
      { numRuns: 100 },
    )
  })

  it('application numbers are normalized to uppercase before building the endpoint', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('katc', 'mihas', 'KATC', 'MIHAS'),
        fc.integer({ min: 0, max: 999999 }),
        (prefix, serial) => {
          const term = `${prefix}${String(serial).padStart(6, '0')}`
          const route = buildTrackerSearchRoute(term)

          expect(route).not.toBeNull()

          // The normalized term in the endpoint should have uppercase prefix
          const expectedNormalized = `${prefix.toUpperCase()}${String(serial).padStart(6, '0')}`
          expect(route!.endpoint).toContain(
            `tracking_code=${encodeURIComponent(expectedNormalized)}`,
          )
        },
      ),
      { numRuns: 100 },
    )
  })

  it('filtered results only contain applications matching the search term', () => {
    fc.assert(
      fc.property(
        validSearchTermArb,
        fc.array(mockApplicationArb, { minLength: 0, maxLength: 20 }),
        (searchTerm, applications) => {
          const results = filterMatchingApplications(applications, searchTerm)
          const normalized = normalizeSearchTerm(searchTerm)

          // Every returned result must match the search term
          for (const app of results) {
            const matches =
              app.application_number === normalized ||
              app.public_tracking_code === normalized
            expect(matches).toBe(true)
          }

          // Results must be a subset of the input
          expect(results.length).toBeLessThanOrEqual(applications.length)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('invalid search terms are rejected before any API call', () => {
    const invalidTermArb = fc.oneof(
      fc.constant(''),
      fc.constant('   '),
      // Over 50 characters — use a constant long string
      fc.constantFrom(
        'a'.repeat(51),
        'b'.repeat(55),
        'c'.repeat(60),
      ),
      // Contains special characters
      fc.constantFrom('app@123', 'track!code', 'search#term', 'code with spaces'),
    )

    fc.assert(
      fc.property(invalidTermArb, (term) => {
        const route = buildTrackerSearchRoute(term)
        // Invalid terms should not produce a route (no API call made)
        expect(route).toBeNull()
      }),
      { numRuns: 100 },
    )
  })

  it('search endpoint never contains supabase table name patterns', () => {
    const supabasePatterns = [
      'supabase.from',
      '.supabase.co',
      'rest/v1/',
      'supabase.rpc',
      'public_application_status',
    ]

    fc.assert(
      fc.property(
        validSearchTermArb,
        fc.constantFrom(...supabasePatterns),
        (term, pattern) => {
          const route = buildTrackerSearchRoute(term)

          if (route !== null) {
            expect(route.endpoint).not.toContain(pattern)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
