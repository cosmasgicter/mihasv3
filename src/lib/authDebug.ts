import { apiClient } from '@/services/client'
import { sanitizeForLog } from '@/lib/security'

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

export async function debugAuthState() {
  try {
    // Check current user via cookie-based auth
    const response = await authFetch('/api/auth?action=session')
    
    if (!response.ok) {
      console.log('[AuthDebug] No active session')
      return null
    }
    
    const sessionData = await response.json()
    const user = sessionData.user
    
    if (!user) {
      console.log('[AuthDebug] No user in session')
      return null
    }
    
    // Check user profile via API
    let profile = null
    let profileError = null
    try {
      profile = await apiClient.request('/auth?action=session')
    } catch (e) {
      profileError = e instanceof Error ? e.message : 'Unknown error'
    }
    
    // Role is embedded in JWT — no separate lookup needed
    const role = user.role || sessionData.role || null
    
    return {
      user,
      profile,
      role,
      errors: {
        profileError,
        roleError: null
      }
    }
  } catch (error) {
    console.error('Debug auth state error:', sanitizeForLog(error instanceof Error ? error.message : 'Unknown error'))
    return null
  }
}

// Add to window for easy debugging
if (typeof window !== 'undefined') {
  (window as any).debugAuth = debugAuthState
}
