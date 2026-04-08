// Feature: ui-ux-quality-audit, Property 4: Form error messages are announced via aria-live
/**
 * Property 4: Form error messages are announced via aria-live
 *
 * For any Input component rendered with a non-empty error prop, the error message
 * element SHALL have role="alert" (which implicitly provides assertive announcement),
 * ensuring screen readers announce validation errors.
 *
 * **Validates: Requirements 5.5, 5.6**
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'
import { Input } from '@/components/ui/input'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let container: HTMLDivElement
let root: Root

function setup(): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
}

function cleanup(): void {
  act(() => {
    root.unmount()
  })
  document.body.removeChild(container)
}

afterEach(() => {
  document.body.querySelectorAll('div').forEach((el) => {
    if (document.body.contains(el) && el !== document.body) {
      try {
        document.body.removeChild(el)
      } catch {
        // ignore
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Non-empty string for error messages */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 80 }).filter((s) => s.trim().length > 0)

// ---------------------------------------------------------------------------
// Property 4: Form error messages are announced via aria-live
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 4: Form error messages are announced via aria-live', () => {
  it('error element has role="alert" for any non-empty error string', () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        setup()

        act(() => {
          root.render(<Input error={errorMsg} />)
        })

        const alertEl = container.querySelector('[role="alert"]')
        expect(alertEl, 'Expected an element with role="alert"').not.toBeNull()
        expect(alertEl!.textContent).toContain(errorMsg)

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('no role="alert" element when error prop is absent', () => {
    setup()

    act(() => {
      root.render(<Input placeholder="No error" />)
    })

    const alertEl = container.querySelector('[role="alert"]')
    expect(alertEl, 'Should not have role="alert" without error').toBeNull()

    cleanup()
  })

  it('input has aria-invalid="true" when error is present', () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        setup()

        act(() => {
          root.render(<Input error={errorMsg} />)
        })

        const input = container.querySelector('input')
        expect(input).not.toBeNull()
        expect(input!.getAttribute('aria-invalid')).toBe('true')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('input aria-describedby references the error element id', () => {
    fc.assert(
      fc.property(errorMessageArb, (errorMsg) => {
        setup()

        act(() => {
          root.render(<Input error={errorMsg} />)
        })

        const input = container.querySelector('input')
        const alertEl = container.querySelector('[role="alert"]')
        expect(input).not.toBeNull()
        expect(alertEl).not.toBeNull()

        const errorId = alertEl!.getAttribute('id')
        expect(errorId).toBeTruthy()

        const describedBy = input!.getAttribute('aria-describedby')
        expect(describedBy).toContain(errorId!)

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})
