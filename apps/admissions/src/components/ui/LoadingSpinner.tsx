/**
 * LoadingSpinner Component
 *
 * Backward-compatible wrapper that renders compact skeleton placeholders.
 */

import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'primary' | 'secondary' | 'white' | 'current'
  message?: string
}

const indicatorSizeMap = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-7 w-7',
} as const

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
}

const colorClasses = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  white: 'text-white',
  current: 'text-current',
}

export function LoadingSpinner({
  size = 'md',
  className,
  color = 'primary',
  message,
}: LoadingSpinnerProps) {
  const indicatorClass = cn(
    'rounded-full',
    indicatorSizeMap[size],
    colorClasses[color].replace('text-', 'bg-'),
  )

  if (message) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center gap-2', className)}
        role="status"
        aria-live="polite"
      >
        <Skeleton className={indicatorClass} />
        <span className={cn('text-muted-foreground', textSizeClasses[size])}>{message}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <Skeleton
        className={cn(indicatorClass, className, textSizeClasses[size] === 'text-lg' && 'scale-110')}
      />
    </div>
  )
}
