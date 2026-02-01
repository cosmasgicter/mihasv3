/**
 * Session Utilities - Cookie-based authentication
 * 
 * All session operations use HTTP-only cookies (credentials: 'include')
 * NO Bearer token headers - cookies are managed by the browser
 * 
 * @module sessionUtils
 */

export interface SessionResult {
  authenticated: boolean;
  error: string | null;
}

/**
 * Checks if the current session is valid via API
 * Uses HTTP-only cookies for authentication
 */
export async function checkSession(): Promise<SessionResult> {
  try {
    const response = await fetch('/api/auth?action=session', {
      method: 'GET',
      credentials: 'include', // Send HTTP-only cookies
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return { authenticated: false, error: 'Session expired or invalid' };
    }

    const data = await response.json();
    
    if (data.success && data.data?.user) {
      return { authenticated: true, error: null };
    }

    return { authenticated: false, error: 'No active session' };
  } catch (err) {
    return {
      authenticated: false,
      error: err instanceof Error ? err.message : 'Failed to check session',
    };
  }
}

/**
 * Makes an authenticated API request using HTTP-only cookies
 * @param url - The URL to fetch
 * @param options - Fetch options
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Validate URL to prevent SSRF attacks
  const urlObj = new URL(url, window.location.origin);
  const allowedHosts = [
    'apply.mihas.edu.zm',
    'mylgegkqoddcrxtwcclb.supabase.co',
    'localhost',
    window.location.hostname,
  ];
  
  if (!allowedHosts.includes(urlObj.hostname)) {
    throw new Error('Invalid URL - host not allowed');
  }

  return fetch(url, {
    ...options,
    credentials: 'include', // CRITICAL: Send HTTP-only cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * @deprecated Use makeAuthenticatedRequest instead
 * This function is kept for backward compatibility during migration
 */
export async function getSessionToken(): Promise<SessionResult> {
  return checkSession();
}
