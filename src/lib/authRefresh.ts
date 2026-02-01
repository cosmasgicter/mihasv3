/**
 * Auth Refresh - Uses HTTP-only cookie authentication
 * Replaces Supabase Auth SDK with custom JWT auth
 */
import { logger } from '@/utils/logger'

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

export async function refreshAuthSession() {
  try {
    // First, try to get the current session
    const sessionResponse = await authFetch('/api/auth?action=session')
    
    logger.info('[AuthRefresh] Session check:', { 
      ok: sessionResponse.ok, 
      status: sessionResponse.status 
    })
    
    if (!sessionResponse.ok) {
      if (sessionResponse.status === 401) {
        logger.warn('[AuthRefresh] No active session found')
        return { success: false, error: 'No active session' }
      }
      logger.error('[AuthRefresh] Session error:', sessionResponse.statusText)
      return { success: false, error: sessionResponse.statusText }
    }
    
    const sessionData = await sessionResponse.json()
    
    if (!sessionData.success || !sessionData.user) {
      logger.error('Invalid session structure')
      return { success: false, error: 'Invalid session' }
    }
    
    // Proactively refresh the token
    logger.info('Refreshing token...')
    
    const refreshResponse = await authFetch('/api/auth?action=refresh', {
      method: 'POST',
    })
    
    if (!refreshResponse.ok) {
      logger.error('Token refresh failed:', refreshResponse.statusText)
      return { success: false, error: refreshResponse.statusText }
    }
    
    const refreshData = await refreshResponse.json()
    
    if (refreshData.success) {
      logger.info('Token refreshed successfully')
      return { success: true, user: refreshData.user }
    }
    
    return { success: false, error: 'Refresh returned no session' }
  } catch (error) {
    logger.error('Auth refresh error:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export async function ensureValidSession() {
  const result = await refreshAuthSession()
  
  if (!result.success) {
    throw new Error(result.error || 'Authentication required')
  }
  
  return result.user
}