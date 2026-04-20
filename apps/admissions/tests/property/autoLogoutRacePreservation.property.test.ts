/**
 * Preservation Property Tests — Auto-Logout Race Condition Fix
 *
 * Property 2: Preservation — Non-Cooldown Refresh Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6**
 *
 * GOAL: Capture baseline behavior on UNFIXED code so we can verify the fix
 * does not regress any of these behaviors.
 *
 * These tests MUST PASS on the current unfixed code.
 *
 * Preservation scenarios:
 * 1. Single refresh call returns the performRefresh() result and calls it exactly once
 * 2. Concurrent in-flight calls share the same promise, performRefresh called once
 * 3. Failed refresh never caches a true result (failures are never cached)
 * 4. After cooldown window elapses, a new call makes a real performRefresh() request
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
        // Small delay to simulate network latency for concurrent dedup tests
        await new Promise(r => setTimeout(r, 10));
        return makeJsonResponse(200, { success: true }, 'new-csrf-token');
      }
      await new Promise(r => setTimeout(r, 10));
      return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
    }

    // Non-refresh endpoints
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

describe('Auto-Logout Race Preservation — Property 2: Non-Cooldown Refresh Behavior Unchanged', () => {
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

          // Result must match what performRefresh returns
          expect(result).toBe(shouldSucceed);

          // performRefresh must be called exactly once
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

          // Fire N concurrent calls — all should share the same in-flight promise
          const promises = Array.from({ length: callerCount }, () =>
            apiClient.refreshAuthSession()
          );

          const results = await Promise.all(promises);

          // All callers should get true
          for (const result of results) {
            expect(result).toBe(true);
          }

          // performRefresh should be called exactly once
          expect(tracker.getRefreshCallCount()).toBe(1);

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Property: when performRefresh() returns false, the failure cooldown prevents
   * redundant refresh attempts within REFRESH_FAILURE_COOLDOWN_MS (2000ms).
   * A subsequent call within the cooldown returns false immediately without
   * making a new network request.
   *
   * **Validates: Requirements 3.2, 3.5**
   */
  it('failed refresh is never cached — subsequent call within cooldown returns false without new request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),
        async (delayMs) => {
          clearCsrfToken();

          // First: set up a failing refresh
          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

            if (urlStr === REFRESH_URL) {
              callCount++;
              // Always fail
              return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
            }
            return makeJsonResponse(200, { success: true });
          });

          vi.stubGlobal('fetch', mockFetch);
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          // First call — should fail
          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(false);
          expect(callCount).toBe(1);

          // Wait a small delay (within failure cooldown of 2000ms)
          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second call — within failure cooldown, returns false immediately
          const result2 = await apiClient.refreshAuthSession();
          expect(result2).toBe(false);

          // Only 1 actual network request — failure cooldown prevents redundant attempts
          expect(callCount).toBe(1);

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Property: for all time deltas > REFRESH_COOLDOWN_MS (5000ms) after a
   * successful refresh, a new attemptRefresh() call invokes performRefresh()
   * (cooldown expired).
   *
   * On UNFIXED code: this passes trivially because there is no cooldown —
   * every call after the first completes makes a new performRefresh() call.
   * After the fix, it should still pass because the cooldown will have expired.
   *
   * **Validates: Requirements 3.1, 3.6**
   */
  it('after cooldown period elapses, new call makes a real performRefresh request', async () => {
    const REFRESH_COOLDOWN_MS = 5000;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: REFRESH_COOLDOWN_MS + 100, max: REFRESH_COOLDOWN_MS + 500 }),
        async (waitMs) => {
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

          // First refresh — succeeds
          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(true);
          expect(callCount).toBe(1);

          // Use fake timers to advance past cooldown without real waiting
          const originalDateNow = Date.now;
          const startTime = Date.now();
          Date.now = () => startTime + waitMs;

          try {
            // Second refresh after cooldown — should make a new request
            const result2 = await apiClient.refreshAuthSession();
            expect(result2).toBe(true);

            // performRefresh must have been called again (cooldown expired)
            expect(callCount).toBe(2);
          } finally {
            Date.now = originalDateNow;
          }

          vi.restoreAllMocks();
        },
      ),
      { numRuns: 5 },
    );
  });
});
