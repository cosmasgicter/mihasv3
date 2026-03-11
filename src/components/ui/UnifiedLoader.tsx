import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface UnifiedLoaderProps extends HTMLAttributes<HTMLElement> {
  variant: 'page' | 'inline' | 'overlay'
  size?: 'sm' | 'md' | 'lg'
  label?: string
  message?: string
}

const spinnerSize = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
} as const

const labelSize = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const

function SpinnerIcon({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <svg
      className={cn(spinnerSize[size], 'animate-spin text-primary motion-reduce:hidden', className)}
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

/** Static fallback shown when prefers-reduced-motion is active */
function StaticIcon({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <svg
      className={cn(spinnerSize[size], 'hidden text-primary motion-reduce:block', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/** Standalone spinner for use in buttons and other inline contexts */
export function UnifiedSpinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <>
      <SpinnerIcon size={size} className={className} />
      <StaticIcon size={size} className={className} />
    </>
  )
}

export function UnifiedLoader({
  variant,
  size = 'md',
  label,
  message,
  className,
  ...props
}: UnifiedLoaderProps) {
  const accessibleLabel = message ?? label ?? 'Loading'
  const spinner = (
    <>
      <SpinnerIcon size={size} />
      <StaticIcon size={size} />
    </>
  )

  if (variant === 'page') {
    return (
      <div
        {...props}
        role="status"
        aria-label={accessibleLabel}
        className={cn('flex min-h-[50vh] flex-col items-center justify-center gap-3', className)}
      >
        {spinner}
        <span className={cn('text-muted-foreground', labelSize[size])}>{accessibleLabel}</span>
        <span className="sr-only" aria-live="polite">{accessibleLabel}</span>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <span
        {...props}
        role="status"
        aria-label={accessibleLabel}
        className={cn('inline-flex items-center gap-2', className)}
      >
        {spinner}
        <span className="sr-only" aria-live="polite">{accessibleLabel}</span>
      </span>
    )
  }

  // overlay
  return (
    <div
      {...props}
      role="status"
      aria-label={accessibleLabel}
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm',
        className,
      )}
    >
      {spinner}
      <span className={cn('text-muted-foreground', labelSize[size])}>{accessibleLabel}</span>
      <span className="sr-only" aria-live="polite">{accessibleLabel}</span>
    </div>
  )
}
