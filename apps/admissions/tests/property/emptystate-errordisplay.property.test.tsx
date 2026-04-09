// Feature: ui-ux-quality-audit, Property 5: EmptyState renders according to prop contract
// Feature: ui-ux-quality-audit, Property 6: ErrorDisplay supportUrl defaults and overrides correctly
/**
 * Property 5: EmptyState renders according to prop contract
 *
 * For any EmptyState component rendered with a headingLevel prop of 'h2' or 'h3',
 * the heading element SHALL use the corresponding HTML tag. When a secondaryAction
 * prop is provided, the rendered output SHALL contain a button with the secondary
 * action's label text. When secondaryAction is absent, no secondary button SHALL appear.
 *
 * **Validates: Requirements 6.4, 6.5**
 *
 * Property 6: ErrorDisplay supportUrl defaults and overrides correctly
 *
 * For any ErrorDisplay component, when supportUrl is not provided, the "Contact Support"
 * link SHALL point to /contact. When supportUrl is provided with any valid URL string,
 * the link SHALL point to that URL. When onGoBack is provided but onRetry is not, the
 * component SHALL render a "Go Back" button instead of a "Retry" button.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'

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
  // Safety cleanup for any leftover containers
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

const headingLevelArb = fc.constantFrom('h2' as const, 'h3' as const)

const secondaryActionArb = fc.option(
  fc.record({
    label: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    onClick: fc.constant(() => {}),
  }),
  { nil: undefined },
)

/** Generate a path-like URL string starting with / */
const supportUrlArb = fc
  .stringMatching(/^[a-z0-9-]{1,20}$/)
  .map((s) => `/${s}`)

// ---------------------------------------------------------------------------
// Property 5: EmptyState renders according to prop contract
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 5: EmptyState renders according to prop contract', () => {
  it('heading tag matches headingLevel prop', () => {
    fc.assert(
      fc.property(headingLevelArb, (headingLevel) => {
        setup()

        act(() => {
          root.render(
            <EmptyState heading="Test heading" headingLevel={headingLevel} />,
          )
        })

        const headingEl = container.querySelector(headingLevel)
        expect(headingEl, `Expected a <${headingLevel}> element`).not.toBeNull()
        expect(headingEl!.textContent).toBe('Test heading')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('secondary button present when secondaryAction provided, absent otherwise', () => {
    fc.assert(
      fc.property(headingLevelArb, secondaryActionArb, (headingLevel, secondaryAction) => {
        setup()

        act(() => {
          root.render(
            <EmptyState
              heading="Test heading"
              headingLevel={headingLevel}
              secondaryAction={secondaryAction}
            />,
          )
        })

        const buttons = container.querySelectorAll('button')

        if (secondaryAction) {
          // Should find a button with the secondary action label
          const secondaryBtn = Array.from(buttons).find(
            (btn) => btn.textContent === secondaryAction.label,
          )
          expect(
            secondaryBtn,
            `Expected a button with label "${secondaryAction.label}"`,
          ).not.toBeNull()
        } else {
          // No secondary action → no buttons at all (unless primary action exists, which we didn't provide)
          expect(buttons.length).toBe(0)
        }

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('defaults to h3 when headingLevel is not specified', () => {
    setup()

    act(() => {
      root.render(<EmptyState heading="Default heading" />)
    })

    const h3 = container.querySelector('h3')
    expect(h3, 'Expected default <h3> element').not.toBeNull()
    expect(h3!.textContent).toBe('Default heading')

    const h2 = container.querySelector('h2')
    expect(h2, 'Should not have <h2> when default is h3').toBeNull()

    cleanup()
  })
})

// ---------------------------------------------------------------------------
// Property 6: ErrorDisplay supportUrl defaults and overrides correctly
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 6: ErrorDisplay supportUrl defaults and overrides correctly', () => {
  it('Contact Support link defaults to /contact when supportUrl is not provided', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        setup()

        act(() => {
          root.render(<ErrorDisplay message="Something went wrong" />)
        })

        const link = container.querySelector('a[href="/contact"]')
        expect(link, 'Expected a link to /contact').not.toBeNull()
        expect(link!.textContent).toContain('Contact Support')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('Contact Support link uses custom supportUrl when provided', () => {
    fc.assert(
      fc.property(supportUrlArb, (supportUrl) => {
        setup()

        act(() => {
          root.render(
            <ErrorDisplay message="Something went wrong" supportUrl={supportUrl} />,
          )
        })

        const link = container.querySelector(`a[href="${supportUrl}"]`)
        expect(
          link,
          `Expected a link to "${supportUrl}"`,
        ).not.toBeNull()
        expect(link!.textContent).toContain('Contact Support')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('renders Go Back button when onGoBack provided and onRetry absent', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        setup()
        const goBackFn = () => {}

        act(() => {
          root.render(
            <ErrorDisplay message="Not found" onGoBack={goBackFn} />,
          )
        })

        // Should have "Go Back" button/link
        const allText = container.textContent || ''
        expect(allText).toContain('Go Back')
        // Should NOT have "Retry" (retry)
        expect(allText).not.toContain('Retry')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('renders Retry button when onRetry provided, even if onGoBack also provided', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        setup()
        const retryFn = () => {}
        const goBackFn = () => {}

        act(() => {
          root.render(
            <ErrorDisplay
              message="Network error"
              onRetry={retryFn}
              onGoBack={goBackFn}
            />,
          )
        })

        const allText = container.textContent || ''
        // Should have "Retry" (retry takes precedence)
        expect(allText).toContain('Retry')
        // Should NOT have "Go Back" when onRetry is present
        expect(allText).not.toContain('Go Back')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('renders neither Retry nor Go Back when both are absent', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        setup()

        act(() => {
          root.render(<ErrorDisplay message="Unknown error" />)
        })

        const allText = container.textContent || ''
        expect(allText).not.toContain('Retry')
        expect(allText).not.toContain('Go Back')
        // But Contact Support should still be present
        expect(allText).toContain('Contact Support')

        cleanup()
      }),
      { numRuns: 100 },
    )
  })

  it('supportUrl override works across both inline and section variants', () => {
    const variantArb = fc.constantFrom('inline' as const, 'section' as const)

    fc.assert(
      fc.property(variantArb, supportUrlArb, (variant, supportUrl) => {
        setup()

        act(() => {
          root.render(
            <ErrorDisplay
              message="Error occurred"
              variant={variant}
              supportUrl={supportUrl}
            />,
          )
        })

        const link = container.querySelector(`a[href="${supportUrl}"]`)
        expect(
          link,
          `Expected link to "${supportUrl}" in ${variant} variant`,
        ).not.toBeNull()

        cleanup()
      }),
      { numRuns: 100 },
    )
  })
})
