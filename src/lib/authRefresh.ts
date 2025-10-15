import { getSupabaseClient } from './supabase'
import { logger } from '@/utils/logger'

function clearStaleSession() {
  if (typeof window === 'undefined') return
  
  try {
    localStorage.removeItem('mihas-auth-token')
    // Clear all Supabase auth keys
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key)
      }
    })
    sessionStorage.clear()
    logger.info('Cleared stale session data')
  } catch (error) {
    logger.error('Failed to clear session:', error)
  }
}

export async function refreshAuthSession() {
  try {
    const supabase = getSupabaseClient()
    
    // First, try to get the current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    logger.info('[AuthRefresh] Session check:', { 
      hasSession: !!session, 
      hasError: !!sessionError,
      hasToken: !!session?.access_token 
    })
    
    if (sessionError) {
      logger.error('[AuthRefresh] Session error:', sessionError)
      clearStaleSession()
      return { success: false, error: sessionError.message }
    }
    
    if (!session) {
      logger.warn('[AuthRefresh] No active session found - NOT clearing (might be loading)')
      return { success: false, error: 'No active session' }
    }
    
    // Validate session has required fields
    if (!session.access_token || !session.user) {
      logger.error('Invalid session structure')
      clearStaleSession()
      return { success: false, error: 'Invalid session' }
    }
    
    // Check if token is expired or about to expire (within 5 minutes)
    const now = Date.now()
    const expiresAt = (session.expires_at || 0) * 1000
    const fiveMinutes = 5 * 60 * 1000
    
    if (expiresAt - now < fiveMinutes) {
      logger.info('Token is expired or about to expire, refreshing...')
      
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession()
      
      if (refreshError) {
        logger.error('Token refresh failed:', refreshError)
        clearStaleSession()
        return { success: false, error: refreshError.message }
      }
      
      if (refreshData.session) {
        logger.info('Token refreshed successfully')
        return { success: true, session: refreshData.session }
      }
      
      clearStaleSession()
      return { success: false, error: 'Refresh returned no session' }
    }
    
    return { success: true, session }
  } catch (error) {
    logger.error('Auth refresh error:', error)
    clearStaleSession()
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }
  }
}

export async function ensureValidSession() {
  const result = await refreshAuthSession()
  
  if (!result.success) {
    clearStaleSession()
    throw new Error(result.error || 'Authentication required')
  }
  
  return result.session
}