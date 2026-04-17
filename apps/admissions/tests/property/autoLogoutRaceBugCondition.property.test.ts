/**
 * Bug Condition Exploration Test — Auto-Logout Race Condition
 *
 * Property 1: Bug Condition — Sequential Double-Refresh Race
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * GOAL: Surface counterexamples that demonstrate the promise lock clears too
 * eagerly, allowing a second `performRefresh()` call after the first succeeds.
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: Tests FAIL — this confirms the bug exists.
 * The tests encode the EXPECTED (correct) behavior. Once the cooldown fix is
 * applied, these tests should pass.
 *
 * Bug Condition from design:
 *   isBugCondition(input) where
 *     input.previousRefreshSucceededWithinCooldownWindow
 *     AND input.refreshPromise === null
 *     AND input.browserHasNotAppliedNewCookie
 *     AND input.callerIsIndependentCodePath
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
 * Build a fetch mock that simulates the JTI blacklist race:
 * - First call to refresh endpoint → 200 (success, token rotated)
 * - Subsequent calls to refresh endpoint → 401 (old JTI blacklisted)
 *
 * Returns a tracker for how many times the refresh endpoint was hit.
 */
function setupRaceFetchMock() {
  let refreshCallCount = 0;

  const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr === REFRESH_URL) {
      refreshCallCount++;
      // First refresh succeeds; subsequent ones fail (JTI blacklisted)
      if (refreshCallCount === 1) {
        return makeJsonResponse(200, { success: true }, 'new-csrf-token');
      }
      // Simulate blacklisted JTI rejection
      return makeJsonResponse(401, { error: 'TOKEN_EXPIRED' });
    }

    // Non-refresh endpoints — not used in these tests
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

describe('Auto-Logout Race Bug Condition — Property 1: Sequential Double-Refresh Race', () => {
  let tracker: ReturnType<typeof setupRaceFetchMock>;

  beforeEach(() => {
    clearCsrfToken();
    tracker = setupRaceFetchMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test Case 1: Sequential double refresh
   *
   * Call refreshAuthSession(), await it, then call refreshAuthSession() again
   * immediately. Assert performRefresh() is called only once.
   *
   * On UNFIXED code: FAILS — performRefresh() is called twice because the
   * promise lock clears in the `finally` block, and the second call sees
   * refreshPromise === null.
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('sequential double refresh — performRefresh called only once within cooldown', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 200 }),
        async (delayMs) => {
          // Reset state for each run — resetModules ensures fresh apiClient singleton
          clearCsrfToken();
          tracker.resetRefreshCallCount();
          tracker.mockFetch.mockClear();
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          // First refresh — should succeed
          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(true);

          // Wait the generated delay (0–200ms), then call again
          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second refresh — should return cached true without new network call
          const result2 = await apiClient.refreshAuthSession();
          expect(result2).toBe(true);

          // The bug: on unfixed code, performRefresh is called twice
          // Expected (correct) behavior: only 1 call to the refresh endpoint
          expect(tracker.getRefreshCallCount()).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Test Case 2: Race with promise lock clear
   *
   * Call refreshAuthSession(), await it (lock clears), call within 100ms.
   * Assert second call returns cached true without new network request.
   *
   * On UNFIXED code: FAILS — the second call makes a new fetch to the
   * refresh endpoint and gets 401 (blacklisted JTI), returning false.
   *
   * **Validates: Requirements 1.2, 1.3**
   */
  it('race with promise lock clear — second call returns cached true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        async (delayMs) => {
          clearCsrfToken();
          tracker.resetRefreshCallCount();
          tracker.mockFetch.mockClear();
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          // First refresh succeeds
          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(true);

          // Small delay within cooldown window
          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second refresh — should return cached true, NOT make a new request
          const result2 = await apiClient.refreshAuthSession();

          // On unfixed code, result2 will be false (401 from blacklisted JTI)
          // Expected: true (cached from first successful refresh)
          expect(result2).toBe(true);

          // Should still be only 1 refresh network call
          expect(tracker.getRefreshCallCount()).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Test Case 3: Multiple concurrent callers after lock clear
   *
   * Await first refreshAuthSession(), then fire 3 concurrent calls.
   * Assert only one additional performRefresh() call is made.
   *
   * On UNFIXED code: FAILS — all 3 concurrent calls see refreshPromise === null
   * and each starts a new performRefresh(). The promise lock only deduplicates
   * truly concurrent calls while one is in-flight, but after the first completes
   * and clears the lock, subsequent calls all race.
   *
   * **Validates: Requirements 1.2, 1.4**
   */
  it('multiple concurrent callers after lock clear — only one additional performRefresh', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 50 }),
        async (delayMs) => {
          clearCsrfToken();
          tracker.resetRefreshCallCount();
          tracker.mockFetch.mockClear();
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          // First refresh succeeds
          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(true);

          // Small delay, then fire 3 concurrent calls
          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          const [r2, r3, r4] = await Promise.all([
            apiClient.refreshAuthSession(),
            apiClient.refreshAuthSession(),
            apiClient.refreshAuthSession(),
          ]);

          // All should return true (cached from first successful refresh)
          expect(r2).toBe(true);
          expect(r3).toBe(true);
          expect(r4).toBe(true);

          // Expected: only 1 total performRefresh call (the initial one)
          // On unfixed code: will be > 1 because each concurrent call
          // starts its own performRefresh after the lock cleared
          expect(tracker.getRefreshCallCount()).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  });
});
