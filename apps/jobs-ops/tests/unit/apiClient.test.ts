import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// The API client reads env.apiBaseUrl at call time, so we mock the module
vi.mock('@/lib/env', () => ({
  env: { apiBaseUrl: 'http://localhost:8000' },
}));

const BASE = 'http://localhost:8000';

// We need to dynamically import the client AFTER the mock is in place,
// and re-import between tests to reset module-level state (csrfToken, refreshPromise, etc.)
async function loadClient() {
  // Reset module registry so we get fresh module-level state
  vi.resetModules();
  // Re-apply the mock after resetModules
  vi.doMock('@/lib/env', () => ({
    env: { apiBaseUrl: 'http://localhost:8000' },
  }));
  const mod = await import('@/services/api/client');
  return mod;
}

// ---------------------------------------------------------------------------
// MSW server — handlers are set per-test via server.use()
// ---------------------------------------------------------------------------
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('API client — 401 refresh and retry', () => {
  it('retries the original request after a successful token refresh', async () => {
    const client = await loadClient();
    let callCount = 0;

    server.use(
      // First call to /api/v1/test/ returns 401
      http.get(`${BASE}/api/v1/test/`, () => {
        callCount += 1;
        if (callCount === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Second call (retry) succeeds
        return HttpResponse.json({ success: true, data: { id: 1 } });
      }),
      // Refresh endpoint succeeds
      http.post(`${BASE}/api/v1/auth/refresh/`, () => {
        return HttpResponse.json({ success: true }, {
          headers: { 'X-CSRF-Token': 'new-csrf-after-refresh' },
        });
      }),
    );

    const result = await client.apiClient.get<{ id: number }>('/api/v1/test/');
    expect(result).toEqual({ id: 1 });
    expect(callCount).toBe(2);
    // CSRF token should have been updated from the refresh response
    expect(client.getCsrfToken()).toBe('new-csrf-after-refresh');
  });

  it('calls onAuthFailure and throws when refresh fails', async () => {
    const client = await loadClient();
    const authFailureSpy = vi.fn();
    client.configureAuthFailure(authFailureSpy);

    server.use(
      http.get(`${BASE}/api/v1/protected/`, () => {
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }),
      http.post(`${BASE}/api/v1/auth/refresh/`, () => {
        return HttpResponse.json({ error: 'TOKEN_EXPIRED' }, { status: 401 });
      }),
    );

    await expect(client.apiClient.get('/api/v1/protected/')).rejects.toThrow('Session expired');
    expect(authFailureSpy).toHaveBeenCalledOnce();
  });
});

describe('API client — concurrent 401 deduplication', () => {
  it('deduplicates refresh calls when multiple requests get 401', async () => {
    const client = await loadClient();
    let refreshCallCount = 0;
    let testCallCounts: Record<string, number> = { a: 0, b: 0 };

    server.use(
      http.get(`${BASE}/api/v1/resource-a/`, () => {
        testCallCounts.a += 1;
        if (testCallCounts.a === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: { name: 'a' } });
      }),
      http.get(`${BASE}/api/v1/resource-b/`, () => {
        testCallCounts.b += 1;
        if (testCallCounts.b === 1) {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return HttpResponse.json({ success: true, data: { name: 'b' } });
      }),
      http.post(`${BASE}/api/v1/auth/refresh/`, () => {
        refreshCallCount += 1;
        return HttpResponse.json({ success: true });
      }),
    );

    const [resultA, resultB] = await Promise.all([
      client.apiClient.get<{ name: string }>('/api/v1/resource-a/'),
      client.apiClient.get<{ name: string }>('/api/v1/resource-b/'),
    ]);

    expect(resultA).toEqual({ name: 'a' });
    expect(resultB).toEqual({ name: 'b' });
    // Only one refresh call should have been made despite two 401s
    expect(refreshCallCount).toBe(1);
  });
});

describe('API client — CSRF token management', () => {
  it('captures CSRF token from response headers', async () => {
    const client = await loadClient();

    server.use(
      http.get(`${BASE}/api/v1/session/`, () => {
        return HttpResponse.json(
          { success: true, data: { authenticated: true } },
          { headers: { 'X-CSRF-Token': 'captured-csrf-token' } },
        );
      }),
    );

    await client.apiClient.get('/api/v1/session/');
    expect(client.getCsrfToken()).toBe('captured-csrf-token');
  });

  it('includes CSRF token in state-changing requests', async () => {
    const client = await loadClient();
    client.setCsrfToken('my-csrf-token');
    let capturedHeaders: Record<string, string> = {};

    server.use(
      http.post(`${BASE}/api/v1/actions/`, ({ request }) => {
        capturedHeaders['x-csrf-token'] = request.headers.get('X-CSRF-Token') ?? '';
        return HttpResponse.json({ success: true, data: { ok: true } });
      }),
    );

    await client.apiClient.post('/api/v1/actions/', { action: 'test' });
    expect(capturedHeaders['x-csrf-token']).toBe('my-csrf-token');
  });

  it('clears CSRF token via clearCsrfToken()', async () => {
    const client = await loadClient();
    client.setCsrfToken('some-token');
    expect(client.getCsrfToken()).toBe('some-token');
    client.clearCsrfToken();
    expect(client.getCsrfToken()).toBeNull();
  });
});

describe('API client — 403 CSRF recovery flow', () => {
  it('recovers from 403 CSRF error by fetching a fresh token and retrying', async () => {
    const client = await loadClient();
    client.setCsrfToken('stale-csrf');
    let postCallCount = 0;

    server.use(
      http.post(`${BASE}/api/v1/submit/`, () => {
        postCallCount += 1;
        if (postCallCount === 1) {
          return HttpResponse.json(
            { error: 'CSRF token invalid', code: 'CSRF_INVALID' },
            { status: 403 },
          );
        }
        // Retry succeeds
        return HttpResponse.json({ success: true, data: { submitted: true } });
      }),
      // CSRF recovery endpoint
      http.get(`${BASE}/api/v1/auth/session/`, () => {
        return HttpResponse.json(
          { success: true, data: { authenticated: true } },
          { headers: { 'X-CSRF-Token': 'fresh-csrf-token' } },
        );
      }),
    );

    const result = await client.apiClient.post<{ submitted: boolean }>('/api/v1/submit/', { data: 'test' });
    expect(result).toEqual({ submitted: true });
    expect(postCallCount).toBe(2);
    expect(client.getCsrfToken()).toBe('fresh-csrf-token');
  });

  it('does not attempt CSRF recovery for GET requests', async () => {
    const client = await loadClient();
    let recoveryAttempted = false;

    server.use(
      http.get(`${BASE}/api/v1/data/`, () => {
        return HttpResponse.json(
          { error: 'CSRF token invalid', code: 'CSRF_INVALID' },
          { status: 403 },
        );
      }),
      http.get(`${BASE}/api/v1/auth/session/`, () => {
        recoveryAttempted = true;
        return HttpResponse.json(
          { success: true, data: {} },
          { headers: { 'X-CSRF-Token': 'fresh' } },
        );
      }),
    );

    await expect(client.apiClient.get('/api/v1/data/')).rejects.toThrow();
    expect(recoveryAttempted).toBe(false);
  });
});

describe('API client — envelope unwrapping', () => {
  it('extracts data field from successful envelope response', async () => {
    const client = await loadClient();

    server.use(
      http.get(`${BASE}/api/v1/items/`, () => {
        return HttpResponse.json({
          success: true,
          data: [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }],
        });
      }),
    );

    const result = await client.apiClient.get<Array<{ id: number; name: string }>>('/api/v1/items/');
    expect(result).toEqual([
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' },
    ]);
  });

  it('throws ApiRequestError when envelope indicates failure', async () => {
    const client = await loadClient();

    server.use(
      http.get(`${BASE}/api/v1/failing/`, () => {
        return HttpResponse.json({
          success: false,
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
        });
      }),
    );

    try {
      await client.apiClient.get('/api/v1/failing/');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(client.ApiRequestError);
      const apiErr = err as InstanceType<typeof client.ApiRequestError>;
      expect(apiErr.message).toBe('Validation failed');
      expect(apiErr.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns raw payload when response is not an envelope', async () => {
    const client = await loadClient();

    server.use(
      http.get(`${BASE}/api/v1/raw/`, () => {
        return HttpResponse.json({ items: [1, 2, 3] });
      }),
    );

    const result = await client.apiClient.get<{ items: number[] }>('/api/v1/raw/');
    expect(result).toEqual({ items: [1, 2, 3] });
  });
});
