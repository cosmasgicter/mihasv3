/**
 * LoadingButton Component
 * 
 * Button with loading state using CSS animations.
 * No Framer Motion dependency for better performance.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { LoadingSpinner } from './LoadingSpinner'
import { Button, ButtonProps } from './Button'
import { cn } from '@/lib/utils'

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean
  loadingText?: string
  children: React.ReactNode
}

export function LoadingButton({
  loading = false,
  loadingText,
  children,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={disabled || loading}
      className={cn(
        'relative overflow-hidden transition-all duration-200',
        loading && 'cursor-not-allowed opacity-90',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'flex items-center justify-center gap-2 transition-transform duration-200',
          loading && 'scale-95'
        )}
      >
        {loading && (
          <LoadingSpinner 
            size="sm" 
            color={props.variant === 'outline' ? 'primary' : 'white'}
          />
        )}
        <span>{loading && loadingText ? loadingText : children}</span>
      </span>
    </Button>
  )
}
