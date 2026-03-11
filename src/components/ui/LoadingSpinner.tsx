/**
 * LoadingSpinner Component
 *
 * Backward-compatible wrapper around the design-system unified spinner.
 */

import { cn } from '@/lib/utils'
import { UnifiedLoader, UnifiedSpinner } from './UnifiedLoader'

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
      <UnifiedLoader
        variant="inline"
        size={spinnerSizeMap[size]}
        label={message}
        className={className}
      />
    )
  }

  return (
    <div className="flex items-center justify-center" aria-hidden="true">
      <UnifiedSpinner
        size={spinnerSizeMap[size]}
        className={cn(colorClasses[color], className, textSizeClasses[size] === 'text-lg' && 'scale-110')}
      />
    </div>
  )
}
