/**
 * LoadingFallback Component
 * 
 * Full-page loading fallback with timeout handling.
 * Uses CSS animations only - no Framer Motion.
 * 
 * @requirements 5.1, 5.2 - Fast page loading
 */

import { useState, useEffect } from 'react'
import { LoadingSpinner } from './LoadingSpinner'
import { cn } from '@/lib/utils'

interface LoadingFallbackProps {
  message?: string
  showProgress?: boolean
  timeout?: number
}

export function LoadingFallback({ 
  message = "Loading...", 
  showProgress = false,
  timeout = 15000 
}: LoadingFallbackProps) {
  const [progress, setProgress] = useState(0)
  const [timeoutReached, setTimeoutReached] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  // Trigger fade-in on mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(timer)
  }, [])

  useEffect(() => {
    if (!showProgress && !timeout) return

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev
        return prev + Math.random() * 10
      })
    }, 200)

    const timeoutTimer = setTimeout(() => {
      setTimeoutReached(true)
    }, timeout)

    return () => {
      clearInterval(interval)
      clearTimeout(timeoutTimer)
    }
  }, [showProgress, timeout])

  if (timeoutReached) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-muted">
        <div 
          className={cn(
            'text-center p-8 bg-card rounded-xl shadow-lg border border-border max-w-md',
            'transition-all duration-500',
            isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-accent/10 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Taking longer than expected</h3>
          <p className="text-muted-foreground mb-4">Please check your internet connection and try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-muted to-muted">
      <div 
        className={cn(
          'text-center p-8 bg-card rounded-xl shadow-lg border border-border',
          'transition-all duration-500',
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        )}
      >
        <LoadingSpinner 
          size="xl" 
          message={message}
          showPulse={true}
        />
        
        {showProgress && (
          <div 
            className={cn(
              'mt-6 w-64 transition-opacity duration-500 delay-500',
              isVisible ? 'opacity-100' : 'opacity-0'
            )}
          >
            <div className="flex justify-between text-sm text-muted-foreground mb-2">
              <span>Loading</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-primary to-primary/70 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <div
          className={cn(
            'mt-4 text-xs text-muted-foreground transition-opacity duration-500 delay-1000',
            isVisible ? 'opacity-100' : 'opacity-0'
          )}
        >
          Preparing your experience...
        </div>
      </div>
    </div>
  )
}
