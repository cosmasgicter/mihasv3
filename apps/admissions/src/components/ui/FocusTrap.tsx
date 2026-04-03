import React, { useEffect, useRef } from 'react'

interface FocusTrapProps {
  children: React.ReactNode
  active?: boolean
  restoreFocus?: boolean
  initialFocus?: React.RefObject<HTMLElement>
}

/**
 * Focus Trap Component
 * Traps keyboard focus within a container (useful for modals)
 * Restores focus when deactivated
 */
export function FocusTrap({ 
  children, 
  active = true, 
  restoreFocus = true,
  initialFocus 
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active) return

    // Store the currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus the initial element or first focusable element
    const focusInitialElement = () => {
      if (initialFocus?.current) {
        initialFocus.current.focus()
      } else {
        const firstFocusable = getFocusableElements()[0]
        firstFocusable?.focus()
      }
    }

    // Small delay to ensure DOM is ready
    setTimeout(focusInitialElement, 10)

    // Get all focusable elements within the container
    const getFocusableElements = (): HTMLElement[] => {
      if (!containerRef.current) return []

      const selector = [
        'a[href]',
        'button:not([disabled])',
        'textarea:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(', ')

      return Array.from(containerRef.current.querySelectorAll(selector))
    }

    // Handle Tab key to trap focus
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement as HTMLElement

      // Shift + Tab (backwards)
      if (event.shiftKey) {
        if (activeElement === firstElement) {
          event.preventDefault()
          lastElement!.focus()
        }
      } 
      // Tab (forwards)
      else {
        if (activeElement === lastElement) {
          event.preventDefault()
          firstElement!.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      // Restore focus to previous element
      if (restoreFocus && previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [active, restoreFocus, initialFocus])

  return (
    <div ref={containerRef}>
      {children}
    </div>
  )
}
