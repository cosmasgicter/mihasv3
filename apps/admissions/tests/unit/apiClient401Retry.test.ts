/**
 * Unit tests for ApiClient 401 intercept-refresh-retry logic
 *
 * Tests:
 * - 401 → refresh succeeds → retry succeeds
 * - 401 → refresh fails → onAuthFailure called
 * - 401 on refresh endpoint → no recursive refresh
 * - 401 on login endpoint → no refresh attempt
 *
 * _Requirements: 1.2, 1.3, 10.5_
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

// ── Helpers ─────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';
const APPLICATIONS_URL = `${BASE}/api/v1/applications/`;
const REFRESH_URL = `${BASE}/api/v1/auth/refresh/`;

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

describe('ApiClient 401 Retry Unit Tests', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearCsrfToken } = await import('@/lib/csrfToken');
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // _Requirements: 1.2_
  it('401 → refresh succeeds → retry succeeds: caller gets the successful response', async () => {
    let callCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;

      // First call: original request returns 401
      if (callCount === 1) {
        return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
      }

      // Second call: refresh endpoint returns 200
      if (urlStr === REFRESH_URL) {
        return makeJsonResponse(200, { success: true, data: { refreshed: true } }, 'fresh-csrf');
      }

      // Third call: retry of original request returns 200
      return makeJsonResponse(200, { success: true, data: { result: 'ok' } });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');

    const result = await apiClient.request('/applications/', {
      method: 'POST',
      retries: 0,
    });

    // Caller should get the successful response data
    expect(result).toEqual({ result: 'ok' });

    // Verify the call sequence: original (401) → refresh (200) → retry (200)
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    expect(urls[0]).toBe(APPLICATIONS_URL);
    expect(urls[1]).toBe(REFRESH_URL);
    expect(urls[2]).toBe(APPLICATIONS_URL);
  });

  it('GET 401 through cache layer refreshes and retries the original request', async () => {
    let callCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;

      if (callCount === 1) {
        return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
      }

      if (urlStr === REFRESH_URL) {
        return makeJsonResponse(200, { success: true, data: { refreshed: true } }, 'fresh-csrf');
      }

      return makeJsonResponse(200, { success: true, data: { result: 'ok' } });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');

    const result = await apiClient.request('/applications/', {
      method: 'GET',
      retries: 0,
      skipCache: true,
    });

    expect(result).toEqual({ result: 'ok' });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    expect(urls[0]).toBe(APPLICATIONS_URL);
    expect(urls[1]).toBe(REFRESH_URL);
    expect(urls[2]).toBe(APPLICATIONS_URL);
  });

  // _Requirements: 1.3_
  it('401 → refresh fails → onAuthFailure called and AuthenticationError thrown', async () => {
    let callCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;

      // First call: original request returns 401
      if (callCount === 1) {
        return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
      }

      // Second call: refresh endpoint returns 401 (refresh failed)
      if (urlStr === REFRESH_URL) {
        return makeJsonResponse(401, { success: false, error: 'Refresh failed' });
      }

      // Should not reach here
      return makeJsonResponse(500, { success: false, error: 'Unexpected' });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient, configureApiClientAuthFailure, AuthenticationError } =
      await import('@/services/client');

    // Set up onAuthFailure spy
    const authFailureSpy = vi.fn();
    configureApiClientAuthFailure(authFailureSpy);

    // The request should throw AuthenticationError
    await expect(
      apiClient.request('/applications/', {
        method: 'POST',
        retries: 0,
      })
    ).rejects.toThrow(AuthenticationError);

    // onAuthFailure should have been called
    expect(authFailureSpy).toHaveBeenCalledTimes(1);

    // Verify: original (401) → refresh (failed) → no retry
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Clean up: reset the auth failure callback
    configureApiClientAuthFailure(() => {});
  });

  // _Requirements: 10.5_
  it('401 on refresh endpoint → no recursive refresh attempt', async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      // Always return 401 — if refresh endpoint is called, it would also 401
      return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient, AuthenticationError } = await import('@/services/client');

    // Request to the refresh endpoint itself returns 401
    // It should NOT trigger another refresh (would cause infinite loop)
    await expect(
      apiClient.request('/auth/refresh/', {
        method: 'POST',
        retries: 0,
      })
    ).rejects.toThrow();

    // Only 1 call should be made — the original request, no refresh attempt
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    // No additional refresh call beyond the original request
    expect(urls.filter((u: string) => u === REFRESH_URL)).toHaveLength(1);
  });

  // _Requirements: 10.5_
  it('401 on login endpoint → no refresh attempt', async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return makeJsonResponse(401, { success: false, error: 'Invalid credentials' });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');

    // Request to the login endpoint returns 401
    // It should NOT trigger a refresh attempt
    await expect(
      apiClient.request('/auth/login/', {
        method: 'POST',
        retries: 0,
      })
    ).rejects.toThrow();

    // Only 1 call — the original login request, no refresh
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    // No call to the refresh endpoint
    expect(urls.filter((u: string) => u === REFRESH_URL)).toHaveLength(0);
  });

  it('generic GET 403 is treated as authorization failure, not logout', async () => {
    const mockFetch = vi.fn(async () => {
      return makeJsonResponse(403, {
        success: false,
        error: 'Permission denied',
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient, configureApiClientAuthFailure } = await import('@/services/client');
    const authFailureSpy = vi.fn();
    configureApiClientAuthFailure(authFailureSpy);

    await expect(
      apiClient.request('/applications/not-owned/details/', {
        method: 'GET',
        retries: 0,
      })
    ).rejects.toThrow();

    expect(authFailureSpy).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    expect(urls.filter((u: string) => u === REFRESH_URL)).toHaveLength(0);

    configureApiClientAuthFailure(() => {});
  });
});
