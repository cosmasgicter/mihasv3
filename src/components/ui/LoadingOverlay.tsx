import React from 'react'
import { cn } from '@/lib/utils'
import { Spinner } from './Spinner'

export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string
}

export function LoadingOverlay({ className, message, ...props }: LoadingOverlayProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-50',
        className
      )}
      {...props}
    >
      <Spinner size="lg" />
      {message && <p className="mt-4 text-sm text-foreground">{message}</p>}
    </div>
  )
}
