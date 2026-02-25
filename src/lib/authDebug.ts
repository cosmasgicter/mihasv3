import { apiClient } from '@/services/client'
import { sanitizeForLog } from '@/lib/security'

export async function debugAuthState() {
  try {
    // Check current user via cookie-based auth
    const sessionData = await apiClient.request<{ user?: any; role?: string }>('/api/auth?action=session')
    
    if (!sessionData) {
      console.log('[AuthDebug] No active session')
      return null
    }
    
    const user = (sessionData as any)?.user
    
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
    const role = user.role || (sessionData as any)?.role || null
    
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
