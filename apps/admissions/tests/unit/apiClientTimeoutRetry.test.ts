// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for ApiClient request timeout and retry configuration.
 * Requirements: 24.1, 24.2, 24.3, 24.4, 24.5
 */

// Mock dependencies before importing the client
vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => '',
}));

vi.mock('@/utils/api-cache', () => ({
  fetchWithCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: ({ originalError }: { originalError: unknown }) =>
      originalError instanceof Error ? originalError : new Error(String(originalError)),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/csrfToken', () => ({
  getCsrfToken: () => 'test-csrf',
  setCsrfToken: vi.fn(),
}));

vi.mock('@/lib/errorMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/errorMessages')>();
  return { ...actual };
});

// Import after mocks
import { apiClient } from '@/services/client';
import { TIMEOUT_ERROR_MESSAGE } from '@/lib/errorMessages';

// Helper to create a mock Response
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serverErrorResponse(status = 500): Response {
  return new Response(JSON.stringify({ error: 'Server error' }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient timeout and retry', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Req 24.1 — Default 30s timeout', () => {
    it('passes an AbortSignal to fetch for timeout enforcement', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { ok: true } })
      );

      await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ test: true }),
        retries: 0,
      });

      // Verify fetch was called with a signal (AbortController for timeout)
      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(callArgs.signal).toBeDefined();
      expect(callArgs.signal).toBeInstanceOf(AbortSignal);
    });

    it('uses custom timeout when provided', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { ok: true } })
      );

      await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
        timeout: 5_000,
        retries: 0,
      });

      // Request succeeded — custom timeout was accepted
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Req 24.2 — Short timeout for health/session', () => {
    it('accepts health endpoint requests with shorter timeout', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { status: 'ok' } })
      );

      const result = await apiClient.request('/api/health?action=ping', {
        method: 'POST',
        retries: 0,
      });

      expect(result).toEqual({ status: 'ok' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('accepts session endpoint requests with shorter timeout', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { user: { id: '1' } } })
      );

      const result = await apiClient.request('/api/auth?action=session', {
        method: 'POST',
        retries: 0,
      });

      expect(result).toEqual({ user: { id: '1' } });
    });
  });

  describe('Req 24.3 — Timeout error message', () => {
    it('throws TimeoutError with correct message when request times out', async () => {
      // Simulate a timeout by having fetch reject with an AbortError
      // after the timeout controller fires
      fetchSpy.mockImplementation((_url: any, init: any) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      // Use a very short custom timeout to trigger quickly
      const requestPromise = apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
        timeout: 50, // 50ms timeout
        retries: 0,
      });

      await expect(requestPromise).rejects.toThrow(TIMEOUT_ERROR_MESSAGE);
    });

    it('timeout error has name TimeoutError', async () => {
      fetchSpy.mockImplementation((_url: any, init: any) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      try {
        await apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
          timeout: 50,
          retries: 0,
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Error).name).toBe('TimeoutError');
        expect((err as Error).message).toBe('Request timed out. Please try again.');
      }
    });
  });

  describe('Req 24.4 — Retry for network/5xx errors', () => {
    it('retries on network error and succeeds on later attempt', async () => {
      const networkError = new TypeError('Failed to fetch');

      fetchSpy
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));

      const result = await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
        retries: 2,
      });

      expect(result).toEqual({ ok: true });
      // 1 initial + 1 retry = 2 calls
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on 500 server error and succeeds', async () => {
      fetchSpy
        .mockResolvedValueOnce(serverErrorResponse(500))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { recovered: true } }));

      const result = await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
        retries: 2,
      });

      expect(result).toEqual({ recovered: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries on 502 server error', async () => {
      fetchSpy
        .mockResolvedValueOnce(serverErrorResponse(502))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }));

      const result = await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
        retries: 2,
      });

      expect(result).toEqual({ ok: true });
    });

    it('throws after exhausting all retry attempts', async () => {
      const networkError = new TypeError('Failed to fetch');

      fetchSpy
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError);

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
          retries: 2,
        })
      ).rejects.toThrow();

      // 1 initial + 2 retries = 3 calls
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('retries timeout errors', async () => {
      // First call times out, second succeeds
      let callCount = 0;
      fetchSpy.mockImplementation((_url: any, init: any) => {
        callCount++;
        if (callCount === 1) {
          return new Promise((_resolve, reject) => {
            const signal = (init as RequestInit)?.signal;
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new DOMException('The operation was aborted.', 'AbortError'));
              });
            }
          });
        }
        return Promise.resolve(jsonResponse({ success: true, data: { ok: true } }));
      });

      const result = await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
        timeout: 50, // Very short timeout to trigger quickly
        retries: 2,
      });

      expect(result).toEqual({ ok: true });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Req 24.4 — No retry for 4xx errors', () => {
    it('does not retry on 400 Bad Request', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 403 Forbidden', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 404 Not Found', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 422 Validation Error', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Validation failed' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
        })
      ).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Req 24.5 — No retry for user-aborted requests', () => {
    it('does not retry when user aborts via AbortController', async () => {
      const userAbort = new AbortController();

      fetchSpy.mockImplementation((_url: any, init: any) => {
        return new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
          // Abort after a tick
          setTimeout(() => userAbort.abort(), 10);
        });
      });

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
          signal: userAbort.signal,
        })
      ).rejects.toThrow();

      // Should NOT have retried
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Successful requests pass through', () => {
    it('returns data on first successful attempt without retrying', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ success: true, data: { id: 'abc' } })
      );

      const result = await apiClient.request('/api/applications', {
        method: 'POST',
        body: JSON.stringify({}),
      });

      expect(result).toEqual({ id: 'abc' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Custom retries option', () => {
    it('respects retries: 0 to disable retries', async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
          retries: 0,
        })
      ).rejects.toThrow();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('respects retries: 1 for single retry', async () => {
      fetchSpy
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(
        apiClient.request('/api/applications', {
          method: 'POST',
          body: JSON.stringify({}),
          retries: 1,
        })
      ).rejects.toThrow();

      // 1 initial + 1 retry = 2
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });
});
