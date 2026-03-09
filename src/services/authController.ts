import { getApiBaseUrl } from '@/lib/apiConfig'
import { logger } from '@/utils/logger'
import { secureStorage } from '@/lib/secureStorage'
import { getCsrfToken, setCsrfToken, clearCsrfToken } from '@/lib/csrfToken'

export interface AuthApiEnvelope<T = unknown> {
  success: boolean
  data?: T
  error?: string
  code?: string
}

interface AuthControllerConfig {
  clearAuthState?: () => void
  clearCaches?: () => void
  redirectToSignIn?: (path: string) => void
}

interface AuthRequestConfig {
  attemptRefreshOn401?: boolean
  redirectOnUnauthorized?: boolean
}

const DEFAULT_SIGNIN_PATH = '/auth/signin'

let controllerConfig: AuthControllerConfig = {}
let isHandlingUnauthorized = false

function getRedirectTarget() {
  if (typeof window === 'undefined') {
    return DEFAULT_SIGNIN_PATH
  }

  const from = `${window.location.pathname}${window.location.search}`
  if (!from || from === '/') {
    return DEFAULT_SIGNIN_PATH
  }

  return `${DEFAULT_SIGNIN_PATH}?redirect=${encodeURIComponent(from)}`
}

function hardClearAuthState() {
  if (isHandlingUnauthorized) {
    return
  }

  isHandlingUnauthorized = true

  controllerConfig.clearAuthState?.()
  controllerConfig.clearCaches?.()

  const redirectTarget = getRedirectTarget()
  if (controllerConfig.redirectToSignIn) {
    controllerConfig.redirectToSignIn(redirectTarget)
  } else if (typeof window !== 'undefined') {
    window.location.assign(redirectTarget)
  }

  isHandlingUnauthorized = false
}

async function requestRefresh(baseUrl: string): Promise<boolean> {
  const csrfToken = getCsrfToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const refreshResponse = await fetch(`${baseUrl}/api/auth?action=refresh`, {
    method: 'POST',
    credentials: 'include',
    headers,
  })

  // Capture rotated CSRF token from refresh response
  const newCsrfToken = refreshResponse.headers.get('X-CSRF-Token');
  if (newCsrfToken) {
    setCsrfToken(newCsrfToken);
  }

  return refreshResponse.ok
}

/**
 * Module-level promise lock for token refresh deduplication.
 * When the first 401 triggers a refresh, subsequent 401s await the same promise
 * instead of initiating parallel refresh requests.
 */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Deduplicated token refresh. If a refresh is already in-flight, returns the
 * existing promise. Otherwise starts a new refresh and clears the lock on
 * completion (success or failure).
 */
async function deduplicatedRefresh(baseUrl: string): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = requestRefresh(baseUrl);
  try {
    const result = await refreshPromise;
    return result;
  } finally {
    refreshPromise = null;
  }
}


async function parseResponse<T>(response: Response): Promise<AuthApiEnvelope<T>> {
  try {
    return (await response.json()) as AuthApiEnvelope<T>
  } catch {
    return {
      success: false,
      error: 'Invalid server response',
    }
  }
}

export function configureAuthController(config: AuthControllerConfig) {
  controllerConfig = config
}

export async function authRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
  config: AuthRequestConfig = {},
): Promise<AuthApiEnvelope<T>> {
  const {
    attemptRefreshOn401 = true,
    redirectOnUnauthorized = true,
  } = config

  const baseUrl = getApiBaseUrl()

  const performRequest = () => {
    const csrfHeaders: Record<string, string> = {};
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        csrfHeaders['X-CSRF-Token'] = csrfToken;
      }
    }

    return fetch(`${baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...csrfHeaders,
        ...options.headers,
      },
    })
  }

  try {
    let response = await performRequest()

    // Capture CSRF token from response (set on login/refresh)
    const responseCsrfToken = response.headers.get('X-CSRF-Token');
    if (responseCsrfToken) {
      setCsrfToken(responseCsrfToken);
    }

    if (response.status === 401 && attemptRefreshOn401) {
      const refreshSucceeded = await deduplicatedRefresh(baseUrl)

      if (refreshSucceeded) {
        // Retry the original request once with the new token
        response = await performRequest()
      } else {
        // Refresh failed — clear auth state and redirect
        if (redirectOnUnauthorized) {
          hardClearAuthState()
        }
        return {
          success: false,
          error: 'Session expired. Please sign in again.',
          code: 'SESSION_EXPIRED',
        }
      }
    }

    const result = await parseResponse<T>(response)

    if (response.status === 401 && redirectOnUnauthorized) {
      hardClearAuthState()
    }

    if (!response.ok) {
      return {
        success: false,
        error: result.error || result.code || 'Request failed',
        code: result.code,
      }
    }

    return result
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

export async function logoutWithTwoPhaseClear() {
  controllerConfig.clearAuthState?.()
  controllerConfig.clearCaches?.()
  clearCsrfToken()

  // Clear all encrypted session data from localStorage
  await secureStorage.clearSession().catch((err) => {
    logger.warn('Failed to clear secure storage on logout', err)
  })

  const result = await authRequest('/api/auth?action=logout', { method: 'POST' }, {
    attemptRefreshOn401: false,
    redirectOnUnauthorized: false,
  })

  if (!result.success) {
    logger.warn('Server logout failed after local logout clear', result)
  }

  return result
}
