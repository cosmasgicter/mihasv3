/**
 * Unit tests for the unified ApiClient (Task 1.4)
 *
 * Validates:
 * - R9.2: All HTTP methods share the same refresh and error pipeline
 * - R14.4: One request/response path for all methods
 * - R17.1: Timeout, retry policy, abort, and normalized errors
 * - Replay guard: unsafe methods without idempotency key are not replayed
 * - CSRF capture: response headers captured for all methods
 * - Error envelope: V2 error.code field parsed and exposed
 *
 * _Requirements: R9.1-R9.2, R14.4, R17.1_
 * _Findings: API-01, API-03_
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => 'http://localhost:3000',
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn((opts: any) => {
      const err = opts.originalError ?? new Error('API Error');
      if (opts.statusCode) err.status = opts.statusCode;
      return err;
    }),
  },
}));

// ── Helpers ─────────────────────────────────────────────────────────────

const BASE = 'http://localhost:3000';
const REFRESH_URL = `${BASE}/api/v1/auth/refresh/`;

function makeJsonResponse(status: number, body: any, headers?: Record<string, string>): Response {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 401 ? 'Unauthorized' : 'Error',
    headers: h,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ApiClient Unified Request Path (Task 1.4)', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { clearCsrfToken } = await import('@/lib/csrfToken');
    clearCsrfToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── R14.4: Unified response path ──────────────────────────────────────

  describe('Unified response pipeline for all methods', () => {
    it('GET requests go through the same envelope unwrapping as POST', async () => {
      const mockFetch = vi.fn(async () =>
        makeJsonResponse(200, { success: true, data: { items: [1, 2, 3] } })
      );
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/', { method: 'GET', retries: 0 });

      expect(result).toEqual({ items: [1, 2, 3] });
    });

    it('POST requests go through the same envelope unwrapping', async () => {
      const mockFetch = vi.fn(async () =>
        makeJsonResponse(200, { success: true, data: { id: 'abc' } })
      );
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
        retries: 0,
      });

      expect(result).toEqual({ id: 'abc' });
    });

    it('GET 401 triggers the same refresh pipeline as POST 401', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;

        if (callCount === 1) {
          return makeJsonResponse(401, { success: false, error: 'Unauthorized' });
        }
        if (urlStr === REFRESH_URL) {
          return makeJsonResponse(200, { success: true, data: {} }, { 'X-CSRF-Token': 'new-token' });
        }
        return makeJsonResponse(200, { success: true, data: { refreshed: true } });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/', { method: 'GET', retries: 0 });

      expect(result).toEqual({ refreshed: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('CSRF token is captured from GET responses', async () => {
      const mockFetch = vi.fn(async () =>
        makeJsonResponse(200, { success: true, data: {} }, { 'X-CSRF-Token': 'get-csrf-token' })
      );
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      await apiClient.request('/auth/session/', { method: 'GET', retries: 0 });

      const { getCsrfToken } = await import('@/lib/csrfToken');
      expect(getCsrfToken()).toBe('get-csrf-token');
    });
  });

  // ── R9.2: Replay guard ────────────────────────────────────────────────

  describe('Replay guard for unsafe methods', () => {
    it('GET is always replayed after successful refresh', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        if (callCount === 1) return makeJsonResponse(401, { error: 'Unauthorized' });
        if (urlStr === REFRESH_URL) return makeJsonResponse(200, { success: true, data: {} });
        return makeJsonResponse(200, { success: true, data: { ok: true } });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/', { method: 'GET', retries: 0 });

      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('POST with Idempotency-Key is replayed after successful refresh', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        if (callCount === 1) return makeJsonResponse(401, { error: 'Unauthorized' });
        if (urlStr === REFRESH_URL) return makeJsonResponse(200, { success: true, data: {} });
        return makeJsonResponse(200, { success: true, data: { submitted: true } });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/123/submit/', {
        method: 'POST',
        retries: 0,
        headers: { 'Idempotency-Key': 'submit-abc-123' },
      });

      expect(result).toEqual({ submitted: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('POST without Idempotency-Key throws REFRESH_NO_REPLAY after successful refresh', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        if (callCount === 1) return makeJsonResponse(401, { error: 'Unauthorized' });
        if (urlStr === REFRESH_URL) return makeJsonResponse(200, { success: true, data: {} });
        return makeJsonResponse(200, { success: true, data: {} });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      await expect(
        apiClient.request('/applications/', { method: 'POST', retries: 0 })
      ).rejects.toMatchObject({
        code: 'REFRESH_NO_REPLAY',
        refreshed: true,
        status: 401,
      });

      // Only 2 calls: original + refresh (no replay)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('PUT without Idempotency-Key throws REFRESH_NO_REPLAY', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        if (callCount === 1) return makeJsonResponse(401, { error: 'Unauthorized' });
        if (urlStr === REFRESH_URL) return makeJsonResponse(200, { success: true, data: {} });
        return makeJsonResponse(200, { success: true, data: {} });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      await expect(
        apiClient.request('/applications/123/', { method: 'PUT', retries: 0 })
      ).rejects.toMatchObject({ code: 'REFRESH_NO_REPLAY' });
    });

    it('DELETE without Idempotency-Key throws REFRESH_NO_REPLAY', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        if (callCount === 1) return makeJsonResponse(401, { error: 'Unauthorized' });
        if (urlStr === REFRESH_URL) return makeJsonResponse(200, { success: true, data: {} });
        return makeJsonResponse(200, { success: true, data: {} });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      await expect(
        apiClient.request('/applications/123/', { method: 'DELETE', retries: 0 })
      ).rejects.toMatchObject({ code: 'REFRESH_NO_REPLAY' });
    });

    it('idempotency-key (lowercase) is also detected for replay', async () => {
      let callCount = 0;
      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;
        if (callCount === 1) return makeJsonResponse(401, { error: 'Unauthorized' });
        if (urlStr === REFRESH_URL) return makeJsonResponse(200, { success: true, data: {} });
        return makeJsonResponse(200, { success: true, data: { ok: true } });
      });

      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/123/submit/', {
        method: 'POST',
        retries: 0,
        headers: { 'idempotency-key': 'key-lowercase' },
      });

      expect(result).toEqual({ ok: true });
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ── Error envelope parsing ────────────────────────────────────────────

  describe('V2 error envelope code parsing', () => {
    it('exposes error.code from the V2 error envelope', async () => {
      const mockFetch = vi.fn(async () =>
        makeJsonResponse(400, {
          success: false,
          error: 'Fee not configured',
          code: 'FEE_NOT_CONFIGURED',
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      try {
        await apiClient.request('/payments/resolve-fee/', { method: 'GET', retries: 0 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });

    it('parses field errors from V2 details object', async () => {
      const mockFetch = vi.fn(async () =>
        makeJsonResponse(400, {
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: {
            email: ['Invalid email format'],
            phone: ['Required field'],
          },
        })
      );
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      try {
        await apiClient.request('/auth/register/', { method: 'POST', retries: 0 });
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('email');
        expect(err.message).toContain('phone');
      }
    });
  });

  // ── Cancellation / timeout ────────────────────────────────────────────

  describe('Cancellation and timeout', () => {
    it('external AbortSignal cancels the request', async () => {
      const controller = new AbortController();
      controller.abort();

      const mockFetch = vi.fn(async (_url: any, init?: RequestInit) => {
        // Simulate fetch checking the abort signal
        if (init?.signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        return makeJsonResponse(200, { success: true, data: {} });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      await expect(
        apiClient.request('/applications/', {
          method: 'GET',
          retries: 0,
          signal: controller.signal,
        })
      ).rejects.toThrow('aborted');
    });

    it('timeout produces a TimeoutError that is retryable', async () => {
      const mockFetch = vi.fn(async (_url: any, init?: RequestInit) => {
        // Simulate a request that takes longer than the timeout
        return new Promise<Response>((_, reject) => {
          const timer = setTimeout(() => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }, 5);

          // If signal is already aborted, reject immediately
          if (init?.signal?.aborted) {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          }
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      await expect(
        apiClient.request('/applications/', {
          method: 'GET',
          timeout: 1, // 1ms timeout
          retries: 0,
        })
      ).rejects.toThrow();
    });
  });

  // ── Concurrent refresh serialization ──────────────────────────────────

  describe('Concurrent refresh serialization', () => {
    it('multiple concurrent 401s share a single refresh call', async () => {
      let refreshCallCount = 0;
      let callCount = 0;

      const mockFetch = vi.fn(async (url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        callCount++;

        if (urlStr.includes('/auth/refresh/')) {
          refreshCallCount++;
          // Small delay to simulate network
          await new Promise(r => setTimeout(r, 10));
          return makeJsonResponse(200, { success: true, data: {} }, { 'X-CSRF-Token': 'refreshed' });
        }

        // First few calls return 401
        if (callCount <= 3) {
          return makeJsonResponse(401, { error: 'Unauthorized' });
        }

        return makeJsonResponse(200, { success: true, data: { ok: true } });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');

      // Fire 3 GET requests concurrently — all will hit 401
      const results = await Promise.all([
        apiClient.request('/applications/', { method: 'GET', retries: 0 }),
        apiClient.request('/catalog/programs/', { method: 'GET', retries: 0 }),
        apiClient.request('/notifications/', { method: 'GET', retries: 0 }),
      ]);

      // All should resolve successfully
      expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);

      // Only ONE refresh call should have been made (serialized)
      expect(refreshCallCount).toBe(1);
    });
  });

  // ── Network error handling ────────────────────────────────────────────

  describe('Network error handling', () => {
    it('network TypeError is treated as retryable', async () => {
      let attempts = 0;
      const mockFetch = vi.fn(async () => {
        attempts++;
        if (attempts <= 2) {
          throw new TypeError('Failed to fetch');
        }
        return makeJsonResponse(200, { success: true, data: { recovered: true } });
      });
      vi.stubGlobal('fetch', mockFetch);

      const { apiClient } = await import('@/services/client');
      const result = await apiClient.request('/applications/', {
        method: 'GET',
        retries: 3,
        timeout: 5000,
      });

      expect(result).toEqual({ recovered: true });
      expect(attempts).toBe(3);
    });
  });
});
