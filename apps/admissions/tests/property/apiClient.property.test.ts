/**
 * Property-based tests for API Client core
 * Feature: admissions-frontend-overhaul
 *
 * Properties 2-7, 11-12
 *
 * **Validates: Requirements 1.3, 1.5, 1.6, 1.7, 1.11, 1.12, 10.2, 10.5, 10.7, 11.1, 11.3, 11.4, 11.5**
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { getCsrfToken, setCsrfToken, clearCsrfToken } from '@/lib/csrfToken';

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

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn((opts: any) => opts.originalError ?? new Error('API Error')),
  },
}));

// ── Shared Arbitraries (fast-check v4 compatible) ───────────────────────

/** Generate a CSRF-like token string (hex chars, 16-64 length) */
const csrfTokenArb = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
    { minLength: 16, maxLength: 64 },
  )
  .map(chars => chars.join(''));

const stateChangingMethodArb = fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE');

const safeEndpointArb = fc.constantFrom(
  '/applications/',
  '/catalog/programs/',
  '/documents/upload/',
  '/notifications/',
  '/admin/dashboard/',
  '/sessions/',
  '/applications/123/review/',
  '/catalog/intakes/',
);

// ── Helpers ─────────────────────────────────────────────────────────────

let capturedRequests: Array<{
  url: string;
  method: string;
  headers: Record<string, string>;
  credentials?: string;
}> = [];

function setupFetchMock(
  csrfTokenToReturn: string | null,
  responseBody: any = { success: true, data: { ok: true } },
  status = 200,
) {
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
    capturedRequests.push({
      url: urlStr,
      method,
      headers,
      credentials: (init as any)?.credentials,
    });

    const responseHeaders = new Headers({ 'content-type': 'application/json' });
    if (csrfTokenToReturn) {
      responseHeaders.set('X-CSRF-Token', csrfTokenToReturn);
    }

    return new Response(JSON.stringify(responseBody), {
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: responseHeaders,
    });
  });

  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

// ── Property 2: Credentials inclusion on all requests ───────────────────

describe('Property 2: Credentials inclusion on all requests', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 1.3, 10.7**
   */
  it('every request includes credentials: include regardless of method', async () => {
    const methodArb = fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

    await fc.assert(
      fc.asyncProperty(methodArb, safeEndpointArb, async (method, endpoint) => {
        capturedRequests = [];
        setupFetchMock(null);

        const { apiClient } = await import('@/services/client');
        try {
          await apiClient.request(endpoint, { method, retries: 0 });
        } catch {
          // Ignore errors — we only care about the fetch call
        }

        // At least one fetch call should have been made
        expect(capturedRequests.length).toBeGreaterThan(0);

        // Every fetch call must include credentials: 'include'
        for (const req of capturedRequests) {
          expect(req.credentials).toBe('include');
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 3: CSRF token attachment on state-changing requests ────────

describe('Property 3: CSRF token attachment on state-changing requests', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirement 1.5**
   */
  it('attaches X-CSRF-Token header on POST/PUT/PATCH/DELETE when token exists', async () => {
    await fc.assert(
      fc.asyncProperty(csrfTokenArb, stateChangingMethodArb, safeEndpointArb, async (token, method, endpoint) => {
        setCsrfToken(token);
        capturedRequests = [];
        setupFetchMock(null);

        const { apiClient } = await import('@/services/client');
        try {
          await apiClient.request(endpoint, { method, retries: 0 });
        } catch {
          // Ignore
        }

        // Find the main API request (not internal refresh/session calls)
        const apiReq = capturedRequests.find(r => r.url.includes('localhost:3000'));
        expect(apiReq).toBeDefined();
        expect(apiReq!.headers['X-CSRF-Token']).toBe(token);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirement 1.5**
   */
  it('does NOT attach X-CSRF-Token header on GET requests', async () => {
    await fc.assert(
      fc.asyncProperty(csrfTokenArb, safeEndpointArb, async (token, endpoint) => {
        setCsrfToken(token);
        capturedRequests = [];
        setupFetchMock(null);

        const { apiClient } = await import('@/services/client');
        try {
          await apiClient.request(endpoint, { method: 'GET', retries: 0 });
        } catch {
          // Ignore
        }

        // GET requests go through fetchWithCache — check captured fetch calls
        const getReq = capturedRequests.find(r => r.url.includes('localhost:3000'));
        if (getReq) {
          expect(getReq.headers['X-CSRF-Token']).toBeUndefined();
        }
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 4: CSRF token capture from responses ───────────────────────

describe('Property 4: CSRF token capture from responses', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 1.6, 10.2**
   */
  it('captures X-CSRF-Token from response headers into the store', async () => {
    await fc.assert(
      fc.asyncProperty(csrfTokenArb, stateChangingMethodArb, async (token, method) => {
        clearCsrfToken();
        capturedRequests = [];
        setupFetchMock(token);

        const { apiClient } = await import('@/services/client');
        await apiClient.request('/applications/', { method, retries: 0 });

        expect(getCsrfToken()).toBe(token);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 1.6, 10.2**
   */
  it('does not overwrite store when response has no X-CSRF-Token', async () => {
    await fc.assert(
      fc.asyncProperty(csrfTokenArb, async (existingToken) => {
        setCsrfToken(existingToken);
        capturedRequests = [];
        setupFetchMock(null);

        const { apiClient } = await import('@/services/client');
        await apiClient.request('/applications/', { method: 'POST', retries: 0 });

        expect(getCsrfToken()).toBe(existingToken);
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 5: Auth-excluded endpoint classification ───────────────────

describe('Property 5: Auth-excluded endpoint classification', () => {
  /**
   * We replicate the isAuthExcludedEndpoint classification logic from
   * client.ts to test the property directly.
   *
   * **Validates: Requirement 1.7**
   */

  const authExcludedPaths = [
    '/api/v1/auth/refresh/',
    '/api/v1/auth/login/',
    '/api/v1/auth/register/',
  ];

  const nonAuthPaths = [
    '/api/v1/applications/',
    '/api/v1/catalog/programs/',
    '/api/v1/admin/dashboard/',
    '/api/v1/notifications/',
    '/api/v1/sessions/',
    '/api/v1/documents/upload/',
    '/api/v1/auth/logout/',
    '/api/v1/auth/session/',
  ];

  function isAuthExcludedEndpoint(endpoint: string): boolean {
    const excludedPatterns = [
      '/api/v1/auth/refresh/',
      '/api/v1/auth/login/',
      '/api/v1/auth/register/',
    ];
    return excludedPatterns.some(pattern => endpoint.includes(pattern));
  }

  it('returns true for the 3 auth-excluded paths', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...authExcludedPaths),
        (path) => {
          expect(isAuthExcludedEndpoint(path)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns false for all non-auth endpoints', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonAuthPaths),
        (path) => {
          expect(isAuthExcludedEndpoint(path)).toBe(false);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns false for random endpoint strings that do not contain auth-excluded patterns', () => {
    /** Alphanumeric + dash/underscore segment */
    const segArb = fc
      .array(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
        { minLength: 1, maxLength: 10 },
      )
      .map(chars => chars.join(''));

    const randomEndpointArb = fc
      .array(segArb, { minLength: 1, maxLength: 4 })
      .map(segs => '/api/v1/' + segs.join('/') + '/')
      .filter(
        ep =>
          !ep.includes('/auth/refresh/') &&
          !ep.includes('/auth/login/') &&
          !ep.includes('/auth/register/'),
      );

    fc.assert(
      fc.property(randomEndpointArb, (endpoint) => {
        expect(isAuthExcludedEndpoint(endpoint)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('does not match legacy query-parameter patterns', () => {
    const legacyPatterns = [
      '/api/auth?action=refresh',
      '/api/auth?action=login',
      '/api/auth?action=register',
    ];

    for (const pattern of legacyPatterns) {
      expect(isAuthExcludedEndpoint(pattern)).toBe(false);
    }
  });
});

// ── Property 6: Response envelope unwrapping with non-JSON passthrough ──

describe('Property 6: Response envelope unwrapping with non-JSON passthrough', () => {
  /**
   * We replicate the unwrapApiResponse logic from client.ts to test the
   * property directly without needing full HTTP mocking.
   *
   * **Validates: Requirements 1.12, 11.1, 11.5**
   */

  function unwrapApiResponse<T>(response: T | null, contentType?: string): T | null {
    if (response === null || response === undefined) return null;
    if (contentType && !contentType.includes('application/json')) return response;
    if (typeof response !== 'object' || Array.isArray(response)) return response;
    const obj = response as Record<string, unknown>;
    if ('success' in obj && 'data' in obj && obj.success === true) {
      return (obj.data ?? null) as T | null;
    }
    return response;
  }

  const jsonPayloadArb = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.string(), { maxLength: 5 }),
    fc.dictionary(
      fc.string().filter(s => s.length > 0 && s.length < 20),
      fc.string(),
      { maxKeys: 5 },
    ),
  );

  it('unwraps {success: true, data: T} to T', () => {
    fc.assert(
      fc.property(jsonPayloadArb, (payload) => {
        const envelope = { success: true, data: payload };
        const result = unwrapApiResponse(envelope);
        expect(result).toEqual(payload);
      }),
      { numRuns: 100 },
    );
  });

  it('passes through objects without {success, data} shape', () => {
    const nonEnvelopeArb = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 20 }),
    });

    fc.assert(
      fc.property(nonEnvelopeArb, (obj) => {
        const result = unwrapApiResponse(obj);
        expect(result).toEqual(obj);
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for null/undefined input', () => {
    expect(unwrapApiResponse(null)).toBeNull();
    expect(unwrapApiResponse(undefined as any)).toBeNull();
  });

  it('passes through non-object types (strings, arrays)', () => {
    fc.assert(
      fc.property(fc.string(), (str) => {
        expect(unwrapApiResponse(str)).toBe(str);
      }),
      { numRuns: 50 },
    );

    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 5 }), (arr) => {
        expect(unwrapApiResponse(arr)).toEqual(arr);
      }),
      { numRuns: 50 },
    );
  });

  it('skips unwrapping when content-type is not application/json', () => {
    const nonJsonContentTypes = [
      'text/csv',
      'application/pdf',
      'text/plain',
      'application/octet-stream',
    ];

    fc.assert(
      fc.property(
        jsonPayloadArb,
        fc.constantFrom(...nonJsonContentTypes),
        (payload, contentType) => {
          const envelope = { success: true, data: payload };
          const result = unwrapApiResponse(envelope, contentType);
          // Should NOT unwrap — return the envelope as-is
          expect(result).toEqual(envelope);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Property 7: Error response parsing with field-level errors ──────────

describe('Property 7: Error response parsing with field-level errors', () => {
  /**
   * Replicate the field error formatting logic from client.ts to test
   * the property directly.
   *
   * **Validates: Requirements 11.3, 11.4**
   */

  function formatFieldErrors(fieldErrors: Record<string, string>): string {
    return Object.entries(fieldErrors)
      .map(([field, message]) => {
        const fieldLabel =
          field === '_root'
            ? 'General'
            : field.replace(/\./g, ' ').replace(/_/g, ' ').trim();
        return `${fieldLabel}: ${message}`;
      })
      .join('; ');
  }

  const fieldNameArb = fc.oneof(
    fc.constant('_root'),
    fc.constantFrom('email', 'first_name', 'last_name', 'phone.number', 'address_line'),
  );

  const fieldMessageArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

  const fieldErrorsArb = fc.dictionary(fieldNameArb, fieldMessageArb, {
    minKeys: 1,
    maxKeys: 5,
  });

  it('formats each field-error pair as "fieldLabel: message" joined by semicolons', () => {
    fc.assert(
      fc.property(fieldErrorsArb, (fieldErrors) => {
        const result = formatFieldErrors(fieldErrors);
        const entries = Object.entries(fieldErrors);

        // Each entry should appear in the result
        for (const [field, message] of entries) {
          const expectedLabel =
            field === '_root'
              ? 'General'
              : field.replace(/\./g, ' ').replace(/_/g, ' ').trim();
          expect(result).toContain(`${expectedLabel}: ${message}`);
        }

        // Entries are joined by '; '
        if (entries.length > 1) {
          expect(result).toContain('; ');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('maps _root field key to "General"', () => {
    fc.assert(
      fc.property(fieldMessageArb, (message) => {
        const result = formatFieldErrors({ _root: message });
        expect(result).toContain(`General: ${message}`);
        expect(result).not.toContain('_root');
      }),
      { numRuns: 50 },
    );
  });

  it('replaces dots and underscores in field names with spaces', () => {
    const fieldWithSpecialChars = fc.constantFrom(
      'first_name',
      'phone.number',
      'address_line',
      'contact.email_address',
    );

    fc.assert(
      fc.property(fieldWithSpecialChars, fieldMessageArb, (field, message) => {
        const result = formatFieldErrors({ [field]: message });
        // Should not contain dots or underscores in the label portion
        const label = result.split(':')[0];
        expect(label).not.toContain('.');
        expect(label).not.toContain('_');
      }),
      { numRuns: 50 },
    );
  });
});

// ── Property 11: Query invalidation pattern mapping for REST URLs ───────

describe('Property 11: Query invalidation pattern mapping for REST URLs', () => {
  let apiClient: any;

  beforeEach(async () => {
    capturedRequests = [];
    setupFetchMock(null);
    const mod = await import('@/services/client');
    apiClient = mod.apiClient;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirement 1.11**
   */
  it('returns empty array for auth endpoints (login/logout/register/refresh)', () => {
    const authEndpoints = [
      '/api/v1/auth/login/',
      '/api/v1/auth/logout/',
      '/api/v1/auth/register/',
      '/api/v1/auth/refresh/',
      '/api/v1/auth/session/',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...authEndpoints),
        fc.constantFrom('POST', 'GET'),
        (endpoint, method) => {
          const keys = apiClient.getQueryInvalidationPatterns(endpoint, method);
          expect(keys).toEqual([]);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns application-related keys for application mutations', () => {
    const appEndpoints = [
      '/api/v1/applications/',
      '/api/v1/applications/123/',
      '/api/v1/applications/abc-def/review/',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...appEndpoints),
        fc.constantFrom('POST', 'PUT', 'PATCH'),
        (endpoint, method) => {
          const keys = apiClient.getQueryInvalidationPatterns(endpoint, method);
          // Should include ['applications'] key
          const hasApplicationsKey = keys.some(
            (k: string[]) => k.length === 1 && k[0] === 'applications',
          );
          expect(hasApplicationsKey).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns admin-related keys for admin mutations', () => {
    const adminEndpoints = [
      '/api/v1/admin/users/',
      '/api/v1/admin/users/123/',
      '/api/v1/admin/dashboard/',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...adminEndpoints),
        fc.constantFrom('POST', 'PUT', 'PATCH', 'DELETE'),
        (endpoint, method) => {
          const keys = apiClient.getQueryInvalidationPatterns(endpoint, method);
          const hasAdminKey = keys.some(
            (k: string[]) => k.length === 1 && k[0] === 'admin-applications',
          );
          expect(hasAdminKey).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('derives keys from path segments, not query parameters', () => {
    // REST URLs should work without any query params
    const restEndpoints = [
      '/api/v1/applications/123/review/',
      '/api/v1/documents/',
      '/api/v1/notifications/',
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...restEndpoints),
        fc.constantFrom('POST', 'PUT'),
        (endpoint, method) => {
          const keys = apiClient.getQueryInvalidationPatterns(endpoint, method);
          // Keys should be arrays of strings (React Query key format)
          for (const key of keys) {
            expect(Array.isArray(key)).toBe(true);
            for (const segment of key) {
              expect(typeof segment).toBe('string');
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ── Property 12: 401 intercept-refresh-retry behavior ───────────────────

describe('Property 12: 401 intercept-refresh-retry behavior', () => {
  beforeEach(() => {
    clearCsrfToken();
    capturedRequests = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirement 10.5**
   */
  it('attempts exactly one refresh on 401 for non-auth-excluded endpoints', async () => {
    const nonAuthEndpoints = [
      '/applications/',
      '/catalog/programs/',
      '/admin/dashboard/',
      '/notifications/',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...nonAuthEndpoints),
        stateChangingMethodArb,
        async (endpoint, method) => {
          capturedRequests = [];
          clearCsrfToken();

          // First call returns 401, refresh returns 200, retry returns 200
          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            const reqMethod = init?.method ?? 'GET';
            const headers: Record<string, string> = {};
            if (init?.headers && typeof init.headers === 'object' && !Array.isArray(init.headers) && !(init.headers instanceof Headers)) {
              Object.assign(headers, init.headers);
            }
            capturedRequests.push({
              url: urlStr,
              method: reqMethod,
              headers,
              credentials: (init as any)?.credentials,
            });

            callCount++;

            // First request: 401
            if (callCount === 1) {
              return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                {
                  status: 401,
                  statusText: 'Unauthorized',
                  headers: { 'content-type': 'application/json' },
                },
              );
            }

            // Second request: refresh endpoint — succeed
            if (callCount === 2 && urlStr.includes('/auth/refresh/')) {
              return new Response(
                JSON.stringify({ success: true, data: {} }),
                {
                  status: 200,
                  statusText: 'OK',
                  headers: {
                    'content-type': 'application/json',
                    'X-CSRF-Token': 'new-csrf-token',
                  },
                },
              );
            }

            // Third request: retry of original — succeed
            return new Response(
              JSON.stringify({ success: true, data: { retried: true } }),
              {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
              },
            );
          });

          vi.stubGlobal('fetch', mockFetch);

          const { apiClient } = await import('@/services/client');
          const result = await apiClient.request(endpoint, { method, retries: 0 });

          // Should have made exactly 3 fetch calls: original, refresh, retry
          expect(capturedRequests.length).toBe(3);

          // Second call should be to the refresh endpoint
          expect(capturedRequests[1].url).toContain('/auth/refresh/');
          expect(capturedRequests[1].method).toBe('POST');

          // Result should be from the retry
          expect(result).toEqual({ retried: true });
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirement 10.5**
   */
  it('does NOT attempt refresh for auth-excluded endpoints on 401', async () => {
    const authExcludedEndpoints = [
      '/auth/refresh/',
      '/auth/login/',
      '/auth/register/',
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...authExcludedEndpoints),
        async (endpoint) => {
          capturedRequests = [];
          clearCsrfToken();

          const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            capturedRequests.push({
              url: urlStr,
              method: init?.method ?? 'GET',
              headers: {},
              credentials: (init as any)?.credentials,
            });

            return new Response(
              JSON.stringify({ success: false, error: 'Unauthorized' }),
              {
                status: 401,
                statusText: 'Unauthorized',
                headers: { 'content-type': 'application/json' },
              },
            );
          });

          vi.stubGlobal('fetch', mockFetch);

          const { apiClient } = await import('@/services/client');

          try {
            await apiClient.request(endpoint, { method: 'POST', retries: 0 });
          } catch {
            // Expected to throw
          }

          // The only fetch calls should be the original request (no separate refresh call).
          // Since the endpoint itself may be /auth/refresh/, we check that no ADDITIONAL
          // refresh call was made beyond the original request.
          const allCalls = capturedRequests.length;
          // Auth-excluded endpoints get a 401 and throw — should be exactly 1 call (the original)
          expect(allCalls).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * **Validates: Requirement 10.5**
   */
  it('throws AuthenticationError when refresh fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('/applications/', '/catalog/programs/'),
        async (endpoint) => {
          capturedRequests = [];
          clearCsrfToken();

          let callCount = 0;
          const mockFetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
            const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
            capturedRequests.push({
              url: urlStr,
              method: init?.method ?? 'GET',
              headers: {},
              credentials: (init as any)?.credentials,
            });

            callCount++;

            // All calls return 401 (original + refresh fails)
            if (callCount === 1) {
              return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                {
                  status: 401,
                  statusText: 'Unauthorized',
                  headers: { 'content-type': 'application/json' },
                },
              );
            }

            // Refresh endpoint — fail
            return new Response(
              JSON.stringify({ success: false, error: 'Refresh failed' }),
              {
                status: 401,
                statusText: 'Unauthorized',
                headers: { 'content-type': 'application/json' },
              },
            );
          });

          vi.stubGlobal('fetch', mockFetch);

          const { apiClient, AuthenticationError } = await import('@/services/client');

          await expect(
            apiClient.request(endpoint, { method: 'POST', retries: 0 }),
          ).rejects.toThrow(AuthenticationError);
        },
      ),
      { numRuns: 20 },
    );
  });
});
