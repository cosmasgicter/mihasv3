import React, { useState, useEffect } from 'react'
import { Wifi, WifiOff } from 'lucide-react'

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="rounded-lg shadow-lg p-4 bg-red-50 border border-red-200">
        <div className="flex items-center space-x-3">
          <WifiOff className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-900">Working offline</p>
            <p className="text-xs text-red-700">Changes saved locally</p>
          </div>
        </div>
      </div>
    </div>
  )
}