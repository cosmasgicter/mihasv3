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
 * The tests encode the EXPECTED (correct) behavior. Once the promise-lock fix is
 * applied, these tests should pass.
 *
 * Bug Condition from design:
 *   isBugCondition(input) where
 *     input.previousRefreshSucceededRecently
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
   * Call refreshAuthSession(), await it, then call refreshAuthSession() again.
   * The simplified auth clears the promise lock in `finally`, so sequential
   * calls each make a new network request. First succeeds (200), second fails
   * (401 — JTI blacklisted) and returns false.
   *
   * **Validates: Requirements 1.1, 1.2**
   */
  it('sequential double refresh — second call makes a new network request', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 200 }),
        async (delayMs) => {
          clearCsrfToken();
          tracker.resetRefreshCallCount();
          tracker.mockFetch.mockClear();
          vi.resetModules();

          const { apiClient } = await import('@/services/client');

          // First refresh — should succeed
          const result1 = await apiClient.refreshAuthSession();
          expect(result1).toBe(true);

          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second refresh — promise lock cleared, makes new request, gets 401
          const result2 = await apiClient.refreshAuthSession();
          expect(result2).toBe(false);

          // Two separate network calls (no dedup window for sequential calls)
          expect(tracker.getRefreshCallCount()).toBe(2);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Test Case 2: Race with promise lock clear
   *
   * Call refreshAuthSession(), await it (lock clears), call within 100ms.
   * The simplified auth has no dedup window — second call makes a new request
   * and gets 401 (blacklisted JTI), returning false.
   *
   * **Validates: Requirements 1.2, 1.3**
   */
  it('race with promise lock clear — second call makes new request after lock clears', async () => {
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

          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Second refresh — lock cleared, new request, gets 401
          const result2 = await apiClient.refreshAuthSession();
          expect(result2).toBe(false);

          // Two network calls (no dedup caching)
          expect(tracker.getRefreshCallCount()).toBe(2);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * Test Case 3: Multiple concurrent callers after lock clear
   *
   * Await first refreshAuthSession(), then fire 3 concurrent calls.
   * The promise lock deduplicates truly concurrent calls (they share one
   * in-flight promise), but since the first already completed and cleared
   * the lock, the 3 concurrent calls share ONE new request (which gets 401).
   *
   * **Validates: Requirements 1.2, 1.4**
   */
  it('multiple concurrent callers after lock clear — concurrent calls share one new request', async () => {
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

          if (delayMs > 0) {
            await new Promise(r => setTimeout(r, delayMs));
          }

          // Fire 3 concurrent calls — they share one in-flight promise (lock dedup)
          const [r2, r3, r4] = await Promise.all([
            apiClient.refreshAuthSession(),
            apiClient.refreshAuthSession(),
            apiClient.refreshAuthSession(),
          ]);

          // All return false (the shared request gets 401 — blacklisted JTI)
          expect(r2).toBe(false);
          expect(r3).toBe(false);
          expect(r4).toBe(false);

          // 2 total: first successful + one shared concurrent request
          expect(tracker.getRefreshCallCount()).toBe(2);
        },
      ),
      { numRuns: 20 },
    );
  });
});
