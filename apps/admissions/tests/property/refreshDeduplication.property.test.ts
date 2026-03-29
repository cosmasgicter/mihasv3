/**
 * Property-based test for ApiClient refresh deduplication
 * Feature: single-source-of-truth-consolidation
 *
 * Property 7: Refresh deduplication — N concurrent 401s produce exactly 1 refresh call
 *
 * **Validates: Requirements 3.8, 10.5**
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

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn((opts: any) => opts.originalError ?? new Error('API Error')),
  },
}));

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Random count of concurrent requests (2–20) */
const concurrentCountArb = fc.integer({ min: 2, max: 20 });

// ── Helpers ─────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';
const REFRESH_URL = `${BASE}/api/v1/auth/refresh/`;

function makeJsonResponse(status: number, body: any, csrfToken?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : 'Unauthorized',
    headers,
  });
}

/**
 * Build a fetch mock that:
 * 1. Returns 401 for the first N calls to non-refresh endpoints (original requests)
 * 2. Returns 200 for the refresh call (POST /api/v1/auth/refresh/)
 * 3. Returns 200 for subsequent retry calls
 *
 * Tracks how many times the refresh endpoint was called.
 */
function setupConcurrentFetchMock() {
  let refreshCallCount = 0;
  // Track which non-refresh URLs have already been retried (after refresh)
  const retriedUrls = new Set<number>();
  let callIndex = 0;

  const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const currentIndex = callIndex++;

    // Refresh endpoint — always succeed
    if (urlStr === REFRESH_URL) {
      refreshCallCount++;
      // Small delay to simulate network latency so concurrent requests queue up
      await new Promise(r => setTimeout(r, 5));
      return makeJsonResponse(200, { success: true, data: { refreshed: true } }, 'new-csrf-token');
    }

    // Non-refresh endpoint: first call returns 401, retry returns 200
    // We use the callIndex to distinguish: if this URL pattern has been seen
    // after a refresh happened, it's a retry
    if (refreshCallCount > 0 || retriedUrls.has(currentIndex)) {
      // This is a retry after refresh — return success
      return makeJsonResponse(200, { success: true, data: { ok: true } });
    }

    // First call — return 401 to trigger refresh
    return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
  });

  vi.stubGlobal('fetch', mockFetch);

  return {
    mockFetch,
    getRefreshCallCount: () => refreshCallCount,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ApiClient Refresh Deduplication Property Tests', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Feature: single-source-of-truth-consolidation, Property 7: Refresh deduplication
  // **Validates: Requirements 3.8, 10.5**
  describe('Property 7: Refresh deduplication — N concurrent 401s produce exactly 1 refresh call', () => {
    it('fires exactly 1 refresh call for N concurrent 401 responses', async () => {
      await fc.assert(
        fc.asyncProperty(concurrentCountArb, async (n) => {
          // Reset state
          clearCsrfToken();

          const { mockFetch, getRefreshCallCount } = setupConcurrentFetchMock();

          const { apiClient } = await import('@/services/client');

          // Fire N concurrent POST requests that will all get 401
          // Use unique endpoints so they don't interfere with each other
          const promises = Array.from({ length: n }, (_, i) =>
            apiClient.request(`/api/applications?req=${i}`, {
              method: 'POST',
              retries: 0, // Disable outer retry loop to isolate 401 handling
            })
          );

          // All N requests should eventually resolve (after refresh + retry)
          const results = await Promise.allSettled(promises);

          // Verify exactly 1 refresh call was made
          const refreshCalls = mockFetch.mock.calls.filter(
            (call: any[]) => {
              const callUrl = typeof call[0] === 'string' ? call[0] : '';
              return callUrl === REFRESH_URL;
            }
          );
          expect(refreshCalls.length).toBe(1);
          expect(getRefreshCallCount()).toBe(1);

          // All N requests should have resolved successfully
          const fulfilled = results.filter(r => r.status === 'fulfilled');
          expect(fulfilled.length).toBe(n);
        }),
        { numRuns: 10 },
      );
    });
  });
});
