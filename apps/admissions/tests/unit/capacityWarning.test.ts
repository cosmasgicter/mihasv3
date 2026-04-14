// Feature: audit-remediation, Property 13: Capacity warning at enrollment threshold
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import fc from 'fast-check'

import { CapacityWarning } from '@/components/admin/applications/CapacityWarning'

/**
 * Validates: Requirements 18.2, 18.3
 *
 * Property 13: For any intake where current_enrollment / max_capacity >= 0.8,
 * the component displays a capacity warning (data-testid="capacity-warning").
 * When current_enrollment >= max_capacity, the warning escalates to an
 * over-capacity alert (role="alert"). When enrollment is below 80%, or
 * capacity data is null/undefined, no warning is shown (fail-safe).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(props: {
  intake_capacity: number | null | undefined
  intake_enrollment: number | null | undefined
}): string {
  return renderToStaticMarkup(createElement(CapacityWarning, props))
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Positive capacity (1–10 000) */
const capacityArb = fc.integer({ min: 1, max: 10_000 })

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 13: Capacity warning at enrollment threshold', () => {
  it('shows amber warning when enrollment is between 80% and 99% of capacity', () => {
    fc.assert(
      fc.property(capacityArb, (capacity) => {
        // Pick an enrollment value in [ceil(0.8 * capacity), capacity - 1]
        const low = Math.ceil(0.8 * capacity)
        const high = capacity - 1
        if (low > high) return // skip when range is empty (very small capacity)

        const enrollment = fc.sample(fc.integer({ min: low, max: high }), 1)[0]
        const markup = render({ intake_capacity: capacity, intake_enrollment: enrollment })

        expect(markup).toContain('data-testid="capacity-warning"')
        expect(markup).toContain('role="status"')
        expect(markup).not.toContain('role="alert"')
      }),
      { numRuns: 100 },
    )
  })

  it('shows red over-capacity alert when enrollment >= capacity', () => {
    fc.assert(
      fc.property(
        capacityArb,
        fc.integer({ min: 0, max: 500 }),
        (capacity, extra) => {
          const enrollment = capacity + extra // at or over capacity
          const markup = render({ intake_capacity: capacity, intake_enrollment: enrollment })

          expect(markup).toContain('data-testid="capacity-warning"')
          expect(markup).toContain('role="alert"')
          expect(markup).toContain('at or over capacity')
        },
      ),
      { numRuns: 100 },
    )
  })

  it('shows no warning when enrollment is below 80% of capacity', () => {
    fc.assert(
      fc.property(capacityArb, (capacity) => {
        // Pick enrollment in [0, floor(0.8 * capacity) - 1]
        const maxEnrollment = Math.floor(0.8 * capacity) - 1
        if (maxEnrollment < 0) return // skip when capacity is too small

        const enrollment = fc.sample(fc.integer({ min: 0, max: maxEnrollment }), 1)[0]
        const markup = render({ intake_capacity: capacity, intake_enrollment: enrollment })

        expect(markup).toBe('')
      }),
      { numRuns: 100 },
    )
  })

  it('shows no warning when capacity data is null or undefined', () => {
    const nullishArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
    )

    fc.assert(
      fc.property(
        nullishArb,
        nullishArb,
        fc.integer({ min: 0, max: 1000 }),
        (cap, enroll, validNum) => {
          // At least one of capacity or enrollment is null/undefined
          const markup1 = render({ intake_capacity: cap, intake_enrollment: validNum })
          const markup2 = render({ intake_capacity: validNum, intake_enrollment: enroll })
          const markup3 = render({ intake_capacity: cap, intake_enrollment: enroll })

          expect(markup1).toBe('')
          expect(markup2).toBe('')
          expect(markup3).toBe('')
        },
      ),
      { numRuns: 100 },
    )
  })
})
