/**
 * LoadingOverlay Component
 * 
 * Full-screen or container overlay with loading indicator.
 * Uses CSS animations only - no Framer Motion.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from './LoadingSpinner'

export interface LoadingOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string
  transparent?: boolean
}

export function LoadingOverlay({ className, message, transparent = false, ...props }: LoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(false)

  // Trigger fade-in on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(timer)
  }, [])

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center z-50',
        'transition-opacity duration-150',
        transparent ? 'bg-white/60' : 'bg-white/90 backdrop-blur-sm',
        isVisible ? 'opacity-100' : 'opacity-0',
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      {...props}
    >
      <LoadingSpinner size="lg" />
      {message && (
        <p className="mt-4 text-sm text-muted-foreground font-medium max-w-xs text-center">
          {message}
        </p>
      )}
    </div>
  )
}
