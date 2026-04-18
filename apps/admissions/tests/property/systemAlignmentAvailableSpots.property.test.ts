// @vitest-environment node
/**
 * Feature: system-alignment-audit, Property 5: Available spots computation is correct
 *
 * For any non-negative integers `max_capacity` and `current_enrollment`,
 * the available spots should equal `max(max_capacity - current_enrollment, 0)`.
 * This computation should never produce a negative number.
 *
 * **Validates: Requirements 3.3**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

/** Pure computation matching the Intakes.tsx inline formula */
function computeAvailableSpots(maxCapacity: number, currentEnrollment: number): number {
  return Math.max(maxCapacity - currentEnrollment, 0)
}

describe('Property 5: Available spots computation is correct', () => {
  it('available spots equals max_capacity - current_enrollment when enrollment <= capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (maxCapacity, currentEnrollment) => {
          fc.pre(currentEnrollment <= maxCapacity)

          const available = computeAvailableSpots(maxCapacity, currentEnrollment)
          expect(available).toBe(maxCapacity - currentEnrollment)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('available spots equals 0 when current_enrollment > max_capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (maxCapacity, currentEnrollment) => {
          fc.pre(currentEnrollment > maxCapacity)

          const available = computeAvailableSpots(maxCapacity, currentEnrollment)
          expect(available).toBe(0)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('available spots is never negative for any non-negative inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (maxCapacity, currentEnrollment) => {
          const available = computeAvailableSpots(maxCapacity, currentEnrollment)
          expect(available).toBeGreaterThanOrEqual(0)
        },
      ),
      { numRuns: 100 },
    )
  })
})
