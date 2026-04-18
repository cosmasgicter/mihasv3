// @vitest-environment node
/**
 * Feature: system-alignment-audit, Property 4: buildIntakePayload maps max_capacity directly
 *
 * For any intake form data with a numeric `max_capacity` field,
 * calling `buildIntakePayload` should produce a payload object where
 * `max_capacity` equals the input `max_capacity` value, and the payload
 * should NOT contain a `total_capacity` key.
 *
 * **Validates: Requirements 3.2, 3.5, 9.6**
 */

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { buildIntakePayload } from '@/services/catalog'
import type { IntakeFormData } from '@/services/catalog'

/**
 * Arbitrary that generates valid IntakeFormData with a numeric max_capacity.
 */
const intakeFormDataArb: fc.Arbitrary<IntakeFormData> = fc.record({
  id: fc.option(fc.uuid(), { nil: undefined }),
  name: fc.string({ minLength: 1, maxLength: 80 }),
  year: fc.integer({ min: 2020, max: 2040 }),
  start_date: fc.constantFrom('2026-01-15', '2026-07-01', '2025-09-01'),
  end_date: fc.constantFrom('2026-06-30', '2026-12-31', '2025-12-15'),
  application_deadline: fc.constantFrom('2025-12-01', '2026-05-01', '2025-08-01'),
  max_capacity: fc.integer({ min: 1, max: 10000 }),
})

describe('Property 4: buildIntakePayload maps max_capacity directly', () => {
  it('payload max_capacity equals input max_capacity for any valid form data', () => {
    fc.assert(
      fc.property(intakeFormDataArb, (formData) => {
        const payload = buildIntakePayload(formData)

        // max_capacity in the payload must equal the input value
        expect(payload.max_capacity).toBe(formData.max_capacity)
      }),
      { numRuns: 100 },
    )
  })

  it('payload does NOT contain a total_capacity key', () => {
    fc.assert(
      fc.property(intakeFormDataArb, (formData) => {
        const payload = buildIntakePayload(formData)

        // The payload must not have total_capacity — that was the old wrong field name
        expect(payload).not.toHaveProperty('total_capacity')
      }),
      { numRuns: 100 },
    )
  })
})
