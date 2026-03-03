/**
 * Auth Refresh - Uses HTTP-only cookie authentication
 * Replaces Supabase Auth SDK with custom JWT auth
 */
import { logger } from '@/utils/logger'
import { apiClient } from '@/services/client'

export async function refreshAuthSession() {
  try {
    // First, try to get the current session
    let sessionData: { user?: { id: string; role?: string } } | null = null
    try {
      sessionData = await apiClient.request<{ user?: { id: string; role?: string } }>('/api/auth?action=session')
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('401') || message.includes('Authentication required')) {
        logger.warn('[AuthRefresh] No active session found')
        return { success: false, error: 'No active session' }
      }
      logger.error('[AuthRefresh] Session error:', message)
      return { success: false, error: message }
    }
    
    if (!sessionData?.user) {
      logger.error('Invalid session structure')
      return { success: false, error: 'Invalid session' }
    }
    
    // Proactively refresh the token
    logger.info('Refreshing token...')
    
    try {
      const refreshData = await apiClient.request<{ user?: { id: string; role?: string } }>('/api/auth?action=refresh', {
        method: 'POST',
      })
      
      if (refreshData) {
        logger.info('Token refreshed successfully')
        return { success: true, user: refreshData?.user }
      }
      
      return { success: false, error: 'Refresh returned no session' }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token refresh failed'
      logger.error('Token refresh failed:', message)
      return { success: false, error: message }
    }
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
