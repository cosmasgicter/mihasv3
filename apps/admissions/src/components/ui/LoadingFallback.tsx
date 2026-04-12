/**
 * LoadingFallback Component
 *
 * Full-page loading fallback using skeleton placeholders with optional timeout handling.
 */

import { useState, useEffect } from 'react'
import { Skeleton } from './skeleton'
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
          <div className="mb-4 space-y-3" role="status" aria-live="polite">
            <Skeleton className="mx-auto h-10 w-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="mx-auto h-4 w-44" />
              <Skeleton className="mx-auto h-3 w-52" />
            </div>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Still loading this page</h3>
          <p className="text-muted-foreground mb-4">Keep this tab open, or refresh if your connection has changed.</p>
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
    <div
      className="min-h-screen bg-background flex flex-col items-center justify-center gap-4"
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <div className="w-full max-w-md space-y-4 px-4">
        <Skeleton className="mx-auto h-10 w-10 rounded-full" />
        <Skeleton className="h-8 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
        <div className="space-y-3 mt-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
