/**
 * Property-based tests for ApiClient CSRF handling
 * Feature: single-source-of-truth-consolidation
 *
 * Property 4: CSRF token captured from every response
 * Property 5: CSRF token attached to all state-changing requests
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getCsrfToken, setCsrfToken, clearCsrfToken } from '@/lib/csrfToken';

// ── Mocks ───────────────────────────────────────────────────────────────

// Mock apiConfig to return a stable base URL in tests
vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

// Mock api-cache to bypass caching — pass through to fetch for GET requests
vi.mock('@/utils/api-cache', () => ({
  fetchWithCache: vi.fn(async (url: string, options: any) => {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      credentials: options.credentials,
      signal: options.signal,
    });
    // Call onResponse callback so CSRF capture runs
    if (options.onResponse) {
      options.onResponse(response.clone(), 0);
    }
    // Use transformResponse if provided (mirrors real fetchWithCache)
    if (options.transformResponse) {
      return options.transformResponse(response);
    }
    return response.json();
  }),
  invalidateCache: vi.fn(),
}));

// Mock logger to silence output
vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock apiErrorHandler
vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn((opts: any) => opts.originalError ?? new Error('API Error')),
  },
}));

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Arbitrary alphanumeric CSRF token string (realistic token format) */
const csrfTokenArb = fc.string({ minLength: 16, maxLength: 64 })
  .map(s => s.replace(/[^a-z0-9]/gi, 'a') || 'a'.repeat(16))
  .filter(s => s.length >= 16);

/** Arbitrary state-changing HTTP method */
const stateChangingMethodArb = fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE');

// ── Helpers ─────────────────────────────────────────────────────────────

/** Track captured request headers from fetch calls */
let capturedRequests: { url: string; method: string; headers: Record<string, string> }[] = [];
const BASE = 'http://localhost:3000';
const APPLICATIONS_URL = `${BASE}/api/v1/applications/`;
const CATALOG_PROGRAMS_URL = `${BASE}/api/v1/catalog/programs/`;

function setupFetchMock(csrfTokenToReturn: string | null, responseBody: any = { success: true, data: { ok: true } }) {
  const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const method = init?.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, init.headers);
      }
    }
    capturedRequests.push({ url: urlStr, method, headers });

    const responseHeaders = new Headers({
      'content-type': 'application/json',
    });
    if (csrfTokenToReturn) {
      responseHeaders.set('X-CSRF-Token', csrfTokenToReturn);
    }

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      statusText: 'OK',
      headers: responseHeaders,
    });
  });

  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ApiClient CSRF Property Tests', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Feature: single-source-of-truth-consolidation, Property 4: CSRF token captured from every response
  // **Validates: Requirements 1.4, 3.7, 6.2, 6.4**
  describe('Property 4: CSRF token captured from every response', () => {
    it('captures CSRF token from POST/PUT/PATCH/DELETE response headers into the store', async () => {
      await fc.assert(
        fc.asyncProperty(csrfTokenArb, stateChangingMethodArb, async (token, method) => {
          // Reset state
          clearCsrfToken();
          capturedRequests = [];

          // Mock fetch to return the generated CSRF token in response header
          setupFetchMock(token);

          // Import a fresh apiClient (uses the mocked fetch)
          const { apiClient } = await import('@/services/client');

          // Make a request with the given method
          await apiClient.request('/api/applications', { method });

          // The CSRF token store should now contain the token from the response
          expect(getCsrfToken()).toBe(token);
        }),
        { numRuns: 10 },
      );
    });

    it('captures CSRF token from GET response headers into the store', async () => {
      await fc.assert(
        fc.asyncProperty(csrfTokenArb, async (token) => {
          // Reset state
          clearCsrfToken();
          capturedRequests = [];

          // Mock fetch to return the generated CSRF token in response header
          setupFetchMock(token);

          const { apiClient } = await import('@/services/client');

          // Make a GET request (default method)
          await apiClient.request('/api/auth?action=session');

          // The CSRF token store should contain the token from the GET response
          expect(getCsrfToken()).toBe(token);
        }),
        { numRuns: 10 },
      );
    });

    it('does not overwrite CSRF store when response has no X-CSRF-Token header', async () => {
      await fc.assert(
        fc.asyncProperty(csrfTokenArb, async (existingToken) => {
          // Pre-set a token in the store
          setCsrfToken(existingToken);
          capturedRequests = [];

          // Mock fetch with NO CSRF token in response
          setupFetchMock(null);

          const { apiClient } = await import('@/services/client');

          await apiClient.request('/api/applications', { method: 'POST' });

          // The existing token should remain unchanged
          expect(getCsrfToken()).toBe(existingToken);
        }),
        { numRuns: 10 },
      );
    });
  });

  // Feature: single-source-of-truth-consolidation, Property 5: CSRF token attached to all state-changing requests
  // **Validates: Requirements 6.5**
  describe('Property 5: CSRF token attached to all state-changing requests', () => {
    it('attaches CSRF token header to all POST/PUT/PATCH/DELETE requests', async () => {
      await fc.assert(
        fc.asyncProperty(csrfTokenArb, stateChangingMethodArb, async (token, method) => {
          // Set the CSRF token in the store before making the request
          setCsrfToken(token);
          capturedRequests = [];

          // Mock fetch (no CSRF in response to avoid overwriting)
          setupFetchMock(null);

          const { apiClient } = await import('@/services/client');

          await apiClient.request('/api/applications', { method });

          const apiRequest = capturedRequests.find(r => r.url === APPLICATIONS_URL);
          expect(apiRequest).toBeDefined();
          expect(apiRequest!.headers['X-CSRF-Token']).toBe(token);
        }),
        { numRuns: 10 },
      );
    });

    it('does not attach CSRF token header to GET requests', async () => {
      await fc.assert(
        fc.asyncProperty(csrfTokenArb, async (token) => {
          // Set the CSRF token in the store
          setCsrfToken(token);
          capturedRequests = [];

          // Mock fetch
          setupFetchMock(null);

          const { apiClient } = await import('@/services/client');

          // GET request should NOT have CSRF header
          await apiClient.request('/api/catalog?type=programs');

          // GET requests go through fetchWithCache, check captured requests
          // The fetch mock captures the request made by fetchWithCache
          const getRequest = capturedRequests.find(r => r.url === CATALOG_PROGRAMS_URL);
          if (getRequest) {
            // GET requests should NOT have the CSRF token header
            expect(getRequest.headers['X-CSRF-Token']).toBeUndefined();
          }
        }),
        { numRuns: 10 },
      );
    });

    it('does not attach CSRF token when store is empty', async () => {
      await fc.assert(
        fc.asyncProperty(stateChangingMethodArb, async (method) => {
          // Ensure CSRF store is empty
          clearCsrfToken();
          capturedRequests = [];

          // Mock fetch
          setupFetchMock(null);

          const { apiClient } = await import('@/services/client');

          await apiClient.request('/api/applications', { method });

          const apiRequest = capturedRequests.find(r => r.url === APPLICATIONS_URL);
          expect(apiRequest).toBeDefined();
          // No CSRF token should be attached when store is empty
          expect(apiRequest!.headers['X-CSRF-Token']).toBeUndefined();
        }),
        { numRuns: 10 },
      );
    });
  });
});
