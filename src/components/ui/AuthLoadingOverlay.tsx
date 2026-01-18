/**
 * AuthLoadingOverlay Component
 * 
 * Full-screen overlay shown during authentication flows.
 * Uses CSS animations only - no Framer Motion.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { useState, useEffect } from 'react'
import { Loader2 } from '@/components/icons'

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
        fixed inset-0 z-50 bg-background/95 backdrop-blur-md 
        flex items-center justify-center
        transition-opacity duration-200
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div
        className={`
          bg-card rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 border border-border
          transition-all duration-300
          ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'}
        `}
      >
        <div className="flex flex-col items-center space-y-6">
          {/* Animated spinner with glow */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/60 rounded-full blur-xl opacity-50 animate-pulse" />
            <div className="relative bg-gradient-to-r from-primary to-primary/80 rounded-full p-4">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          </div>
          
          {/* Text content */}
          <div className="text-center space-y-2">
            <h3
              className={`
                text-lg font-semibold text-foreground
                transition-all duration-300 delay-100
                ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}
              `}
            >
              {message}
            </h3>
            <p
              className={`
                text-sm text-muted-foreground
                transition-all duration-300 delay-200
                ${isVisible ? 'opacity-100' : 'opacity-0'}
              `}
            >
              Please wait a moment...
            </p>
          </div>
          
          {/* Progress bar */}
          <div
            className={`
              w-full bg-muted rounded-full h-1 overflow-hidden
              transition-opacity duration-300 delay-300
              ${isVisible ? 'opacity-100' : 'opacity-0'}
            `}
          >
            <div 
              className="h-full bg-gradient-to-r from-primary to-primary/60 rounded-full animate-progress-bar"
            />
          </div>
        </div>
      </div>
      
      {/* CSS keyframes for progress bar */}
      <style>{`
        @keyframes progress-bar {
          0% { width: 0%; }
          50% { width: 70%; }
          100% { width: 100%; }
        }
        .animate-progress-bar {
          animation: progress-bar 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
