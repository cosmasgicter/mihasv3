/**
 * LoadingFallback Component
 *
 * Unified full-page loading fallback with optional timeout handling.
 */

import { useState, useEffect } from 'react'
import { UnifiedLoader } from './UnifiedLoader'
import { cn } from '@/lib/utils'

interface LoadingFallbackProps {
  message?: string
  label?: string
  timeout?: number
  delay?: number
}

export function LoadingFallback({
  message = 'Preparing MIHAS',
  label = 'Preparing MIHAS application',
  timeout = 15000,
  delay = 180,
}: LoadingFallbackProps) {
  const [timeoutReached, setTimeoutReached] = useState(false)
  const [canShowLoader, setCanShowLoader] = useState(delay <= 0)

  useEffect(() => {
    if (delay <= 0) {
      setCanShowLoader(true)
      return
    }

    const delayTimer = setTimeout(() => {
      setCanShowLoader(true)
    }, delay)

    return () => {
      clearTimeout(delayTimer)
    }
  }, [delay])

  useEffect(() => {
    if (!timeout) return

    const timeoutTimer = setTimeout(() => {
      setTimeoutReached(true)
    }, timeout)

    return () => {
      clearTimeout(timeoutTimer)
    }
  }, [timeout])

  if (timeoutReached) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div
          className={cn(
            'text-center p-8 bg-card rounded-xl shadow-lg border border-border max-w-md',
            'transition-all duration-300'
          )}
        >
          <UnifiedLoader variant="inline" size="md" message="Still preparing your session" />
          <h3 className="text-lg font-semibold text-foreground mt-4 mb-2">Taking longer than expected</h3>
          <p className="text-muted-foreground mb-4">Please check your internet connection and try refreshing the page.</p>
          <button
            onClick={() => window.location.assign(window.location.pathname)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    )
  }

  if (!canShowLoader) {
    return null
  }

  return (
    <UnifiedLoader
      variant="page"
      size="lg"
      message={message}
      label={label}
      className="min-h-screen bg-background"
    />
  )
}
