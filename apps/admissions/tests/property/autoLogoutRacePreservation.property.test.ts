/**
 * Preservation Property Tests — Auto-Logout Race Condition Fix
 *
 * Property 2: Preservation — Core Refresh Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.6**
 *
 * GOAL: Verify the simplified promise-lock refresh logic preserves correct
 * baseline behavior.
 *
 * Preservation scenarios:
 * 1. Single refresh call returns the performRefresh() result and calls it exactly once
 * 2. Concurrent in-flight calls share the same promise, performRefresh called once
 * 3. After promise-lock clears (failure), a new call makes a fresh request
 * 4. After promise-lock clears (success), a new call makes a fresh request
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
 * Build a fetch mock that returns a configurable status for the refresh endpoint.
 * Tracks how many times the refresh endpoint was hit.
 */
function setupRefreshFetchMock(refreshSuccess: boolean) {
  let refreshCallCount = 0;

  const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr === REFRESH_URL) {
      refreshCallCount++;
      if (refreshSuccess) {
        await new Promise(r => setTimeout(r, 10));
        return makeJsonResponse(200, { success: true }, 'new-csrf-token');
      }
      await new Promise(r => setTimeout(r, 10));
      return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
    }

    return makeJsonResponse(200, { success: true });
  });

  vi.stubGlobal('fetch', mockFetch);

  return {
    mockFetch,
    getRefreshCallCount: () => refreshCallCount,
    resetRefreshCallCount: () => { refreshCallCount = 0; },
  };
}


// ── Tests ───────────────────────────────────────────────────────────────

describe('Auto-Logout Race Preservation — Property 2: Core Refresh Behavior Unchanged', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property: for all performRefresh() results in {true, false}, a single
   * attemptRefresh() call returns that result and calls performRefresh() exactly once.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('single refresh call returns performRefresh result and calls it exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        async (shouldSucceed) => {
          clearCsrfToken();

          const tracker = setupRefreshFetchMock(shouldSucceed);
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          const result = await apiClient.refreshAuthSession();
          expect(result).toBe(shouldSucceed);
          expect(tracker.getRefreshCallCount()).toBe(1);

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Property: for all concurrent caller counts (1–10), when refreshPromise is
   * in-flight, all callers share the same promise and performRefresh() is called
   * exactly once.
   *
   * **Validates: Requirements 3.3, 3.6**
   */
  it('concurrent in-flight calls share the same promise, performRefresh called once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (callerCount) => {
          clearCsrfToken();

          const tracker = setupRefreshFetchMock(true);
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          const promises = Array.from({ length: callerCount }, () =>
            apiClient.refreshAuthSession()
          );

          const results = await Promise.all(promises);

          for (const result of results) {
            expect(result).toBe(true);
          }
          expect(tracker.getRefreshCallCount()).toBe(1);

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 20 },
    );
  });


  /**
   * Property: when performRefresh() returns false, the promise-lock clears and
   * a subsequent call makes a fresh performRefresh() request. There is no
   * failure cooldown — every call after the lock clears triggers a real request.
   *
   * **Validates: Requirements 3.2, 3.6**
   */
  it('failed refresh clears promise-lock — subsequent call makes a fresh request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),
        async (delayMs) => {
          clearCsrfToken();

          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

            if (urlStr === REFRESH_URL) {
              callCount++;
              return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
            }
            return makeJsonResponse(200, { success: true });
          });

          vi.stubGlobal('fetch', mockFetch);
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(false);
          expect(callCount).toBe(1);

          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second call — promise-lock cleared, makes a fresh request
          const result2 = await apiClient.refreshAuthSession();
          expect(result2).toBe(false);

          // Both calls made real network requests (no cooldown caching)
          expect(callCount).toBe(2);

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Property: after a successful refresh completes and the promise-lock clears,
   * a new call makes a fresh performRefresh() request. The simplified ApiClient
   * has no success cooldown — every sequential call after lock release triggers
   * a real refresh.
   *
   * **Validates: Requirements 3.1, 3.6**
   */
  it('after promise-lock clears, new call makes a real performRefresh request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        async (delayMs) => {
          clearCsrfToken();

          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

            if (urlStr === REFRESH_URL) {
              callCount++;
              return makeJsonResponse(200, { success: true }, `csrf-token-${callCount}`);
            }
            return makeJsonResponse(200, { success: true });
          });

          vi.stubGlobal('fetch', mockFetch);
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(true);
          expect(callCount).toBe(1);

          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second refresh — lock cleared, makes a new request
          const result2 = await apiClient.refreshAuthSession();
          expect(result2).toBe(true);

          // Both calls made real network requests
          expect(callCount).toBe(2);

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 20 },
    );
  });
});
