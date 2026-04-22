/**
 * CSRF token management and recovery for the API client.
 *
 * Handles CSRF token storage synchronization and 403 CSRF error recovery
 * by re-fetching the token from the session endpoint and retrying.
 *
 * @module csrf
 */

import { getApiBaseUrl } from '@/lib/apiConfig';
import { getCsrfToken, setCsrfToken } from '@/lib/csrfToken';
import { toApiV1Path } from './apiHelpers';

const API_BASE = getApiBaseUrl();

/**
 * Handle a 403 response with a CSRF-related error code.
 * Re-fetches the CSRF token from the session endpoint, updates the
 * CSRF Token Store, and retries the original request once with the
 * fresh token.
 */
export async function recoverCsrfAndRetry(
  endpoint: string,
  method: string,
  restOptions: Record<string, unknown>,
  requestHeaders: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  // Re-fetch CSRF token from session endpoint
  const sessionEndpoint = toApiV1Path('/auth/session/');
  const sessionResponse = await fetch(`${API_BASE}${sessionEndpoint}`, {
    method: 'GET',
    credentials: 'include',
    signal,
  });

  const freshCsrf = sessionResponse.headers.get('X-CSRF-Token');
  if (freshCsrf) {
    setCsrfToken(freshCsrf);
  }

  // Retry the original request with the fresh CSRF token
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    requestHeaders['X-CSRF-Token'] = csrfToken;
  }

  return fetch(`${API_BASE}${endpoint}`, {
    ...restOptions,
    method,
    headers: requestHeaders,
    credentials: 'include',
    signal,
  });
}

/**
 * Sync the in-memory CSRF token from external auth events such as multi-tab
 * broadcasts. Keeping the write inside ApiClient preserves the single writer
 * invariant for the token store.
 */
export function syncApiClientCsrfToken(token: string | null): void {
  setCsrfToken(token);
}
