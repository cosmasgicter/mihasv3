/**
 * UnifiedLoader Component
 * 
 * A single, unified loading component that consolidates all loader variants
 * across the application. Supports page, inline, skeleton, and overlay variants
 * with configurable sizes and accessibility features.
 * 
 * @requirements 3.3 - THE unified Loader_System SHALL provide a single global loading mechanism
 * 
 * Features:
 * - 4 variants: page (full page), inline (within content), skeleton (placeholder), overlay (modal-like)
 * - 3 sizes: sm, md, lg
 * - Proper accessibility with aria-label and role attributes
 * - Respects prefers-reduced-motion
 * - No visual flicker on mount
 * - Performant CSS-only animations (no framer-motion)
 */

import { cn } from '@/lib/utils'

export interface UnifiedLoaderProps {
  /** Loading variant type */
  variant?: 'page' | 'inline' | 'skeleton' | 'overlay'
  /** Size of the loader */
  size?: 'sm' | 'md' | 'lg'
  /** Accessibility label for screen readers */
  label?: string
  /** Additional CSS classes */
  className?: string
  /** Optional message to display below the spinner */
  message?: string
  /** For skeleton variant: number of skeleton lines to show */
  skeletonLines?: number
  /** For skeleton variant: show as card skeleton */
  skeletonCard?: boolean
}

/**
 * Size configurations for spinner dimensions
 */
const SPINNER_SIZES = {
  sm: 'w-5 h-5',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
} as const

/**
 * Size configurations for text
 */
const TEXT_SIZES = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const

/**
 * Size configurations for padding/spacing
 */
const SPACING_SIZES = {
  sm: 'py-2 gap-2',
  md: 'py-4 gap-3',
  lg: 'py-6 gap-4',
} as const

/**
 * Spinner SVG component - reusable across variants
 */
function Spinner({ 
  size = 'md', 
  className 
}: { 
  size?: 'sm' | 'md' | 'lg'
  className?: string 
}) {
  return (
    <svg
      className={cn(
        SPINNER_SIZES[size],
        'animate-spin text-primary',
        // Respect reduced motion preference
        'motion-reduce:animate-none motion-reduce:opacity-70',
        className
      )}
      viewBox="0 0 50 50"
      aria-hidden="true"
    >
      <circle
        className="opacity-20"
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      <circle
        className="opacity-90"
        cx="25"
        cy="25"
        r="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeDasharray="80"
        strokeDashoffset="60"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Skeleton line component for skeleton variant
 */
function SkeletonLine({ 
  width = 'full',
  className 
}: { 
  width?: 'full' | '3/4' | '1/2' | '1/4'
  className?: string 
}) {
  const widthClasses = {
    full: 'w-full',
    '3/4': 'w-3/4',
    '1/2': 'w-1/2',
    '1/4': 'w-1/4',
  }

  return (
    <div
      className={cn(
        'h-4 bg-muted rounded animate-pulse',
        'motion-reduce:animate-none motion-reduce:opacity-70',
        widthClasses[width],
        className
      )}
      aria-hidden="true"
    />
  )
}

/**
 * Skeleton card component for skeleton variant
 */
function SkeletonCardContent({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const avatarSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }

  return (
    <div className="bg-card rounded-xl border border-border p-4 sm:p-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <div 
          className={cn(
            'rounded-full bg-muted animate-pulse flex-shrink-0',
            'motion-reduce:animate-none motion-reduce:opacity-70',
            avatarSizes[size]
          )}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <SkeletonLine width="3/4" />
          <SkeletonLine width="full" />
          <SkeletonLine width="1/2" />
        </div>
      </div>
    </div>
  )
}

/**
 * Page variant - Full page centered loader
 */
function PageLoader({ 
  size = 'lg', 
  label, 
  message, 
  className 
}: Omit<UnifiedLoaderProps, 'variant'>) {
  return (
    <div
      className={cn(
        'min-h-[400px] flex flex-col items-center justify-center',
        SPACING_SIZES[size],
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label || 'Loading page content'}
    >
      <Spinner size={size} />
      {message && (
        <p className={cn(
          'text-muted-foreground font-medium text-center max-w-xs',
          TEXT_SIZES[size]
        )}>
          {message}
        </p>
      )}
      <span className="sr-only">{label || 'Loading page content'}</span>
    </div>
  )
}

/**
 * Inline variant - Within content loader
 */
function InlineLoader({ 
  size = 'md', 
  label, 
  message, 
  className 
}: Omit<UnifiedLoaderProps, 'variant'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        SPACING_SIZES[size],
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label || 'Loading'}
    >
      <Spinner size={size === 'lg' ? 'md' : 'sm'} />
      {message && (
        <span className={cn(
          'font-medium text-foreground',
          TEXT_SIZES[size]
        )}>
          {message}
        </span>
      )}
      <span className="sr-only">{label || 'Loading'}</span>
    </div>
  )
}

/**
 * Skeleton variant - Placeholder content loader
 */
function SkeletonLoader({ 
  size = 'md', 
  label, 
  skeletonLines = 3, 
  skeletonCard = false,
  className 
}: Omit<UnifiedLoaderProps, 'variant' | 'message'>) {
  if (skeletonCard) {
    return (
      <div
        className={className}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label || 'Loading content'}
      >
        <SkeletonCardContent size={size} />
        <span className="sr-only">{label || 'Loading content'}</span>
      </div>
    )
  }

  // Generate varying widths for natural look
  const lineWidths: Array<'full' | '3/4' | '1/2' | '1/4'> = []
  for (let i = 0; i < skeletonLines; i++) {
    if (i === skeletonLines - 1) {
      lineWidths.push('3/4') // Last line shorter
    } else if (i % 3 === 2) {
      lineWidths.push('1/2')
    } else {
      lineWidths.push('full')
    }
  }

  return (
    <div
      className={cn('space-y-3', className)}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label || 'Loading content'}
    >
      {lineWidths.map((width, index) => (
        <SkeletonLine key={index} width={width} />
      ))}
      <span className="sr-only">{label || 'Loading content'}</span>
    </div>
  )
}

/**
 * Overlay variant - Modal-like overlay loader
 */
function OverlayLoader({ 
  size = 'lg', 
  label, 
  message, 
  className 
}: Omit<UnifiedLoaderProps, 'variant'>) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center z-50',
        'bg-background/80 backdrop-blur-sm',
        // Smooth fade-in animation
        'animate-in fade-in duration-150',
        'motion-reduce:animate-none',
        SPACING_SIZES[size],
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label || 'Loading'}
    >
      <Spinner size={size} />
      {message && (
        <p className={cn(
          'text-muted-foreground font-medium text-center max-w-xs mt-4',
          TEXT_SIZES[size]
        )}>
          {message}
        </p>
      )}
      <span className="sr-only">{label || 'Loading'}</span>
    </div>
  )
}

/**
 * UnifiedLoader - Main exported component
 * 
 * A single, unified loading component that consolidates all loader variants.
 * 
 * @example
 * // Page loader (full page centered)
 * <UnifiedLoader variant="page" message="Loading dashboard..." />
 * 
 * @example
 * // Inline loader (within content)
 * <UnifiedLoader variant="inline" size="sm" message="Saving..." />
 * 
 * @example
 * // Skeleton loader (placeholder)
 * <UnifiedLoader variant="skeleton" skeletonLines={5} />
 * 
 * @example
 * // Overlay loader (modal-like)
 * <UnifiedLoader variant="overlay" message="Processing..." />
 */
export function UnifiedLoader({
  variant = 'inline',
  size = 'md',
  label,
  message,
  className,
  skeletonLines,
  skeletonCard,
}: UnifiedLoaderProps) {
  switch (variant) {
    case 'page':
      return (
        <PageLoader 
          size={size} 
          label={label} 
          message={message} 
          className={className} 
        />
      )
    
    case 'inline':
      return (
        <InlineLoader 
          size={size} 
          label={label} 
          message={message} 
          className={className} 
        />
      )
    
    case 'skeleton':
      return (
        <SkeletonLoader 
          size={size} 
          label={label} 
          skeletonLines={skeletonLines} 
          skeletonCard={skeletonCard}
          className={className} 
        />
      )
    
    case 'overlay':
      return (
        <OverlayLoader 
          size={size} 
          label={label} 
          message={message} 
          className={className} 
        />
      )
    
    default:
      // TypeScript exhaustive check
      const _exhaustiveCheck: never = variant
      return _exhaustiveCheck
  }
}

// Named exports for direct variant access (convenience)
export { PageLoader, InlineLoader, SkeletonLoader, OverlayLoader }

// Export the Spinner for use in other components (like Button)
export { Spinner as UnifiedSpinner }
