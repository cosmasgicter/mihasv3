import { monitoring } from '@/lib/monitoring'
import { getSupabaseClient } from '@/lib/supabase'
import { getApiBaseUrl } from '@/lib/apiConfig'

const API_BASE = getApiBaseUrl()

class ApiClient {
  private async parseJsonSafely<TResponse>(
    response: Response,
    service: string,
    endpoint: string
  ): Promise<TResponse | null> {
    if (response.status === 204 || response.status === 205) {
      return null
    }

    const contentLengthHeader = response.headers.get('content-length')
    if (contentLengthHeader !== null) {
      const contentLength = Number.parseInt(contentLengthHeader, 10)
      if (!Number.isNaN(contentLength) && contentLength === 0) {
        return null
      }
    }

    const bodyText = await response.text()
    const trimmedBody = bodyText.trim()

    if (!trimmedBody) {
      return null
    }

    const contentType = response.headers.get('content-type') ?? ''
    const shouldParseJson =
      contentType.includes('application/json') ||
      trimmedBody.startsWith('{') ||
      trimmedBody.startsWith('[')

    if (!shouldParseJson) {
      return bodyText
    }

    try {
      return JSON.parse(bodyText) as TResponse
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to parse JSON response from ${endpoint}: ${message}`)
    }
  }

  private normalizeHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) {
      return {}
    }

    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries())
    }

    if (Array.isArray(headers)) {
      return headers.reduce((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {} as Record<string, string>)
    }

    return headers
  }

  private async getAuthHeaders() {
    const baseHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (typeof window === 'undefined') {
      return baseHeaders
    }

    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        baseHeaders.Authorization = `Bearer ${token}`
      }
    } catch (error) {
      console.error('Failed to resolve Supabase session for API request:', error)
    }

    return baseHeaders
  }

  async request<TResponse = unknown>(endpoint: string, options: RequestInit = {}): Promise<TResponse | null> {
    const start = Date.now()
    const service = endpoint.split('/')[2] || 'unknown'
    const method = (options.method ?? 'GET').toString().toUpperCase()

    try {
      const authHeaders = await this.getAuthHeaders()
      const requestHeaders = {
        ...authHeaders,
        ...this.normalizeHeaders(options.headers)
      }

      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: requestHeaders
      })

      const duration = Date.now() - start
      monitoring.trackApiCall(service, endpoint, duration, response.ok, {
        method,
        statusCode: response.status
      })
      monitoring.queueFlush(!response.ok)

      if (!response.ok) {
        monitoring.logError(service, `${response.status}: ${response.statusText}`, {
          endpoint,
          method,
          statusCode: response.status
        })
        throw new Error(`API Error: ${response.statusText}`)
      }

      return this.parseJsonSafely<TResponse>(response, service, endpoint)
    } catch (error) {
      const duration = Date.now() - start
      monitoring.trackApiCall(service, endpoint, duration, false, { method })
      monitoring.logError(service, error instanceof Error ? error : { message: 'Unknown error' }, {
        endpoint,
        method
      })
      monitoring.queueFlush(true)
      throw error
    }
  }
}

export const apiClient = new ApiClient()

export type QueryParamValue = string | number | boolean

export type QueryParams = Record<string, QueryParamValue | QueryParamValue[] | null | undefined>

export function buildQueryString(params: QueryParams = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    if (Array.isArray(value)) {
      const validItems = value.filter(item => item !== undefined && item !== null && item !== '')
      if (validItems.length > 0) {
        query.set(key, validItems.join(','))
      }
      return
    }

    query.set(key, String(value))
  })

  const queryString = query.toString()
  return queryString ? `?${queryString}` : ''
}

export type ApiClientRequest = ApiClient['request']
