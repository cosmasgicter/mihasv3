/**
 * Unit tests for ApiClient CSRF 403 intercept-retry logic
 *
 * Tests:
 * - 403 CSRF error → re-fetch CSRF token → retry succeeds
 * - 403 non-CSRF error → no retry, error thrown
 *
 * _Requirements: 6.7_
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ── Helpers ─────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';
const APPLICATIONS_URL = `${BASE}/api/v1/applications/`;
const SESSION_URL = `${BASE}/api/v1/auth/session/`;

function makeJsonResponse(status: number, body: any, csrfToken?: string): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 403 ? 'Forbidden' : 'Error',
    headers,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ApiClient CSRF 403 Retry Unit Tests', () => {
  beforeEach(() => {
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // _Requirements: 6.7_
  it('403 CSRF error → re-fetch CSRF token → retry succeeds', async () => {
    let callCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;

      // First call: original POST returns 403 with CSRF_INVALID code
      if (callCount === 1) {
        return makeJsonResponse(403, {
          success: false,
          error: 'CSRF validation failed',
          code: 'CSRF_INVALID',
        });
      }

      // Second call: session endpoint GET to re-fetch CSRF token
      if (urlStr === SESSION_URL) {
        return makeJsonResponse(
          200,
          { success: true, data: { user: { id: '1' } } },
          'fresh-csrf-token'
        );
      }

      // Third call: retry of original POST with fresh CSRF token succeeds
      return makeJsonResponse(200, { success: true, data: { updated: true } });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');

    const result = await apiClient.request('/api/applications?action=details', {
      method: 'POST',
      retries: 0,
    });

    // Caller gets the successful response data (envelope unwrapped)
    expect(result).toEqual({ updated: true });

    // Verify call sequence: original POST (403) → session GET (200) → retry POST (200)
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    expect(urls[0]).toBe(APPLICATIONS_URL);
    expect(urls[1]).toBe(SESSION_URL);
    expect(urls[2]).toBe(APPLICATIONS_URL);

    // Verify the retry request includes the fresh CSRF token
    const retryInit = mockFetch.mock.calls[2][1] as RequestInit;
    const retryHeaders = retryInit.headers as Record<string, string>;
    expect(retryHeaders['X-CSRF-Token']).toBe('fresh-csrf-token');
  });

  // _Requirements: 6.7_
  it('403 non-CSRF error → no retry, error thrown', async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      // Return 403 with a non-CSRF error code
      return makeJsonResponse(403, {
        success: false,
        error: 'Forbidden',
        code: 'FORBIDDEN',
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient } = await import('@/services/client');

    // Should throw without retrying
    await expect(
      apiClient.request('/api/applications?action=details', {
        method: 'POST',
        retries: 0,
      })
    ).rejects.toThrow();

    // Only 1 call — the original request, no session re-fetch, no retry
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify no session endpoint call was made
    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    expect(urls.filter((u: string) => u === SESSION_URL)).toHaveLength(0);
  });
});
