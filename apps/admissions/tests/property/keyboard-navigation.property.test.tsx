// Feature: ui-ux-quality-audit, Property 8: FocusTrap cycles focus within container
// Feature: ui-ux-quality-audit, Property 9: Arrow key navigation computes correct index
/**
 * Property 8: FocusTrap cycles focus within container
 *
 * For any set of focusable elements inside an active FocusTrap, pressing Tab
 * on the last focusable element SHALL move focus to the first focusable element,
 * and pressing Shift+Tab on the first focusable element SHALL move focus to the
 * last focusable element.
 *
 * **Validates: Requirements 10.2**
 *
 * Property 9: Arrow key navigation computes correct index
 *
 * For any current index in range [0, itemCount-1] and itemCount > 0,
 * handleHorizontalArrowNavigation with ArrowRight SHALL produce
 * (currentIndex + 1) % itemCount, and with ArrowLeft SHALL produce
 * (currentIndex - 1 + itemCount) % itemCount. Home SHALL produce 0
 * and End SHALL produce itemCount - 1.
 *
 * **Validates: Requirements 10.4**
 */
import React from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import * as fc from 'fast-check'
import { FocusTrap } from '@/components/ui/FocusTrap'
import { handleHorizontalArrowNavigation } from '@/lib/accessibility-utils'

// ---------------------------------------------------------------------------
// Helpers for Property 8
// ---------------------------------------------------------------------------

/** Build a FocusTrap container with N buttons */
function renderFocusTrap(n: number): { root: Root; container: HTMLDivElement; buttons: HTMLButtonElement[] } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(
      <FocusTrap active>
        {Array.from({ length: n }, (_, i) => (
          <button key={i} data-testid={`btn-${i}`}>
            Button {i}
          </button>
        ))}
      </FocusTrap>
    )
  })

  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button')
  )

  return { root, container, buttons }
}

/** Dispatch a real KeyboardEvent on the document (FocusTrap listens on document) */
function pressTab(shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
    shiftKey,
  })
  document.dispatchEvent(event)
}

// ---------------------------------------------------------------------------
// Helpers for Property 9
// ---------------------------------------------------------------------------

/** Create a minimal React.KeyboardEvent-like object for handleHorizontalArrowNavigation */
function makeKeyEvent(key: string): React.KeyboardEvent {
  return {
    key,
    preventDefault: () => {},
  } as unknown as React.KeyboardEvent
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
// Property 8: FocusTrap cycles focus within container
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 8: FocusTrap cycles focus within container', () => {
  it('Tab on last element wraps to first, Shift+Tab on first wraps to last', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (n) => {
        const { root, container, buttons } = renderFocusTrap(n)

        if (buttons.length === 0) {
          // Cleanup and skip — shouldn't happen with n >= 1
          act(() => root.unmount())
          document.body.removeChild(container)
          return
        }

        const firstButton = buttons[0]!
        const lastButton = buttons[buttons.length - 1]!

        // --- Tab on last element should wrap to first ---
        act(() => lastButton.focus())
        expect(document.activeElement).toBe(lastButton)

        act(() => pressTab(false))
        expect(document.activeElement).toBe(firstButton)

        // --- Shift+Tab on first element should wrap to last ---
        act(() => firstButton.focus())
        expect(document.activeElement).toBe(firstButton)

        act(() => pressTab(true))
        expect(document.activeElement).toBe(lastButton)

        // Cleanup
        act(() => root.unmount())
        document.body.removeChild(container)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 9: Arrow key navigation computes correct index
// ---------------------------------------------------------------------------

describe('Feature: ui-ux-quality-audit, Property 9: Arrow key navigation computes correct index', () => {
  it('ArrowRight produces (currentIndex + 1) % itemCount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).chain((itemCount) =>
          fc.tuple(
            fc.integer({ min: 0, max: itemCount - 1 }),
            fc.constant(itemCount)
          )
        ),
        ([currentIndex, itemCount]) => {
          let result = -1
          handleHorizontalArrowNavigation(
            makeKeyEvent('ArrowRight'),
            currentIndex,
            itemCount,
            (newIndex) => { result = newIndex }
          )
          expect(result).toBe((currentIndex + 1) % itemCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('ArrowLeft produces (currentIndex - 1 + itemCount) % itemCount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).chain((itemCount) =>
          fc.tuple(
            fc.integer({ min: 0, max: itemCount - 1 }),
            fc.constant(itemCount)
          )
        ),
        ([currentIndex, itemCount]) => {
          let result = -1
          handleHorizontalArrowNavigation(
            makeKeyEvent('ArrowLeft'),
            currentIndex,
            itemCount,
            (newIndex) => { result = newIndex }
          )
          expect(result).toBe((currentIndex - 1 + itemCount) % itemCount)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Home always produces index 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).chain((itemCount) =>
          fc.tuple(
            fc.integer({ min: 0, max: itemCount - 1 }),
            fc.constant(itemCount)
          )
        ),
        ([currentIndex, itemCount]) => {
          let result = -1
          handleHorizontalArrowNavigation(
            makeKeyEvent('Home'),
            currentIndex,
            itemCount,
            (newIndex) => { result = newIndex }
          )
          expect(result).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('End always produces itemCount - 1', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).chain((itemCount) =>
          fc.tuple(
            fc.integer({ min: 0, max: itemCount - 1 }),
            fc.constant(itemCount)
          )
        ),
        ([currentIndex, itemCount]) => {
          let result = -1
          handleHorizontalArrowNavigation(
            makeKeyEvent('End'),
            currentIndex,
            itemCount,
            (newIndex) => { result = newIndex }
          )
          expect(result).toBe(itemCount - 1)
        }
      ),
      { numRuns: 100 }
    )
  })
})
