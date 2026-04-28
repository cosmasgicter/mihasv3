/**
 * AuthLoadingOverlay Component
 * 
 * Full-screen overlay shown during authentication flows.
 * Uses skeleton placeholders instead of spinners.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { useState, useEffect } from 'react'
import { Skeleton } from '@/components/ui'

interface AuthLoadingOverlayProps {
  message?: string
}

export function AuthLoadingOverlay({ message = 'Signing you in...' }: AuthLoadingOverlayProps) {
  const [isVisible, setIsVisible] = useState(false)

  // Trigger animations on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(timer)
  }, [])

  return (
    <div
      className={`
        fixed inset-0 z-50 bg-background/90 
        flex items-center justify-center
        transition-opacity duration-200
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div
        className={`
          flex flex-col items-center space-y-4
          transition-all duration-300
          ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}
        `}
      >
        <Skeleton className="h-14 w-14 rounded-full" />

        <h3
          className={`
            text-lg font-medium text-foreground
            transition-all duration-300 delay-100
            ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          {message}
        </h3>
        <div className="w-56 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="mx-auto h-3 w-4/5" />
        </div>
      </div>
    </div>
  )
}
