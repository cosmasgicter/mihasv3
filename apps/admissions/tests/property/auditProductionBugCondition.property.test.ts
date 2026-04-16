/**
 * Bug Condition Exploration — Audit Production Fixes
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.10, 1.11**
 *
 * These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on
 * unfixed code — failure confirms the bugs exist.
 *
 * Bug 1: Settings isDirty persists after save because reset() spreads
 *   server response with null fields over form values that had empty strings.
 *   On UNFIXED code isDirty remains true after reset → test FAILS.
 *
 * Bug 2: ErrorDisplay renders role="alert" even for empty/whitespace messages.
 *   On UNFIXED code the alert div is always rendered → test FAILS.
 *
 * Bug 5: Font fallback chain in tailwind.config.js is incomplete — missing
 *   intermediate fallbacks like ui-sans-serif, -apple-system, BlinkMacSystemFont.
 *   On UNFIXED code only Inter, system-ui, sans-serif are present → test FAILS.
 */
import React, { act } from 'react'
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'
import * as fs from 'fs'
import * as path from 'path'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'

// ---------------------------------------------------------------------------
// Bug 1 — Settings isDirty: the unfixed reset merge produces null values
// ---------------------------------------------------------------------------

describe('[PBT] Bug 1 — Settings isDirty resets to false after save', () => {
  /**
   * The UNFIXED onSubmit does:
   *   reset({ ...formValues, ...updatedProfile,
   *     date_of_birth: updatedProfile.date_of_birth ?? formValues.date_of_birth,
   *     sex: (updatedProfile.sex as ...) ?? formValues.sex })
   *
   * When updatedProfile has null for optional fields (phone, country, etc.),
   * the spread overwrites formValues' empty strings with null. The reset()
   * call then sets defaultValues with null, but form inputs render as empty
   * strings. On the next isDirty check, '' !== null → isDirty stays true.
   *
   * We test this by reading the actual Settings.tsx source and verifying
   * the reset call handles null-to-empty-string normalization for ALL fields.
   */

  const optionalFields = [
    'phone',
    'residence_town',
    'country',
    'nrc_number',
    'address',
    'next_of_kin_name',
    'next_of_kin_phone',
  ]

  const arbOptionalField = fc.constantFrom(...optionalFields)

  it('Settings onSubmit reset handles null server values with explicit fallbacks for all optional fields', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const fileContent = fs.readFileSync(filePath, 'utf-8')

    // Find the reset() call inside the onSubmit/try block
    // The UNFIXED code does: reset({ ...formValues, ...updatedProfile, ... })
    // The FIXED code should have explicit field-by-field merge with ?? fallbacks

    fc.assert(
      fc.property(arbOptionalField, (field) => {
        // EXPECTED (fixed): each optional field should have an explicit
        // null-coalescing fallback like: field: updatedProfile.field ?? formValues.field ?? ''
        // On UNFIXED code: the spread ...updatedProfile passes null through → FAILS

        // Check that the reset call explicitly handles this field with a ?? fallback
        // The fixed code should have something like: phone: updatedProfile.phone ?? formValues.phone ?? ''
        const fieldPattern = new RegExp(
          `${field}:\\s*(?:updatedProfile\\.${field}|[^,}]*?)\\s*\\?\\?\\s*(?:formValues\\.${field}|[^,}]*?)\\s*\\?\\?\\s*['"]`,
        )

        // EXPECTED (fixed): explicit null-safe merge for each optional field
        // On UNFIXED code: relies on spread which passes null through → FAILS
        expect(fileContent).toMatch(fieldPattern)
      }),
      { numRuns: optionalFields.length },
    )
  })
})


// ---------------------------------------------------------------------------
// Bug 2 — ErrorDisplay renders role="alert" for empty/whitespace messages
// ---------------------------------------------------------------------------

describe('[PBT] Bug 2 — ErrorDisplay returns null for empty messages', () => {
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

  // Arbitrary: empty or whitespace-only strings
  const arbEmptyMessage = fc.constantFrom('', '   ', '  \t  ', '\n')

  it('no role="alert" element exists when message is empty or whitespace', () => {
    fc.assert(
      fc.property(arbEmptyMessage, (message) => {
        setup()

        act(() => {
          root.render(React.createElement(ErrorDisplay, { message }))
        })

        // EXPECTED (fixed): ErrorDisplay returns null for empty/whitespace messages
        // On UNFIXED code: the component always renders a div with role="alert" → FAILS
        const alertElement = container.querySelector('[role="alert"]')
        expect(alertElement).toBeNull()

        teardown()
      }),
      { numRuns: 10 },
    )
  })

  it('no role="alert" element exists for inline variant with empty message', () => {
    setup()

    act(() => {
      root.render(
        React.createElement(ErrorDisplay, { message: '', variant: 'inline' as const }),
      )
    })

    // EXPECTED (fixed): inline variant also returns null for empty message
    // On UNFIXED code: inline variant renders role="alert" div → FAILS
    const alertElement = container.querySelector('[role="alert"]')
    expect(alertElement).toBeNull()

    teardown()
  })
})

// ---------------------------------------------------------------------------
// Bug 5 — Font fallback chain incomplete in tailwind.config.js
// ---------------------------------------------------------------------------

describe('[PBT] Bug 5 — Font fallback chain includes intermediate fallbacks', () => {
  // Required intermediate fallback fonts between Inter and generic sans-serif
  const requiredFallbacks = [
    'ui-sans-serif',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
  ]

  const arbRequiredFont = fc.constantFrom(...requiredFallbacks)

  // Read the tailwind config file as text and parse the fontFamily.sans array
  function parseFontSansFromConfig(): string[] {
    const configPath = path.resolve(__dirname, '../../tailwind.config.js')
    const configContent = fs.readFileSync(configPath, 'utf-8')

    // Extract the fontFamily.sans array from the config source
    const fontMatch = configContent.match(/fontFamily:\s*\{[^}]*sans:\s*\[([\s\S]*?)\]/)
    if (!fontMatch) return []

    // Parse the array entries — they're quoted strings
    const arrayContent = fontMatch[1]
    const fonts = arrayContent.match(/['"]([^'"]+)['"]/g)
    if (!fonts) return []

    return fonts.map(f => f.replace(/['"]/g, ''))
  }

  it('tailwind fontFamily.sans contains all required intermediate fallbacks', () => {
    const fontSans = parseFontSansFromConfig()

    fc.assert(
      fc.property(arbRequiredFont, (requiredFont) => {
        // EXPECTED (fixed): fontFamily.sans includes all intermediate fallbacks
        // On UNFIXED code: only ['Inter', 'system-ui', 'sans-serif'] → FAILS
        // for ui-sans-serif, -apple-system, BlinkMacSystemFont, Segoe UI
        expect(fontSans).toContain(requiredFont)
      }),
      { numRuns: requiredFallbacks.length },
    )
  })

  it('fontFamily.sans has at least 7 entries (Inter + intermediates + sans-serif)', () => {
    const fontSans = parseFontSansFromConfig()

    // EXPECTED (fixed): at least 7 entries total (Inter + 5+ intermediates + sans-serif)
    // On UNFIXED code: only 3 entries ['Inter', 'system-ui', 'sans-serif'] → FAILS
    expect(fontSans.length).toBeGreaterThanOrEqual(7)
  })
})
