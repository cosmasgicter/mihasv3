import React, { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTokenRefresh } from '@/hooks/auth/useTokenRefresh'
import { useRoleVerification } from '@/hooks/auth/useRoleVerification'

export function SessionMonitor() {
  const { user } = useAuth()
  const { tokenExpiry, lastRefresh, refreshCount } = useTokenRefresh()
  const { roleStatus, profileRole, authRole } = useRoleVerification()
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    if (!tokenExpiry) return

    const checkExpiry = () => {
      const now = new Date()
      const timeUntilExpiry = tokenExpiry.getTime() - now.getTime()
      const minutesUntilExpiry = timeUntilExpiry / (1000 * 60)

      // Only show if expires in less than 5 minutes and more than 0
      if (minutesUntilExpiry < 5 && minutesUntilExpiry > 0) {
        setShowWarning(true)
      } else {
        setShowWarning(false)
      }
    }

    checkExpiry()
    const interval = setInterval(checkExpiry, 60000)

    return () => clearInterval(interval)
  }, [tokenExpiry])

  if (!user) return null

  return (
    <>
      {showWarning && (
        <div className="fixed top-4 right-4 z-50 bg-accent/5 border border-yellow-200 rounded-lg p-4 shadow-lg max-w-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-accent" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-accent-foreground">Session Expiring Soon</h3>
              <p className="mt-1 text-xs text-yellow-700">Your session will expire soon. Please save your work.</p>
            </div>
          </div>
        </div>
      )}


    </>
  )
}
