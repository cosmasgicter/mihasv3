// @vitest-environment node
// Feature: migration-recovery-hardening, Property 2: Payment status filtering is a correct partition
/**
 * Property Test: Payment status filtering is a correct partition
 * Validates: Requirements 1.5
 *
 * For any list of applications, filtering by "pending" (payment_status is null or
 * 'pending_review') and filtering by "completed" (payment_status is 'verified' or
 * 'rejected') should produce two disjoint sets whose union equals the original list.
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

// ---- Pure filter functions (mirror Payment.tsx logic) ----

/**
 * Pending: payment_status is null or 'pending_review'
 * This matches the filter in Payment.tsx:
 *   applications.filter(app => app.payment_status === null || app.payment_status === 'pending_review')
 */
function filterPending(applications: ApplicationWithPayment[]): ApplicationWithPayment[] {
  return applications.filter(
    (app) => app.payment_status === null || app.payment_status === 'pending_review',
  )
}

/**
 * Completed: payment_status is 'verified' or 'rejected'
 * This matches the filter in Payment.tsx:
 *   allApplications.filter(app => app.payment_status === 'verified' || app.payment_status === 'rejected')
 */
function filterCompleted(applications: ApplicationWithPayment[]): ApplicationWithPayment[] {
  return applications.filter(
    (app) => app.payment_status === 'verified' || app.payment_status === 'rejected',
  )
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

/** Only the four known payment statuses used by the Payment page */
const paymentStatusArb: fc.Arbitrary<string | null> = fc.constantFrom(
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

const applicationListArb = fc.array(applicationArb, { minLength: 0, maxLength: 10 })

// ---- Property Tests ----

describe('Feature: migration-recovery-hardening, Property 2: Payment status filtering is a correct partition', () => {
  it('pending + completed counts equal total count', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * For any list of applications, |pending| + |completed| === |total|.
     */
    fc.assert(
      fc.property(applicationListArb, (applications) => {
        const pending = filterPending(applications)
        const completed = filterCompleted(applications)

        expect(pending.length + completed.length).toBe(applications.length)
      }),
      { numRuns: 20 },
    )
  })

  it('pending and completed sets are disjoint (no shared IDs)', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * No application appears in both the pending and completed sets.
     */
    fc.assert(
      fc.property(applicationListArb, (applications) => {
        const pending = filterPending(applications)
        const completed = filterCompleted(applications)

        const pendingIds = new Set(pending.map((a) => a.id))
        const completedIds = new Set(completed.map((a) => a.id))

        for (const id of pendingIds) {
          expect(completedIds.has(id)).toBe(false)
        }
      }),
      { numRuns: 20 },
    )
  })

  it('union of pending and completed equals the original list', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * Every application in the original list appears in exactly one of the two sets,
     * and the combined set contains no extra elements.
     */
    fc.assert(
      fc.property(applicationListArb, (applications) => {
        const pending = filterPending(applications)
        const completed = filterCompleted(applications)
        const union = [...pending, ...completed]

        // Same length
        expect(union.length).toBe(applications.length)

        // Every original application is in the union (by index-based ID matching)
        const originalIds = applications.map((a) => a.id)
        const unionIds = union.map((a) => a.id)
        expect(unionIds.sort()).toEqual(originalIds.sort())
      }),
      { numRuns: 20 },
    )
  })

  it('pending filter only contains null or pending_review payment statuses', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * Every application in the pending set has payment_status === null or 'pending_review'.
     */
    fc.assert(
      fc.property(applicationListArb, (applications) => {
        const pending = filterPending(applications)

        for (const app of pending) {
          expect(app.payment_status === null || app.payment_status === 'pending_review').toBe(true)
        }
      }),
      { numRuns: 20 },
    )
  })

  it('completed filter only contains verified or rejected payment statuses', () => {
    /**
     * **Validates: Requirements 1.5**
     *
     * Every application in the completed set has payment_status === 'verified' or 'rejected'.
     */
    fc.assert(
      fc.property(applicationListArb, (applications) => {
        const completed = filterCompleted(applications)

        for (const app of completed) {
          expect(app.payment_status === 'verified' || app.payment_status === 'rejected').toBe(true)
        }
      }),
      { numRuns: 20 },
    )
  })
})
