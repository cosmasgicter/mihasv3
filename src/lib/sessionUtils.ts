import { supabase } from './supabase'

export interface SessionResult {
  token: string | null
  error: string | null
}

/**
 * Safely retrieves the current session token
 * @returns Promise with token and error information
 */
export async function getSessionToken(): Promise<SessionResult> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      return { token: null, error: error.message }
    }
    
    if (!session?.access_token) {
      return { token: null, error: 'No active session' }
    }
    
    return { token: session.access_token, error: null }
  } catch (err) {
    return { 
      token: null, 
      error: err instanceof Error ? err.message : 'Failed to get session' 
    }
  }
}

/**
 * Makes an authenticated API request with proper session handling
 */
export async function makeAuthenticatedRequest(
  url: string, 
  options: RequestInit = {}
): Promise<Response> {
  const { token, error } = await getSessionToken()
  
  if (!token) {
    throw new Error(error || 'Authentication required')
  }
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      Authorization: `Bearer ${token}`
    }
  })
}