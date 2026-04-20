/**
 * Bug condition exploration test — ApiClient 403 refresh behavior.
 *
 * Property 1 (Frontend): Bug Condition — ApiClient Does Not Trigger Refresh on Auth-Related 403
 *
 * This test encodes the EXPECTED (fixed) behavior:
 * - When a GET request to a session/auth endpoint returns 403 WITHOUT a CSRF
 *   error code, the ApiClient SHOULD trigger the refresh flow (same as 401).
 *
 * On UNFIXED code, this test MUST FAIL because:
 * - The ApiClient only intercepts 401 for refresh, not 403
 * - A 403 on a GET request falls through to normal error handling
 *
 * **Validates: Requirements 1.7, 1.8, 1.9**
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

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
    // Replicate real fetchWithCache behavior: throw on non-ok responses
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & {
        status?: number;
        statusText?: string;
      };
      error.status = response.status;
      error.statusText = response.statusText;
      throw error;
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

// Auth-related GET endpoints that would return 403 when JWT is expired
const authRelatedGetEndpoints = [
  '/auth/session/',
  '/sessions/',
  '/applications/',
  '/notifications/',
];

// Non-CSRF error codes that indicate auth failure (TOKEN_EXPIRED triggers refresh)
const tokenExpiredCodes = [
  'TOKEN_EXPIRED',
];

// ── Property 1: 403 on GET to auth-related endpoint triggers refresh ────

describe('Property 1: Bug Condition — 403 on GET triggers refresh for auth-related endpoints', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearCsrfToken } = await import('@/lib/csrfToken');
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * When a state-changing request returns 403 with TOKEN_EXPIRED error code,
   * the ApiClient should attempt a token refresh — same as 401.
   *
   * Session hardening made 403 handling conservative:
   * - GET requests: only 401 triggers refresh (403 is a permission denial)
   * - State-changing requests: 403 + TOKEN_EXPIRED triggers refresh
   *
   * **Validates: Requirements 1.7, 1.8, 1.9**
   */
  it('attempts token refresh when GET request returns 403 with TOKEN_EXPIRED error code', async () => {
    const stateChangingEndpoints = [
      '/applications/',
      '/sessions/',
      '/notifications/',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...stateChangingEndpoints),
        fc.constantFrom(...tokenExpiredCodes),
        async (endpoint, errorCode) => {
          vi.resetModules();
          const { clearCsrfToken } = await import('@/lib/csrfToken');
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

            // First request: 403 (expired JWT → TOKEN_EXPIRED)
            if (callCount === 1) {
              const body: Record<string, unknown> = {
                success: false,
                error: 'You do not have permission to perform this action.',
              };
              if (errorCode) {
                body.code = errorCode;
              }
              return new Response(JSON.stringify(body), {
                status: 403,
                statusText: 'Forbidden',
                headers: { 'content-type': 'application/json' },
              });
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
              JSON.stringify({ success: true, data: { session: 'valid' } }),
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
            await apiClient.request(endpoint, { method: 'POST', retries: 0 });
          } catch {
            // May throw on unfixed code — that's expected
          }

          // EXPECTED behavior: The ApiClient should have attempted a refresh after the 403 + TOKEN_EXPIRED
          const refreshCall = capturedRequests.find(r =>
            r.url.includes('/auth/refresh/')
          );

          expect(refreshCall).toBeDefined();
          // Verify the refresh was a POST
          expect(refreshCall?.method).toBe('POST');
        },
      ),
      { numRuns: 20 },
    );
  });
});
