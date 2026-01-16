/**
 * Touch Target Utilities
 * 
 * Provides utilities for ensuring WCAG 2.1 touch target compliance.
 * All interactive elements should have a minimum touch target of 44x44 pixels.
 * 
 * Requirements: 9.2 - Touch targets at least 44x44 pixels
 */

import { cn } from '@/lib/utils'

/**
 * Minimum touch target size in pixels (WCAG 2.1 Level AAA recommends 44px)
 */
export const MIN_TOUCH_TARGET = 44

/**
 * Large touch target size for primary actions
 */
export const LARGE_TOUCH_TARGET = 48

/**
 * CSS classes for touch target compliance
 */
export const touchTargetClasses = {
  /** Minimum 44x44px touch target */
  base: 'min-h-[44px] min-w-[44px]',
  /** Large 48x48px touch target for primary actions */
  large: 'min-h-[48px] min-w-[48px]',
  /** Touch-optimized interaction styles */
  interaction: 'touch-manipulation select-none',
  /** Disable tap highlight on mobile */
  noHighlight: '[-webkit-tap-highlight-color:transparent]',
  /** Combined touch-friendly styles */
  touchFriendly: 'min-h-[44px] min-w-[44px] touch-manipulation select-none [-webkit-tap-highlight-color:transparent]',
}

/**
 * Get touch target classes based on size
 */
export function getTouchTargetClasses(size: 'base' | 'large' = 'base'): string {
  return cn(
    size === 'large' ? touchTargetClasses.large : touchTargetClasses.base,
    touchTargetClasses.interaction,
    touchTargetClasses.noHighlight
  )
}

/**
 * Inline styles for touch target compliance
 * Use when Tailwind classes aren't sufficient
 */
export const touchTargetStyles = {
  base: {
    minHeight: `${MIN_TOUCH_TARGET}px`,
    minWidth: `${MIN_TOUCH_TARGET}px`,
  },
  large: {
    minHeight: `${LARGE_TOUCH_TARGET}px`,
    minWidth: `${LARGE_TOUCH_TARGET}px`,
  },
}

/**
 * Check if an element meets touch target requirements
 * Useful for testing and validation
 */
export function meetsMinTouchTarget(
  width: number,
  height: number,
  minSize: number = MIN_TOUCH_TARGET
): boolean {
  return width >= minSize && height >= minSize
}

/**
 * Calculate padding needed to meet touch target requirements
 */
export function calculateTouchPadding(
  contentWidth: number,
  contentHeight: number,
  minSize: number = MIN_TOUCH_TARGET
): { horizontal: number; vertical: number } {
  const horizontalPadding = Math.max(0, (minSize - contentWidth) / 2)
  const verticalPadding = Math.max(0, (minSize - contentHeight) / 2)
  
  return {
    horizontal: Math.ceil(horizontalPadding),
    vertical: Math.ceil(verticalPadding),
  }
}

/**
 * Touch target wrapper component props
 */
export interface TouchTargetWrapperProps {
  /** Size variant */
  size?: 'base' | 'large'
  /** Additional class names */
  className?: string
  /** Whether to center content */
  center?: boolean
}

/**
 * Get wrapper classes for touch target compliance
 */
export function getTouchTargetWrapperClasses({
  size = 'base',
  className,
  center = true,
}: TouchTargetWrapperProps = {}): string {
  return cn(
    getTouchTargetClasses(size),
    center && 'flex items-center justify-center',
    className
  )
}

/**
 * Interactive element types that require touch target compliance
 */
export const interactiveElements = [
  'button',
  'a',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
] as const

/**
 * Selector string for all interactive elements
 */
export const interactiveElementsSelector = interactiveElements.join(', ')
