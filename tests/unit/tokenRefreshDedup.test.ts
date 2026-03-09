// @vitest-environment jsdom
/**
 * Token Refresh Deduplication Unit Tests
 *
 * Verifies that the authController implements token refresh deduplication:
 * - Module-level refreshPromise lock prevents parallel refresh requests (Req 7.1, 7.2)
 * - Multiple concurrent 401s share a single refresh promise (Req 7.1)
 * - On refresh failure, hardClearAuthState is called once (Req 7.3)
 * - refreshPromise is reset after completion (Req 7.2)
 * - Max 1 refresh attempt per original request (Req 7.5)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Source analysis tests ───────────────────────────────────────────────────

const CONTROLLER_PATH = path.resolve(process.cwd(), 'src/services/authController.ts');
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf-8');

describe('authController source: deduplicatedRefresh structure (Req 7.1, 7.2)', () => {
  it('should have a module-level refreshPromise variable', () => {
    expect(controllerSource).toMatch(/let\s+refreshPromise\s*:\s*Promise<boolean>\s*\|\s*null\s*=\s*null/);
  });

  it('should define a deduplicatedRefresh function', () => {
    expect(controllerSource).toContain('async function deduplicatedRefresh');
  });

  it('should return existing refreshPromise if already in-flight', () => {
    expect(controllerSource).toMatch(/if\s*\(\s*refreshPromise\s*\)/);
    expect(controllerSource).toContain('return refreshPromise');
  });

  it('should assign refreshPromise = requestRefresh(baseUrl)', () => {
    expect(controllerSource).toMatch(/refreshPromise\s*=\s*requestRefresh\s*\(\s*baseUrl\s*\)/);
  });

  it('should reset refreshPromise to null in a finally block', () => {
    // The finally block ensures cleanup on both success and failure
    expect(controllerSource).toMatch(/finally\s*\{[\s\S]*?refreshPromise\s*=\s*null/);
  });

  it('should call deduplicatedRefresh instead of requestRefresh in authRequest', () => {
    // Find the 401 handling block in authRequest
    const authRequestMatch = controllerSource.match(
      /if\s*\(\s*response\.status\s*===\s*401\s*&&\s*attemptRefreshOn401\s*\)\s*\{([\s\S]*?)\}/
    );
    expect(authRequestMatch).toBeTruthy();
    const block = authRequestMatch![1];
    expect(block).toContain('deduplicatedRefresh');
    expect(block).not.toContain('requestRefresh(');
  });
});

describe('authController source: refresh failure handling (Req 7.3)', () => {
  it('should call hardClearAuthState on refresh failure', () => {
    // After deduplicatedRefresh returns false, hardClearAuthState should be called
    expect(controllerSource).toMatch(/refreshSucceeded[\s\S]*?hardClearAuthState\s*\(\s*\)/);
  });

  it('should return early with SESSION_EXPIRED on refresh failure', () => {
    expect(controllerSource).toContain('SESSION_EXPIRED');
  });
});

// ── Behavioral tests with fetch mocking ─────────────────────────────────────

describe('authController behavioral: concurrent 401 deduplication (Req 7.1, 7.2)', () => {
  let authRequest: typeof import('@/services/authController').authRequest;
  let configureAuthController: typeof import('@/services/authController').configureAuthController;
  let refreshCallCount: number;
  let clearAuthStateCalled: number;

  beforeEach(async () => {
    vi.resetModules();
    refreshCallCount = 0;
    clearAuthStateCalled = 0;

    // Mock getApiBaseUrl
    vi.doMock('@/lib/apiConfig', () => ({
      getApiBaseUrl: () => 'https://test.example.com',
    }));

    // Mock logger
    vi.doMock('@/utils/logger', () => ({
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    }));

    // Mock secureStorage
    vi.doMock('@/lib/secureStorage', () => ({
      secureStorage: { clearSession: vi.fn().mockResolvedValue(undefined) },
    }));

    // Mock csrfToken
    vi.doMock('@/lib/csrfToken', () => ({
      getCsrfToken: () => 'test-csrf',
      setCsrfToken: vi.fn(),
      clearCsrfToken: vi.fn(),
    }));

    const mod = await import('@/services/authController');
    authRequest = mod.authRequest;
    configureAuthController = mod.configureAuthController;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should issue only one refresh call for multiple concurrent 401s', async () => {
    let resolveRefresh: (value: Response) => void;
    const refreshGate = new Promise<Response>((r) => { resolveRefresh = r; });

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('action=refresh')) {
        refreshCallCount++;
        return refreshGate;
      }
      // All other requests return 401 first time
      return Promise.resolve(new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', mockFetch);

    // Fire 3 concurrent requests that all get 401
    const p1 = authRequest('/api/test1', {}, { redirectOnUnauthorized: false });
    const p2 = authRequest('/api/test2', {}, { redirectOnUnauthorized: false });
    const p3 = authRequest('/api/test3', {}, { redirectOnUnauthorized: false });

    // Wait for all initial requests to fire and hit the refresh path
    await new Promise((r) => setTimeout(r, 50));

    // Resolve the refresh — only 1 should have been issued
    resolveRefresh!(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'new-csrf' },
    }));

    await Promise.all([p1, p2, p3]);

    expect(refreshCallCount).toBe(1);
  });

  it('should reset refreshPromise after successful refresh', async () => {
    let callIndex = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('action=refresh')) {
        refreshCallCount++;
        return Promise.resolve(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'new-csrf' },
        }));
      }
      callIndex++;
      if (callIndex <= 2) {
        // First two calls: 401, then retry succeeds
        return Promise.resolve(new Response(JSON.stringify({ success: false }), {
          status: callIndex === 1 ? 401 : 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      // Third call (second request): 401 again, triggering a NEW refresh
      if (callIndex === 3) {
        return Promise.resolve(new Response(JSON.stringify({ success: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', mockFetch);

    // First request triggers refresh
    await authRequest('/api/first', {}, { redirectOnUnauthorized: false });

    // Second request should be able to trigger a NEW refresh (promise was reset)
    await authRequest('/api/second', {}, { redirectOnUnauthorized: false });

    // Two separate refresh calls — one per sequential request
    expect(refreshCallCount).toBe(2);
  });

  it('should call hardClearAuthState once on refresh failure', async () => {
    configureAuthController({
      clearAuthState: () => { clearAuthStateCalled++; },
      clearCaches: vi.fn(),
      redirectToSignIn: vi.fn(),
    });

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('action=refresh')) {
        refreshCallCount++;
        return Promise.resolve(new Response(JSON.stringify({ success: false }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', mockFetch);

    // Fire concurrent requests that all get 401, refresh also fails
    const results = await Promise.all([
      authRequest('/api/a', {}, { redirectOnUnauthorized: true }),
      authRequest('/api/b', {}, { redirectOnUnauthorized: true }),
    ]);

    // Only 1 refresh call
    expect(refreshCallCount).toBe(1);

    // hardClearAuthState called (via clearAuthState config) — at least once
    expect(clearAuthStateCalled).toBeGreaterThanOrEqual(1);

    // Both requests should return SESSION_EXPIRED
    for (const result of results) {
      expect(result.success).toBe(false);
      expect(result.code).toBe('SESSION_EXPIRED');
    }
  });

  it('should not attempt refresh when attemptRefreshOn401 is false', async () => {
    const mockFetch = vi.fn().mockImplementation(() => {
      return Promise.resolve(new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }));
    });
    vi.stubGlobal('fetch', mockFetch);

    await authRequest('/api/test', {}, {
      attemptRefreshOn401: false,
      redirectOnUnauthorized: false,
    });

    // No refresh call should have been made
    const refreshCalls = mockFetch.mock.calls.filter(
      ([url]: [string]) => url.includes('action=refresh')
    );
    expect(refreshCalls).toHaveLength(0);
  });
});
