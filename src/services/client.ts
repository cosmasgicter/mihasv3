/**
 * API Client - Cookie-based authentication
 * 
 * All API requests use HTTP-only cookies (credentials: 'include')
 * NO Bearer token headers - cookies are managed by the browser
 * 
 * @module client
 */

import { monitoring } from '@/lib/monitoring';
import { getApiBaseUrl } from '@/lib/apiConfig';
import { fetchWithCache, invalidateCache } from '@/utils/api-cache';
import { ApiErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/utils/logger';

import type { FetchWithCacheOptions } from '@/utils/api-cache';

const API_BASE = getApiBaseUrl();

class ApiClient {
  private normalizeEndpoint(endpoint: string, method: string): string {
    if (!endpoint || endpoint.startsWith('/api/') || endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      return endpoint;
    }

    const [rawPath, rawQuery = ''] = endpoint.split('?');
    const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
    const segments = path.split('/').filter(Boolean);

    if (segments.length === 0) {
      return endpoint;
    }

    const [resource, ...rest] = segments;
    const supportedResources = new Set(['admin', 'applications', 'auth', 'catalog', 'documents', 'notifications']);

    if (!supportedResources.has(resource)) {
      return endpoint;
    }

    const params = new URLSearchParams(rawQuery);
    const canonicalPath = `/api/${resource}`;

    if (resource === 'catalog' && rest.length > 0 && !params.has('type')) {
      params.set('type', rest[0]);
    }

    if (resource === 'auth' && rest.length > 0 && !params.has('action')) {
      params.set('action', rest.join('-'));
    }

    if (resource === 'documents' && rest.length > 0 && !params.has('action')) {
      params.set('action', rest.join('-'));
    }

    if (resource === 'notifications' && rest.length > 0 && !params.has('action')) {
      params.set('action', rest.join('-'));
    }

    if (resource === 'applications') {
      if (rest.length > 0) {
        if (rest[0] === 'bulk' && !params.has('action')) {
          params.set('action', 'bulk');
        } else if (!params.has('id')) {
          params.set('id', rest[0]);
        }
      }

      if (rest.length > 1 && !params.has('action')) {
        params.set('action', rest.slice(1).join('-'));
      }
    }

    if (resource === 'admin' && rest.length > 0) {
      if (rest[0] === 'users') {
        if (!params.has('action')) {
          if (rest[2] === 'role' && (method === 'PUT' || method === 'POST')) {
            params.set('action', 'update-role');
          } else {
            params.set('action', 'users');
          }
        }

        if (rest[1] && !params.has('id')) {
          params.set('id', rest[1]);
        }
      } else if (!params.has('action')) {
        params.set('action', rest.join('-'));
      }
    }

    const queryString = params.toString();
    return queryString ? `${canonicalPath}?${queryString}` : canonicalPath;
  }

  private async parseJsonSafely<TResponse>(
    response: Response,
    service: string,
    endpoint: string
  ): Promise<TResponse | null> {
    if (response.status === 204 || response.status === 205) {
      return null;
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader !== null) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(contentLength) && contentLength === 0) {
        return null;
      }
    }

    const bodyText = await response.text();
    const trimmedBody = bodyText.trim();

    if (!trimmedBody) {
      return null;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const shouldParseJson =
      contentType.includes('application/json') ||
      trimmedBody.startsWith('{') ||
      trimmedBody.startsWith('[');

    if (!shouldParseJson) {
      return bodyText as unknown as TResponse;
    }

    try {
      return JSON.parse(bodyText) as TResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to parse JSON response from ${endpoint}: ${message}`);
    }
  }

  private normalizeHeaders(headers?: HeadersInit): Record<string, string> {
    if (!headers) {
      return {};
    }

    if (headers instanceof Headers) {
      return Object.fromEntries(headers.entries());
    }

    if (Array.isArray(headers)) {
      return headers.reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
    }

    return headers;
  }

  /**
   * Get base headers for API requests
   * NO Authorization header - we use HTTP-only cookies
   */
  private getBaseHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Unwrap the { success, data } envelope returned by API endpoints.
   * All Vercel API endpoints return { success: true, data: T } via sendSuccess().
   * This method extracts the inner `data` so callers get the payload directly.
   */
  private unwrapApiResponse<TResponse>(response: TResponse | null): TResponse | null {
    if (response === null || response === undefined) return null;
    if (typeof response === 'object' && !Array.isArray(response)) {
      const obj = response as Record<string, unknown>;
      if ('success' in obj && 'data' in obj) {
        return (obj.data ?? null) as TResponse | null;
      }
    }
    return response;
  }

  private getInvalidationPatterns(
    endpoint: string,
    customTargets?: string | string[] | false
  ): string[] {
    if (customTargets === false) {
      return [];
    }

    const targets = new Set<string>();

    if (customTargets) {
      const entries = Array.isArray(customTargets) ? customTargets : [customTargets];
      entries
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .forEach(value => targets.add(value));
    }

    const normalizedEndpoint = endpoint.split('?')[0];
    if (normalizedEndpoint) {
      const segments = normalizedEndpoint.split('/').filter(Boolean);
      if (segments.length > 0) {
        const startIndex = segments[0] === 'api' ? 2 : 1;
        for (let i = startIndex; i <= segments.length; i++) {
          const pattern = `/${segments.slice(0, i).join('/')}`;
          if (pattern.length > 1) {
            targets.add(pattern);
          }
        }

        if (segments[0] !== 'api') {
          const fullPath = normalizedEndpoint.startsWith('/')
            ? normalizedEndpoint
            : `/${normalizedEndpoint}`;
          targets.add(fullPath);
        }
      }
    }

    return Array.from(targets);
  }

  private invalidateRelatedCaches(
    endpoint: string,
    customTargets?: string | string[] | false
  ) {
    const patterns = this.getInvalidationPatterns(endpoint, customTargets);
    patterns.forEach(pattern => invalidateCache(pattern));
  }

  async request<TResponse = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<TResponse | null> {
    const start = Date.now();
    const method = (options.method ?? 'GET').toString().toUpperCase();
    const normalizedEndpoint = this.normalizeEndpoint(endpoint, method);
    const service = normalizedEndpoint.split('/')[2] || 'unknown';

    try {
      const {
        cacheTTL,
        skipCache,
        useCache,
        cacheKey,
        invalidateCache: invalidateTargets,
        headers,
        ...restOptions
      } = options;

      const baseHeaders = this.getBaseHeaders();
      const requestHeaders = {
        ...baseHeaders,
        ...this.normalizeHeaders(headers),
      };

      const requestInit: RequestInit = {
        ...restOptions,
        method,
        headers: requestHeaders,
        credentials: 'include', // CRITICAL: Send HTTP-only cookies
      };

      if (method === 'GET') {
        const shouldUseCache = (useCache ?? true) && !(skipCache ?? false);
        const url = `${API_BASE}${normalizedEndpoint}`;

        let responseMeta: { ok: boolean; statusCode: number; duration: number } | null = null;

        // Build fetch options - use type assertion to handle cache property conflict
        // FetchWithCacheOptions.cache is boolean, RequestInit.cache is RequestCache
        const fetchOptions = {
          method,
          headers: requestHeaders,
          credentials: 'include' as RequestCredentials,
          cache: shouldUseCache,
          ...(cacheTTL !== undefined ? { cacheTTL } : {}),
          ...(cacheKey ? { cacheKey } : {}),
          transformResponse: (response: Response) =>
            this.parseJsonSafely<TResponse>(response, service, normalizedEndpoint),
          onResponse: (response: Response, duration: number) => {
            responseMeta = {
              ok: response.ok,
              statusCode: response.status,
              duration,
            };
          },
        } as RequestInit & FetchWithCacheOptions;

        const data = await fetchWithCache<TResponse | null>(url, fetchOptions);

        if (responseMeta) {
          monitoring.trackApiCall(service, normalizedEndpoint, responseMeta.duration, responseMeta.ok, {
            method,
            statusCode: responseMeta.statusCode,
          });
          monitoring.queueFlush(!responseMeta.ok);
        } else {
          const duration = Date.now() - start;
          monitoring.trackApiCall(service, normalizedEndpoint, duration, true, {
            method,
            statusCode: 200,
          });
          monitoring.queueFlush(false);
        }

        // Unwrap { success, data } envelope from API responses
        return this.unwrapApiResponse<TResponse>(data);
      }

      const response = await fetch(`${API_BASE}${normalizedEndpoint}`, requestInit);

      const duration = Date.now() - start;
      monitoring.trackApiCall(service, normalizedEndpoint, duration, response.ok, {
        method,
        statusCode: response.status,
      });
      monitoring.queueFlush(!response.ok);

      if (!response.ok) {
        let errorMessage = `API Error: ${response.statusText}`;
        try {
          const errorData = await response.text();
          if (errorData) {
            const parsed = JSON.parse(errorData);
            errorMessage = parsed.error || parsed.message || errorMessage;
          }
        } catch {
          // Use default error message
        }

        // Handle 401 Unauthorized specifically
        if (response.status === 401) {
          errorMessage = 'Authentication required. Please sign in again.';
          logger.warn('[API Client] 401 Unauthorized - session may have expired');
        }

        monitoring.logError(service, `${response.status}: ${errorMessage}`, {
          endpoint: normalizedEndpoint,
          method,
          statusCode: response.status,
        });

        // Enhance error message for better UX
        const enhancedError = ApiErrorHandler.enhanceError({
          endpoint: normalizedEndpoint,
          method,
          statusCode: response.status,
          originalError: new Error(errorMessage),
        });
        throw enhancedError;
      }

      const payload = await this.parseJsonSafely<TResponse>(response, service, normalizedEndpoint);

      this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);

      // Unwrap { success, data } envelope from API responses
      return this.unwrapApiResponse<TResponse>(payload);
    } catch (error) {
      // Check if this is an abort error (request cancelled)
      const isAbortError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.message?.includes('aborted') ||
          error.message?.includes('cancelled'));

      // Don't log or track abort errors (normal cancellation)
      if (!isAbortError) {
        const duration = Date.now() - start;
        monitoring.trackApiCall(service, normalizedEndpoint, duration, false, { method });
        const errorPayload = error instanceof Error ? error : { message: 'Unknown error' };
        const statusCode =
          typeof (error as any)?.status === 'number' ? (error as any).status : undefined;
        monitoring.logError(service, errorPayload, {
          endpoint: normalizedEndpoint,
          method,
          ...(statusCode ? { statusCode } : {}),
        });
        monitoring.queueFlush(true);
      }

      // For abort errors, just rethrow without enhancement
      if (isAbortError) {
        throw error;
      }

      // Handle authentication errors specifically
      if (error instanceof Error && error.message.includes('401')) {
        logger.warn('[API Client] 401 error in catch block');
        throw new Error('Authentication required. Please sign in again.');
      }

      // Enhance error if not already enhanced
      if (!(error instanceof Error) || !error.message.includes('Please')) {
        const errorStatusCode =
          typeof (error as any)?.status === 'number' ? (error as any).status : undefined;
        const enhancedError = ApiErrorHandler.enhanceError({
          endpoint: normalizedEndpoint,
          method,
          statusCode: errorStatusCode,
          originalError: error,
        });
        throw enhancedError;
      }

      throw error;
    }
  }
}

export const apiClient = new ApiClient();

export type QueryParamValue = string | number | boolean;

export type QueryParams = Record<string, QueryParamValue | QueryParamValue[] | null | undefined>;

export function buildQueryString(params: QueryParams = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value)) {
      const validItems = value.filter(item => item !== undefined && item !== null && item !== '');
      if (validItems.length > 0) {
        query.set(key, validItems.join(','));
      }
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export type ApiClientRequest = ApiClient['request'];

export interface ApiRequestOptions extends RequestInit {
  cacheTTL?: number;
  skipCache?: boolean;
  useCache?: boolean;
  cacheKey?: string;
  invalidateCache?: string | string[] | false;
}
