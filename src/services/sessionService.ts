/**
 * Session Service
 * Manages user sessions using custom JWT auth with HTTP-only cookies
 */

export interface TerminateSessionsResult {
  success: boolean
  terminatedCount: number
  error?: string
}

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

/**
 * Terminates all other sessions except the current one.
 * Uses the sessions API endpoint with revoke-all action.
 * 
 * @returns Promise with success status and count of terminated sessions
 */
export async function terminateAllOtherSessions(): Promise<TerminateSessionsResult> {
  try {
    // Call the sessions API to revoke all other sessions
    const response = await authFetch('/api/sessions?action=revoke-all', {
      method: 'POST',
    })

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          terminatedCount: 0,
          error: 'No active session found'
        }
      }
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        terminatedCount: 0,
        error: errorData.error || `Failed to terminate sessions: ${response.statusText}`
      }
    }

    const result = await response.json()
    
    return {
      success: result.success ?? true,
      terminatedCount: result.revokedCount ?? 0,
      error: result.error
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('Failed to terminate sessions:', error)
    return {
      success: false,
      terminatedCount: 0,
      error: errorMessage
    }
  }
}
