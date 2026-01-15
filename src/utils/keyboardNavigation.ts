/**
 * Keyboard Navigation Utilities
 * Provides consistent keyboard navigation patterns across the application
 * Ensures WCAG 2.1 Level AA compliance for keyboard accessibility
 */

/**
 * Standard keyboard event handlers
 */
export const KEYS = {
  ENTER: 'Enter',
  SPACE: ' ',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const

/**
 * Handle Enter key press for button-like elements
 */
export function handleEnterKey(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (event.key === KEYS.ENTER) {
    event.preventDefault()
    callback()
  }
}

/**
 * Handle Space key press for button-like elements
 */
export function handleSpaceKey(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (event.key === KEYS.SPACE) {
    event.preventDefault()
    callback()
  }
}

/**
 * Handle Enter or Space key press for button-like elements
 */
export function handleActivationKeys(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (event.key === KEYS.ENTER || event.key === KEYS.SPACE) {
    event.preventDefault()
    callback()
  }
}

/**
 * Handle Escape key press for closing modals/dialogs
 */
export function handleEscapeKey(
  event: React.KeyboardEvent,
  callback: () => void
): void {
  if (event.key === KEYS.ESCAPE) {
    event.preventDefault()
    callback()
  }
}

/**
 * Handle arrow key navigation in lists
 */
export function handleArrowNavigation(
  event: React.KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  onNavigate: (newIndex: number) => void
): void {
  let newIndex = currentIndex

  switch (event.key) {
    case KEYS.ARROW_UP:
      event.preventDefault()
      newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1
      break
    case KEYS.ARROW_DOWN:
      event.preventDefault()
      newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0
      break
    case KEYS.HOME:
      event.preventDefault()
      newIndex = 0
      break
    case KEYS.END:
      event.preventDefault()
      newIndex = itemCount - 1
      break
    default:
      return
  }

  onNavigate(newIndex)
}

/**
 * Handle horizontal arrow key navigation (e.g., tabs)
 */
export function handleHorizontalArrowNavigation(
  event: React.KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  onNavigate: (newIndex: number) => void
): void {
  let newIndex = currentIndex

  switch (event.key) {
    case KEYS.ARROW_LEFT:
      event.preventDefault()
      newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1
      break
    case KEYS.ARROW_RIGHT:
      event.preventDefault()
      newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0
      break
    case KEYS.HOME:
      event.preventDefault()
      newIndex = 0
      break
    case KEYS.END:
      event.preventDefault()
      newIndex = itemCount - 1
      break
    default:
      return
  }

  onNavigate(newIndex)
}

/**
 * Trap focus within a container (for modals/dialogs)
 */
export function trapFocus(
  event: React.KeyboardEvent,
  containerRef: React.RefObject<HTMLElement>
): void {
  if (event.key !== KEYS.TAB) return

  const container = containerRef.current
  if (!container) return

  const focusableElements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )

  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]

  if (event.shiftKey) {
    // Shift + Tab
    if (document.activeElement === firstElement) {
      event.preventDefault()
      lastElement?.focus()
    }
  } else {
    // Tab
    if (document.activeElement === lastElement) {
      event.preventDefault()
      firstElement?.focus()
    }
  }
}

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(
  container: HTMLElement
): HTMLElement[] {
  const elements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )
  return Array.from(elements)
}

/**
 * Focus the first focusable element in a container
 */
export function focusFirstElement(container: HTMLElement): void {
  const elements = getFocusableElements(container)
  elements[0]?.focus()
}

/**
 * Focus the last focusable element in a container
 */
export function focusLastElement(container: HTMLElement): void {
  const elements = getFocusableElements(container)
  elements[elements.length - 1]?.focus()
}

/**
 * Check if an element is focusable
 */
export function isFocusable(element: HTMLElement): boolean {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ]

  return focusableSelectors.some((selector) => element.matches(selector))
}

/**
 * Create keyboard event handler for search inputs
 */
export function createSearchKeyHandler(
  onSearch: () => void
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent) => {
    if (event.key === KEYS.ENTER) {
      event.preventDefault()
      onSearch()
    }
  }
}

/**
 * Create keyboard event handler for form submission
 */
export function createFormSubmitKeyHandler(
  onSubmit: () => void
): (event: React.KeyboardEvent) => void {
  return (event: React.KeyboardEvent) => {
    if (event.key === KEYS.ENTER && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSubmit()
    }
  }
}

/**
 * Announce to screen readers (for dynamic content updates)
 */
export function announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  const announcement = document.createElement('div')
  announcement.setAttribute('role', 'status')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message

  document.body.appendChild(announcement)

  // Remove after announcement
  setTimeout(() => {
    document.body.removeChild(announcement)
  }, 1000)
}

/**
 * Skip to main content (for keyboard navigation)
 */
export function skipToMainContent(): void {
  const mainContent = document.querySelector('main') || document.querySelector('[role="main"]')
  if (mainContent instanceof HTMLElement) {
    mainContent.focus()
    mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
