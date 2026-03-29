// @vitest-environment node
/**
 * Property Test: Paginated response extraction preserves all applications
 * Feature: migration-recovery-hardening, Property 1: Paginated response extraction preserves all applications
 * Validates: Requirements 1.2
 *
 * For any paginated API response containing an `applications` array of length N,
 * the Payment page extraction logic should produce exactly N application objects,
 * each preserving the original `id`, `status`, `payment_status`, and `program` fields.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---- Types matching Payment.tsx ----

interface ApplicationWithPayment {
  id: string
  status: string
  payment_status: string | null
  payment_method: string | null
  amount: number | null
  momo_ref: string | null
  created_at: string
  program: string | null
}

interface ApplicationsListPayload {
  applications: ApplicationWithPayment[]
  totalCount: number
  page: number
  pageSize: number
}

// ---- Pure extraction function (mirrors Payment.tsx logic) ----

/**
 * Extracts applications from the API response payload.
 * Handles three cases:
 * 1. Paginated object { applications: [...], totalCount, page, pageSize } → extract .applications
 * 2. Plain array [...] → use directly
 * 3. null/undefined → empty array
 */
function extractApplications(
  response: ApplicationsListPayload | ApplicationWithPayment[] | null | undefined,
): ApplicationWithPayment[] {
  const payload = response as unknown as ApplicationsListPayload | ApplicationWithPayment[] | null | undefined
  const listData =
    payload && !Array.isArray(payload) && Array.isArray(payload.applications)
      ? payload.applications
      : Array.isArray(payload)
        ? payload
        : []
  return listData
}

// ---- Generators ----

const applicationStatusArb = fc.constantFrom(
  'draft',
  'submitted',
  'under_review',
  'interview_scheduled',
  'accepted',
  'rejected',
  'waitlisted',
  'withdrawn',
)

const paymentStatusArb = fc.constantFrom(
  null,
  'pending_review',
  'verified',
  'rejected',
)

const programArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom('Nursing', 'Clinical Medicine', 'Pharmacy', 'Laboratory Technology', 'Environmental Health'),
)

const paymentMethodArb = fc.oneof(
  fc.constant(null),
  fc.constantFrom('momo', 'bank_transfer', 'cash'),
)

const isoDateArb = fc
  .integer({ min: 1704067200000, max: 1767225600000 })
  .map((ts) => new Date(ts).toISOString())

const applicationArb: fc.Arbitrary<ApplicationWithPayment> = fc.record({
  id: fc.uuid(),
  status: applicationStatusArb,
  payment_status: paymentStatusArb,
  payment_method: paymentMethodArb,
  amount: fc.oneof(fc.constant(null), fc.integer({ min: 100, max: 500 })),
  momo_ref: fc.oneof(fc.constant(null), fc.stringMatching(/^MOMO-[A-Z0-9]{8}$/)),
  created_at: isoDateArb,
  program: programArb,
})

const paginatedResponseArb: fc.Arbitrary<ApplicationsListPayload> = fc
  .array(applicationArb, { minLength: 0, maxLength: 10 })
  .chain((apps) =>
    fc.record({
      applications: fc.constant(apps),
      totalCount: fc.constant(apps.length),
      page: fc.integer({ min: 1, max: 10 }),
      pageSize: fc.integer({ min: 10, max: 50 }),
    }),
  )

// ---- Property Tests ----

describe('Feature: migration-recovery-hardening, Property 1: Paginated response extraction preserves all applications', () => {
  it('extracts all applications from a paginated response object', () => {
    /**
     * **Validates: Requirements 1.2**
     *
     * For any paginated response with N applications, extraction produces exactly N items.
     */
    fc.assert(
      fc.property(paginatedResponseArb, (paginatedResponse) => {
        const result = extractApplications(paginatedResponse)

        // Count must match
        expect(result).toHaveLength(paginatedResponse.applications.length)

        // Each application's fields must be preserved
        for (let i = 0; i < result.length; i++) {
          expect(result[i].id).toBe(paginatedResponse.applications[i].id)
          expect(result[i].status).toBe(paginatedResponse.applications[i].status)
          expect(result[i].payment_status).toBe(paginatedResponse.applications[i].payment_status)
          expect(result[i].program).toBe(paginatedResponse.applications[i].program)
        }
      }),
      { numRuns: 10 },
    )
  })

  it('extracts all applications from a plain array response', () => {
    /**
     * **Validates: Requirements 1.2**
     */
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 0, maxLength: 10 }),
        (applications) => {
          const result = extractApplications(applications)
          expect(result).toHaveLength(applications.length)
          for (let i = 0; i < result.length; i++) {
            expect(result[i].id).toBe(applications[i].id)
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  it('returns empty array for null or undefined responses', () => {
    expect(extractApplications(null)).toEqual([])
    expect(extractApplications(undefined)).toEqual([])
  })

  it('preserves all fields including nullable ones across any input shape', () => {
    /**
     * **Validates: Requirements 1.2**
     */
    const responseArb = fc.oneof(
      paginatedResponseArb.map((p) => ({ type: 'paginated' as const, value: p })),
      fc.array(applicationArb, { minLength: 0, maxLength: 10 }).map((a) => ({ type: 'array' as const, value: a })),
    )

    fc.assert(
      fc.property(responseArb, ({ type, value }) => {
        const sourceApps = type === 'paginated'
          ? (value as ApplicationsListPayload).applications
          : (value as ApplicationWithPayment[])

        const result = extractApplications(
          type === 'paginated' ? (value as ApplicationsListPayload) : (value as ApplicationWithPayment[]),
        )

        expect(result).toHaveLength(sourceApps.length)
        for (let i = 0; i < result.length; i++) {
          expect(result[i]).toBe(sourceApps[i])
        }
      }),
      { numRuns: 10 },
    )
  })
})
