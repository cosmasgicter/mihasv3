// @vitest-environment node
/**
 * Feature: system-alignment-audit, Property 3: normalizeIntake preserves max_capacity without renaming
 *
 * For any valid raw intake object with a numeric `max_capacity` field,
 * calling `normalizeIntake` should produce an output object that has a
 * `max_capacity` property equal to the input value, and should NOT have
 * a `total_capacity` property.
 *
 * **Validates: Requirements 3.4, 9.4, 9.5**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { normalizeIntake } from '@/services/catalog'

/**
 * Arbitrary that generates a valid raw intake object with a numeric max_capacity.
 * Mirrors the RawIntake shape from catalog.ts.
 */
const rawIntakeArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 80 }),
  year: fc.integer({ min: 2020, max: 2040 }),
  start_date: fc.constantFrom('2026-01-15', '2026-07-01', '2025-09-01'),
  end_date: fc.constantFrom('2026-06-30', '2026-12-31', '2025-12-15'),
  application_deadline: fc.constantFrom('2025-12-01', '2026-05-01', '2025-08-01'),
  max_capacity: fc.integer({ min: 0, max: 10000 }),
  current_enrollment: fc.option(fc.integer({ min: 0, max: 5000 }), { nil: undefined }),
  is_active: fc.option(fc.boolean(), { nil: undefined }),
})

describe('Property 3: normalizeIntake preserves max_capacity without renaming', () => {
  it('output max_capacity equals input max_capacity for any valid raw intake', () => {
    fc.assert(
      fc.property(rawIntakeArb, (rawIntake) => {
        const result = normalizeIntake(rawIntake)

        // normalizeIntake should not return null for a valid intake with id and name
        expect(result).not.toBeNull()

        // max_capacity must be preserved exactly
        expect(result!.max_capacity).toBe(rawIntake.max_capacity)
      }),
      { numRuns: 100 },
    )
  })

  it('output does NOT contain a total_capacity property', () => {
    fc.assert(
      fc.property(rawIntakeArb, (rawIntake) => {
        const result = normalizeIntake(rawIntake)

        expect(result).not.toBeNull()

        // The output must not have total_capacity — that was the old wrong field name
        expect(result).not.toHaveProperty('total_capacity')
      }),
      { numRuns: 100 },
    )
  })
})
