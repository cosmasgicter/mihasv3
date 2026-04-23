import { env } from '@/lib/env'
import type { ApiEnvelope } from '@/services/api/contracts'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  retries?: number
}

let csrfToken: string | null = null

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
