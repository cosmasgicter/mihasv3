import React, { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/Button'

/**
 * SessionMonitor — tracks user activity and warns before session expiry.
 *
 * Token refresh is handled transparently by ApiClient's 401 intercept.
 * This component adds a user-facing warning when the session is about to
 * expire due to inactivity, giving them a chance to save work.
 *
 * The warning appears after 25 minutes of no user interaction (mouse, keyboard,
 * touch, scroll). Any interaction resets the timer. If the user doesn't interact
 * for 30 minutes total, the warning suggests saving work.
 */

const INACTIVITY_WARNING_MS = 25 * 60 * 1000 // 25 minutes
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const

export function SessionMonitor() {
  const { user } = useAuth()
  const [showWarning, setShowWarning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!user) return

    const resetTimer = () => {
      setShowWarning(false)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setShowWarning(true), INACTIVITY_WARNING_MS)
    }

    // Start the inactivity timer
    resetTimer()

    // Reset on any user activity
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer, { passive: true })
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer)
      }
    }
  }, [user])

  if (!user || !showWarning) return null

  return (
    <div
      role="alert"
      className="fixed top-4 right-4 z-50 bg-card border border-yellow-300 rounded-lg p-4 shadow-lg max-w-sm animate-in fade-in slide-in-from-top-2"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">Session idle</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            You've been inactive for a while. Your session may expire soon — save any unsaved work.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setShowWarning(false)}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
