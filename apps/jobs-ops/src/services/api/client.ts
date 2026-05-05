import { env } from '@/lib/env'
import type { ApiEnvelope } from '@/services/api/contracts'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  retries?: number
  /** Internal flag — prevents infinite CSRF recovery loops. */
  csrfRecovered?: boolean
}

/**
 * In-memory CSRF token store.
 *
 * The token is received from the server in the X-CSRF-Token response header
 * and attached to all state-changing requests (POST, PUT, PATCH, DELETE).
 * Stored in a module-level variable — never persisted to localStorage or
 * sessionStorage. Cleared on logout.
 */
let csrfToken: string | null = null

/** Get the current CSRF token (may be null before bootstrap). */
export function getCsrfToken(): string | null {
  return csrfToken
}

/** Store the CSRF token received from the server. */
export function setCsrfToken(token: string): void {
  csrfToken = token
}

/** Clear the CSRF token (called on logout). */
export function clearCsrfToken(): void {
  csrfToken = null
}

let refreshPromise: Promise<boolean> | null = null
let onAuthFailure: (() => void) | null = null

export function configureAuthFailure(callback: () => void) {
  onAuthFailure = callback
}

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = fetch(`${env.apiBaseUrl}/api/v1/auth/refresh/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  })
    .then((res) => {
      const nextCsrf = res.headers.get('X-CSRF-Token')
      if (nextCsrf) csrfToken = nextCsrf
      return res.ok
    })
    .catch(() => false)
    .finally(() => { refreshPromise = null })
  return refreshPromise
}

/**
 * Recover from a 403 CSRF error by fetching a fresh CSRF token from the
 * session endpoint. Uses the `?refresh_csrf=1` query parameter (not a custom
 * header) to avoid CORS preflight issues on cross-origin requests.
 */
async function recoverCsrf(): Promise<boolean> {
  try {
    const res = await fetch(
      `${env.apiBaseUrl}/api/v1/auth/session/?refresh_csrf=1`,
      { method: 'GET', credentials: 'include' },
    )
    const freshToken = res.headers.get('X-CSRF-Token')
    if (freshToken) {
      csrfToken = freshToken
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Check whether an error payload indicates a CSRF-related failure.
 * The backend may return error codes like CSRF_INVALID, CSRF_MISSING, or
 * CSRF_VALIDATION_FAILED, or include "csrf" in the error message.
 */
function isCsrfError(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return false
  const obj = payload as Record<string, unknown>
  const code = typeof obj.code === 'string' ? obj.code.toLowerCase() : ''
  const error = typeof obj.error === 'string' ? obj.error.toLowerCase() : ''
  const message = typeof obj.message === 'string' ? obj.message.toLowerCase() : ''
  return code.includes('csrf') || error.includes('csrf') || message.includes('csrf')
}

export class ApiRequestError extends Error {
  readonly status?: number
  readonly code?: string
  readonly path: string

  constructor(message: string, path: string, status?: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.path = path
    this.status = status
    this.code = code
  }
}

const RETRY_DELAYS_MS = [400, 1_000]

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function shouldRetry(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return false
  if (error instanceof ApiRequestError) {
    return error.status === undefined || error.status >= 500
  }
  return error instanceof TypeError
}

async function parsePayload<T>(response: Response): Promise<ApiEnvelope<T> | T | null> {
  const text = await response.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as ApiEnvelope<T> | T
  } catch {
    return text as T
  }
}

function logApiFailure(path: string, method: string, error: unknown, attempt: number) {
  const status = error instanceof ApiRequestError ? error.status : undefined
  const code = error instanceof ApiRequestError ? error.code : undefined

  console.error('[jobs-ops api]', {
    path,
    method,
    attempt,
    status,
    code,
    message: error instanceof Error ? error.message : 'Unknown API error',
  })
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { retries = 2, ...fetchOptions } = options
  const method = fetchOptions.method ?? 'GET'

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${env.apiBaseUrl}${path}`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? { 'X-CSRF-Token': csrfToken } : {}),
          ...(fetchOptions.headers || {}),
        },
        ...fetchOptions,
        body: options.body ? JSON.stringify(options.body) : undefined,
      })

      // Capture CSRF token from response header
      const responseCsrf = response.headers.get('X-CSRF-Token')
      if (responseCsrf) {
        csrfToken = responseCsrf
      }

      const payload = await parsePayload<T>(response)

      if (!response.ok) {
        // 401 → attempt token refresh (skip for the refresh endpoint itself)
        if (response.status === 401 && !path.includes('/auth/refresh/')) {
          const refreshed = await refreshSession()
          if (refreshed) {
            // Retry the original request once
            return request<T>(path, { ...options, retries: 0 })
          }
          onAuthFailure?.()
          throw new ApiRequestError('Session expired', path, 401)
        }

        // 403 with CSRF error → recover token and retry once
        if (
          response.status === 403 &&
          !options.csrfRecovered &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
          isCsrfError(payload)
        ) {
          const recovered = await recoverCsrf()
          if (recovered) {
            return request<T>(path, { ...options, retries: 0, csrfRecovered: true })
          }
        }

        if (typeof payload === 'object' && payload && 'error' in payload) {
          throw new ApiRequestError(
            String(payload.error || 'API request failed'),
            path,
            response.status,
            'code' in payload ? String(payload.code || '') : undefined,
          )
        }
        throw new ApiRequestError(`API request failed with status ${response.status}`, path, response.status)
      }

      if (typeof payload === 'object' && payload && 'success' in payload) {
        if (!payload.success) {
          throw new ApiRequestError(String(payload.error || 'API request failed'), path, undefined, payload.code)
        }
        return payload.data
      }

      return payload as T
    } catch (error) {
      logApiFailure(path, String(method), error, attempt + 1)
      if (attempt >= retries || !shouldRetry(error)) {
        throw error
      }
      await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1])
    }
  }

  throw new ApiRequestError('API request failed', path)
}

export const apiClient = {
  get<T>(path: string) {
    return request<T>(path, { method: 'GET' })
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, { method: 'POST', body })
  },
}
