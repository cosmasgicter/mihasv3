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

// Non-CSRF error codes that indicate auth failure, not CSRF failure
const nonCsrfErrorCodes = [
  undefined,
  'FORBIDDEN',
  'NOT_AUTHENTICATED',
  'PERMISSION_DENIED',
];

// ── Property 1: 403 on GET to auth-related endpoint triggers refresh ────

describe('Property 1: Bug Condition — 403 on GET triggers refresh for auth-related endpoints', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * When a GET request to a session/auth endpoint returns 403 without a CSRF
   * error code, the ApiClient should attempt a token refresh — same as 401.
   *
   * Bug condition from design:
   *   isBugCondition_Bug4(input) where responseStatus == 403
   *   AND NOT refreshFlowTriggered
   *
   * On UNFIXED code: the 403 falls through to normal error handling without
   * attempting refresh. The test expects a refresh attempt, so it will FAIL.
   *
   * **Validates: Requirements 1.7, 1.8, 1.9**
   */
  it('attempts token refresh when GET request returns 403 without CSRF error code', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...authRelatedGetEndpoints),
        fc.constantFrom(...nonCsrfErrorCodes),
        async (endpoint, errorCode) => {
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

            // First request: 403 (expired JWT → AnonymousUser → DRF returns 403)
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

            // Third request: retry of original GET — succeed
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
            await apiClient.request(endpoint, { method: 'GET', retries: 0 });
          } catch {
            // May throw on unfixed code — that's expected
          }

          // EXPECTED behavior (will FAIL on unfixed code):
          // The ApiClient should have attempted a refresh after the 403
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
