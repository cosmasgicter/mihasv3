// Feature: ui-ux-quality-audit, Property 7: Style injection deduplicates across multiple component instances
/**
 * Property 7: Style injection deduplicates across multiple component instances
 *
 * For any number N >= 1 of simultaneously rendered instances of a component
 * sharing the same style key, the document SHALL contain exactly one <style>
 * element with that key's `data-style-key` attribute. When all N instances
 * unmount, the <style> element SHALL be removed from the document.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'
import { useStyleInjection } from '@/hooks/useStyleInjection'

// ---------------------------------------------------------------------------
// Test component that consumes useStyleInjection
// ---------------------------------------------------------------------------

const STYLE_KEY = 'test-dedup-key'
const STYLE_CSS = '.test-dedup { opacity: 1; }'

function StyleConsumer() {
  useStyleInjection(STYLE_KEY, STYLE_CSS)
  return <span data-testid="style-consumer" />
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function queryStyleElements(key: string): NodeListOf<HTMLStyleElement> {
  return document.querySelectorAll<HTMLStyleElement>(
    `style[data-style-key="${key}"]`
  )
}

/** Render N instances of StyleConsumer into a container, return root + container for cleanup */
function renderInstances(n: number): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <>
        {Array.from({ length: n }, (_, i) => (
          <StyleConsumer key={i} />
        ))}
      </>
    )
  })

  return { root, container }
}

// ---------------------------------------------------------------------------
// Cleanup: remove any leftover style elements and containers between tests
// ---------------------------------------------------------------------------

afterEach(() => {
  // Clean up any lingering style elements from the test key
  queryStyleElements(STYLE_KEY).forEach((el) => el.remove())
  // Clean up any test containers left in body
  document.body.querySelectorAll('div').forEach((el) => {
    if (document.body.contains(el)) {
      document.body.removeChild(el)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 7: Style injection deduplicates across multiple component instances', () => {
  it('Property 7: exactly one <style> element exists for N (1–10) instances sharing the same key', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        const { root, container } = renderInstances(n)

        // Verify exactly one <style> element with the key
        const styleElements = queryStyleElements(STYLE_KEY)
        expect(styleElements.length).toBe(1)
        expect(styleElements[0].textContent).toBe(STYLE_CSS)

        // Cleanup: unmount and remove container
        act(() => {
          root.unmount()
        })
        document.body.removeChild(container)

        // After unmount, the style element should be removed
        const remaining = queryStyleElements(STYLE_KEY)
        expect(remaining.length).toBe(0)
      }),
      { numRuns: 100 }
    )
  })
})
