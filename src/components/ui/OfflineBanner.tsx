import React, { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'

/**
 * Offline Banner Component
 * Displays a non-intrusive banner at the top of the page when the app detects no network connectivity.
 * Automatically hides when connectivity is restored.
 * Requirements: 19.4 - Offline indicator banner for PWA
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-md animate-slide-down"
    >
      <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>You are offline. Some features may be unavailable.</span>
    </div>
  )
}
