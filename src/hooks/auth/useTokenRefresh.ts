/**
 * Token Refresh Hook - Uses HTTP-only cookie authentication
 */
import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Helper for authenticated API calls using HTTP-only cookies
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

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
      try {
        // Proactively refresh the token
        const response = await authFetch('/api/auth?action=refresh', {
          method: 'POST',
        })
        
        if (mounted && response.ok) {
          setLastRefresh(new Date())
          // Estimate expiry as 15 minutes from now (access token lifetime)
          setTokenExpiry(new Date(Date.now() + 15 * 60 * 1000))
          setRefreshCount(prev => prev + 1)
        }
      } catch (error) {
        console.error('Token refresh error:', error)
      }
    }

    // Initial check
    checkAndRefreshToken()

    // Refresh every 10 minutes (before 15-minute expiry)
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
