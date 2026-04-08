/**
 * LoadingSpinner Component
 *
 * Backward-compatible wrapper around ButtonSpinner.
 */

import { cn } from '@/lib/utils'
import { ButtonSpinner } from './ButtonSpinner'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  color?: 'primary' | 'secondary' | 'white' | 'current'
  message?: string
}

const spinnerSizeMap = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'lg',
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
  if (message) {
    return (
      <div
        className={cn('flex flex-col items-center justify-center gap-2', className)}
        role="status"
        aria-live="polite"
      >
        <ButtonSpinner size={spinnerSizeMap[size]} className={colorClasses[color]} />
        <span className={cn('text-muted-foreground', textSizeClasses[size])}>{message}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <ButtonSpinner
        size={spinnerSizeMap[size]}
        className={cn(colorClasses[color], className, textSizeClasses[size] === 'text-lg' && 'scale-110')}
      />
    </div>
  )
}
