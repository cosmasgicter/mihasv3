/**
 * Property-based tests for the simplified ApiClient refresh logic.
 * Feature: auth-architecture-simplification
 *
 * Property 4: Concurrent 401s deduplicate to a single refresh call
 * Property 5: After refresh lock clears, next 401 triggers a fresh refresh
 *
 * **Validates: Requirements 6.1, 6.3**
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { clearCsrfToken } from '@/lib/csrfToken';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn((opts: any) => opts.originalError ?? new Error('API Error')),
  },
}));

// ── Constants ───────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';
const REFRESH_URL = `${BASE}/api/v1/auth/refresh/`;

// ── Helpers ─────────────────────────────────────────────────────────────

function makeJsonResponse(status: number, body: object, csrfToken?: string): Response {
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
 * Build a fetch mock that tracks calls to the refresh endpoint.
 * Returns a configurable response for refresh calls.
 */
function setupRefreshFetchMock(refreshSuccess: boolean) {
  let refreshCallCount = 0;

  const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr === REFRESH_URL) {
      refreshCallCount++;
      // Small delay to simulate network latency so concurrent requests queue up
      await new Promise(r => setTimeout(r, 5));
      if (refreshSuccess) {
        return makeJsonResponse(200, { success: true }, 'new-csrf-token');
      }
      return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
    }

    // Non-refresh endpoints
    return makeJsonResponse(200, { success: true, data: {} });
  });

  vi.stubGlobal('fetch', mockFetch);

  return {
    mockFetch,
    getRefreshCallCount: () => refreshCallCount,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Auth Simplification — ApiClient Refresh Property Tests', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 4: Concurrent 401s deduplicate to a single refresh call
   *
   * For any N concurrent callers (2–20), the promise-lock in attemptRefresh()
   * ensures only one performRefresh() call occurs. All callers share the
   * same in-flight promise and receive the same result.
   *
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('Property 4: Concurrent 401s deduplicate to a single refresh call', () => {
    it('fires exactly 1 performRefresh for N concurrent attemptRefresh calls', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 20 }),
          async (n) => {
            clearCsrfToken();
            vi.resetModules();

            const tracker = setupRefreshFetchMock(true);
            const { apiClient } = await import('@/services/client');

            // Fire N concurrent refresh calls via the public refreshAuthSession()
            // which delegates directly to the private attemptRefresh()
            const promises = Array.from({ length: n }, () =>
              apiClient.refreshAuthSession()
            );

            const results = await Promise.all(promises);

            // All N callers must receive the same success result
            for (const result of results) {
              expect(result).toBe(true);
            }

            // Only 1 actual performRefresh (fetch to refresh endpoint) should occur
            expect(tracker.getRefreshCallCount()).toBe(1);

            vi.restoreAllMocks();
          },
        ),
        { numRuns: 10 },
      );
    });

    it('fires exactly 1 performRefresh for N concurrent calls even on failure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 20 }),
          async (n) => {
            clearCsrfToken();
            vi.resetModules();

            const tracker = setupRefreshFetchMock(false);
            const { apiClient } = await import('@/services/client');

            const promises = Array.from({ length: n }, () =>
              apiClient.refreshAuthSession()
            );

            const results = await Promise.all(promises);

            // All callers receive the failure result
            for (const result of results) {
              expect(result).toBe(false);
            }

            // Still only 1 actual refresh call — deduplication works on failure too
            expect(tracker.getRefreshCallCount()).toBe(1);

            vi.restoreAllMocks();
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Property 5: After refresh lock clears, next 401 triggers a fresh refresh
   *
   * After one refresh cycle completes (success or failure), the promise-lock
   * is cleared. A subsequent call triggers a brand new performRefresh().
   *
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('Property 5: After refresh lock clears, next 401 triggers a fresh refresh', () => {
    it('sequential batches each trigger a new performRefresh call', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }),
          fc.integer({ min: 2, max: 10 }),
          async (batches, callersPerBatch) => {
            clearCsrfToken();
            vi.resetModules();

            let refreshCallCount = 0;
            const mockFetch = vi.fn(async (url: string | URL | Request) => {
              const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
              if (urlStr === REFRESH_URL) {
                refreshCallCount++;
                await new Promise(r => setTimeout(r, 5));
                return makeJsonResponse(200, { success: true }, `csrf-${refreshCallCount}`);
              }
              return makeJsonResponse(200, { success: true, data: {} });
            });
            vi.stubGlobal('fetch', mockFetch);

            const { apiClient } = await import('@/services/client');

            for (let batch = 0; batch < batches; batch++) {
              // Fire concurrent calls within this batch
              const promises = Array.from({ length: callersPerBatch }, () =>
                apiClient.refreshAuthSession()
              );
              const results = await Promise.all(promises);

              // All callers in this batch succeed
              for (const result of results) {
                expect(result).toBe(true);
              }
            }

            // Total refresh calls = number of batches (lock resets between batches)
            expect(refreshCallCount).toBe(batches);

            vi.restoreAllMocks();
          },
        ),
        { numRuns: 10 },
      );
    });

    it('lock resets after failure — subsequent call triggers a new refresh', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 10 }),
          async (n) => {
            clearCsrfToken();
            vi.resetModules();

            let refreshCallCount = 0;
            let shouldSucceed = false;

            const mockFetch = vi.fn(async (url: string | URL | Request) => {
              const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
              if (urlStr === REFRESH_URL) {
                refreshCallCount++;
                await new Promise(r => setTimeout(r, 5));
                if (shouldSucceed) {
                  return makeJsonResponse(200, { success: true }, 'csrf-ok');
                }
                return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
              }
              return makeJsonResponse(200, { success: true, data: {} });
            });
            vi.stubGlobal('fetch', mockFetch);

            const { apiClient } = await import('@/services/client');

            // Batch 1: refresh fails
            const failPromises = Array.from({ length: n }, () =>
              apiClient.refreshAuthSession()
            );
            const failResults = await Promise.all(failPromises);
            for (const result of failResults) {
              expect(result).toBe(false);
            }
            expect(refreshCallCount).toBe(1);

            // Batch 2: refresh succeeds (lock was cleared after failure)
            shouldSucceed = true;
            const successPromises = Array.from({ length: n }, () =>
              apiClient.refreshAuthSession()
            );
            const successResults = await Promise.all(successPromises);
            for (const result of successResults) {
              expect(result).toBe(true);
            }
            expect(refreshCallCount).toBe(2);

            vi.restoreAllMocks();
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});
