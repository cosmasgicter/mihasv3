import { useState, useEffect } from 'react'
import { WifiOff } from 'lucide-react'
import { Banner } from '@/components/ui/Banner'

/**
 * Offline Banner Component
 * Displays a non-intrusive banner at the top of the page when the app detects no network connectivity.
 * Automatically hides when connectivity is restored.
 * Uses the canonical Banner component with the 'offline' variant.
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
    <Banner variant="offline">
      <span className="flex items-center gap-2">
        <WifiOff className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        You are offline. Some features may be unavailable.
      </span>
    </Banner>
  )
}
