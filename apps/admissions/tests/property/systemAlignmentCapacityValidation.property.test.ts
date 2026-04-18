// @vitest-environment node
/**
 * Feature: system-alignment-audit, Property 6: Capacity validation rejects non-positive values
 *
 * For any integer value ≤ 0, the intake capacity validation schema should reject it.
 * For any positive integer, the schema should accept it as a valid capacity.
 *
 * **Validates: Requirements 3.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { intakeSchema } from '@/pages/admin/Intakes'

/**
 * A valid base object that satisfies all non-capacity schema fields and refinements.
 * Dates are chosen so that: start_date <= end_date AND application_deadline <= start_date.
 */
const validBase = {
  name: 'July 2026 Intake',
  year: 2026,
  start_date: '2026-07-01',
  end_date: '2026-12-31',
  application_deadline: '2026-06-01',
}

describe('Property 6: Capacity validation rejects non-positive values', () => {
  it('rejects any integer ≤ 0 as max_capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 0 }),
        (nonPositive) => {
          const result = intakeSchema.safeParse({ ...validBase, max_capacity: nonPositive })
          expect(result.success).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('accepts any positive integer as max_capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        (positive) => {
          const result = intakeSchema.safeParse({ ...validBase, max_capacity: positive })
          expect(result.success).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})
