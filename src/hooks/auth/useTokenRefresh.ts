/**
 * Token Refresh Hook - Uses centralized auth controller
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { authRequest } from '@/services/authController'

export function useTokenRefresh() {
  const { user } = useAuth()
  const [tokenExpiry, setTokenExpiry] = useState<Date | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)

  useEffect(() => {
    if (!user) return

    let mounted = true
    let refreshInterval: NodeJS.Timeout | null = null

    async function checkAndRefreshToken() {
      const response = await authRequest('/api/auth?action=refresh', {
        method: 'POST',
      }, {
        attemptRefreshOn401: false,
      })

      if (mounted && response.success) {
        setLastRefresh(new Date())
        setTokenExpiry(new Date(Date.now() + 15 * 60 * 1000))
        setRefreshCount(prev => prev + 1)
      }
    }

    checkAndRefreshToken()
    refreshInterval = setInterval(checkAndRefreshToken, 10 * 60 * 1000)

    return () => {
      mounted = false
      if (refreshInterval) {
        clearInterval(refreshInterval)
      }
    }
  }, [user])

  return { tokenExpiry, lastRefresh, refreshCount }
}
