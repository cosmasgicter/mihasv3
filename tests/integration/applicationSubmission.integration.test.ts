/**
 * Integration Test: Application Submission Flow
 * Feature: production-remediation
 *
 * Tests the full application submission lifecycle:
 * Create draft → Auto-save → Submit → Verify status change → Verify dashboard update
 *
 * Mocks the fetch API layer but tests the integration between:
 * - applicationService (CRUD operations)
 * - useApplicationSubmit hook logic (idempotency, double-submit prevention)
 * - ApiClient (envelope unwrapping, CSRF attachment, cache invalidation patterns)
 *
 * **Validates: Requirement 29.2**
 */

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock setup ──────────────────────────────────────────────────────────────

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/secureStorage', () => ({
  secureStorage: { clearSession: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/apiConfig', () => ({
  getApiBaseUrl: () => '',
}));

vi.mock('@/lib/errorMessages', () => ({
  TIMEOUT_ERROR_MESSAGE: 'Request timed out. Please try again.',
}));

// Mock the api-cache module used by ApiClient
vi.mock('@/utils/api-cache', () => ({
  fetchWithCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

// Mock the ApiErrorHandler
vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn(({ originalError }) => originalError instanceof Error ? originalError : new Error(String(originalError))),
  },
}));

import { setCsrfToken, getCsrfToken, clearCsrfToken } from '@/lib/csrfToken';
import { fetchWithCache, invalidateCache } from '@/utils/api-cache';
import { apiClient } from '@/services/client';
import { triggerSubmissionNotifications } from '@/hooks/useApplicationSubmit';

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

function createFetchResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {}
) {
  const headerMap = new Map(Object.entries({
    'content-type': 'application/json',
    ...headers,
  }));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
      entries: () => headerMap.entries(),
    },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    clone() { return createFetchResponse(body, status, headers); },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Feature: production-remediation — Application Submission Flow Integration (Req 29.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCsrfToken();
    setCsrfToken('test-csrf-token');
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCsrfToken();
  });

  describe('Create draft → Auto-save → Submit → Status change', () => {
    it('should complete the full application submission lifecycle', async () => {
      // ── Step 1: Create draft application ──────────────────────────────
      const draftApp = {
        id: 'app-uuid-1',
        application_number: 'MIHAS-2025-0001',
        status: 'draft',
        version: 1,
        user_id: 'user-1',
      };

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: draftApp,
        })
      );

      const createResult = await apiClient.request<typeof draftApp>('/api/applications', {
        method: 'POST',
        body: JSON.stringify({
          user_id: 'user-1',
          program: 'nursing',
          intake: '2025-sept',
        }),
      });

      expect(createResult).toBeDefined();
      expect(createResult!.id).toBe('app-uuid-1');
      expect(createResult!.status).toBe('draft');

      // Verify CSRF token was attached to POST
      const createCall = mockFetch.mock.calls[0];
      expect(createCall[1].headers['X-CSRF-Token']).toBe('test-csrf-token');
      expect(createCall[1].credentials).toBe('include');

      // ── Step 2: Auto-save with version ────────────────────────────────
      const savedApp = { ...draftApp, version: 2, full_name: 'Test Student' };

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: savedApp,
        })
      );

      const saveResult = await apiClient.request<typeof savedApp>(
        '/api/applications?id=app-uuid-1',
        {
          method: 'PUT',
          body: JSON.stringify({
            full_name: 'Test Student',
            version: 2,
          }),
        }
      );

      expect(saveResult).toBeDefined();
      expect(saveResult!.version).toBe(2);
      expect(saveResult!.full_name).toBe('Test Student');

      // ── Step 3: Auto-save version conflict (409) ──────────────────────
      mockFetch.mockResolvedValueOnce(
        createFetchResponse(
          {
            success: false,
            error: 'Version conflict — a newer version exists',
            code: 'VERSION_CONFLICT',
          },
          409
        )
      );

      await expect(
        apiClient.request('/api/applications?id=app-uuid-1', {
          method: 'PUT',
          body: JSON.stringify({ full_name: 'Stale Data', version: 1 }),
          retries: 0,
        })
      ).rejects.toThrow();

      // ── Step 4: Submit application ────────────────────────────────────
      const submittedApp = {
        ...savedApp,
        status: 'submitted',
        version: 3,
        submitted_at: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: submittedApp,
        })
      );

      const submitResult = await apiClient.request<typeof submittedApp>(
        '/api/applications?id=app-uuid-1',
        {
          method: 'PUT',
          body: JSON.stringify({
            status: 'submitted',
            submitted_at: new Date().toISOString(),
            payment_method: 'MTN Money',
            amount: 153,
          }),
          headers: {
            'X-Idempotency-Key': 'idem-key-abc-123',
          },
        }
      );

      expect(submitResult).toBeDefined();
      expect(submitResult!.status).toBe('submitted');

      // Verify idempotency key was sent
      const submitCall = mockFetch.mock.calls[3];
      expect(submitCall[1].headers['X-Idempotency-Key']).toBe('idem-key-abc-123');

      // ── Step 5: Verify dashboard reflects new status ──────────────────
      // Simulate the dashboard polling query that would follow
      const mockedFetchWithCache = vi.mocked(fetchWithCache);
      mockedFetchWithCache.mockResolvedValueOnce({
        applications: [
          { id: 'app-uuid-1', status: 'submitted', application_number: 'MIHAS-2025-0001' },
        ],
        totalCount: 1,
      });

      const dashboardResult = await apiClient.request<{
        applications: Array<{ id: string; status: string }>;
        totalCount: number;
      }>('/api/applications');

      expect(dashboardResult).toBeDefined();
      expect(dashboardResult!.applications[0].status).toBe('submitted');
      expect(dashboardResult!.totalCount).toBe(1);
    });
  });

  describe('Idempotency key handling', () => {
    it('should return same response for duplicate submission with same idempotency key', async () => {
      const submittedApp = {
        id: 'app-uuid-2',
        status: 'submitted',
        application_number: 'MIHAS-2025-0002',
      };

      // First submission
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ success: true, data: submittedApp })
      );

      const first = await apiClient.request<typeof submittedApp>(
        '/api/applications?id=app-uuid-2',
        {
          method: 'PUT',
          body: JSON.stringify({ status: 'submitted' }),
          headers: { 'X-Idempotency-Key': 'same-key' },
        }
      );

      // Duplicate submission with same key — server returns cached response
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ success: true, data: submittedApp })
      );

      const second = await apiClient.request<typeof submittedApp>(
        '/api/applications?id=app-uuid-2',
        {
          method: 'PUT',
          body: JSON.stringify({ status: 'submitted' }),
          headers: { 'X-Idempotency-Key': 'same-key' },
        }
      );

      // Both should return the same application data
      expect(first!.id).toBe(second!.id);
      expect(first!.status).toBe(second!.status);
    });
  });

  describe('Cache invalidation after submission', () => {
    it('should produce correct invalidation patterns for application mutations', () => {
      // Application submit (student-side)
      const submitPatterns = apiClient.getQueryInvalidationPatterns(
        '/api/applications?id=app-1',
        'PUT'
      );

      expect(submitPatterns).toContainEqual(['applications']);
      expect(submitPatterns).toContainEqual(['student-dashboard-polling']);
      expect(submitPatterns).toContainEqual(['application-stats']);
      expect(submitPatterns).toContainEqual(['applications', 'app-1']);
    });

    it('should NOT invalidate data caches on token refresh', () => {
      const refreshPatterns = apiClient.getQueryInvalidationPatterns(
        '/api/auth?action=refresh',
        'POST'
      );

      expect(refreshPatterns).toHaveLength(0);
    });

    it('should NOT invalidate on login/logout (handled by queryClient.clear)', () => {
      const loginPatterns = apiClient.getQueryInvalidationPatterns(
        '/api/auth?action=login',
        'POST'
      );
      const logoutPatterns = apiClient.getQueryInvalidationPatterns(
        '/api/auth?action=logout',
        'POST'
      );

      expect(loginPatterns).toHaveLength(0);
      expect(logoutPatterns).toHaveLength(0);
    });
  });

  describe('Submission notification triggering', () => {
    it('should trigger notifications after successful submission', async () => {
      // Mock the notification service calls
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ success: true, data: { notification: { id: 'n-1' } } })
      );
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({ success: true, data: { id: 'email-1' } })
      );

      const result = await triggerSubmissionNotifications({
        applicationId: 'app-uuid-1',
        userId: 'user-1',
        email: 'student@mihas.edu.zm',
        fullName: 'Test Student',
        applicationNumber: 'MIHAS-2025-0001',
        program: 'Nursing',
      });

      // Notifications should succeed (or at least not throw)
      expect(result.success).toBe(true);
    });

    it('should handle notification failures gracefully without failing submission', async () => {
      // Both notification calls fail
      mockFetch.mockRejectedValueOnce(new Error('Notification service down'));
      mockFetch.mockRejectedValueOnce(new Error('Email service down'));

      const result = await triggerSubmissionNotifications({
        applicationId: 'app-uuid-1',
        userId: 'user-1',
        email: 'student@mihas.edu.zm',
        fullName: 'Test Student',
        applicationNumber: 'MIHAS-2025-0001',
        program: 'Nursing',
      });

      // Should not throw — notifications are non-blocking
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('API envelope unwrapping', () => {
    it('should unwrap { success: true, data: payload } envelope', async () => {
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: { id: 'app-1', status: 'draft' },
        })
      );

      const result = await apiClient.request<{ id: string; status: string }>(
        '/api/applications?id=app-1',
        { method: 'PUT', body: JSON.stringify({ status: 'draft' }), retries: 0 }
      );

      // Should receive the inner payload directly, not the envelope
      expect(result).toEqual({ id: 'app-1', status: 'draft' });
    });
  });
});
