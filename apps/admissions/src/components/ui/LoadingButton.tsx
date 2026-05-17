/**
 * LoadingButton Component
 * 
 * Button wrapper that delegates inline loading indicators to Button.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

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
      loading={loading}
      disabled={disabled || loading}
      className={cn(
        'relative overflow-hidden transition-opacity duration-200',
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
        <span>{loading && loadingText ? loadingText : children}</span>
      </span>
    </Button>
  )
}
