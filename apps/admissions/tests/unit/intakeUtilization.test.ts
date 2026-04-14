// Feature: audit-remediation, Property 14: Intake utilization visual indicator
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { getUtilizationColor } from '@/pages/admin/Intakes'

/**
 * Validates: Requirements 19.3
 *
 * Property 14: For any intake displayed on the admin Intakes page, the visual
 * utilization indicator reflects the ratio of current_enrollment to capacity —
 * green below 80%, amber at 80-99%, red at 100%+.
 */

describe('Property 14: Intake utilization visual indicator', () => {
  it('returns green when enrollment is below 80% of capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        (capacity) => {
          const maxEnrollment = Math.ceil(0.8 * capacity) - 1
          if (maxEnrollment < 0) return // skip tiny capacities

          const enrollment = fc.sample(fc.integer({ min: 0, max: maxEnrollment }), 1)[0]
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-green-100')
          expect(result.text).toBe('text-green-700')
          expect(result.label).toBe('Available')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns amber when enrollment is between 80% and 99% of capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 10_000 }),
        (capacity) => {
          const low = Math.ceil(0.8 * capacity)
          const high = capacity - 1
          if (low > high) return // skip when range is empty

          const enrollment = fc.sample(fc.integer({ min: low, max: high }), 1)[0]
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-amber-100')
          expect(result.text).toBe('text-amber-700')
          expect(result.label).toBe('Near capacity')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns red when enrollment is at or above 100% of capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        (capacity, extra) => {
          const enrollment = capacity + extra
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-red-100')
          expect(result.text).toBe('text-red-700')
          expect(result.label).toBe('Over capacity')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns muted N/A when capacity is zero or negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 0 }),
        fc.integer({ min: 0, max: 1000 }),
        (capacity, enrollment) => {
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-muted')
          expect(result.text).toBe('text-muted-foreground')
          expect(result.label).toBe('N/A')
        },
      ),
      { numRuns: 100 },
    )
  })
})
