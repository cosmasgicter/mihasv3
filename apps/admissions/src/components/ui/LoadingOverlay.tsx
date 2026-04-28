/**
 * LoadingOverlay Component
 *
 * Overlay loading surface using skeleton placeholders.
 */

import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from './skeleton'

export interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  message?: string
  transparent?: boolean
}

export function LoadingOverlay({ className, message, transparent = false, ...props }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 ',
        transparent && 'bg-background/60 backdrop-blur-0',
        className
      )}
      role="status"
      aria-live="polite"
      {...props}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-card/90 p-6 shadow-md">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="w-full space-y-2 text-center">
            <Skeleton className="mx-auto h-4 w-40" />
            <Skeleton className="mx-auto h-3 w-56" />
          </div>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
      </div>
    </div>
  )
}
