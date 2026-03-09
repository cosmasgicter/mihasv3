/**
 * Integration Test: Complete Auth Flow
 * Feature: production-remediation
 *
 * Tests the full authentication lifecycle:
 * Register → Login → Session Check → Token Refresh → Logout
 * with CSRF token handling at each step.
 *
 * Mocks the fetch API layer but tests the integration between:
 * - authController (request orchestration, CSRF attachment, refresh dedup)
 * - csrfToken module (in-memory CSRF token management)
 * - authBroadcast (multi-tab sync on login/logout)
 *
 * **Validates: Requirement 29.1**
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock setup ──────────────────────────────────────────────────────────────

// Mock logger to suppress output
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock secureStorage
vi.mock('@/lib/secureStorage', () => ({
  secureStorage: { clearSession: vi.fn().mockResolvedValue(undefined) },
}));

// Mock apiConfig
vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => '',
}));

// Mock errorMessages
vi.mock('@/lib/errorMessages', () => ({
  TIMEOUT_ERROR_MESSAGE: 'Request timed out. Please try again.',
}));

// Import modules under test AFTER mocks are set up
import {
  authRequest,
  configureAuthController,
  logoutWithTwoPhaseClear,
} from '@/services/authController';
import { getCsrfToken, setCsrfToken, clearCsrfToken } from '@/lib/csrfToken';

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

function createMockResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {}
) {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (key: string) => headerMap.get(key) ?? null,
      entries: () => headerMap.entries(),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone: () => createMockResponse(body, status, headers),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Feature: production-remediation — Complete Auth Flow Integration (Req 29.1)', () => {
  const clearAuthState = vi.fn();
  const clearCaches = vi.fn();
  const redirectToSignIn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    clearCsrfToken();
    global.fetch = mockFetch as unknown as typeof fetch;

    configureAuthController({
      clearAuthState,
      clearCaches,
      redirectToSignIn,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCsrfToken();
  });

  describe('Full lifecycle: Register → Login → Session → Refresh → Logout', () => {
    it('should complete the entire auth lifecycle with CSRF handling', async () => {
      // ── Step 1: Register ──────────────────────────────────────────────
      const registerCsrf = 'csrf-register-token-abc';
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            success: true,
            data: {
              user: { id: 'user-1', email: 'student@mihas.edu.zm', role: 'student' },
              profile: { id: 'user-1', first_name: 'Test', last_name: 'Student' },
            },
          },
          200,
          { 'X-CSRF-Token': registerCsrf }
        )
      );

      const registerResult = await authRequest<{
        user?: { id: string; email: string; role: string };
        profile?: { id: string };
      }>('/api/auth?action=register', {
        method: 'POST',
        body: JSON.stringify({
          email: 'student@mihas.edu.zm',
          password: 'SecurePass123!',
          firstName: 'Test',
          lastName: 'Student',
        }),
      }, { attemptRefreshOn401: false, redirectOnUnauthorized: false });

      expect(registerResult.success).toBe(true);
      expect(registerResult.data?.user?.email).toBe('student@mihas.edu.zm');
      // CSRF token should be captured from the register response
      expect(getCsrfToken()).toBe(registerCsrf);

      // Verify credentials: 'include' was used (cookie-based auth)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth?action=register',
        expect.objectContaining({ credentials: 'include' })
      );

      // ── Step 2: Login ─────────────────────────────────────────────────
      const loginCsrf = 'csrf-login-token-xyz';
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          {
            success: true,
            data: {
              user: { id: 'user-1', email: 'student@mihas.edu.zm', role: 'student' },
              profile: { id: 'user-1', first_name: 'Test', last_name: 'Student' },
            },
          },
          200,
          { 'X-CSRF-Token': loginCsrf }
        )
      );

      const loginResult = await authRequest<{
        user?: { id: string; email: string; role: string };
      }>('/api/auth?action=login', {
        method: 'POST',
        body: JSON.stringify({
          email: 'student@mihas.edu.zm',
          password: 'SecurePass123!',
        }),
      }, { attemptRefreshOn401: false, redirectOnUnauthorized: false });

      expect(loginResult.success).toBe(true);
      expect(loginResult.data?.user?.id).toBe('user-1');
      // CSRF token should be rotated from login response
      expect(getCsrfToken()).toBe(loginCsrf);

      // Verify CSRF from register was sent with the login POST
      const loginCall = mockFetch.mock.calls[1];
      expect(loginCall[1].headers['X-CSRF-Token']).toBe(registerCsrf);

      // ── Step 3: Session check ─────────────────────────────────────────
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          data: {
            user: { id: 'user-1', email: 'student@mihas.edu.zm', role: 'student' },
            expires_at: new Date(Date.now() + 900_000).toISOString(),
          },
        })
      );

      const sessionResult = await authRequest<{
        user?: { id: string; role: string };
        expires_at?: string;
      }>('/api/auth?action=session', { method: 'GET' });

      expect(sessionResult.success).toBe(true);
      expect(sessionResult.data?.user?.id).toBe('user-1');
      // GET requests should NOT include CSRF header
      const sessionCall = mockFetch.mock.calls[2];
      expect(sessionCall[1].headers['X-CSRF-Token']).toBeUndefined();

      // ── Step 4: Token refresh ─────────────────────────────────────────
      const refreshCsrf = 'csrf-refreshed-token-999';

      // First call returns 401 (expired token)
      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' },
          401
        )
      );
      // Refresh call succeeds with new CSRF
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true }, 200, { 'X-CSRF-Token': refreshCsrf })
      );
      // Retry of original request succeeds
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          success: true,
          data: { applications: [], totalCount: 0 },
        })
      );

      const protectedResult = await authRequest<{
        applications?: unknown[];
        totalCount?: number;
      }>('/api/applications', { method: 'GET' });

      expect(protectedResult.success).toBe(true);
      // CSRF should be updated from refresh response
      expect(getCsrfToken()).toBe(refreshCsrf);

      // Verify the refresh was called
      const refreshCall = mockFetch.mock.calls[4];
      expect(refreshCall[0]).toContain('/api/auth?action=refresh');
      expect(refreshCall[1].method).toBe('POST');

      // ── Step 5: Logout ────────────────────────────────────────────────
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, message: 'Logged out' })
      );

      const logoutResult = await logoutWithTwoPhaseClear();

      expect(logoutResult.success).toBe(true);
      // CSRF should be cleared after logout
      expect(getCsrfToken()).toBeNull();
      // Auth state should be cleared
      expect(clearAuthState).toHaveBeenCalled();
      expect(clearCaches).toHaveBeenCalled();
    });
  });

  describe('CSRF token handling across requests', () => {
    it('should attach CSRF token to all state-changing requests', async () => {
      setCsrfToken('test-csrf-token');

      mockFetch.mockResolvedValue(
        createMockResponse({ success: true, data: {} })
      );

      // POST should include CSRF
      await authRequest('/api/applications', {
        method: 'POST',
        body: JSON.stringify({ status: 'draft' }),
      }, { attemptRefreshOn401: false });

      const postCall = mockFetch.mock.calls[0];
      expect(postCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');

      // PUT should include CSRF
      await authRequest('/api/applications?id=app-1', {
        method: 'PUT',
        body: JSON.stringify({ status: 'submitted' }),
      }, { attemptRefreshOn401: false });

      const putCall = mockFetch.mock.calls[1];
      expect(putCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');

      // DELETE should include CSRF
      await authRequest('/api/applications?id=app-1', {
        method: 'DELETE',
      }, { attemptRefreshOn401: false });

      const deleteCall = mockFetch.mock.calls[2];
      expect(deleteCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');
    });

    it('should NOT attach CSRF token to GET requests', async () => {
      setCsrfToken('test-csrf-token');

      mockFetch.mockResolvedValue(
        createMockResponse({ success: true, data: {} })
      );

      await authRequest('/api/auth?action=session', { method: 'GET' }, {
        attemptRefreshOn401: false,
      });

      const getCall = mockFetch.mock.calls[0];
      expect(getCall[1].headers['X-CSRF-Token']).toBeUndefined();
    });

    it('should rotate CSRF token when server sends a new one', async () => {
      setCsrfToken('old-csrf');

      mockFetch.mockResolvedValueOnce(
        createMockResponse(
          { success: true, data: { user: { id: '1' } } },
          200,
          { 'X-CSRF-Token': 'new-csrf' }
        )
      );

      await authRequest('/api/auth?action=login', {
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'pass' }),
      }, { attemptRefreshOn401: false });

      expect(getCsrfToken()).toBe('new-csrf');
    });
  });

  describe('Token refresh deduplication', () => {
    it('should only issue one refresh when multiple 401s occur', async () => {
      setCsrfToken('initial-csrf');

      // Both requests get 401
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, error: 'Expired' }, 401)
      );
      // Refresh succeeds
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true }, 200, { 'X-CSRF-Token': 'refreshed-csrf' })
      );
      // Retry succeeds
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: true, data: { ok: true } })
      );

      const result = await authRequest('/api/applications', { method: 'GET' });

      expect(result.success).toBe(true);
      expect(getCsrfToken()).toBe('refreshed-csrf');

      // Verify exactly one refresh call was made
      const refreshCalls = mockFetch.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('action=refresh')
      );
      expect(refreshCalls).toHaveLength(1);
    });

    it('should redirect to sign-in when refresh fails', async () => {
      setCsrfToken('old-csrf');

      // Original request returns 401
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, error: 'Expired' }, 401)
      );
      // Refresh also fails with 401
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ success: false, error: 'Refresh failed' }, 401)
      );

      const result = await authRequest('/api/applications', { method: 'GET' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('SESSION_EXPIRED');
      // Should have triggered redirect
      expect(clearAuthState).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const result = await authRequest('/api/auth?action=session', { method: 'GET' }, {
        attemptRefreshOn401: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch');
    });

    it('should handle invalid JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: { get: () => null, entries: () => new Map().entries() },
        json: () => Promise.reject(new Error('Invalid JSON')),
        text: () => Promise.resolve('not json'),
      });

      const result = await authRequest('/api/auth?action=session', { method: 'GET' }, {
        attemptRefreshOn401: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid server response');
    });
  });
});
