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

/** Store a rotated token from a response header; the one writer the upload transport uses. */
export function captureCsrfToken(value: string | null): void {
  if (value) setCsrfToken(value);
}

/**
 * Re-fetch the CSRF token from the session endpoint and store it.
 *
 * Uses the `?refresh_csrf=1` query parameter instead of a custom header because
 * cross-origin requests with non-standard headers need a CORS preflight that may
 * be blocked if the header is not in CORS_ALLOW_HEADERS. Shared by the fetch
 * recovery below and the upload transport, so there is one recovery contract.
 */
export async function refreshCsrfToken(signal?: AbortSignal): Promise<void> {
  const sessionEndpoint = toApiV1Path('/auth/session/') + '?refresh_csrf=1';
  const sessionResponse = await fetch(`${API_BASE}${sessionEndpoint}`, {
    method: 'GET',
    credentials: 'include',
    signal,
  });
  const freshCsrf = sessionResponse.headers.get('X-CSRF-Token');
  if (freshCsrf) {
    setCsrfToken(freshCsrf);
  }
}

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
  await refreshCsrfToken(signal);
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
