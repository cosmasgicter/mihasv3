/**
 * Accessibility Utilities
 * 
 * Provides utilities for WCAG 2.1 AA compliance including:
 * - Skip links for keyboard navigation
 * - Heading hierarchy validation
 * - ARIA label helpers
 * - Color contrast utilities
 * - Focus management
 * 
 * Requirements: 10.2, 10.3, 10.4, 10.7
 */

import { cn } from '@/lib/utils'

/**
 * Skip link configuration
 */
export interface SkipLinkConfig {
  /** Target element ID (without #) */
  targetId: string
  /** Link text */
  label: string
}

/**
 * Default skip links for the application
 * 
 * The primary skip link points to main content (most common use case).
 * This is the essential skip link for keyboard navigation accessibility.
 * 
 * Requirements: 4.4 - Skip links should have correct href targets (main content, not footer)
 */
export const defaultSkipLinks: SkipLinkConfig[] = [
  { targetId: 'main-content', label: 'Skip to main content' },
]

/**
 * CSS classes for skip links
 * Uses transform-based hiding for reliable accessibility:
 * - Hidden by default using transform (moves off-screen)
 * - Visible on focus by resetting transform
 * - Proper z-index and positioning when visible
 * 
 * Note: Using transform instead of sr-only/clip to avoid intermittent visibility issues
 * 
 * Requirements: 4.1, 4.2, 4.3 - Skip links hidden by default, visible on focus
 */
export const skipLinkClasses = cn(
  // Base positioning - always absolute, always at top-left when visible
  'absolute left-4 top-4 z-[9999]',
  // Hidden by default using transform (more reliable than sr-only)
  '-translate-y-full opacity-0 pointer-events-none',
  // Visible on focus - reset transform and opacity
  'focus:translate-y-0 focus:opacity-100 focus:pointer-events-auto',
  // Smooth transition for focus state
  'transition-all duration-150',
  // Styling
  'block px-4 py-2',
  'bg-primary text-primary-foreground',
  'font-medium rounded-lg shadow-lg',
  // Focus ring for visibility
  'outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
  // Ensure proper text rendering
  'whitespace-nowrap'
)

/**
 * Heading levels for hierarchy validation
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/**
 * Validate heading hierarchy
 * Returns true if headings follow proper hierarchy (no skipped levels)
 */
export function validateHeadingHierarchy(headings: HeadingLevel[]): boolean {
  if (headings.length === 0) return true
  
  // First heading should be h1
  if (headings[0] !== 1) return false
  
  // Count h1s - should be exactly one
  const h1Count = headings.filter(h => h === 1).length
  if (h1Count !== 1) return false
  
  // Check for skipped levels
  for (let i = 1; i < headings.length; i++) {
    const current = headings[i]
    const previous = headings[i - 1]
    
    // Can go down any number of levels, but can only go up by 1
    if (current > previous + 1) {
      return false
    }
  }
  
  return true
}

/**
 * Extract heading levels from a DOM element
 */
export function extractHeadingLevels(container: Element): HeadingLevel[] {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
  return Array.from(headings).map(h => {
    const tagName = h.tagName.toLowerCase()
    return parseInt(tagName.charAt(1)) as HeadingLevel
  })
}

/**
 * ARIA label helpers
 */
export const ariaLabels = {
  /** Navigation landmarks */
  navigation: {
    main: 'Main navigation',
    breadcrumb: 'Breadcrumb navigation',
    pagination: 'Pagination navigation',
    footer: 'Footer navigation',
    mobile: 'Mobile navigation menu',
  },
  /** Common actions */
  actions: {
    close: 'Close',
    open: 'Open',
    expand: 'Expand',
    collapse: 'Collapse',
    submit: 'Submit',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    save: 'Save',
    search: 'Search',
    filter: 'Filter',
    sort: 'Sort',
    refresh: 'Refresh',
    loading: 'Loading',
  },
  /** Form elements */
  form: {
    required: 'Required field',
    optional: 'Optional field',
    error: 'Error',
    success: 'Success',
    password: {
      show: 'Show password',
      hide: 'Hide password',
    },
  },
  /** Status indicators */
  status: {
    pending: 'Pending',
    inProgress: 'In progress',
    completed: 'Completed',
    error: 'Error',
    warning: 'Warning',
  },
}

/**
 * Generate ARIA describedby ID
 */
export function getAriaDescribedBy(
  baseId: string,
  hasError: boolean,
  hasHelper: boolean
): string | undefined {
  const ids: string[] = []
  
  if (hasError) {
    ids.push(`${baseId}-error`)
  }
  if (hasHelper) {
    ids.push(`${baseId}-helper`)
  }
  
  return ids.length > 0 ? ids.join(' ') : undefined
}

/**
 * Focus trap utilities
 */
export const focusTrapSelectors = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(', ')

/**
 * Get all focusable elements within a container
 */
export function getFocusableElements(container: Element): HTMLElement[] {
  const elements = container.querySelectorAll(focusTrapSelectors)
  return Array.from(elements).filter(
    el => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1'
  ) as HTMLElement[]
}

/**
 * Trap focus within a container
 */
export function trapFocus(container: Element, event: KeyboardEvent): void {
  if (event.key !== 'Tab') return
  
  const focusableElements = getFocusableElements(container)
  if (focusableElements.length === 0) return
  
  const firstElement = focusableElements[0]
  const lastElement = focusableElements[focusableElements.length - 1]
  
  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault()
    lastElement.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement.focus()
  }
}

/**
 * Color contrast ratio calculation (WCAG 2.1)
 * Returns the contrast ratio between two colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const lum1 = getRelativeLuminance(color1)
  const lum2 = getRelativeLuminance(color2)
  
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Calculate relative luminance of a color
 */
export function getRelativeLuminance(color: string): number {
  const rgb = hexToRgb(color)
  if (!rgb) return 0
  
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    const sRGB = c / 255
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })
  
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Remove # if present
  const cleanHex = hex.replace('#', '')
  
  // Handle shorthand hex (e.g., #fff)
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex
  
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex)
  
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

/**
 * Check if contrast ratio meets WCAG AA standards
 * Normal text: 4.5:1
 * Large text (18pt+ or 14pt+ bold): 3:1
 */
export function meetsWcagAA(
  contrastRatio: number,
  isLargeText: boolean = false
): boolean {
  const minRatio = isLargeText ? 3 : 4.5
  return contrastRatio >= minRatio
}

/**
 * Check if contrast ratio meets WCAG AAA standards
 * Normal text: 7:1
 * Large text: 4.5:1
 */
export function meetsWcagAAA(
  contrastRatio: number,
  isLargeText: boolean = false
): boolean {
  const minRatio = isLargeText ? 4.5 : 7
  return contrastRatio >= minRatio
}

/**
 * Announce message to screen readers
 */
export function announceToScreenReader(
  message: string,
  priority: 'polite' | 'assertive' = 'polite'
): void {
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
 * Screen reader only class
 */
export const srOnlyClass = 'sr-only'

/**
 * CSS for screen reader only content
 */
export const srOnlyStyles = {
  position: 'absolute' as const,
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap' as const,
  border: '0',
}
