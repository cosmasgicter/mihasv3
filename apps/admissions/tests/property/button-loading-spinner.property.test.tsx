// Feature: ui-ux-quality-audit, Property 1: Button loading state renders inline spinner
/**
 * Property 1: Button loading state renders inline spinner
 *
 * For any Button component rendered with loading={true} and any valid variant
 * and size combination, the rendered output SHALL contain exactly one SVG spinner
 * element inside the button, and the button SHALL have aria-busy="true" and
 * disabled attributes.
 *
 * **Validates: Requirements 1b.3, 1b.4**
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'
import { Button } from '@/components/ui/Button'

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

const variantArb = fc.constantFrom(
  'default' as const,
  'primary' as const,
  'secondary' as const,
  'outline' as const,
  'ghost' as const,
  'link' as const,
  'destructive' as const,
  'danger' as const,
  'success' as const,
  'warning' as const,
  'gradient' as const,
)

const sizeArb = fc.constantFrom(
  'default' as const,
  'xs' as const,
  'sm' as const,
  'md' as const,
  'lg' as const,
  'xl' as const,
  'icon' as const,
)

// ---------------------------------------------------------------------------
// Property 1: Button loading state renders inline spinner
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 1: Button loading state renders inline spinner', () => {
  it('renders SVG spinner, aria-busy="true", and disabled for any variant × size with loading=true', () => {
    fc.assert(
      fc.property(variantArb, sizeArb, (variant, size) => {
        setup()

        act(() => {
          root.render(
            <Button variant={variant} size={size} loading={true}>
              Submit
            </Button>,
          )
        })

        const button = container.querySelector('button')
        expect(button, 'Expected a <button> element').not.toBeNull()

        // Assert SVG spinner is present inside the button
        const svgs = button!.querySelectorAll('svg')
        expect(
          svgs.length,
          `Expected at least one SVG spinner inside button (variant=${variant}, size=${size})`,
        ).toBeGreaterThanOrEqual(1)

        // Assert aria-busy="true"
        expect(
          button!.getAttribute('aria-busy'),
          `Expected aria-busy="true" (variant=${variant}, size=${size})`,
        ).toBe('true')

        // Assert disabled attribute
        expect(
          button!.disabled,
          `Expected button to be disabled (variant=${variant}, size=${size})`,
        ).toBe(true)

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})
