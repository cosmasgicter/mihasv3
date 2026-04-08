/**
 * LoadingOverlay Component
 *
 * Overlay loading surface using ButtonSpinner.
 */

import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { ButtonSpinner } from './ButtonSpinner'

export interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  message?: string
  transparent?: boolean
}

export function LoadingOverlay({ className, message, transparent = false, ...props }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm',
        transparent && 'bg-background/60 backdrop-blur-0',
        className
      )}
      role="status"
      aria-live="polite"
      {...props}
    >
      <ButtonSpinner size="lg" />
      {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
