/**
 * Unit test for clean auth redirect on refresh 401
 *
 * Verifies that when /api/v1/auth/refresh/ returns 401 (blacklisted JTI),
 * the auth cascade invokes onAuthFailure and throws AuthenticationError
 * WITHOUT producing console.error or console.warn output.
 *
 * _Validates: Property 3 (Bug Condition — Auth Refresh 401 Clean Redirect)_
 * _Requirements: 2.4_
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
const REFRESH_URL = `${BASE}/api/v1/auth/refresh/`;

function makeJsonResponse(status: number, body: any): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
    headers,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Auth Refresh 401 Clean Redirect', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearCsrfToken();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('401 → refresh 401 → onAuthFailure called, AuthenticationError thrown, no console.error or console.warn', async () => {
    let callCount = 0;

    const mockFetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;

      // First call: original request returns 401
      if (callCount === 1) {
        return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
      }

      // Second call: refresh endpoint returns 401 (blacklisted JTI)
      if (urlStr === REFRESH_URL) {
        return makeJsonResponse(401, { success: false, error: 'Token blacklisted' });
      }

      return makeJsonResponse(500, { success: false, error: 'Unexpected' });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { apiClient, configureApiClientAuthFailure, AuthenticationError } =
      await import('@/services/client');

    const authFailureSpy = vi.fn();
    configureApiClientAuthFailure(authFailureSpy);

    // The request should throw AuthenticationError
    await expect(
      apiClient.request('/applications/', {
        method: 'POST',
        retries: 0,
      })
    ).rejects.toThrow(AuthenticationError);

    // onAuthFailure callback must have been invoked
    expect(authFailureSpy).toHaveBeenCalledTimes(1);

    // No console.error or console.warn during the cascade
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    // Verify call sequence: original (401) → refresh (401) → no retry
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((c: any[]) =>
      typeof c[0] === 'string' ? c[0] : ''
    );
    expect(urls[0]).toBe(APPLICATIONS_URL);
    expect(urls[1]).toBe(REFRESH_URL);

    // Clean up
    configureApiClientAuthFailure(() => {});
  });
});
