/**
 * LoadingOverlay Component
 *
 * Overlay loading surface powered by UnifiedLoader.
 */

import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { UnifiedLoader } from './UnifiedLoader'

export interface LoadingOverlayProps extends HTMLAttributes<HTMLDivElement> {
  message?: string
  transparent?: boolean
}

export function LoadingOverlay({ className, message, transparent = false, ...props }: LoadingOverlayProps) {
  return (
    <UnifiedLoader
      variant="overlay"
      size="lg"
      message={message}
      className={cn(transparent && 'bg-background/60 backdrop-blur-0', className)}
      {...props}
    />
  )
}
