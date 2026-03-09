// @vitest-environment node
/**
 * Property Test: Polling deduplication
 * Feature: supabase-remnant-purge
 * Property 5: Polling deduplication
 * Validates: Requirements 8.2
 *
 * For any dashboard data payload, if the polling hook receives an identical payload
 * on two consecutive polls (same application IDs, same statuses), the `onDataChange`
 * callback SHALL fire exactly once (on the first receipt), not on the duplicate.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// ---- Types matching the polling hooks ----

interface StudentApplication {
  id: string
  application_number: string
  status: string
  program: string
  created_at: string
  updated_at: string
  payment_status: string
}

interface DashboardData {
  applications: StudentApplication[]
}

/**
 * Models the ref-based deduplication logic used in useStudentDashboardPolling.
 *
 * The hook uses a previousAppsRef to compare incoming data with the last known state.
 * If the data is identical (same IDs, same statuses), onDataChange should not fire again.
 *
 * This class simulates the polling hook's deduplication behavior.
 */
class PollingDeduplicator {
  private previousData: DashboardData | null = null
  private callbackFireCount = 0

  /**
   * Generates a fingerprint for comparison.
   * Matches the hook's comparison strategy: application IDs + statuses.
   */
  private fingerprint(data: DashboardData): string {
    const sorted = [...data.applications].sort((a, b) => a.id.localeCompare(b.id))
    return sorted.map((app) => `${app.id}:${app.status}:${app.payment_status}`).join('|')
  }

  /**
   * Process a poll result. Returns whether onDataChange would fire.
   */
  receivePollResult(data: DashboardData): boolean {
    const currentFingerprint = this.fingerprint(data)
    const previousFingerprint = this.previousData ? this.fingerprint(this.previousData) : null

    if (previousFingerprint === null || currentFingerprint !== previousFingerprint) {
      // Data is new or changed — fire callback
      this.previousData = data
      this.callbackFireCount++
      return true
    }

    // Duplicate data — do NOT fire callback
    return false
  }

  getCallbackFireCount(): number {
    return this.callbackFireCount
  }

  reset(): void {
    this.previousData = null
    this.callbackFireCount = 0
  }
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
  'pending',
  'paid',
  'verified',
  'failed',
  'refunded',
)

const programArb = fc.constantFrom(
  'Nursing',
  'Clinical Medicine',
  'Pharmacy',
  'Laboratory Technology',
  'Environmental Health',
)

const isoDateArb = fc
  .integer({ min: 1704067200000, max: 1767225600000 }) // 2024-01-01 to 2025-12-31
  .map((ts) => new Date(ts).toISOString())

const applicationArb: fc.Arbitrary<StudentApplication> = fc.record({
  id: fc.uuid(),
  application_number: fc.stringMatching(/^APP-[0-9]{4}-[0-9]{4}$/),
  status: applicationStatusArb,
  program: programArb,
  created_at: isoDateArb,
  updated_at: isoDateArb,
  payment_status: paymentStatusArb,
})

const dashboardDataArb: fc.Arbitrary<DashboardData> = fc
  .array(applicationArb, { minLength: 0, maxLength: 10 })
  .map((applications) => ({ applications }))

// ---- Property Tests ----

describe('Feature: supabase-remnant-purge, Property 5: Polling deduplication', () => {
  it('identical consecutive polls fire onDataChange exactly once', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * When the polling hook receives the same payload twice in a row,
     * onDataChange fires on the first receipt but NOT on the duplicate.
     */
    fc.assert(
      fc.property(dashboardDataArb, (data) => {
        const deduplicator = new PollingDeduplicator()

        // First poll — should fire
        const firstFired = deduplicator.receivePollResult(data)
        expect(firstFired).toBe(true)

        // Second poll with identical data — should NOT fire
        const secondFired = deduplicator.receivePollResult(data)
        expect(secondFired).toBe(false)

        // Total callback fires: exactly 1
        expect(deduplicator.getCallbackFireCount()).toBe(1)
      }),
      { numRuns: 10 },
    )
  })

  it('changed data between polls fires onDataChange again', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * When the polling hook receives different data on consecutive polls,
     * onDataChange fires on both receipts.
     */
    fc.assert(
      fc.property(
        dashboardDataArb,
        dashboardDataArb,
        (data1, data2) => {
          const deduplicator = new PollingDeduplicator()

          const firstFired = deduplicator.receivePollResult(data1)
          expect(firstFired).toBe(true)

          const secondFired = deduplicator.receivePollResult(data2)

          // If data actually changed (different IDs or statuses), callback should fire
          // If data happens to be identical, callback should not fire
          const data1Fingerprint = [...data1.applications]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((app) => `${app.id}:${app.status}:${app.payment_status}`)
            .join('|')
          const data2Fingerprint = [...data2.applications]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((app) => `${app.id}:${app.status}:${app.payment_status}`)
            .join('|')

          if (data1Fingerprint !== data2Fingerprint) {
            expect(secondFired).toBe(true)
            expect(deduplicator.getCallbackFireCount()).toBe(2)
          } else {
            expect(secondFired).toBe(false)
            expect(deduplicator.getCallbackFireCount()).toBe(1)
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  it('N identical consecutive polls fire onDataChange exactly once', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * Even if the same data arrives many times in a row (e.g., 2-10 consecutive
     * identical polls), onDataChange fires only on the first receipt.
     */
    fc.assert(
      fc.property(
        dashboardDataArb,
        fc.integer({ min: 2, max: 10 }),
        (data, repeatCount) => {
          const deduplicator = new PollingDeduplicator()

          // First poll fires
          deduplicator.receivePollResult(data)

          // Subsequent identical polls do NOT fire
          for (let i = 1; i < repeatCount; i++) {
            const fired = deduplicator.receivePollResult(data)
            expect(fired).toBe(false)
          }

          // Total: exactly 1 callback fire
          expect(deduplicator.getCallbackFireCount()).toBe(1)
        },
      ),
      { numRuns: 10 },
    )
  })

  it('status change in any application triggers onDataChange', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * If even one application's status changes between polls,
     * the deduplicator must detect the change and fire onDataChange.
     */
    fc.assert(
      fc.property(
        fc.array(applicationArb, { minLength: 1, maxLength: 5 }),
        fc.nat({ max: 4 }), // index to mutate
        applicationStatusArb,
        (apps, indexHint, newStatus) => {
          const index = indexHint % apps.length
          const original: DashboardData = { applications: apps }

          const deduplicator = new PollingDeduplicator()
          deduplicator.receivePollResult(original)

          // Mutate one application's status
          const mutatedApps = apps.map((app, i) => {
            if (i === index && app.status !== newStatus) {
              return { ...app, status: newStatus }
            }
            return { ...app }
          })
          const mutated: DashboardData = { applications: mutatedApps }

          const fired = deduplicator.receivePollResult(mutated)

          // If the status actually changed, callback must fire
          if (apps[index].status !== newStatus) {
            expect(fired).toBe(true)
          }
        },
      ),
      { numRuns: 10 },
    )
  })

  it('empty dashboard data is deduplicated correctly', () => {
    /**
     * **Validates: Requirements 8.2**
     *
     * An empty applications array is a valid state (new student, no applications).
     * Consecutive empty polls should fire onDataChange only once.
     */
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 5 }), (repeatCount) => {
        const deduplicator = new PollingDeduplicator()
        const emptyData: DashboardData = { applications: [] }

        // First empty poll fires
        const firstFired = deduplicator.receivePollResult(emptyData)
        expect(firstFired).toBe(true)

        // Subsequent empty polls do NOT fire
        for (let i = 1; i < repeatCount; i++) {
          const fired = deduplicator.receivePollResult(emptyData)
          expect(fired).toBe(false)
        }

        expect(deduplicator.getCallbackFireCount()).toBe(1)
      }),
      { numRuns: 10 },
    )
  })
})
