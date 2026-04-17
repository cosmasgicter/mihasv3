/**
 * Regression test: wizard refresh dedupe
 *
 * Verifies that when wizard recovery triggers authService.refresh() at the
 * same time a protected API call gets a 401 (which also triggers refresh
 * via the ApiClient interceptor), only ONE actual POST /auth/refresh/
 * network call is made — thanks to the shared promise lock in ApiClient.
 *
 * Previously the wizard called apiClient.request('/auth/refresh/', { method: 'POST' })
 * directly, bypassing the dedupe lock. That was fixed to use authService.refresh().
 *
 * _Requirements: 1.1 (wizard refresh bypass fix)_
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
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

vi.mock('@/lib/apiErrorLogger', () => ({
  logApiError: vi.fn(),
}));

// ── Helpers ─────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';
const REFRESH_URL = `${BASE}/api/v1/auth/refresh/`;
const SESSION_URL = `${BASE}/api/v1/auth/session/`;
const APPLICATIONS_URL = `${BASE}/api/v1/applications/`;

function makeJsonResponse(status: number, body: any, csrfToken?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
    headers,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Wizard Refresh Dedupe Regression', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearCsrfToken } = await import('@/lib/csrfToken');
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wizard recovery + concurrent 401 produce exactly one /auth/refresh/ call', async () => {
    let refreshCallCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      // Refresh endpoint — always succeed, with a small delay to let concurrent callers queue
      if (urlStr === REFRESH_URL) {
        refreshCallCount++;
        await new Promise(r => setTimeout(r, 10));
        return makeJsonResponse(200, { success: true, data: { refreshed: true } }, 'new-csrf');
      }

      // Session endpoint — succeed (wizard recovery calls this after refresh)
      if (urlStr === SESSION_URL) {
        return makeJsonResponse(200, {
          success: true,
          data: { user: { id: 'u1', email: 'test@example.com' } },
        });
      }

      // Protected API endpoint — first call returns 401, retries succeed
      if (urlStr === APPLICATIONS_URL) {
        // Check if a refresh has already happened — if so, this is a retry
        if (refreshCallCount > 0) {
          return makeJsonResponse(200, { success: true, data: { saved: true } });
        }
        // First call: 401 triggers the ApiClient's intercept-refresh-retry
        return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
      }

      // Fallback
      return makeJsonResponse(200, { success: true, data: {} });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');
    const { authService } = await import('@/services/auth');

    // Simulate concurrent:
    // 1. Wizard recovery calls authService.refresh() (goes through the dedupe lock)
    // 2. A protected API call gets 401 and triggers refresh via the ApiClient interceptor
    const [wizardRefreshResult, apiResult] = await Promise.allSettled([
      authService.refresh(),
      apiClient.request('/applications/', { method: 'POST', retries: 0 }),
    ]);

    // Both should succeed
    expect(wizardRefreshResult.status).toBe('fulfilled');
    expect(apiResult.status).toBe('fulfilled');

    // Only ONE actual /auth/refresh/ network call should have been made
    const refreshCalls = mockFetch.mock.calls.filter(
      (call: any[]) => (typeof call[0] === 'string' ? call[0] : '') === REFRESH_URL,
    );
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCallCount).toBe(1);
  });

  it('session cache is updated after successful refresh', async () => {
    let refreshCallCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr === REFRESH_URL) {
        refreshCallCount++;
        await new Promise(r => setTimeout(r, 5));
        return makeJsonResponse(200, { success: true, data: { refreshed: true } }, 'updated-csrf');
      }

      if (urlStr === SESSION_URL) {
        return makeJsonResponse(200, {
          success: true,
          data: { user: { id: 'u1', email: 'test@example.com', full_name: 'Test User' } },
        });
      }

      return makeJsonResponse(200, { success: true, data: {} });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { authService } = await import('@/services/auth');

    // Wizard recovery: refresh then fetch session
    await authService.refresh();
    const session = await authService.session() as { user?: { id?: string } };

    // Session should have been fetched successfully after refresh
    expect(session).toBeDefined();
    expect(session.user).toBeDefined();
    expect(session.user?.id).toBe('u1');

    // Verify refresh was called exactly once
    expect(refreshCallCount).toBe(1);

    // Verify session endpoint was called (cache bypass)
    const sessionCalls = mockFetch.mock.calls.filter(
      (call: any[]) => (typeof call[0] === 'string' ? call[0] : '') === SESSION_URL,
    );
    expect(sessionCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('wizard recovery and two concurrent 401s still produce exactly one refresh', async () => {
    let refreshCallCount = 0;
    const protectedCallResults = new Map<string, number>();

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;

      if (urlStr === REFRESH_URL) {
        refreshCallCount++;
        await new Promise(r => setTimeout(r, 10));
        return makeJsonResponse(200, { success: true, data: { refreshed: true } }, 'new-csrf');
      }

      if (urlStr === SESSION_URL) {
        return makeJsonResponse(200, {
          success: true,
          data: { user: { id: 'u1', email: 'test@example.com' } },
        });
      }

      // Protected endpoints — 401 on first call, 200 on retry
      if (urlStr.startsWith(BASE + '/api/v1/') && !urlStr.includes('/auth/')) {
        const count = (protectedCallResults.get(urlStr) ?? 0) + 1;
        protectedCallResults.set(urlStr, count);

        if (refreshCallCount > 0) {
          return makeJsonResponse(200, { success: true, data: { ok: true } });
        }
        return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
      }

      return makeJsonResponse(200, { success: true, data: {} });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');
    const { authService } = await import('@/services/auth');

    // Three concurrent refresh triggers:
    // 1. Wizard recovery
    // 2. Protected API call A gets 401
    // 3. Protected API call B gets 401
    const results = await Promise.allSettled([
      authService.refresh(),
      apiClient.request('/applications/', { method: 'POST', retries: 0 }),
      apiClient.request('/notifications/', { method: 'GET', retries: 0, skipCache: true }),
    ]);

    // All should succeed
    expect(results.every(r => r.status === 'fulfilled')).toBe(true);

    // Still exactly one refresh call
    expect(refreshCallCount).toBe(1);
  });
});
