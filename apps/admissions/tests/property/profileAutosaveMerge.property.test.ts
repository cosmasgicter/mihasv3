/**
 * Property tests for the canonical profile autosave reset merge (task 6.1).
 *
 * The shared `buildProfileResetValues` is the single source of truth for the
 * audit-production Settings fix (isDirty must not persist after save). These
 * properties assert that across arbitrary form values + arbitrary (partial /
 * null-laden) server responses, the merged reset object always has every field
 * present and every string field is a real string (never null/undefined) — so
 * it always matches the controlled inputs and clears the dirty state.
 *
 * Validates: Requirements R9.3, R9.8.
 */
import { describe, expect, it } from 'vitest'
import * as fc from 'fast-check'

import { buildProfileResetValues } from '@/lib/profileAutosave'

const FORM_FIELDS = [
  'full_name',
  'phone',
  'date_of_birth',
  'sex',
  'residence_town',
  'country',
  'nrc_number',
  'address',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone',
] as const

const STRING_FIELDS = [
  'phone',
  'date_of_birth',
  'residence_town',
  'country',
  'nrc_number',
  'address',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone',
] as const

const arbFormString = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 60 }),
  fc.constantFrom('Zambian', 'Male', 'Female', 'Zambia', '+260970000000', '1990-01-01'),
)

const arbFormValues = fc.record(
  Object.fromEntries(FORM_FIELDS.map((f) => [f, fc.option(arbFormString, { nil: undefined })])),
)

const arbServerValue = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 60 }),
  fc.constantFrom('Zambian', 'Male', 'Female', 'Zambia', '2000-12-31'),
)

const arbServerResponse = fc.record(
  Object.fromEntries(FORM_FIELDS.map((f) => [f, arbServerValue])),
)

describe('buildProfileResetValues — property', () => {
  it('always includes every form field', () => {
    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const merged = buildProfileResetValues(formValues, serverResponse)
        for (const field of FORM_FIELDS) {
          expect(merged).toHaveProperty(field)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('never yields a null field', () => {
    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const merged = buildProfileResetValues(formValues, serverResponse)
        for (const field of FORM_FIELDS) {
          expect(merged[field]).not.toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps string fields as strings after merge', () => {
    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const merged = buildProfileResetValues(formValues, serverResponse)
        for (const field of STRING_FIELDS) {
          expect(typeof merged[field]).toBe('string')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('date_of_birth is always empty or a valid YYYY-MM-DD string', () => {
    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const merged = buildProfileResetValues(formValues, serverResponse)
        const dob = merged.date_of_birth as string
        expect(typeof dob).toBe('string')
        if (dob !== '') {
          expect(dob).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      }),
      { numRuns: 200 },
    )
  })
})
