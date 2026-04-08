// Feature: ui-ux-quality-audit, Property 10: Decorative SmoothUI elements use aria-hidden
/**
 * Property 10: Decorative SmoothUI elements use aria-hidden
 *
 * For any rendered instance of InfiniteGrid with random props,
 * the root container element SHALL have aria-hidden="true".
 *
 * **Validates: Requirements 11.6**
 */
import React from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Mock dependencies that InfiniteGrid uses
// ---------------------------------------------------------------------------

// Mock useReducedMotion to avoid matchMedia issues in jsdom
vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => false,
}))

// Mock useStyleInjection — we don't need real style injection for this test
vi.mock('@/hooks/useStyleInjection', () => ({
  useStyleInjection: () => {},
}))

// Import after mocks are set up
const { InfiniteGrid } = await import(
  '@/components/smoothui/infinite-grid'
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderInfiniteGrid(
  props: {
    cellSize?: number
    lineOpacity?: number
    speed?: number
    className?: string
  }
): { root: Root; container: HTMLDivElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<InfiniteGrid {...props} />)
  })

  return { root, container }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  document.body.querySelectorAll('div').forEach((el) => {
    if (document.body.contains(el)) {
      document.body.removeChild(el)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 10: Decorative SmoothUI elements use aria-hidden', () => {
  it('Property 10: InfiniteGrid root container has aria-hidden="true" for any random props', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 100 }),   // cellSize
        fc.double({ min: 0.05, max: 1, noNaN: true }), // lineOpacity
        fc.double({ min: 0.1, max: 5, noNaN: true }),   // speed
        (cellSize, lineOpacity, speed) => {
          const { root, container } = renderInfiniteGrid({
            cellSize,
            lineOpacity,
            speed,
          })

          // The root element rendered by InfiniteGrid should have aria-hidden="true"
          const rootEl = container.firstElementChild
          expect(rootEl).not.toBeNull()
          expect(rootEl!.getAttribute('aria-hidden')).toBe('true')

          // Cleanup
          act(() => {
            root.unmount()
          })
          document.body.removeChild(container)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 10: InfiniteGrid with default props has aria-hidden="true"', () => {
    const { root, container } = renderInfiniteGrid({})

    const rootEl = container.firstElementChild
    expect(rootEl).not.toBeNull()
    expect(rootEl!.getAttribute('aria-hidden')).toBe('true')

    act(() => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('Property 10: InfiniteGrid with optional className still has aria-hidden="true"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 100 }),
        fc.constantFrom('bg-red-500', 'opacity-50', 'z-10', 'custom-class'),
        (cellSize, className) => {
          const { root, container } = renderInfiniteGrid({
            cellSize,
            className,
          })

          const rootEl = container.firstElementChild
          expect(rootEl).not.toBeNull()
          expect(rootEl!.getAttribute('aria-hidden')).toBe('true')

          act(() => {
            root.unmount()
          })
          document.body.removeChild(container)
        }
      ),
      { numRuns: 100 }
    )
  })
})
