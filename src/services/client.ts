/**
 * API Client - Cookie-based authentication
 * 
 * All API requests use HTTP-only cookies (credentials: 'include')
 * NO Bearer token headers - cookies are managed by the browser
 * 
 * @module client
 */

import { getApiBaseUrl } from '@/lib/apiConfig';
import { fetchWithCache, invalidateCache } from '@/utils/api-cache';
import { ApiErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger';
import { getCsrfToken, setCsrfToken } from '@/lib/csrfToken';
import { TIMEOUT_ERROR_MESSAGE } from '@/lib/errorMessages';

import type { FetchWithCacheOptions } from '@/utils/api-cache';

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

const API_BASE = getApiBaseUrl();

/** Default request timeout in milliseconds (30s) */
const DEFAULT_TIMEOUT = 30_000;
/** Shorter timeout for health check and session validation requests (10s) */
const SHORT_TIMEOUT = 10_000;
/** Maximum retry attempts for network/5xx errors */
const MAX_RETRIES = 2;
/** Backoff delays in ms for each retry attempt (1s, 3s) */
const RETRY_DELAYS = [1_000, 3_000];

/** Endpoints that use the shorter timeout */
const SHORT_TIMEOUT_PATTERNS = ['/api/health', '/api/auth?action=session'];

/**
 * Determine the appropriate timeout for a given endpoint.
 * Health checks and session validation use 10s; everything else uses 30s.
 */
function getTimeoutForEndpoint(endpoint: string): number {
  for (const pattern of SHORT_TIMEOUT_PATTERNS) {
    if (endpoint.startsWith(pattern) || endpoint.includes(pattern)) {
      return SHORT_TIMEOUT;
    }
  }
  return DEFAULT_TIMEOUT;
}

/**
 * Check whether a failed request should be retried.
 * Retries network errors and 5xx server errors.
 * Does NOT retry 4xx client errors or user-aborted requests.
 */
function isRetryableFailure(error: unknown): boolean {
  // Never retry user-aborted requests
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  if (error instanceof Error && error.name === 'AbortError') return false;

  // Timeout errors (our custom TimeoutError) are retryable
  if (error instanceof Error && error.name === 'TimeoutError') return true;

  // Network errors (TypeError from fetch) are retryable
  if (error instanceof TypeError) return true;

  // Check for 5xx status in error metadata
  const errWithStatus = error as { status?: number };
  if (typeof errWithStatus?.status === 'number') {
    return errWithStatus.status >= 500;
  }

  // Check error message for network-related failures
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('net::err')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Create an AbortController that auto-aborts after `ms` milliseconds.
 * If an external signal is provided, it is linked so that external abort
 * also cancels the timeout controller.
 */
function createTimeoutController(
  ms: number,
  externalSignal?: AbortSignal | null
): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    const err = new DOMException(TIMEOUT_ERROR_MESSAGE, 'TimeoutError');
    controller.abort(err);
  }, ms);

  const clear = () => clearTimeout(timer);

  // If the caller already has an AbortSignal (e.g. from navigation), link it
  if (externalSignal) {
    if (externalSignal.aborted) {
      clear();
      controller.abort(externalSignal.reason);
    } else {
      const onExternalAbort = () => {
        clear();
        controller.abort(externalSignal.reason);
      };
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  return { controller, clear };
}

class ApiClient {
  /**
   * Promise-lock for token refresh deduplication.
   * When the first 401 triggers a refresh, subsequent 401s await the same promise
   * instead of initiating parallel refresh requests.
   */
  private refreshPromise: Promise<boolean> | null = null;

  /**
   * Perform the actual token refresh call to the server.
   * Sends a POST to /api/auth?action=refresh with credentials and CSRF token.
   * Captures the rotated CSRF token from the response header.
   */
  private async performRefresh(): Promise<boolean> {
    const csrfToken = getCsrfToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth?action=refresh`, {
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
   *
   * This is the same promise-lock pattern from authController.ts deduplicatedRefresh,
   * ported into ApiClient as the single refresh mechanism.
   */
  private async attemptRefresh(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Check if an endpoint should be excluded from 401 intercept-refresh-retry.
   * Auth endpoints like refresh, login, and register are excluded to prevent
   * infinite loops (e.g., a failed refresh triggering another refresh).
   */
  private isAuthExcludedEndpoint(endpoint: string): boolean {
    const excludedPatterns = [
      '/api/auth?action=refresh',
      '/api/auth?action=login',
      '/api/auth?action=register',
    ];
    return excludedPatterns.some(pattern => endpoint.includes(pattern));
  }

  /**
   * Handle a 403 response with a CSRF-related error code.
   * Re-fetches the CSRF token from the session endpoint, updates the
   * CSRF Token Store, and retries the original request once with the
   * fresh token.
   */
  private async handleCsrf403(
    endpoint: string,
    method: string,
    restOptions: Record<string, unknown>,
    requestHeaders: Record<string, string>,
    signal: AbortSignal,
  ): Promise<Response> {
    // Re-fetch CSRF token from session endpoint
    const sessionResponse = await fetch(`${API_BASE}/api/auth?action=session`, {
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
    const supportedResources = new Set(['admin', 'applications', 'auth', 'bootstrap', 'catalog', 'documents', 'email', 'health', 'notifications', 'payments', 'sessions']);

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
      return bodyText as TResponse;
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
   * 
   * Non-JSON responses (file downloads, CSV exports, SSE streams) are returned
   * as-is since they won't have the envelope structure. When a Content-Type is
   * provided and it is not application/json, the response is returned without
   * attempting envelope unwrapping.
   * 
   * Requirements: 8.3, 8.4
   */
  private unwrapApiResponse<TResponse>(response: TResponse | null, contentType?: string): TResponse | null {
    if (response === null || response === undefined) return null;

    // If Content-Type is known and not JSON, skip envelope unwrapping entirely
    if (contentType && !contentType.includes('application/json')) {
      return response;
    }

    // Non-JSON responses (strings, buffers) pass through without unwrapping
    if (typeof response !== 'object' || Array.isArray(response)) {
      return response;
    }
    const obj = response as Record<string, unknown>;
    if ('success' in obj && 'data' in obj && obj.success === true) {
      return (obj.data ?? null) as TResponse | null;
    }
    // Error envelope or non-envelope object — return as-is
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

  /**
   * Maps an API endpoint + HTTP method to the React Query keys that should be
   * invalidated after a successful mutation. This ensures consistent cache
   * invalidation across all mutation paths.
   *
   * Usage: after a mutation succeeds, call
   *   `queryClient.invalidateQueries({ queryKey })` for each key returned.
   *
   * Rules:
   * - Application submit → invalidate ['student-dashboard-polling'], ['applications']
   * - Admin status change → invalidate ['applications', appId], ['admin-applications'],
   *   ['admin-dashboard-polling'], ['application-stats']
   * - Login/logout → queryClient.clear() (handled separately in auth flow)
   * - Token refresh → does NOT invalidate data caches
   *
   * @param endpoint  The API endpoint path (e.g. '/api/applications?id=xxx')
   * @param method    The HTTP method (e.g. 'POST', 'PUT')
   * @returns Array of React Query key arrays to invalidate
   *
   * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5
   */
  getQueryInvalidationPatterns(
    endpoint: string,
    method: string
  ): string[][] {
    const upper = method.toUpperCase();
    const url = new URL(endpoint, 'http://localhost');
    const pathname = url.pathname.replace(/^\/api\//, '');
    const action = url.searchParams.get('action') ?? '';
    const id = url.searchParams.get('id') ?? '';

    // Token refresh — never invalidate data caches (Req 15.5)
    if (pathname === 'auth' && action === 'refresh') {
      return [];
    }

    // Login/logout — handled by queryClient.clear() in auth flow (Req 15.4)
    if (pathname === 'auth' && (action === 'login' || action === 'logout' || action === 'register')) {
      return [];
    }

    // Application mutations (student-side)
    if (pathname === 'applications' && ['POST', 'PUT', 'PATCH'].includes(upper)) {
      const keys: string[][] = [
        ['applications'],
        ['student-dashboard-polling'],
        ['application-stats'],
      ];
      if (id) {
        keys.push(['applications', id]);
      }
      return keys;
    }

    // Admin actions
    if (pathname === 'admin' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(upper)) {
      const keys: string[][] = [
        ['admin-applications'],
        ['admin-dashboard-polling'],
        ['application-stats'],
      ];
      // If the admin action targets a specific application, also invalidate it
      if (id) {
        keys.push(['applications', id]);
      }
      // Status changes also affect the general applications list
      if (action === 'update-status' || action === 'review') {
        keys.push(['applications']);
        keys.push(['application-history']);
      }
      return keys;
    }

    // Document uploads
    if (pathname === 'documents' && ['POST', 'PUT'].includes(upper)) {
      return [['applications'], ['documents']];
    }

    // Payment mutations
    if (pathname === 'payments' && ['POST', 'PUT'].includes(upper)) {
      return [['applications'], ['payment-status']];
    }

    // Notification mutations
    if (pathname === 'notifications' && ['POST', 'PUT'].includes(upper)) {
      return [['notification_preferences']];
    }

    // Default: no automatic React Query invalidation
    return [];
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

    const timeoutMs = options.timeout ?? getTimeoutForEndpoint(normalizedEndpoint);
    const maxRetries = options.retries ?? MAX_RETRIES;

    // Outer retry loop for network/5xx errors
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Wait before retry (skip delay on first attempt)
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1];
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      try {
        const result = await this.executeRequest<TResponse>(
          normalizedEndpoint,
          method,
          service,
          start,
          timeoutMs,
          options
        );
        return result;
      } catch (error) {
        lastError = error;

        // Don't retry if the user aborted or it's a 4xx error
        if (!isRetryableFailure(error)) {
          throw error;
        }

        // Don't retry if we've exhausted attempts
        if (attempt >= maxRetries) {
          throw error;
        }

        // Log retry attempt (dev only — terser strips console.log in prod)
        logger.warn(
          `[API Client] Retrying ${method} ${normalizedEndpoint} (attempt ${attempt + 1}/${maxRetries})`
        );
      }
    }

    // Should not reach here, but just in case
    throw lastError;
  }

  /**
   * Execute a single request attempt with timeout support.
   * Extracted from `request()` to keep the retry loop clean.
   */
  private async executeRequest<TResponse>(
    normalizedEndpoint: string,
    method: string,
    service: string,
    start: number,
    timeoutMs: number,
    options: ApiRequestOptions
  ): Promise<TResponse | null> {
    const {
      cacheTTL,
      skipCache,
      useCache,
      cacheKey,
      invalidateCache: invalidateTargets,
      headers,
      timeout: _timeout,
      retries: _retries,
      signal: externalSignal,
      ...restOptions
    } = options;

    // Create timeout-aware AbortController, linked to any external signal
    const { controller: timeoutController, clear: clearTimeout_ } =
      createTimeoutController(timeoutMs, externalSignal as AbortSignal | null);

    try {
      const isFormDataRequest =
        typeof FormData !== 'undefined' && restOptions.body instanceof FormData;
      const baseHeaders = isFormDataRequest ? {} : this.getBaseHeaders();
      const requestHeaders = {
        ...baseHeaders,
        ...this.normalizeHeaders(headers),
      };

      // Attach CSRF token for state-changing requests
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = getCsrfToken();
        if (csrfToken) {
          requestHeaders['X-CSRF-Token'] = csrfToken;
        }
      }

      const requestInit: RequestInit = {
        ...restOptions,
        method,
        headers: requestHeaders,
        credentials: 'include', // CRITICAL: Send HTTP-only cookies
        signal: timeoutController.signal,
      };

      if (method === 'GET') {
        const shouldUseCache = (useCache ?? true) && !(skipCache ?? false);
        const url = `${API_BASE}${normalizedEndpoint}`;

        let responseContentType = '';

        // Build fetch options for cached GET requests
        const fetchOptions = {
          method,
          headers: requestHeaders,
          credentials: 'include' as RequestCredentials,
          signal: timeoutController.signal,
          useLocalCache: shouldUseCache,
          ...(cacheTTL !== undefined ? { cacheTTL } : {}),
          ...(cacheKey ? { cacheKey } : {}),
          transformResponse: (response: Response) =>
            this.parseJsonSafely<TResponse>(response, service, normalizedEndpoint),
          onResponse: (response: Response, _duration: number) => {
            responseContentType = response.headers.get('content-type') ?? '';
            // Capture CSRF token from GET responses (e.g. session check after page refresh)
            const csrfHeader = response.headers.get('X-CSRF-Token');
            if (csrfHeader) {
              setCsrfToken(csrfHeader);
            }
          },
        } as RequestInit & FetchWithCacheOptions;

        const data = await fetchWithCache<TResponse | null>(url, fetchOptions);

        // Unwrap { success, data } envelope from API responses
        // Pass content-type so non-JSON responses skip unwrapping (Req 8.4)
        return this.unwrapApiResponse<TResponse>(data, responseContentType);
      }

      const response = await fetch(`${API_BASE}${normalizedEndpoint}`, requestInit);

      // Capture CSRF token from response header (set on login/refresh)
      const responseCsrfToken = response.headers.get('X-CSRF-Token');
      if (responseCsrfToken) {
        setCsrfToken(responseCsrfToken);
      }

      const duration = Date.now() - start;
      void duration; // monitoring removed

      if (!response.ok) {
        let errorMessage = `API Error: ${response.statusText}`;
        let errorCode: string | undefined;
        try {
          const errorData = await response.text();
          if (errorData) {
            const parsed = JSON.parse(errorData);
            errorMessage = parsed.error || parsed.message || errorMessage;
            errorCode = parsed.code;
          }
        } catch {
          // Use default error message
        }

        // 401 intercept-refresh-retry: attempt a single token refresh and retry
        // Exclude auth endpoints that would cause infinite loops
        if (response.status === 401 && !this.isAuthExcludedEndpoint(normalizedEndpoint)) {
          logger.warn('[API Client] 401 Unauthorized - attempting token refresh');
          const refreshed = await this.attemptRefresh();

          if (refreshed) {
            // Refresh succeeded — retry the original request once
            // Re-attach the (possibly rotated) CSRF token
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
              const freshCsrf = getCsrfToken();
              if (freshCsrf) {
                requestHeaders['X-CSRF-Token'] = freshCsrf;
              }
            }

            const retryResponse = await fetch(`${API_BASE}${normalizedEndpoint}`, {
              ...restOptions,
              method,
              headers: requestHeaders,
              credentials: 'include',
              signal: timeoutController.signal,
            });

            // Capture CSRF token from retry response
            const retryCsrf = retryResponse.headers.get('X-CSRF-Token');
            if (retryCsrf) {
              setCsrfToken(retryCsrf);
            }

            if (retryResponse.ok) {
              const retryContentType = retryResponse.headers.get('content-type') ?? '';
              if (retryContentType && !retryContentType.includes('application/json')) {
                const rawBody = await retryResponse.text();
                this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);
                return (rawBody || null) as TResponse | null;
              }
              const retryPayload = await this.parseJsonSafely<TResponse>(retryResponse, service, normalizedEndpoint);
              this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);
              return this.unwrapApiResponse<TResponse>(retryPayload, retryContentType);
            }

            // Second 401 after retry — same as refresh failure
            const authFailure = getOnAuthFailure();
            if (authFailure) authFailure();
            throw new AuthenticationError();
          }

          // Refresh failed — invoke onAuthFailure and throw
          const authFailure = getOnAuthFailure();
          if (authFailure) authFailure();
          throw new AuthenticationError();
        }

        // Handle 401 on excluded auth endpoints (no refresh attempt)
        if (response.status === 401) {
          logger.warn('[API Client] 401 on auth endpoint - no refresh attempt');
        }

        // 403 CSRF intercept-retry: re-fetch CSRF token and retry once
        // Only for state-changing methods with CSRF-related error codes
        if (
          response.status === 403 &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
          (errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING')
        ) {
          logger.warn('[API Client] 403 CSRF error - re-fetching CSRF token');
          const csrfRetryResponse = await this.handleCsrf403(
            normalizedEndpoint,
            method,
            restOptions,
            requestHeaders,
            timeoutController.signal,
          );

          if (csrfRetryResponse.ok) {
            // Capture CSRF token from retry response
            const retryCsrf = csrfRetryResponse.headers.get('X-CSRF-Token');
            if (retryCsrf) {
              setCsrfToken(retryCsrf);
            }

            const retryContentType = csrfRetryResponse.headers.get('content-type') ?? '';
            if (retryContentType && !retryContentType.includes('application/json')) {
              const rawBody = await csrfRetryResponse.text();
              this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);
              return (rawBody || null) as TResponse | null;
            }
            const retryPayload = await this.parseJsonSafely<TResponse>(csrfRetryResponse, service, normalizedEndpoint);
            this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);
            return this.unwrapApiResponse<TResponse>(retryPayload, retryContentType);
          }

          // Second failure — fall through to normal error handling
          let csrfRetryErrorMessage = errorMessage;
          try {
            const retryErrorData = await csrfRetryResponse.text();
            if (retryErrorData) {
              const parsed = JSON.parse(retryErrorData);
              csrfRetryErrorMessage = parsed.error || parsed.message || csrfRetryErrorMessage;
            }
          } catch {
            // Use original error message
          }
          const csrfStatusError = new Error(csrfRetryErrorMessage) as Error & { status: number };
          csrfStatusError.status = csrfRetryResponse.status;
          const csrfEnhancedError = ApiErrorHandler.enhanceError({
            endpoint: normalizedEndpoint,
            method,
            statusCode: csrfRetryResponse.status,
            originalError: csrfStatusError,
          });
          throw csrfEnhancedError;
        }

        // Create error with status for retry logic
        const statusError = new Error(errorMessage) as Error & { status: number };
        statusError.status = response.status;

        // For 5xx errors, throw the raw status error so retry logic can inspect it
        if (response.status >= 500) {
          throw statusError;
        }

        // For 4xx errors, enhance and throw (no retry)
        const enhancedError = ApiErrorHandler.enhanceError({
          endpoint: normalizedEndpoint,
          method,
          statusCode: response.status,
          originalError: statusError,
        });
        throw enhancedError;
      }

      // For non-JSON responses (file downloads, CSV), return raw response
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType && !contentType.includes('application/json')) {
        // Non-JSON response — return raw body without envelope unwrapping
        const rawBody = await response.text();
        this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);
        return (rawBody || null) as TResponse | null;
      }

      const payload = await this.parseJsonSafely<TResponse>(response, service, normalizedEndpoint);

      this.invalidateRelatedCaches(normalizedEndpoint, invalidateTargets);

      // Unwrap { success, data } envelope from API responses
      // Pass content-type so non-JSON responses skip unwrapping (Req 8.4)
      return this.unwrapApiResponse<TResponse>(payload, contentType);
    } catch (error) {
      // Convert timeout AbortError to a named TimeoutError for retry logic
      if (
        error instanceof DOMException &&
        error.name === 'AbortError' &&
        timeoutController.signal.aborted
      ) {
        // Check if it was our timeout (not an external abort)
        if (!externalSignal || !(externalSignal as AbortSignal).aborted) {
          const timeoutError = new Error(TIMEOUT_ERROR_MESSAGE);
          timeoutError.name = 'TimeoutError';
          throw timeoutError;
        }
      }

      // Check if this is an abort error (request cancelled by user/navigation)
      const isAbortError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.message?.includes('aborted') ||
          error.message?.includes('cancelled'));

      // For abort errors, just rethrow without enhancement
      if (isAbortError) {
        throw error;
      }

      // For retryable errors (network/5xx), rethrow as-is so the retry loop handles them
      if (isRetryableFailure(error)) {
        throw error;
      }

      // Re-throw AuthenticationError as-is (already handled by 401 intercept logic)
      if (error instanceof AuthenticationError) {
        throw error;
      }

      // Enhance error if not already enhanced
      if (!(error instanceof Error) || !error.message.includes('Please')) {
        const errorWithStatus = error as { status?: number };
        const errorStatusCode =
          typeof errorWithStatus?.status === 'number' ? errorWithStatus.status : undefined;
        const enhancedError = ApiErrorHandler.enhanceError({
          endpoint: normalizedEndpoint,
          method,
          statusCode: errorStatusCode,
          originalError: error,
        });
        throw enhancedError;
      }

      throw error;
    } finally {
      clearTimeout_();
    }
  }
}

export const apiClient = new ApiClient();

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

export interface ApiRequestOptions extends Omit<RequestInit, 'cache'> {
  cacheTTL?: number;
  skipCache?: boolean;
  useCache?: boolean;
  cacheKey?: string;
  invalidateCache?: string | string[] | false;
  /** Request timeout in milliseconds. Defaults to 30s (10s for health/session). */
  timeout?: number;
  /** Max retry attempts for network/5xx errors. Defaults to 2. Set 0 to disable. */
  retries?: number;
}
