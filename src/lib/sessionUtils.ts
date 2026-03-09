/**
 * Session Utilities - Cookie-based authentication
 * 
 * All session operations use HTTP-only cookies (credentials: 'include')
 * NO Bearer token headers - cookies are managed by the browser
 * 
 * @module sessionUtils
 */

import { apiClient } from '@/services/client';

export interface SessionResult {
  authenticated: boolean;
  error: string | null;
}

function getAllowedHosts(): string[] {
  const hosts = new Set<string>([
    'apply.mihas.edu.zm',
    'localhost',
    '127.0.0.1',
  ]);

  if (typeof window !== 'undefined' && window.location.hostname) {
    hosts.add(window.location.hostname);
  }

  const r2PublicUrl = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_R2_PUBLIC_URL;
  if (r2PublicUrl) {
    try {
      hosts.add(new URL(r2PublicUrl).hostname);
    } catch {
      // Ignore invalid env values.
    }
  }

  return Array.from(hosts);
}

/**
 * Checks if the current session is valid via API
 * Uses HTTP-only cookies for authentication
 */
export async function checkSession(): Promise<SessionResult> {
  try {
    const data = await apiClient.request<{ user?: unknown }>('/auth?action=session');
    if (data?.user) {
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
  const allowedHosts = getAllowedHosts();
  
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


