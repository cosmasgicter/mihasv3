/**
 * AuthLoadingOverlay Component
 * 
 * Full-screen overlay shown during authentication flows.
 * Uses the new sleek LoadingSpinner.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

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
        fixed inset-0 z-50 bg-background/90 backdrop-blur-sm
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
        <LoadingSpinner size="lg" color="primary" />

        <h3
          className={`
            text-lg font-medium text-foreground
            transition-all duration-300 delay-100
            ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
          `}
        >
          {message}
        </h3>
      </div>
    </div>
  )
}
