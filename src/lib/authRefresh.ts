import { getSupabaseClient } from './supabase'
import { logger } from '@/utils/logger'

export async function refreshAuthSession() {
  try {
    const supabase = getSupabaseClient()
    
    // First, try to get the current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      logger.error('Session error:', sessionError)
      return { success: false, error: sessionError.message }
    }
    
    if (!session) {
      logger.warn('No active session found')
      return { success: false, error: 'No active session' }
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
        return { success: false, error: refreshError.message }
      }
      
      if (refreshData.session) {
        logger.info('Token refreshed successfully')
        return { success: true, session: refreshData.session }
      }
    }
    
    return { success: true, session }
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
    // Clear any stale session data
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mihas-auth-token')
      sessionStorage.clear()
    }
    
    throw new Error(result.error || 'Authentication required')
  }
  
  return result.session
}