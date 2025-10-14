import { monitoring } from '@/lib/monitoring'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { fetchWithCache, invalidateCache } from '@/utils/api-cache'
import { ApiErrorHandler } from '@/lib/apiErrorHandler'
import { logger } from '@/utils/logger'

import type { FetchWithCacheOptions } from '@/utils/api-cache'

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

    if (!isSupabaseConfigured) {
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
      logger.error('Failed to resolve Supabase session for API request:', error)
    }

    return baseHeaders
  }

  private getInvalidationPatterns(
    endpoint: string,
    customTargets?: string | string[] | false
  ): string[] {
    if (customTargets === false) {
      return []
    }

    const targets = new Set<string>()

    if (customTargets) {
      const entries = Array.isArray(customTargets) ? customTargets : [customTargets]
      entries
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .forEach(value => targets.add(value))
    }

    const normalizedEndpoint = endpoint.split('?')[0]
    if (normalizedEndpoint) {
      const segments = normalizedEndpoint.split('/').filter(Boolean)
      if (segments.length > 0) {
        const startIndex = segments[0] === 'api' ? 2 : 1
        for (let i = startIndex; i <= segments.length; i++) {
          const pattern = `/${segments.slice(0, i).join('/')}`
          if (pattern.length > 1) {
            targets.add(pattern)
          }
        }

        if (segments[0] !== 'api') {
          const fullPath = normalizedEndpoint.startsWith('/')
            ? normalizedEndpoint
            : `/${normalizedEndpoint}`
          targets.add(fullPath)
        }
      }
    }

    return Array.from(targets)
  }

  private invalidateRelatedCaches(
    endpoint: string,
    customTargets?: string | string[] | false
  ) {
    const patterns = this.getInvalidationPatterns(endpoint, customTargets)
    patterns.forEach(pattern => invalidateCache(pattern))
  }

  async request<TResponse = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<TResponse | null> {
    const start = Date.now()
    const service = endpoint.split('/')[2] || 'unknown'
    const method = (options.method ?? 'GET').toString().toUpperCase()

    try {
      const {
        cacheTTL,
        skipCache,
        useCache,
        cacheKey,
        invalidateCache: invalidateTargets,
        headers,
        ...restOptions
      } = options

      const authHeaders = await this.getAuthHeaders()
      const requestHeaders = {
        ...authHeaders,
        ...this.normalizeHeaders(headers)
      }

      const requestInit: RequestInit = {
        ...restOptions,
        method,
        headers: requestHeaders
      }

      if (method === 'GET') {
        const shouldUseCache = (useCache ?? true) && !(skipCache ?? false)
        const url = `${API_BASE}${endpoint}`

        let responseMeta: { ok: boolean; statusCode: number; duration: number } | null = null

        const fetchOptions: RequestInit & FetchWithCacheOptions = {
          ...requestInit,
          cache: shouldUseCache,
          ...(cacheTTL !== undefined ? { cacheTTL } : {}),
          ...(cacheKey ? { cacheKey } : {}),
          transformResponse: (response: Response) =>
            this.parseJsonSafely<TResponse>(response, service, endpoint),
          onResponse: (response, duration) => {
            responseMeta = {
              ok: response.ok,
              statusCode: response.status,
              duration
            }
          }
        }

        const data = await fetchWithCache<TResponse | null>(url, fetchOptions)

        if (responseMeta) {
          monitoring.trackApiCall(service, endpoint, responseMeta.duration, responseMeta.ok, {
            method,
            statusCode: responseMeta.statusCode
          })
          monitoring.queueFlush(!responseMeta.ok)
        } else {
          const duration = Date.now() - start
          monitoring.trackApiCall(service, endpoint, duration, true, {
            method,
            statusCode: 200
          })
          monitoring.queueFlush(false)
        }

        return data
      }

      const response = await fetch(`${API_BASE}${endpoint}`, requestInit)

      const duration = Date.now() - start
      monitoring.trackApiCall(service, endpoint, duration, response.ok, {
        method,
        statusCode: response.status
      })
      monitoring.queueFlush(!response.ok)

      if (!response.ok) {
        let errorMessage = `API Error: ${response.statusText}`
        try {
          const errorData = await response.text()
          if (errorData) {
            const parsed = JSON.parse(errorData)
            errorMessage = parsed.error || parsed.message || errorMessage
          }
        } catch {
          // Use default error message
        }
        
        monitoring.logError(service, `${response.status}: ${errorMessage}`, {
          endpoint,
          method,
          statusCode: response.status
        })
        
        // Enhance error message for better UX
        const enhancedError = ApiErrorHandler.enhanceError({
          endpoint,
          method,
          statusCode: response.status,
          originalError: new Error(errorMessage)
        })
        throw enhancedError
      }

      const payload = await this.parseJsonSafely<TResponse>(response, service, endpoint)

      this.invalidateRelatedCaches(endpoint, invalidateTargets)

      return payload
    } catch (error) {
      const duration = Date.now() - start
      monitoring.trackApiCall(service, endpoint, duration, false, { method })
      const errorPayload = error instanceof Error ? error : { message: 'Unknown error' }
      const statusCode = typeof (error as any)?.status === 'number' ? (error as any).status : undefined
      monitoring.logError(
        service,
        errorPayload,
        {
          endpoint,
          method,
          ...(statusCode ? { statusCode } : {})
        }
      )
      monitoring.queueFlush(true)
      
      // Enhance error if not already enhanced
      if (!(error instanceof Error) || !error.message.includes('Please')) {
        const enhancedError = ApiErrorHandler.enhanceError({
          endpoint,
          method,
          statusCode,
          originalError: error
        })
        throw enhancedError
      }
      
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

export interface ApiRequestOptions extends RequestInit {
  cacheTTL?: number
  skipCache?: boolean
  useCache?: boolean
  cacheKey?: string
  invalidateCache?: string | string[] | false
}
