import { apiClient } from '@/services/client'
import { sanitizeForLog } from '@/lib/security'

export async function debugAuthState() {
  try {
    // Check current user via cookie-based auth
    const sessionData = await apiClient.request<{ user?: { id: string; role?: string }; role?: string }>('/api/auth?action=session')
    
    if (!sessionData) {
      console.log('[AuthDebug] No active session')
      return null
    }
    
    const user = sessionData?.user
    
    if (!user) {
      console.log('[AuthDebug] No user in session')
      return null
    }
    
    // Check user profile via API
    let profile: unknown = null
    let profileError: string | null = null
    try {
      profile = await apiClient.request('/auth?action=session')
    } catch (e) {
      profileError = e instanceof Error ? e.message : 'Unknown error'
    }
    
    // Role is embedded in JWT — no separate lookup needed
    const role = user.role || sessionData?.role || null
    
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

// Add to window for easy debugging in development
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- debug utility attached to window for dev console access
  (window as Window & { debugAuth?: typeof debugAuthState }).debugAuth = debugAuthState
}
