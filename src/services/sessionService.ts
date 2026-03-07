/**
 * Session Service
 * Manages user sessions using custom JWT auth with HTTP-only cookies
 */
import { apiClient } from '@/services/client'

export interface SessionDeviceInfo {
  browser?: string
  os?: string
  device_type?: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  is_mobile?: boolean
}

export interface DeviceSession {
  id: string
  device_info: SessionDeviceInfo | string
  ip_address?: string | null
  last_activity: string
  created_at: string
  is_current?: boolean
}

export interface ListSessionsResult {
  success: boolean
  sessions: DeviceSession[]
  count: number
  error?: string
  accessIssue?: boolean
}

export interface TerminateSessionsResult {
  success: boolean
  terminatedCount: number
  error?: string
}

export interface TerminateSessionResult {
  success: boolean
  error?: string
}

export async function listActiveSessions(): Promise<ListSessionsResult> {
  try {
    const result = await apiClient.request<{ sessions?: DeviceSession[]; count?: number }>('/api/sessions?action=list', {
      method: 'GET',
      useCache: false,
    })

    return {
      success: true,
      sessions: Array.isArray(result?.sessions) ? result.sessions : [],
      count: typeof result?.count === 'number' ? result.count : Array.isArray(result?.sessions) ? result.sessions.length : 0,
      accessIssue: !Array.isArray(result?.sessions),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    if (errorMessage.includes('Authentication required')) {
      return {
        success: false,
        sessions: [],
        count: 0,
        error: 'No active session found',
        accessIssue: true,
      }
    }

    return {
      success: false,
      sessions: [],
      count: 0,
      error: errorMessage,
      accessIssue: false,
    }
  }
}

export async function terminateSessionById(sessionId: string): Promise<TerminateSessionResult> {
  try {
    const result = await apiClient.request<{ revoked?: boolean }>('/api/sessions?action=revoke', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })

    return {
      success: result?.revoked !== false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return {
      success: false,
      error: errorMessage,
    }
  }
}

/**
 * Terminates all other sessions except the current one.
 * Uses the sessions API endpoint with revoke-all action.
 * 
 * @returns Promise with success status and count of terminated sessions
 */
export async function terminateAllOtherSessions(): Promise<TerminateSessionsResult> {
  try {
    const result = await apiClient.request<{ count?: number; revoked?: boolean }>('/api/sessions?action=revoke-all', {
      method: 'POST',
      body: JSON.stringify({ keepCurrent: true }),
    })
    
    return {
      success: result?.revoked !== false,
      terminatedCount: result?.count ?? 0,
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
