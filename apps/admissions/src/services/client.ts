/**
 * API Client - Cookie-based authentication
 * 
 * All API requests use HTTP-only cookies (credentials: 'include')
 * NO Bearer token headers - cookies are managed by the browser
 * 
 * @module client
 */

import { getApiBaseUrl } from '@/lib/apiConfig';
import { ApiErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger';
import { getCsrfToken, setCsrfToken } from '@/lib/csrfToken';
import { TIMEOUT_ERROR_MESSAGE } from '@/lib/errorMessages';
import { shouldDispatchAuthFailure, isPermissionDenial, dispatchAuthRecovered } from '@/lib/sessionHardening';

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
const API_V1_PREFIX = '/api/v1';

/** Default request timeout in milliseconds (30s) */
const DEFAULT_TIMEOUT = 30_000;
/** Shorter timeout for health check and session validation requests (10s) */
const SHORT_TIMEOUT = 10_000;
/** Maximum retry attempts for network/5xx errors */
const MAX_RETRIES = 3;
/** Backoff delays in ms for each retry attempt (2s, 5s, 10s) */
const RETRY_DELAYS = [2_000, 5_000, 10_000];

/** Endpoints that use the shorter timeout */
const SHORT_TIMEOUT_PATTERNS = ['/api/v1/health/', '/api/v1/auth/session/'];

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

/**
 * Normalize an endpoint path to include the `/api/v1` prefix.
 * - Absolute URLs (http:// or https://) pass through unchanged.
 * - Paths already starting with `/api/v1/` are returned as-is (idempotent).
 * - All other paths get `/api/v1` prepended.
 * - Consecutive slashes are deduplicated.
 */
export function toApiV1Path(path: string): string {
  // Absolute URLs pass through unchanged
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Already prefixed — return as-is (idempotent)
  if (path.startsWith('/api/v1/') || path.startsWith('/api/v1?')) {
    return path.replace(/\/{2,}/g, '/');
  }

  const trimmedPath = path.replace(/^\/+/, '');
  return `${API_V1_PREFIX}/${trimmedPath}`.replace(/\/{2,}/g, '/');
}

/**
 * Extract the primary resource name from a normalized `/api/v1/...` endpoint.
 * Used for logging/metrics only.
 */
function getServiceName(endpoint: string): string {
  const stripped = endpoint.replace(/^\/api\/v1\//, '').replace(/^\//, '');
  return stripped.split('/')[0] || 'unknown';
}

class ApiClient {
  /**
   * Promise-lock for token refresh deduplication.
   * When the first 401 triggers a refresh, subsequent 401s await the same promise
   * instead of initiating parallel refresh requests.
   */
  private refreshPromise: Promise<boolean> | null = null;
  private lastRefreshSuccessTime: number = 0;
  private lastRefreshFailureTime: number = 0;
  private lastRefreshResult: boolean = false;
  private static readonly REFRESH_COOLDOWN_MS = 5000;
  private static readonly REFRESH_FAILURE_COOLDOWN_MS = 2000;

  /**
   * Perform the actual token refresh call to the server.
   * Sends a POST to /api/v1/auth/refresh/ with credentials and CSRF token.
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
   *
   * This is the same promise-lock pattern from authController.ts deduplicatedRefresh,
   * ported into ApiClient as the single refresh mechanism.
   */
  private async attemptRefresh(): Promise<boolean> {
    const now = Date.now();
    // Cooldown: if a refresh succeeded recently, return cached success
    if (this.lastRefreshResult && (now - this.lastRefreshSuccessTime) < ApiClient.REFRESH_COOLDOWN_MS) {
      return true;
    }
    // Failure cooldown: if a refresh failed recently, return false immediately
    if (!this.lastRefreshResult && this.lastRefreshFailureTime > 0
        && (now - this.lastRefreshFailureTime) < ApiClient.REFRESH_FAILURE_COOLDOWN_MS) {
      return false;
    }

    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh();
    try {
      const result = await this.refreshPromise;
      if (result) {
        this.lastRefreshSuccessTime = Date.now();
        this.lastRefreshResult = true;
        dispatchAuthRecovered();
      } else {
        this.lastRefreshFailureTime = Date.now();
        this.lastRefreshResult = false;
      }
      return result;
    } catch {
      this.lastRefreshFailureTime = Date.now();
      this.lastRefreshResult = false;
      return false;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Public refresh entrypoint for auth bootstrap code. It uses the same
   * promise-lock as the 401 interceptor so explicit session recovery cannot
   * race with data-request recovery and invalidate a rotating refresh token.
   */
  async refreshAuthSession(): Promise<boolean> {
    return this.attemptRefresh();
  }

  /**
   * Check if an endpoint should be excluded from 401 intercept-refresh-retry.
   * Auth endpoints like refresh, login, and register are excluded to prevent
   * infinite loops (e.g., a failed refresh triggering another refresh).
   */
  private isAuthExcludedEndpoint(endpoint: string): boolean {
    const excludedPatterns = [
      '/api/v1/auth/refresh/',
      '/api/v1/auth/login/',
      '/api/v1/auth/register/',
    ];
    return excludedPatterns.some(pattern => endpoint.includes(pattern));
  }

  private isSessionEndpoint(endpoint: string): boolean {
    return endpoint.includes('/api/v1/auth/session/');
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
   * All API endpoints return { success: true, data: T } via the response envelope.
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
   * @param endpoint  The API endpoint path (e.g. '/api/v1/applications/123/review/')
   * @param method    The HTTP method (e.g. 'POST', 'PUT')
   * @returns Array of React Query key arrays to invalidate
   *
   * Requirements: 1.10, 1.11
   */
  getQueryInvalidationPatterns(
    endpoint: string,
    method: string
  ): string[][] {
    const upper = method.toUpperCase();
    const url = new URL(endpoint, 'http://localhost');

    // Parse REST-style path segments: strip /api/v1/ prefix, split by /
    // e.g. /api/v1/applications/123/review/ -> ['applications', '123', 'review']
    const segments = url.pathname
      .replace(/^\/api(?:\/v1)?\//, '')
      .split('/')
      .filter(Boolean);

    const resource = segments[0] ?? '';
    const id = segments[1] ?? '';

    // Auth endpoints (login/logout/register/refresh) -> no cache invalidation
    // Login/logout handled by queryClient.clear() in auth flow
    // Token refresh must never invalidate data caches
    if (resource === 'auth') {
      return [];
    }

    // Application mutations (student-side)
    if (resource === 'applications' && ['POST', 'PUT', 'PATCH'].includes(upper)) {
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
    if (resource === 'admin' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(upper)) {
      const keys: string[][] = [
        ['admin-applications'],
        ['admin-dashboard-polling'],
        ['application-stats'],
      ];
      return keys;
    }

    // Document mutations
    if (resource === 'documents' && ['POST', 'PUT'].includes(upper)) {
      return [['applications'], ['documents']];
    }

    // Payment mutations
    if (resource === 'payments' && ['POST', 'PUT'].includes(upper)) {
      return [['applications'], ['payment-status']];
    }

    // Notification mutations
    if (resource === 'notifications' && ['POST', 'PUT'].includes(upper)) {
      return [['notification_preferences']];
    }

    // Default: no automatic React Query invalidation
    return [];
  }
  async request<TResponse = unknown>(
    endpoint: string,
    options: ApiRequestOptions = {}
  ): Promise<TResponse | null> {
    const start = Date.now();
    const method = (options.method ?? 'GET').toString().toUpperCase();
    const apiEndpoint = toApiV1Path(endpoint);
    const service = getServiceName(apiEndpoint);

    const timeoutMs = options.timeout ?? getTimeoutForEndpoint(apiEndpoint);
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
          apiEndpoint,
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
          `[API Client] Retrying ${method} ${apiEndpoint} (attempt ${attempt + 1}/${maxRetries})`
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
      headers,
      timeout: _timeout,
      retries: _retries,
      signal: externalSignal,
      ...restOptions
    } = options;

    // Create timeout-aware AbortController, linked to any external signal
    const { controller: timeoutController, clear: clearTimeout_ } =
      createTimeoutController(timeoutMs, externalSignal as AbortSignal | null);

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

    try {
      const requestInit: RequestInit = {
        ...restOptions,
        method,
        headers: requestHeaders,
        credentials: 'include', // CRITICAL: Send HTTP-only cookies
        signal: timeoutController.signal,
      };

      if (method === 'GET') {
        const url = `${API_BASE}${normalizedEndpoint}`;

        let responseContentType = '';

        const fetchResponse = await fetch(url, {
          method: 'GET',
          headers: requestHeaders,
          credentials: 'include' as RequestCredentials,
          signal: timeoutController.signal,
        });

        // Capture CSRF token and content-type
        responseContentType = fetchResponse.headers.get('content-type') ?? '';
        const csrfHeader = fetchResponse.headers.get('X-CSRF-Token');
        if (csrfHeader) {
          setCsrfToken(csrfHeader);
        }

        if (!fetchResponse.ok) {
          const error = Object.assign(
            new Error(`API Error: ${fetchResponse.statusText}`),
            { status: fetchResponse.status }
          );
          throw error;
        }

        const data = await this.parseJsonSafely<TResponse>(fetchResponse, service, normalizedEndpoint);

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
        let fieldErrors: Record<string, string> | undefined;
        try {
          const errorData = await response.text();
          if (errorData) {
            const parsed = JSON.parse(errorData);
            errorMessage = parsed.error || parsed.message || errorMessage;
            errorCode = parsed.code;
            if (parsed.fieldErrors && typeof parsed.fieldErrors === 'object') {
              fieldErrors = parsed.fieldErrors as Record<string, string>;
            } else if (parsed.details && typeof parsed.details === 'object') {
              // Django REST Framework returns validation errors in `details`
              // e.g. { details: { program: ["Invalid program reference."] } }
              const mapped: Record<string, string> = {};
              for (const [field, messages] of Object.entries(parsed.details)) {
                mapped[field] = Array.isArray(messages) ? messages.join(', ') : String(messages);
              }
              if (Object.keys(mapped).length > 0) {
                fieldErrors = mapped;
              }
            }
          }
        } catch {
          // Use default error message
        }

        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          const formattedFieldErrors = Object.entries(fieldErrors)
            .map(([field, message]) => {
              const fieldLabel = field === '_root'
                ? 'General'
                : field.replace(/\./g, ' ').replace(/_/g, ' ').trim();
              return `${fieldLabel}: ${message}`;
            })
            .join('; ');

          errorMessage = formattedFieldErrors || errorMessage;
        }

        // 401 intercept-refresh-retry: attempt a single token refresh and retry
        // Exclude auth endpoints that would cause infinite loops
        if (response.status === 401 && !this.isAuthExcludedEndpoint(normalizedEndpoint)) {
          console.debug('[API Client] 401 Unauthorized - attempting token refresh');
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
                return (rawBody || null) as TResponse | null;
              }
              const retryPayload = await this.parseJsonSafely<TResponse>(retryResponse, service, normalizedEndpoint);
              return this.unwrapApiResponse<TResponse>(retryPayload, retryContentType);
            }

            // Only treat a second 401 as an auth failure. Other status codes
            // (e.g. 400 validation errors) should be handled normally — they
            // are not authentication failures and must not trigger logout.
            if (retryResponse.status === 401) {
              const authFailure = getOnAuthFailure();
              if (authFailure && shouldDispatchAuthFailure()) authFailure();
              throw new AuthenticationError();
            }

            // Non-401 error after successful refresh — parse and throw as a
            // normal API error so the caller can handle it (e.g. show validation
            // messages for 400 responses).
            let retryErrorMessage = `API Error: ${retryResponse.statusText}`;
            let retryFieldErrors: Record<string, string> | undefined;
            try {
              const retryErrorData = await retryResponse.text();
              if (retryErrorData) {
                const parsed = JSON.parse(retryErrorData);
                retryErrorMessage = parsed.error || parsed.message || retryErrorMessage;
                if (parsed.details && typeof parsed.details === 'object') {
                  const mapped: Record<string, string> = {};
                  for (const [field, messages] of Object.entries(parsed.details)) {
                    mapped[field] = Array.isArray(messages) ? messages.join(', ') : String(messages);
                  }
                  if (Object.keys(mapped).length > 0) {
                    retryFieldErrors = mapped;
                  }
                }
              }
            } catch { /* use default */ }

            if (retryFieldErrors && Object.keys(retryFieldErrors).length > 0) {
              const formatted = Object.entries(retryFieldErrors)
                .map(([f, m]) => `${f.replace(/_/g, ' ').trim()}: ${m}`)
                .join('; ');
              retryErrorMessage = formatted || retryErrorMessage;
            }

            const retryStatusError = new Error(retryErrorMessage) as Error & { status: number; fieldErrors?: Record<string, string> };
            retryStatusError.status = retryResponse.status;
            if (retryFieldErrors) retryStatusError.fieldErrors = retryFieldErrors;
            const retryEnhanced = ApiErrorHandler.enhanceError({
              endpoint: normalizedEndpoint,
              method,
              statusCode: retryResponse.status,
              originalError: retryStatusError,
            });
            throw retryEnhanced;
          }

          // Refresh failed — invoke onAuthFailure and throw
          const authFailure = getOnAuthFailure();
          if (authFailure && shouldDispatchAuthFailure()) authFailure();
          throw new AuthenticationError();
        }

        // Handle 401 on excluded auth endpoints (no refresh attempt)
        if (response.status === 401) {
          console.debug('[API Client] 401 on auth endpoint - no refresh attempt');
        }

        // 403 CSRF intercept-retry: re-fetch CSRF token and retry once
        // Only for state-changing methods with CSRF-related error codes
        if (
          response.status === 403 &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) &&
          (errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING' || errorCode === 'CSRF_VALIDATION_FAILED')
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
              return (rawBody || null) as TResponse | null;
            }
            const retryPayload = await this.parseJsonSafely<TResponse>(csrfRetryResponse, service, normalizedEndpoint);
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

        // 403 auth-failure intercept (defense-in-depth for expired JWT → 403):
        // Only explicit token-expiry 403s are authentication failures. Generic
        // 403 permission denials must not clear the user's session.
        if (
          response.status === 403 &&
          !this.isAuthExcludedEndpoint(normalizedEndpoint) &&
          errorCode === 'TOKEN_EXPIRED'
        ) {
          console.debug('[API Client] 403 auth-related error - attempting token refresh');
          const refreshed = await this.attemptRefresh();

          if (refreshed) {
            // Refresh succeeded — retry the original request once
            const retryResponse = await fetch(`${API_BASE}${normalizedEndpoint}`, {
              ...restOptions,
              method,
              headers: requestHeaders,
              credentials: 'include',
              signal: timeoutController.signal,
            });

            const retryCsrf = retryResponse.headers.get('X-CSRF-Token');
            if (retryCsrf) {
              setCsrfToken(retryCsrf);
            }

            if (retryResponse.ok) {
              const retryContentType = retryResponse.headers.get('content-type') ?? '';
              if (retryContentType && !retryContentType.includes('application/json')) {
                const rawBody = await retryResponse.text();
                return (rawBody || null) as TResponse | null;
              }
              const retryPayload = await this.parseJsonSafely<TResponse>(retryResponse, service, normalizedEndpoint);
              return this.unwrapApiResponse<TResponse>(retryPayload, retryContentType);
            }

            // Only treat a second 401/403 as an auth failure. Other status
            // codes (e.g. 400 validation errors) are not auth failures.
            // A generic 403 INSUFFICIENT_PERMISSIONS after refresh is a
            // permission denial, not an auth failure — do not logout.
            if (retryResponse.status === 401) {
              const authFailure = getOnAuthFailure();
              if (authFailure && shouldDispatchAuthFailure()) authFailure();
              throw new AuthenticationError();
            }
            if (retryResponse.status === 403) {
              // Parse the error code to distinguish auth vs permission
              let retryCode: string | undefined;
              try {
                const retryBody = await retryResponse.clone().text();
                if (retryBody) { retryCode = JSON.parse(retryBody)?.code; }
              } catch { /* ignore */ }
              if (isPermissionDenial(403, retryCode)) {
                // Permission denial — throw as normal error, NOT auth failure
                const permErr = new Error('Permission denied for this action') as Error & { status: number; code?: string };
                permErr.status = 403;
                permErr.code = retryCode;
                throw ApiErrorHandler.enhanceError({ endpoint: normalizedEndpoint, method, statusCode: 403, originalError: permErr });
              }
              const authFailure = getOnAuthFailure();
              if (authFailure && shouldDispatchAuthFailure()) authFailure();
              throw new AuthenticationError();
            }

            // Non-auth error after successful refresh — handle normally
            let retryErrMsg = `API Error: ${retryResponse.statusText}`;
            try {
              const retryErrData = await retryResponse.text();
              if (retryErrData) {
                const parsed = JSON.parse(retryErrData);
                retryErrMsg = parsed.error || parsed.message || retryErrMsg;
              }
            } catch { /* use default */ }
            const retryErr = new Error(retryErrMsg) as Error & { status: number };
            retryErr.status = retryResponse.status;
            throw ApiErrorHandler.enhanceError({
              endpoint: normalizedEndpoint,
              method,
              statusCode: retryResponse.status,
              originalError: retryErr,
            });
          }

          // Refresh failed — invoke onAuthFailure and throw
          const authFailure = getOnAuthFailure();
          if (authFailure && shouldDispatchAuthFailure()) authFailure();
          throw new AuthenticationError();
        }

        // Create error with status for retry logic
        const statusError = new Error(errorMessage) as Error & { status: number };
        statusError.status = response.status;
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          ;(statusError as Error & { fieldErrors?: Record<string, string> }).fieldErrors = fieldErrors
        }

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
        return (rawBody || null) as TResponse | null;
      }

      const payload = await this.parseJsonSafely<TResponse>(response, service, normalizedEndpoint);

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

      // Defense-in-depth: handle auth failures from GET requests.
      // fetch throws errors with status property for non-ok responses.
      // If a GET request got a 401, attempt refresh. Generic 403s are
      // authorization failures and must not log the user out.
      const errorStatus = (error as { status?: number })?.status;
      if (
        errorStatus === 401 &&
        method === 'GET' &&
        !this.isAuthExcludedEndpoint(normalizedEndpoint)
      ) {
        console.debug('[API Client] auth error on GET (via cache layer) - attempting token refresh');
        const refreshed = await this.attemptRefresh();

        if (refreshed) {
          // Refresh succeeded — retry the GET request directly (bypass cache)
          const retryResponse = await fetch(`${API_BASE}${normalizedEndpoint}`, {
            method: 'GET',
            headers: requestHeaders,
            credentials: 'include',
            signal: timeoutController.signal,
          });

          const retryCsrf = retryResponse.headers.get('X-CSRF-Token');
          if (retryCsrf) {
            setCsrfToken(retryCsrf);
          }

          if (retryResponse.ok) {
            const retryContentType = retryResponse.headers.get('content-type') ?? '';
            if (retryContentType && !retryContentType.includes('application/json')) {
              const rawBody = await retryResponse.text();
              return (rawBody || null) as TResponse | null;
            }
            const retryPayload = await this.parseJsonSafely<TResponse>(retryResponse, service, normalizedEndpoint);
            return this.unwrapApiResponse<TResponse>(retryPayload, retryContentType);
          }

          // Only treat a second 401/403 as an auth failure
          if (retryResponse.status === 401 || retryResponse.status === 403) {
            if (retryResponse.status === 403) {
              let retryCode: string | undefined;
              try {
                const retryBody = await retryResponse.clone().text();
                if (retryBody) { retryCode = JSON.parse(retryBody)?.code; }
              } catch { /* ignore */ }
              if (isPermissionDenial(403, retryCode)) {
                const permErr = new Error('Permission denied for this action') as Error & { status: number };
                permErr.status = 403;
                throw ApiErrorHandler.enhanceError({ endpoint: normalizedEndpoint, method, statusCode: 403, originalError: permErr });
              }
            }
            if (this.isSessionEndpoint(normalizedEndpoint)) {
              throw new AuthenticationError();
            }
            const authFailure = getOnAuthFailure();
            if (authFailure && shouldDispatchAuthFailure()) authFailure();
            throw new AuthenticationError();
          }

          // Non-auth error after successful refresh — handle normally
          let retryGetErrMsg = `API Error: ${retryResponse.statusText}`;
          try {
            const retryGetErrData = await retryResponse.text();
            if (retryGetErrData) {
              const parsed = JSON.parse(retryGetErrData);
              retryGetErrMsg = parsed.error || parsed.message || retryGetErrMsg;
            }
          } catch { /* use default */ }
          const retryGetErr = new Error(retryGetErrMsg) as Error & { status: number };
          retryGetErr.status = retryResponse.status;
          throw ApiErrorHandler.enhanceError({
            endpoint: normalizedEndpoint,
            method,
            statusCode: retryResponse.status,
            originalError: retryGetErr,
          });
        }

        // Refresh failed — invoke onAuthFailure and throw
        if (this.isSessionEndpoint(normalizedEndpoint)) {
          throw error;
        }
        const authFailure = getOnAuthFailure();
        if (authFailure && shouldDispatchAuthFailure()) authFailure();
        throw new AuthenticationError();
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

/**
 * Sync the in-memory CSRF token from external auth events such as multi-tab
 * broadcasts. Keeping the write inside ApiClient preserves the single writer
 * invariant for the token store.
 */
export function syncApiClientCsrfToken(token: string | null): void {
  setCsrfToken(token);
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

    // Django pagination is 1-based — clamp page to >= 1
    if (key === 'page') {
      const pageNum = Number(value);
      query.set(key, String(Math.max(pageNum || 1, 1)));
      return;
    }

    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export type ApiClientRequest = ApiClient['request'];

export interface ApiRequestOptions extends Omit<RequestInit, 'cache'> {
  /** Request timeout in milliseconds. Defaults to 30s (10s for health/session). */
  timeout?: number;
  /** Max retry attempts for network/5xx errors. Defaults to 3. Set 0 to disable. */
  retries?: number;
}
