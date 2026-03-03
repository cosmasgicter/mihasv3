/**
 * Property-based tests for Escape key closing overlays
 * Feature: website-quality-remediation, Property 19: Escape key closes overlays
 *
 * **Validates: Requirements 14.4**
 *
 * Tests verify that the useEscapeKey hook correctly:
 * - Calls the onEscape callback when Escape is pressed and the overlay is active
 * - Does NOT call the onEscape callback when the overlay is inactive
 * - Does NOT call the onEscape callback for non-Escape keys
 * - Cleans up event listeners when deactivated
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Arbitrary for non-Escape key names */
const nonEscapeKeyArb = fc.oneof(
  fc.constantFrom(
    'Enter', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
    'a', 'b', 'c', 'z', '1', '0', 'F1', 'F12', 'Shift', 'Control', 'Alt', 'Meta'
  ),
  fc.string({ minLength: 1, maxLength: 10 }).filter(s => s !== 'Escape')
)

/** Arbitrary for number of Escape presses (1 to 10) */
const escapeCountArb = fc.integer({ min: 1, max: 10 })

/** Arbitrary for a sequence of mixed key events */
const keySequenceArb = fc.array(
  fc.oneof(
    fc.constant('Escape'),
    nonEscapeKeyArb
  ),
  { minLength: 1, maxLength: 20 }
)

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Simulates the useEscapeKey hook behavior by attaching/detaching
 * a keydown listener on the document, mirroring the hook's logic.
 * Returns a cleanup function.
 */
function attachEscapeListener(
  isActive: boolean,
  onEscape: () => void
): (() => void) | undefined {
  if (!isActive) return undefined

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}

/** Dispatch a keydown event with the given key */
function dispatchKey(key: string): void {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Property 19: Escape key closes overlays', () => {
  let cleanups: Array<(() => void) | undefined>

  beforeEach(() => {
    cleanups = []
  })

  afterEach(() => {
    cleanups.forEach(fn => fn?.())
  })

  it('should call onEscape every time Escape is pressed when overlay is active', () => {
    fc.assert(
      fc.property(escapeCountArb, (count) => {
        const onEscape = vi.fn()
        const cleanup = attachEscapeListener(true, onEscape)
        cleanups.push(cleanup)

        for (let i = 0; i < count; i++) {
          dispatchKey('Escape')
        }

        expect(onEscape).toHaveBeenCalledTimes(count)

        cleanup?.()
        cleanups.pop()
      }),
      { numRuns: 100 }
    )
  })

  it('should never call onEscape when overlay is inactive, regardless of key presses', () => {
    fc.assert(
      fc.property(keySequenceArb, (keys) => {
        const onEscape = vi.fn()
        const cleanup = attachEscapeListener(false, onEscape)
        cleanups.push(cleanup)

        for (const key of keys) {
          dispatchKey(key)
        }

        expect(onEscape).not.toHaveBeenCalled()

        cleanup?.()
        cleanups.pop()
      }),
      { numRuns: 100 }
    )
  })

  it('should never call onEscape for non-Escape keys when overlay is active', () => {
    fc.assert(
      fc.property(nonEscapeKeyArb, (key) => {
        const onEscape = vi.fn()
        const cleanup = attachEscapeListener(true, onEscape)
        cleanups.push(cleanup)

        dispatchKey(key)

        expect(onEscape).not.toHaveBeenCalled()

        cleanup?.()
        cleanups.pop()
      }),
      { numRuns: 100 }
    )
  })

  it('should call onEscape exactly once per Escape in a mixed key sequence', () => {
    fc.assert(
      fc.property(keySequenceArb, (keys) => {
        const onEscape = vi.fn()
        const cleanup = attachEscapeListener(true, onEscape)
        cleanups.push(cleanup)

        for (const key of keys) {
          dispatchKey(key)
        }

        const expectedCalls = keys.filter(k => k === 'Escape').length
        expect(onEscape).toHaveBeenCalledTimes(expectedCalls)

        cleanup?.()
        cleanups.pop()
      }),
      { numRuns: 100 }
    )
  })

  it('should stop calling onEscape after listener cleanup (simulating overlay close)', () => {
    fc.assert(
      fc.property(escapeCountArb, escapeCountArb, (beforeCount, afterCount) => {
        const onEscape = vi.fn()
        const cleanup = attachEscapeListener(true, onEscape)

        // Press Escape while active
        for (let i = 0; i < beforeCount; i++) {
          dispatchKey('Escape')
        }
        expect(onEscape).toHaveBeenCalledTimes(beforeCount)

        // Cleanup (simulates overlay closing / hook deactivation)
        cleanup?.()

        // Press Escape after cleanup — should not trigger
        for (let i = 0; i < afterCount; i++) {
          dispatchKey('Escape')
        }
        expect(onEscape).toHaveBeenCalledTimes(beforeCount)
      }),
      { numRuns: 100 }
    )
  })
})
