// Feature: audit-remediation, Property 14: Intake utilization visual indicator
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import { getUtilizationColor } from '@/pages/admin/Intakes'

/**
 * Validates: Requirements 19.3
 *
 * Property 14: For any intake displayed on the admin Intakes page, the visual
 * utilization indicator reflects the ratio of current_enrollment to capacity —
 * success below 80%, warning at 80-99%, destructive at 100%+.
 *
 * Updated 2026-05-26: badge now uses semantic design-system tokens
 * (`bg-success/10`, `bg-warning/10`, `bg-destructive/10`) instead of raw
 * Tailwind palette utilities. The `tone` field is asserted as the semantic
 * source of truth.
 */

describe('Property 14: Intake utilization visual indicator', () => {
  it('returns success tone when enrollment is below 80% of capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        (capacity) => {
          const maxEnrollment = Math.ceil(0.8 * capacity) - 1
          if (maxEnrollment < 0) return // skip tiny capacities

          const enrollment = fc.sample(fc.integer({ min: 0, max: maxEnrollment }), 1)[0]
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-success/10')
          expect(result.text).toBe('text-success')
          expect(result.label).toBe('Available')
          expect(result.tone).toBe('success')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns warning tone when enrollment is between 80% and 99% of capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 10_000 }),
        (capacity) => {
          const low = Math.ceil(0.8 * capacity)
          const high = capacity - 1
          if (low > high) return // skip when range is empty

          const enrollment = fc.sample(fc.integer({ min: low, max: high }), 1)[0]
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-warning/10')
          expect(result.text).toBe('text-warning')
          expect(result.label).toBe('Near capacity')
          expect(result.tone).toBe('warning')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('returns destructive tone when enrollment is at or above 100% of capacity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        (capacity, extra) => {
          const enrollment = capacity + extra
          const result = getUtilizationColor(enrollment, capacity)

          expect(result.bg).toBe('bg-destructive/10')
          expect(result.text).toBe('text-destructive')
          expect(result.label).toBe('Over capacity')
          expect(result.tone).toBe('destructive')
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
          expect(result.tone).toBe('muted')
        },
      ),
      { numRuns: 100 },
    )
  })
})
