/**
 * Auth interceptor — 401 refresh logic, 403 CSRF recovery delegation,
 * and promise deduplication for token refresh.
 *
 * Extracted from the monolithic ApiClient to keep auth concerns isolated.
 *
 * @module authInterceptor
 */

import { getCsrfToken, setCsrfToken } from '@/lib/csrfToken';
import { dispatchAuthRecovered } from '@/lib/sessionHardening';

import { toApiV1Path } from './apiHelpers';
import { API_BASE } from './httpClient';

// ---------------------------------------------------------------------------
// AuthenticationError
// ---------------------------------------------------------------------------

/**
 * Error thrown when the ApiClient encounters an unrecoverable 401
 * (token refresh failed or second 401 after retry).
 * Callers can catch this to handle UI cleanup if needed.
 */
export class AuthenticationError extends Error {
  public readonly status = 401;
  constructor(message: string = 'Authentication required. Please sign in again.') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// ---------------------------------------------------------------------------
// Auth failure callback management
// ---------------------------------------------------------------------------

/**
 * Callback invoked when the ApiClient encounters an unrecoverable 401
 * (token refresh failed). Configured by AuthProvider on mount to clear
 * auth state, caches, and redirect to sign-in.
 *
 * Replaces `configureAuthController` from the old authController.ts.
 */
let onAuthFailure: (() => void) | null = null;

/**
 * Configure the auth failure callback for the ApiClient.
 * Called once from AuthProvider on mount. When the ApiClient detects
 * an unrecoverable 401 (refresh failed), it invokes this callback
 * to clear auth state and redirect.
 *
 * Replaces `configureAuthController` from authController.ts.
 */
export function configureApiClientAuthFailure(callback: () => void): void {
  onAuthFailure = callback;
}

/**
 * Get the current auth failure callback (used internally by ApiClient).
 * @internal
 */
export function getOnAuthFailure(): (() => void) | null {
  return onAuthFailure;
}

// ---------------------------------------------------------------------------
// Endpoint classification helpers
// ---------------------------------------------------------------------------

/**
 * Check if an endpoint should be excluded from 401 intercept-refresh-retry.
 * Auth endpoints like refresh, login, and register are excluded to prevent
 * infinite loops (e.g., a failed refresh triggering another refresh).
 */
export function isAuthExcludedEndpoint(endpoint: string): boolean {
  const excludedPatterns = [
    '/api/v1/auth/refresh/',
    '/api/v1/auth/login/',
    '/api/v1/auth/register/',
  ];
  if (excludedPatterns.some(pattern => endpoint.includes(pattern))) return true;
  // Don't attempt refresh on auth pages — the user is logged out
  if (typeof window !== 'undefined' && /^\/auth\//i.test(window.location.pathname)) return true;
  return false;
}

export function isSessionEndpoint(endpoint: string): boolean {
  return endpoint.includes('/api/v1/auth/session/');
}

// ---------------------------------------------------------------------------
// Token refresh with promise deduplication
// ---------------------------------------------------------------------------

/**
 * Promise-lock for token refresh deduplication.
 * When the first 401 triggers a refresh, subsequent 401s await the same promise
 * instead of initiating parallel refresh requests.
 */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Perform the actual token refresh call to the server.
 * Sends a POST to /api/v1/auth/refresh/ with credentials and CSRF token.
 * Captures the rotated CSRF token from the response header.
 */
async function performRefresh(): Promise<boolean> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  try {
    const refreshEndpoint = toApiV1Path('/auth/refresh/');
    const response = await fetch(`${API_BASE}${refreshEndpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });

    // Capture rotated CSRF token from refresh response
    const newCsrfToken = response.headers.get('X-CSRF-Token');
    if (newCsrfToken) {
      setCsrfToken(newCsrfToken);
    }

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Deduplicated token refresh. If a refresh is already in-flight, returns the
 * existing promise. Otherwise starts a new refresh and clears the lock on
 * completion (success or failure).
 */
export async function attemptRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefresh();
  try {
    const result = await refreshPromise;
    if (result) {
      dispatchAuthRecovered();
    }
    return result;
  } finally {
    refreshPromise = null;
  }
}

/**
 * Public refresh entrypoint for auth bootstrap code. It uses the same
 * promise-lock as the 401 interceptor so explicit session recovery cannot
 * race with data-request recovery and invalidate a rotating refresh token.
 */
export async function refreshAuthSession(): Promise<boolean> {
  return attemptRefresh();
}
