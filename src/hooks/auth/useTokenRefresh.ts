/**
 * Token Refresh Hook - Uses centralized auth controller
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { authRequest } from '@/services/authController'

const SESSION_EXPIRY_WINDOW_MS = 15 * 60 * 1000
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000

export function useTokenRefresh() {
  const { user } = useAuth()
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!user) {
      setTokenExpiry(null)
      setLastRefresh(null)
      setRefreshCount(0)
      return
    }

    let cancelled = false
    setTokenExpiry(new Date(Date.now() + SESSION_EXPIRY_WINDOW_MS))

    async function refreshTokenSilently() {
      const response = await authRequest('/api/auth?action=refresh', {
        method: 'POST',
      }, {
        attemptRefreshOn401: false,
      })

      if (!cancelled && response.success) {
        setLastRefresh(new Date())
        setTokenExpiry(new Date(Date.now() + SESSION_EXPIRY_WINDOW_MS))
        setRefreshCount(prev => prev + 1)
      }
    }

    const refreshInterval = window.setInterval(() => {
      void refreshTokenSilently()
    }, TOKEN_REFRESH_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(refreshInterval)
    }
  }, [user?.id])

  return { tokenExpiry, lastRefresh, refreshCount }
}
