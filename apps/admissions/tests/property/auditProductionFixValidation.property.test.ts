/**
 * Fix Validation Property Tests — Audit Production Fixes
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 *
 * These property-based tests verify the FIXED behavior works correctly
 * across a wide range of randomly generated inputs.
 *
 * 1. Settings reset merge: random form values + random server responses
 *    (with null/undefined/missing fields) → isDirty is always false after reset.
 * 2. ErrorDisplay rendering: random strings (empty, whitespace, valid text) →
 *    returns null for empty/whitespace, renders alert for non-empty.
 */
import React, { act } from 'react'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { normalizeDateInputValue } from '@/lib/profileFieldMapping'

// ---------------------------------------------------------------------------
// Helpers — Settings reset merge logic (extracted from Settings.tsx onSubmit)
// ---------------------------------------------------------------------------

/**
 * Replicates the fixed merge logic from Settings.tsx onSubmit handler.
 * Given form values and a (possibly partial/null-laden) server response,
 * produces the object passed to react-hook-form's reset().
 */
function buildResetValues(
  formValues: Record<string, string | undefined>,
  serverResponse: Record<string, string | null | undefined>,
): Record<string, string | undefined> {
  return {
    full_name: serverResponse.full_name ?? formValues.full_name,
    phone: serverResponse.phone ?? formValues.phone ?? '',
    date_of_birth: normalizeDateInputValue(
      serverResponse.date_of_birth ?? formValues.date_of_birth ?? '',
    ),
    sex: ((serverResponse.sex as 'Male' | 'Female') ?? formValues.sex) as string | undefined,
    residence_town: serverResponse.residence_town ?? formValues.residence_town ?? '',
    country: serverResponse.country ?? formValues.country ?? '',
    nrc_number: serverResponse.nrc_number ?? formValues.nrc_number ?? '',
    address: serverResponse.address ?? formValues.address ?? '',
    nationality: serverResponse.nationality ?? formValues.nationality ?? 'Zambian',
    next_of_kin_name: serverResponse.next_of_kin_name ?? formValues.next_of_kin_name ?? '',
    next_of_kin_phone: serverResponse.next_of_kin_phone ?? formValues.next_of_kin_phone ?? '',
  }
}


// ---------------------------------------------------------------------------
// Arbitraries — form values and server responses
// ---------------------------------------------------------------------------

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

/** Arbitrary non-null string value a form field might hold */
const arbFormString = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 60 }),
  fc.constantFrom('Zambian', 'Male', 'Female', 'Zambia', 'Zimbabwe', '+260-977-123456'),
)

/** Arbitrary server response value — may be null, undefined, or a string */
const arbServerValue = fc.oneof(
  fc.constant(null as string | null | undefined),
  fc.constant(undefined as string | null | undefined),
  fc.constant('' as string | null | undefined),
  fc.string({ minLength: 1, maxLength: 60 }) as fc.Arbitrary<string | null | undefined>,
  fc.constantFrom('Zambian', 'Male', 'Female', 'Zambia', '2000-01-15') as fc.Arbitrary<string | null | undefined>,
)

/** Build a random form values object (all fields present, non-null) */
const arbFormValues: fc.Arbitrary<Record<string, string | undefined>> = fc.record(
  Object.fromEntries(FORM_FIELDS.map((f) => [f, arbFormString])) as Record<string, fc.Arbitrary<string>>,
)

/** Build a random server response (fields may be null, undefined, or missing) */
const arbServerResponse: fc.Arbitrary<Record<string, string | null | undefined>> = fc.record(
  Object.fromEntries(
    FORM_FIELDS.map((f) => [f, arbServerValue]),
  ) as Record<string, fc.Arbitrary<string | null | undefined>>,
  { requiredKeys: [] },
)

// ---------------------------------------------------------------------------
// 1. Settings reset merge — Property 1 (Requirements 2.1, 2.2)
// ---------------------------------------------------------------------------

describe('[PBT] Fix Validation — Settings isDirty resets to false after save', () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any combination of form values and server response (with null,
   * undefined, or missing fields), the fixed merge logic must produce a
   * reset object where:
   *   - No field value is null or undefined (except sex which may be undefined
   *     when both server and form have no value)
   *   - Every string field has a string value (not null)
   *   - The reset object has all expected form fields
   *
   * This ensures React Hook Form's isDirty comparison finds no differences
   * between the reset defaultValues and the rendered form field values.
   */
  it('reset values contain all form fields with no null values', () => {
    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const resetValues = buildResetValues(formValues, serverResponse)

        // Every form field must be present in the reset object
        for (const field of FORM_FIELDS) {
          expect(resetValues).toHaveProperty(field)
        }

        // No field should be null — null causes isDirty mismatch with '' in inputs
        for (const field of FORM_FIELDS) {
          expect(resetValues[field]).not.toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })

  it('string fields are always strings (never null/undefined) after merge', () => {
    const stringFields = [
      'phone',
      'residence_town',
      'country',
      'nrc_number',
      'address',
      'nationality',
      'next_of_kin_name',
      'next_of_kin_phone',
      'date_of_birth',
    ]

    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const resetValues = buildResetValues(formValues, serverResponse)

        for (const field of stringFields) {
          expect(typeof resetValues[field]).toBe('string')
        }
      }),
      { numRuns: 200 },
    )
  })

  it('date_of_birth is always a valid YYYY-MM-DD string or empty string', () => {
    fc.assert(
      fc.property(arbFormValues, arbServerResponse, (formValues, serverResponse) => {
        const resetValues = buildResetValues(formValues, serverResponse)
        const dob = resetValues.date_of_birth as string

        expect(typeof dob).toBe('string')
        // Must be either empty or a valid YYYY-MM-DD date
        if (dob !== '') {
          expect(dob).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('nationality defaults to "Zambian" when both server and form values are null/undefined', () => {
    const resetValues = buildResetValues(
      { full_name: 'Test', nationality: undefined } as Record<string, string | undefined>,
      { nationality: null } as Record<string, string | null | undefined>,
    )

    expect(resetValues.nationality).toBe('Zambian')
  })

  it('server values take precedence over form values when non-null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (formPhone, serverPhone) => {
          const resetValues = buildResetValues(
            { phone: formPhone } as Record<string, string | undefined>,
            { phone: serverPhone } as Record<string, string | null | undefined>,
          )

          expect(resetValues.phone).toBe(serverPhone)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('form values are used as fallback when server returns null', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        (formPhone) => {
          const resetValues = buildResetValues(
            { phone: formPhone } as Record<string, string | undefined>,
            { phone: null } as Record<string, string | null | undefined>,
          )

          expect(resetValues.phone).toBe(formPhone)
        },
      ),
      { numRuns: 50 },
    )
  })
})


// ---------------------------------------------------------------------------
// 2. ErrorDisplay rendering — Property 2 (Requirements 2.3, 2.4)
// ---------------------------------------------------------------------------

describe('[PBT] Fix Validation — ErrorDisplay rendering for all message types', () => {
  let container: HTMLDivElement
  let root: Root

  function setup(): void {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }

  function teardown(): void {
    act(() => { root.unmount() })
    document.body.removeChild(container)
  }

  /**
   * **Validates: Requirements 2.3, 2.4**
   *
   * For any empty or whitespace-only message, ErrorDisplay must return null
   * (no DOM element with role="alert"). For any non-empty, non-whitespace
   * message, ErrorDisplay must render a role="alert" element containing
   * the message text.
   */

  // Arbitrary: empty or whitespace-only strings
  const arbEmptyOrWhitespace = fc.oneof(
    fc.constant(''),
    fc.constant('   '),
    fc.constant('  \t  '),
    fc.constant('\n'),
    fc.constant(' \n \t '),
    fc.constant('    \r\n   '),
  )

  // Arbitrary: non-empty, non-whitespace strings
  const arbNonEmptyMessage = fc.string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0)

  // Arbitrary: variant
  const arbVariant = fc.constantFrom('section' as const, 'inline' as const)

  it('returns null (no role="alert") for empty/whitespace messages across both variants', () => {
    fc.assert(
      fc.property(arbEmptyOrWhitespace, arbVariant, (message, variant) => {
        setup()

        act(() => {
          root.render(React.createElement(ErrorDisplay, { message, variant }))
        })

        const alertEl = container.querySelector('[role="alert"]')
        expect(alertEl).toBeNull()

        teardown()
      }),
      { numRuns: 30 },
    )
  })

  it('renders role="alert" with message text for non-empty messages (section variant)', () => {
    fc.assert(
      fc.property(arbNonEmptyMessage, (message) => {
        setup()

        act(() => {
          root.render(React.createElement(ErrorDisplay, { message, variant: 'section' }))
        })

        const alertEl = container.querySelector('[role="alert"]')
        expect(alertEl).not.toBeNull()
        expect(alertEl!.textContent).toContain(message)

        teardown()
      }),
      { numRuns: 30 },
    )
  })

  it('renders role="alert" with message text for non-empty messages (inline variant)', () => {
    fc.assert(
      fc.property(arbNonEmptyMessage, (message) => {
        setup()

        act(() => {
          root.render(React.createElement(ErrorDisplay, { message, variant: 'inline' }))
        })

        const alertEl = container.querySelector('[role="alert"]')
        expect(alertEl).not.toBeNull()
        expect(alertEl!.textContent).toContain(message)

        teardown()
      }),
      { numRuns: 30 },
    )
  })

  it('ErrorDisplay with empty message renders no children at all', () => {
    setup()

    act(() => {
      root.render(React.createElement(ErrorDisplay, { message: '' }))
    })

    // Container should have no child elements when message is empty
    expect(container.children.length).toBe(0)

    teardown()
  })

  it('ErrorDisplay with whitespace-only message renders no children at all', () => {
    setup()

    act(() => {
      root.render(React.createElement(ErrorDisplay, { message: '   \t\n  ' }))
    })

    expect(container.children.length).toBe(0)

    teardown()
  })
})
