import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Traps keyboard focus within a container element while active.
 *
 * - Saves the previously focused element on activation
 * - Moves focus to the first focusable child
 * - Wraps Tab / Shift+Tab at container boundaries
 * - Restores focus to the previously focused element on deactivation
 * - Optionally closes on Escape key via `onEscape` callback
 *
 * Re-queries focusable elements on every Tab press so dynamically
 * added/removed content is handled correctly.
 */
export function useFocusTrap(
  isActive: boolean,
  onEscape?: () => void
): RefObject<HTMLElement> {
  const containerRef = useRef<HTMLElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive) return

    const container = containerRef.current
    if (!container) return

    // Store previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus first focusable element inside the container
    const initialFocusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    initialFocusable[0]?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscape) {
        e.preventDefault()
        e.stopPropagation()
        onEscape()
        return
      }

      if (e.key !== 'Tab') return

      // Re-query on every Tab so dynamic content is handled
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last!.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first!.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)
      // Restore focus to the element that was focused before the trap activated
      previousFocusRef.current?.focus()
    }
  }, [isActive, onEscape])

  return containerRef
}

