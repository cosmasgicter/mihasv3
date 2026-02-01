import { supabase } from '@/lib/supabase'
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
    
    // Check user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    
    // Check user role
    const { data: role, error: roleError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    
    return {
      user,
      profile,
      role,
      errors: {
        profileError,
        roleError
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