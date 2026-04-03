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

import React from 'react'
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
 * Canonical main landmark id for the primary application shell.
 */
export const APP_MAIN_CONTENT_ID = 'app-main-content'

/**
 * Default skip links for the application
 * 
 * The primary skip link points to main content (most common use case).
 * This is the essential skip link for keyboard navigation accessibility.
 * 
 * Requirements: 4.4 - Skip links should have correct href targets (main content, not footer)
 */
export const defaultSkipLinks: SkipLinkConfig[] = [
  { targetId: APP_MAIN_CONTENT_ID, label: 'Skip to main content' },
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
    if (current! > previous! + 1) {
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
    lastElement!.focus()
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault()
    firstElement!.focus()
  }
}

/**
 * Convert hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleanHex = hex.replace('#', '')
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex)
  return result
    ? {
        r: parseInt(result[1]!, 16),
        g: parseInt(result[2]!, 16),
        b: parseInt(result[3]!, 16),
      }
    : null
}

/**
 * Convert RGB string to RGB values
 */
export function rgbStringToRgb(rgb: string): { r: number; g: number; b: number } | null {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (match) {
    return {
      r: parseInt(match[1]!, 10),
      g: parseInt(match[2]!, 10),
      b: parseInt(match[3]!, 10)
    }
  }
  return null
}

const NAMED_COLORS: Record<string, string> = {
  'white': '#ffffff', 'black': '#000000', 'red': '#ff0000',
  'green': '#008000', 'blue': '#0000ff', 'yellow': '#ffff00',
  'cyan': '#00ffff', 'magenta': '#ff00ff', 'gray': '#808080', 'grey': '#808080'
}

/**
 * Parse color string (hex, rgb(), or named) to RGB values
 */
export function parseColor(color: string): { r: number; g: number; b: number } | null {
  if (color.startsWith('#')) return hexToRgb(color)
  if (color.startsWith('rgb(')) return rgbStringToRgb(color)
  if (NAMED_COLORS[color.toLowerCase()]) return hexToRgb(NAMED_COLORS[color.toLowerCase()]!)
  return null
}

/**
 * Calculate relative luminance of a color (WCAG 2.1)
 */
export function getRelativeLuminance(color: string): number {
  const rgb = parseColor(color)
  if (!rgb) return 0

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
    const sRGB = c / 255
    return sRGB <= 0.03928
      ? sRGB / 12.92
      : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })

  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/**
 * Color contrast ratio calculation (WCAG 2.1)
 * Accepts hex, rgb(), or named colors
 */
export function getContrastRatio(color1: string, color2: string): number {
  const c1 = parseColor(color1)
  const c2 = parseColor(color2)
  if (!c1 || !c2) return 1

  const lum1 = getRelativeLuminance(color1)
  const lum2 = getRelativeLuminance(color2)

  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)

  return (lighter + 0.05) / (darker + 0.05)
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

// ─── Contrast Checker Utilities (merged from src/utils/contrastChecker.ts) ───

/**
 * Get accessibility level for color combination
 */
export function getAccessibilityLevel(
  foreground: string,
  background: string,
  isLargeText: boolean = false
): 'AAA' | 'AA' | 'FAIL' {
  if (meetsWcagAAA(getContrastRatio(foreground, background), isLargeText)) return 'AAA'
  if (meetsWcagAA(getContrastRatio(foreground, background), isLargeText)) return 'AA'
  return 'FAIL'
}

/**
 * Suggest an accessible color based on a base color and background
 */
export function suggestAccessibleColor(
  baseColor: string,
  background: string,
  targetRatio: number = 4.5
): string {
  const bgColor = parseColor(background)
  if (!bgColor) return baseColor

  const bgLuminance = getRelativeLuminance(background)
  const needsLighter = bgLuminance < 0.5

  const baseRgb = parseColor(baseColor)
  if (!baseRgb) return baseColor

  let { r, g, b } = baseRgb
  let attempts = 0

  while (attempts < 50) {
    const currentRatio = getContrastRatio(`rgb(${r}, ${g}, ${b})`, background)
    if (currentRatio >= targetRatio) return `rgb(${r}, ${g}, ${b})`

    if (needsLighter) {
      r = Math.min(255, r + 5)
      g = Math.min(255, g + 5)
      b = Math.min(255, b + 5)
    } else {
      r = Math.max(0, r - 5)
      g = Math.max(0, g - 5)
      b = Math.max(0, b - 5)
    }
    attempts++
  }

  return needsLighter ? '#ffffff' : '#000000'
}

/**
 * Validate a color palette against WCAG AA standards
 */
export function validateColorPalette(palette: {
  [key: string]: { color: string; background: string; isLargeText?: boolean }
}): {
  [key: string]: { ratio: number; level: 'AAA' | 'AA' | 'FAIL'; passes: boolean }
} {
  const results: Record<string, { ratio: number; level: 'AAA' | 'AA' | 'FAIL'; passes: boolean }> = {}
  for (const [key, config] of Object.entries(palette)) {
    const ratio = getContrastRatio(config.color, config.background)
    const level = getAccessibilityLevel(config.color, config.background, config.isLargeText)
    results[key] = { ratio: Math.round(ratio * 100) / 100, level, passes: level !== 'FAIL' }
  }
  return results
}

/**
 * Development helper: Log contrast validation results
 */
export function logContrastValidation(
  name: string,
  foreground: string,
  background: string,
  isLargeText: boolean = false
): void {
  if (process.env.NODE_ENV !== 'development') return
  const ratio = getContrastRatio(foreground, background)
  const level = getAccessibilityLevel(foreground, background, isLargeText)
  const status = level !== 'FAIL' ? '✅' : '❌'
  const textSize = isLargeText ? 'Large' : 'Normal'
  console.log(`${status} ${name} (${textSize}): ${ratio.toFixed(2)}:1 (${level})`)
  if (level === 'FAIL') {
    console.log(`   💡 Suggested: ${suggestAccessibleColor(foreground, background)}`)
  }
}

// ─── Keyboard Navigation Utilities (merged from src/utils/keyboardNavigation.ts) ───

/**
 * Standard keyboard key constants
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

/** Handle Enter key press for button-like elements */
export function handleEnterKey(event: React.KeyboardEvent, callback: () => void): void {
  if (event.key === KEYS.ENTER) { event.preventDefault(); callback() }
}

/** Handle Space key press for button-like elements */
export function handleSpaceKey(event: React.KeyboardEvent, callback: () => void): void {
  if (event.key === KEYS.SPACE) { event.preventDefault(); callback() }
}

/** Handle Enter or Space key press for button-like elements */
export function handleActivationKeys(event: React.KeyboardEvent, callback: () => void): void {
  if (event.key === KEYS.ENTER || event.key === KEYS.SPACE) { event.preventDefault(); callback() }
}

/** Handle Escape key press for closing modals/dialogs */
export function handleEscapeKey(event: React.KeyboardEvent, callback: () => void): void {
  if (event.key === KEYS.ESCAPE) { event.preventDefault(); callback() }
}

/** Handle arrow key navigation in lists */
export function handleArrowNavigation(
  event: React.KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  onNavigate: (newIndex: number) => void
): void {
  let newIndex = currentIndex
  switch (event.key) {
    case KEYS.ARROW_UP: event.preventDefault(); newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1; break
    case KEYS.ARROW_DOWN: event.preventDefault(); newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0; break
    case KEYS.HOME: event.preventDefault(); newIndex = 0; break
    case KEYS.END: event.preventDefault(); newIndex = itemCount - 1; break
    default: return
  }
  onNavigate(newIndex)
}

/** Handle horizontal arrow key navigation (e.g., tabs) */
export function handleHorizontalArrowNavigation(
  event: React.KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  onNavigate: (newIndex: number) => void
): void {
  let newIndex = currentIndex
  switch (event.key) {
    case KEYS.ARROW_LEFT: event.preventDefault(); newIndex = currentIndex > 0 ? currentIndex - 1 : itemCount - 1; break
    case KEYS.ARROW_RIGHT: event.preventDefault(); newIndex = currentIndex < itemCount - 1 ? currentIndex + 1 : 0; break
    case KEYS.HOME: event.preventDefault(); newIndex = 0; break
    case KEYS.END: event.preventDefault(); newIndex = itemCount - 1; break
    default: return
  }
  onNavigate(newIndex)
}

/** Focus the first focusable element in a container */
export function focusFirstElement(container: HTMLElement): void {
  const elements = getFocusableElements(container)
  elements[0]?.focus()
}

/** Focus the last focusable element in a container */
export function focusLastElement(container: HTMLElement): void {
  const elements = getFocusableElements(container)
  elements[elements.length - 1]?.focus()
}

/** Check if an element is focusable */
export function isFocusable(element: HTMLElement): boolean {
  return element.matches(focusTrapSelectors)
}

/** Create keyboard event handler for search inputs */
export function createSearchKeyHandler(onSearch: () => void): (event: React.KeyboardEvent) => void {
  return (event) => { if (event.key === KEYS.ENTER) { event.preventDefault(); onSearch() } }
}

/** Create keyboard event handler for form submission (Ctrl/Cmd+Enter) */
export function createFormSubmitKeyHandler(onSubmit: () => void): (event: React.KeyboardEvent) => void {
  return (event) => { if (event.key === KEYS.ENTER && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onSubmit() } }
}

/** Skip to main content (for keyboard navigation) */
export function skipToMainContent(): void {
  const mainContent = document.querySelector('main') || document.querySelector('[role="main"]')
  if (mainContent instanceof HTMLElement) {
    mainContent.focus()
    mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
