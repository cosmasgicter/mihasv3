/**
 * OpenAPI contract drift guard — frontend service routes ⇔ backend schema.
 *
 * Feature: beanola-production-readiness, Property 27: Frontend service shapes match the backend contract
 *
 * Task 9.3 — OpenAPI drift guard (route presence + important fields): every
 * `/api/v1/...` route an admissions frontend service calls must be present in
 * the generated OpenAPI schema, and every paginated `*Page` schema must expose
 * the documented `{page, pageSize, totalCount, results}` field set.
 *
 * Task 9.4 — Property 27 (frontend half): the normalized list-response shape
 * each service declares (`{results|applications|...}`, `totalCount`, `page`,
 * `pageSize`) round-trips against the backend `{page, pageSize, totalCount,
 * results}` envelope contract (R4.3, R4.4, R16.6). The backend half lives in
 * `backend/tests/property/test_envelope_pagination_conformance.py`.
 *
 * The schema facts are mirrored into `__fixtures__/openApiSchemaMirror.ts`,
 * regenerated from the live schema by `backend/scripts/generate_openapi_fixture.py`
 * (jsdom has no YAML/JSON-schema loader, so we commit the mirror in lockstep —
 * the same convention as `paymentErrorCodesBackendMirror.ts`).
 *
 * Validates: Requirements 4.3, 4.4, 4.5, 16.6.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { normalizePaginatedApplications } from '@/services/applications'

import {
  OPENAPI_PAGE_SCHEMAS,
  OPENAPI_PATHS,
  OPENAPI_SCHEMA_TITLE,
} from './__fixtures__/openApiSchemaMirror'

// ---------------------------------------------------------------------------
// Frontend service route inventory.
//
// Each entry is the concrete `/api/v1/...` route a `src/services/*` method
// calls, with dynamic `${...}` segments collapsed to the schema's `{param}`
// placeholder so it can be matched against an OpenAPI path template.
// Sourced by reading the request literals in src/services/*.ts.
// ---------------------------------------------------------------------------

const FRONTEND_SERVICE_ROUTES: readonly string[] = [
  // auth.ts
  '/api/v1/auth/login/',
  '/api/v1/auth/logout/',
  '/api/v1/auth/register/',
  '/api/v1/auth/refresh/',
  '/api/v1/auth/session/',
  '/api/v1/auth/profile/',
  '/api/v1/auth/password-reset/',
  '/api/v1/auth/password-reset/confirm/',
  // applications.ts
  '/api/v1/applications/',
  '/api/v1/applications/{application_id}/',
  '/api/v1/applications/{application_id}/details/',
  '/api/v1/applications/{application_id}/documents/',
  '/api/v1/applications/{application_id}/grades/',
  '/api/v1/applications/{application_id}/summary/',
  '/api/v1/applications/{application_id}/interviews/',
  '/api/v1/applications/{application_id}/review/',
  '/api/v1/applications/{application_id}/submit/',
  '/api/v1/applications/{application_id}/verify-document/',
  '/api/v1/applications/{application_id}/withdraw/',
  '/api/v1/applications/{application_id}/waitlist-position/',
  '/api/v1/applications/{application_id}/conditions/',
  '/api/v1/applications/{application_id}/amendments/',
  '/api/v1/applications/{application_id}/assign/',
  '/api/v1/applications/{application_id}/confirm-enrollment/',
  '/api/v1/applications/{application_id}/fee-waiver/',
  '/api/v1/applications/{application_id}/acceptance-letter/',
  '/api/v1/applications/{application_id}/application-slip/',
  '/api/v1/applications/{application_id}/conditional-offer/',
  '/api/v1/applications/{application_id}/finance-receipt/',
  '/api/v1/applications/{application_id}/payment-receipt/',
  '/api/v1/applications/auto-assign/',
  '/api/v1/applications/bulk-status/',
  '/api/v1/applications/draft/',
  '/api/v1/applications/export/',
  '/api/v1/applications/interviews/',
  '/api/v1/applications/track/',
  // catalog.ts
  '/api/v1/catalog/context/',
  '/api/v1/catalog/programs/',
  '/api/v1/catalog/programs/{program_id}/',
  '/api/v1/catalog/canonical-programs/',
  '/api/v1/catalog/assignment-preview/',
  '/api/v1/catalog/intakes/',
  '/api/v1/catalog/intakes/{intake_id}/',
  '/api/v1/catalog/subjects/',
  '/api/v1/catalog/institutions/',
  '/api/v1/catalog/institutions/{institution_id}/',
  // payments.ts
  '/api/v1/payments/initiate/',
  '/api/v1/payments/mobile-money/',
  '/api/v1/payments/{payment_id}/verify/',
  // notifications.ts
  '/api/v1/notifications/',
  '/api/v1/notifications/{id}/',
  '/api/v1/notifications/{id}/read/',
  '/api/v1/notifications/preferences/',
  '/api/v1/notifications/read-all/',
  // sessions.ts
  '/api/v1/sessions/',
  '/api/v1/sessions/revoke-all/',
  '/api/v1/sessions/{session_id}/revoke/',
  // documents.ts
  '/api/v1/documents/upload/',
  // communications.ts
  '/api/v1/email/send/',
] as const

/** Collapse OpenAPI `{param}` segments so any param name matches any other. */
function canonicalizeTemplate(path: string): string {
  return path.replace(/\{[^}]+\}/g, '{param}')
}

const SCHEMA_TEMPLATES = new Set(OPENAPI_PATHS.map(canonicalizeTemplate))

const PAGINATION_KEYS = ['page', 'pageSize', 'totalCount', 'results'] as const

describe('OpenAPI contract drift guard — schema is Beanola-branded', () => {
  it('schema metadata uses Beanola platform branding (R4.1)', () => {
    expect(OPENAPI_SCHEMA_TITLE).toMatch(/Beanola/i)
  })

  it('exposes at least the known admissions surface area', () => {
    // Sanity floor so an empty/garbled mirror cannot silently pass the guard.
    expect(OPENAPI_PATHS.length).toBeGreaterThan(100)
    expect(Object.keys(OPENAPI_PAGE_SCHEMAS).length).toBeGreaterThan(0)
  })
})

describe('Task 9.3 — frontend service routes are present in the schema (R4.5)', () => {
  it.each(FRONTEND_SERVICE_ROUTES)('schema documents %s', (route) => {
    expect(SCHEMA_TEMPLATES.has(canonicalizeTemplate(route))).toBe(true)
  })

  it('every paginated *Page schema documents {page, pageSize, totalCount, results}', () => {
    const pageSchemas = Object.entries(OPENAPI_PAGE_SCHEMAS)
    expect(pageSchemas.length).toBeGreaterThan(0)
    for (const [name, fields] of pageSchemas) {
      for (const key of PAGINATION_KEYS) {
        expect(fields, `${name} is missing "${key}"`).toContain(key)
      }
    }
  })
})

describe('Property 27 — frontend service shapes match the backend contract (R4.3, R4.4, R16.6)', () => {
  // The backend serves authenticated list endpoints as the API_Envelope
  // `{success, data: {page, pageSize, totalCount, results}}`. Frontend service
  // methods receive the already-unwrapped `data` payload and normalize it into
  // their declared type. This property drives the applications normalizer (the
  // representative list service) over arbitrary-but-valid backend page shapes
  // and asserts the normalized shape round-trips the contract fields.

  it('normalizePaginatedApplications round-trips the backend page contract', () => {
    const recordArb = fc.record({
      id: fc.uuid(),
      created_at: fc.date({ min: new Date('2020-01-01'), max: new Date('2035-01-01') }).map((d) => d.toISOString()),
    })

    const backendPageArb = fc
      .record({
        results: fc.array(recordArb, { maxLength: 20 }),
        page: fc.integer({ min: 1, max: 500 }),
        pageSize: fc.integer({ min: 1, max: 500 }),
        totalCount: fc.integer({ min: 0, max: 100000 }),
      })

    fc.assert(
      fc.property(backendPageArb, (page) => {
        const normalized = normalizePaginatedApplications(page)

        // The declared type carries exactly the contract's metadata fields.
        expect(normalized).toHaveProperty('applications')
        expect(normalized).toHaveProperty('totalCount')
        expect(normalized).toHaveProperty('page')
        expect(normalized).toHaveProperty('pageSize')

        // `results` (backend) ⇒ `applications` (frontend) with count preserved.
        expect(Array.isArray(normalized.applications)).toBe(true)
        expect(normalized.applications.length).toBe(page.results.length)

        // Metadata echoes the documented contract fields, never inventing values.
        expect(normalized.totalCount).toBe(page.totalCount)
        expect(normalized.page).toBe(page.page)
        expect(normalized.pageSize).toBe(page.pageSize)
      }),
      { numRuns: 20, seed: 0 },
    )
  })

  it('normalizePaginatedApplications degrades safely on a null/empty contract response', () => {
    fc.assert(
      fc.property(fc.constantFrom(null, undefined), (empty) => {
        const normalized = normalizePaginatedApplications(empty as never)
        expect(normalized.applications).toEqual([])
        expect(normalized.totalCount).toBe(0)
        expect(normalized.page).toBe(1)
        expect(PAGINATION_KEYS.every((k) => k in normalized || k === 'results')).toBe(true)
      }),
      { numRuns: 20, seed: 0 },
    )
  })
})
