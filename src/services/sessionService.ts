/**
 * Session Service
 * Manages user sessions using custom JWT auth with HTTP-only cookies
 */
import { apiClient } from '@/services/client'

export interface TerminateSessionsResult {
  success: boolean
  terminatedCount: number
  error?: string
}

/**
 * Terminates all other sessions except the current one.
 * Uses the sessions API endpoint with revoke-all action.
 * 
 * @returns Promise with success status and count of terminated sessions
 */
export async function terminateAllOtherSessions(): Promise<TerminateSessionsResult> {
  try {
    const result = await apiClient.request<{ revokedCount?: number }>('/api/sessions?action=revoke-all', {
      method: 'POST',
    })
    
    return {
      success: true,
      terminatedCount: (result as any)?.revokedCount ?? 0,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Failed to terminate sessions:', error)
    
    if (errorMessage.includes('401') || errorMessage.includes('Authentication required')) {
      return {
        success: false,
        terminatedCount: 0,
        error: 'No active session found'
      }
    }
    
    return {
      success: false,
      terminatedCount: 0,
      error: errorMessage
    }
  }
}
