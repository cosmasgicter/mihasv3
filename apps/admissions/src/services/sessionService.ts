/**
 * Session Service
 * Manages user sessions using custom JWT auth with HTTP-only cookies
 *
 * Django REST paths (no /api/v1/ prefix — apiClient prepends it):
 *   GET  /sessions/            → list active sessions
 *   POST /sessions/{id}/revoke/  → revoke a specific session
 *   POST /sessions/revoke-all/   → revoke all other sessions
 */
import { apiClient } from '@/services/client'
import { logApiError } from '@/lib/apiErrorLogger'

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
    const result = await apiClient.request<DeviceSession[] | { sessions?: DeviceSession[]; count?: number }>('/sessions/', {
      method: 'GET',
    })

    const sessions = (Array.isArray(result)
      ? result
      : Array.isArray(result?.sessions)
        ? result.sessions
        : []
    ).map((session) => ({
      ...session,
      last_activity:
        session.last_activity ||
        (session as DeviceSession & { last_active?: string }).last_active ||
        session.created_at,
    }))

    return {
      success: true,
      sessions,
      count: typeof result === 'object' && result !== null && !Array.isArray(result) && typeof result.count === 'number'
        ? result.count
        : sessions.length,
      accessIssue: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

    logApiError('session', '/api/v1/sessions/', error)

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
    const result = await apiClient.request<{ message?: string }>(`/sessions/${encodeURIComponent(sessionId)}/revoke/`, {
      method: 'POST',
    })

    return {
      success: Boolean(result?.message || result === null),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    logApiError('session', `/api/v1/sessions/${encodeURIComponent(sessionId)}/revoke/`, error)
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
    const result = await apiClient.request<{ message?: string }>('/sessions/revoke-all/', {
      method: 'POST',
    })

    const terminatedCount = typeof result?.message === 'string'
      ? Number(result.message.match(/\d+/)?.[0] ?? 0)
      : 0

    return {
      success: true,
      terminatedCount,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    logApiError('session', '/api/v1/sessions/revoke-all/', error)
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
