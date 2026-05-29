import { cn } from '@/lib/utils'

const spinnerSize = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const

export interface ButtonSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * Standalone spinner for use in buttons and other inline contexts.
 *
 * Renders an animated SVG spinner. The CSS `@media (prefers-reduced-motion)`
 * rule in `smooth-animations.css` automatically reduces the animation to
 * an effectively static frame for users who request reduced motion, so a
 * separate static fallback component is no longer needed.
 */
export function ButtonSpinner({ size = 'md', className }: ButtonSpinnerProps) {
  return (
    <svg
      className={cn(spinnerSize[size], 'animate-spin text-primary', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}
