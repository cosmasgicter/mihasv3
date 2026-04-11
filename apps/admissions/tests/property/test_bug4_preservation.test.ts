/**
 * Preservation property tests — Session auth unchanged for valid tokens.
 *
 * Property 2: Preservation — Valid Token Auth and Genuine 403 Unchanged
 *
 * These tests capture EXISTING correct behavior that must not regress:
 * - For any 403 response with a CSRF error code, ApiClient does NOT trigger refresh
 * - For any 403 response on a non-GET (state-changing) request with CSRF error,
 *   ApiClient handles via CSRF retry logic, NOT token refresh
 * - Successful token refresh retries the original request exactly once
 *
 * These tests MUST PASS on UNFIXED code.
 *
 * **Validates: Requirements 3.8, 3.9, 3.10**
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { clearCsrfToken } from '@/lib/csrfToken';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@/utils/api-cache', () => ({
  fetchWithCache: vi.fn(async (url: string, options: any) => {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      credentials: options.credentials,
      signal: options.signal,
    });
    if (options.onResponse) {
      options.onResponse(response.clone(), 0);
    }
    if (options.transformResponse) {
      return options.transformResponse(response);
    }
    return response.json();
  }),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn((opts: any) => opts.originalError ?? new Error('API Error')),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────

let capturedRequests: Array<{
  url: string;
  method: string;
}> = [];

// CSRF error codes that indicate a CSRF failure (NOT an auth failure)
const csrfErrorCodes = [
  'CSRF_INVALID',
  'CSRF_MISSING',
  'CSRF_VALIDATION_FAILED',
];

// State-changing methods that attach CSRF tokens
const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

// ── Property 2a: CSRF 403 does NOT trigger token refresh ────────────────

describe('Property 2a: Preservation — CSRF 403 does NOT trigger token refresh', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * For any 403 response with a CSRF error code on a state-changing request,
   * the ApiClient handles it via CSRF retry logic (re-fetch CSRF token),
   * NOT via token refresh.
   *
   * This is existing correct behavior that must be preserved.
   *
   * **Validates: Requirements 3.9**
   */
  it('does NOT attempt token refresh for CSRF 403 errors on state-changing requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...stateChangingMethods),
        fc.constantFrom(...csrfErrorCodes),
        fc.constantFrom('/applications/', '/documents/', '/notifications/'),
        async (method, csrfCode, endpoint) => {
          capturedRequests = [];
          clearCsrfToken();

          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            capturedRequests.push({
              url: urlStr,
              method: init?.method ?? 'GET',
            });

            callCount++;

            // First request: 403 with CSRF error code
            if (callCount === 1) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'CSRF validation failed',
                  code: csrfCode,
                }),
                {
                  status: 403,
                  statusText: 'Forbidden',
                  headers: { 'content-type': 'application/json' },
                },
              );
            }

            // CSRF retry: session endpoint to re-fetch CSRF token
            if (urlStr.includes('/auth/session/')) {
              return new Response(
                JSON.stringify({ success: true, data: {} }),
                {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'X-CSRF-Token': 'fresh-csrf-token',
                  },
                },
              );
            }

            // CSRF retry: re-send original request with fresh CSRF token
            return new Response(
              JSON.stringify({ success: true, data: { updated: true } }),
              {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
              },
            );
          });

          vi.stubGlobal('fetch', mockFetch);

          const { apiClient } = await import('@/services/client');

          try {
            await apiClient.request(endpoint, {
              method,
              body: JSON.stringify({ test: true }),
              retries: 0,
            });
          } catch {
            // May throw — that's fine for this test
          }

          // PRESERVATION: No refresh endpoint should have been called
          const refreshCall = capturedRequests.find(r =>
            r.url.includes('/auth/refresh/')
          );

          expect(refreshCall).toBeUndefined();
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ── Property 2b: 401 refresh retries original request exactly once ──────

describe('Property 2b: Preservation — Successful 401 refresh retries exactly once', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * When a non-auth-excluded endpoint returns 401, the ApiClient:
   * 1. Attempts a token refresh (POST /auth/refresh/)
   * 2. On success, retries the original request exactly once
   *
   * This is existing correct behavior that must be preserved.
   *
   * **Validates: Requirements 3.10**
   */
  it('retries original request exactly once after successful 401 refresh', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...stateChangingMethods),
        fc.constantFrom('/applications/', '/documents/', '/notifications/'),
        async (method, endpoint) => {
          capturedRequests = [];
          clearCsrfToken();

          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            capturedRequests.push({
              url: urlStr,
              method: init?.method ?? 'GET',
            });

            callCount++;

            // First request: 401 Unauthorized
            if (callCount === 1) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Authentication required',
                }),
                {
                  status: 401,
                  statusText: 'Unauthorized',
                  headers: { 'content-type': 'application/json' },
                },
              );
            }

            // Second request: refresh endpoint — succeed
            if (urlStr.includes('/auth/refresh/')) {
              return new Response(
                JSON.stringify({ success: true, data: {} }),
                {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'X-CSRF-Token': 'refreshed-csrf-token',
                  },
                },
              );
            }

            // Third request: retry of original — succeed
            return new Response(
              JSON.stringify({ success: true, data: { result: 'ok' } }),
              {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
              },
            );
          });

          vi.stubGlobal('fetch', mockFetch);

          const { apiClient } = await import('@/services/client');

          const result = await apiClient.request(endpoint, {
            method,
            body: JSON.stringify({ test: true }),
            retries: 0,
          });

          // Verify refresh was attempted
          const refreshCalls = capturedRequests.filter(r =>
            r.url.includes('/auth/refresh/')
          );
          expect(refreshCalls).toHaveLength(1);

          // Verify original endpoint was called exactly twice (initial + retry)
          const endpointCalls = capturedRequests.filter(r =>
            r.url.includes(endpoint) && !r.url.includes('/auth/')
          );
          expect(endpointCalls).toHaveLength(2);

          // Verify the result came through
          expect(result).toEqual({ result: 'ok' });
        },
      ),
      { numRuns: 20 },
    );
  });
});
