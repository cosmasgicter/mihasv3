/**
 * Integration Test: Admin Review Flow
 * Feature: production-remediation
 *
 * Tests the admin application review lifecycle:
 * List applications → View detail → Change status → Verify audit log → Verify notification
 *
 * Mocks the fetch API layer but tests the integration between:
 * - applicationService (list, getById, updateStatus)
 * - notificationService (send notification on status change)
 * - ApiClient (CSRF, envelope unwrapping, cache invalidation patterns)
 *
 * **Validates: Requirement 29.3**
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

vi.mock('@/utils/api-cache', () => ({
  fetchWithCache: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock('@/lib/apiErrorHandler', () => ({
  ApiErrorHandler: {
    enhanceError: vi.fn(({ originalError }) =>
      originalError instanceof Error ? originalError : new Error(String(originalError))
    ),
  },
}));

import { setCsrfToken, clearCsrfToken } from '@/lib/csrfToken';
import { fetchWithCache, invalidateCache } from '@/utils/api-cache';
import { apiClient } from '@/services/client';
import { applicationService } from '@/services/applications';
import { notificationService } from '@/services/notifications';

// ── Helpers ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

function createFetchResponse(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {}
) {
  const headerMap = new Map(
    Object.entries({ 'content-type': 'application/json', ...headers })
  );
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
    clone() {
      return createFetchResponse(body, status, headers);
    },
  };
}

// ── Sample data ─────────────────────────────────────────────────────────────

const sampleApplications = [
  {
    id: 'app-1',
    application_number: 'MIHAS-2025-0001',
    status: 'submitted',
    user_id: 'student-1',
    full_name: 'Alice Mwansa',
    program: 'Nursing',
    created_at: '2025-01-15T10:00:00Z',
  },
  {
    id: 'app-2',
    application_number: 'MIHAS-2025-0002',
    status: 'submitted',
    user_id: 'student-2',
    full_name: 'Bob Tembo',
    program: 'Pharmacy',
    created_at: '2025-01-16T09:00:00Z',
  },
];

const sampleDetail = {
  application: {
    ...sampleApplications[0],
    date_of_birth: '2000-05-10',
    phone: '+260971234567',
    email: 'alice@example.com',
    nrc_number: '123456/78/1',
  },
  documents: [
    { id: 'doc-1', type: 'nrc', status: 'pending', filename: 'nrc.pdf' },
  ],
  grades: [
    { subject: 'Mathematics', grade: 2 },
    { subject: 'English', grade: 3 },
  ],
  statusHistory: [
    {
      id: 'sh-1',
      old_status: null,
      new_status: 'draft',
      changed_by: 'student-1',
      created_at: '2025-01-15T10:00:00Z',
    },
    {
      id: 'sh-2',
      old_status: 'draft',
      new_status: 'submitted',
      changed_by: 'student-1',
      created_at: '2025-01-15T11:00:00Z',
    },
  ],
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Feature: production-remediation — Admin Review Flow Integration (Req 29.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCsrfToken();
    setCsrfToken('admin-csrf-token');
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCsrfToken();
  });

  describe('Full lifecycle: List → View → Change status → Audit → Notification', () => {
    it('should complete the admin review lifecycle', async () => {
      // ── Step 1: List applications ─────────────────────────────────────
      const mockedFetchWithCache = vi.mocked(fetchWithCache);
      mockedFetchWithCache.mockResolvedValueOnce({
        success: true,
        data: {
          applications: sampleApplications,
          totalCount: 2,
          page: 1,
          pageSize: 20,
        },
      });

      const listResult = await applicationService.list({
        status: 'submitted',
        page: 1,
        pageSize: 20,
      });

      expect(listResult).toBeDefined();
      expect(listResult!.applications).toHaveLength(2);
      expect(listResult!.totalCount).toBe(2);
      expect(listResult!.applications[0].status).toBe('submitted');

      // ── Step 2: View application detail ───────────────────────────────
      mockedFetchWithCache
        .mockResolvedValueOnce({
          success: true,
          data: { application: sampleDetail.application },
        })
        .mockResolvedValueOnce({
          success: true,
          data: sampleDetail.documents,
        })
        .mockResolvedValueOnce({
          success: true,
          data: sampleDetail.grades,
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            application: sampleDetail.application,
            status_history: sampleDetail.statusHistory,
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: [],
        });

      const detailResult = await applicationService.getById('app-1', {
        include: ['documents', 'grades', 'statusHistory'],
      });

      expect(detailResult).toBeDefined();
      expect(detailResult!.application.id).toBe('app-1');
      expect(detailResult!.documents).toHaveLength(1);
      expect(detailResult!.grades).toHaveLength(2);
      expect(detailResult!.statusHistory).toHaveLength(2);

      // ── Step 3: Change application status (approve) ───────────────────
      const approvedApp = {
        ...sampleApplications[0],
        status: 'approved',
      };

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: approvedApp,
        })
      );

      mockedFetchWithCache.mockResolvedValueOnce({
        success: true,
        data: approvedApp,
      });

      const statusResult = await applicationService.updateStatus(
        'app-1',
        'approved' as any,
        'Meets all requirements. Approved for 2025 intake.'
      );

      expect(statusResult).toBeDefined();
      expect(statusResult!.status).toBe('approved');

      // Verify CSRF token was attached to the PATCH request
      const statusCall = mockFetch.mock.calls[0];
      expect(statusCall[1].headers['X-CSRF-Token']).toBe('admin-csrf-token');
      expect(statusCall[1].credentials).toBe('include');

      // Verify the request body includes status change details
      const statusBody = JSON.parse(statusCall[1].body);
      expect(statusBody.status).toBe('approved');
      expect(statusBody.notes).toBe('Meets all requirements. Approved for 2025 intake.');

      // ── Step 4: Verify audit log entry was created ────────────────────
      // The status change API should have created an audit log entry
      // server-side. We verify by fetching the updated detail with history.
      mockedFetchWithCache
        .mockResolvedValueOnce({
          success: true,
          data: { application: approvedApp },
        })
        .mockResolvedValueOnce({
          success: true,
          data: {
            application: approvedApp,
            status_history: [
              ...sampleDetail.statusHistory,
              {
                id: 'sh-3',
                old_status: 'submitted',
                new_status: 'approved',
                changed_by: 'admin-1',
                notes: 'Meets all requirements. Approved for 2025 intake.',
                created_at: new Date().toISOString(),
              },
            ],
          },
        })
        .mockResolvedValueOnce({
          success: true,
          data: [],
        });

      const updatedDetail = await applicationService.getById('app-1', {
        include: ['statusHistory'],
      });

      expect(updatedDetail!.statusHistory).toHaveLength(3);
      const latestEntry = updatedDetail!.statusHistory![2] as {
        old_status: string;
        new_status: string;
        changed_by: string;
        notes: string;
      };
      expect(latestEntry.old_status).toBe('submitted');
      expect(latestEntry.new_status).toBe('approved');
      expect(latestEntry.changed_by).toBe('admin-1');
      expect(latestEntry.notes).toContain('Approved');

      // ── Step 5: Verify student notification was sent ──────────────────
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: { notification: { id: 'notif-1' }, email_sent: true },
        })
      );

      const notifResult = await notificationService.send({
        to: 'student-1',
        subject: 'Application Approved — MIHAS',
        message: 'Your application MIHAS-2025-0001 for Nursing has been approved.',
      });

      expect(notifResult).toBe(true);

      // Verify notification request was sent with correct payload
      const notifCall = mockFetch.mock.calls[1];
      const notifBody = JSON.parse(notifCall[1].body);
      expect(notifBody.user_id).toBe('student-1');
      expect(notifBody.title).toBe('Application Approved — MIHAS');
    });
  });

  describe('Cache invalidation after admin status change', () => {
    it('should produce correct invalidation patterns for admin mutations', () => {
      // Admin status change via REST path
      const patterns = apiClient.getQueryInvalidationPatterns(
        '/api/v1/admin/users/',
        'PATCH'
      );

      expect(patterns).toContainEqual(['admin-applications']);
      expect(patterns).toContainEqual(['admin-dashboard-polling']);
      expect(patterns).toContainEqual(['application-stats']);
    });

    it('should invalidate document caches on document upload', () => {
      const patterns = apiClient.getQueryInvalidationPatterns(
        '/api/v1/documents/upload/',
        'POST'
      );

      expect(patterns).toContainEqual(['applications']);
      expect(patterns).toContainEqual(['documents']);
    });
  });

  describe('Admin RBAC enforcement', () => {
    it('should handle 403 when student tries admin POST action', async () => {
      mockFetch.mockResolvedValueOnce(
        createFetchResponse(
          {
            success: false,
            error: "You don't have permission for this action.",
            code: 'INSUFFICIENT_PERMISSIONS',
          },
          403
        )
      );

      // Use POST (state-changing) since GET goes through fetchWithCache
      await expect(
        apiClient.request('/admin/users/', {
          method: 'POST',
          body: JSON.stringify({}),
          retries: 0,
        })
      ).rejects.toThrow();
    });

    it('should handle 403 when reviewer tries write operation', async () => {
      mockFetch.mockResolvedValueOnce(
        createFetchResponse(
          {
            success: false,
            error: 'Reviewers have read-only access.',
            code: 'INSUFFICIENT_PERMISSIONS',
          },
          403
        )
      );

      await expect(
        applicationService.updateStatus('app-1', 'approved' as any, 'Trying to approve')
      ).rejects.toThrow();
    });
  });

  describe('Admin review edge cases', () => {
    it('should handle approval of application without payment (advisory warning)', async () => {
      const mockedFetchWithCache = vi.mocked(fetchWithCache);

      // Server allows override but includes a warning
      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: {
            ...sampleApplications[0],
            status: 'approved',
            _warning: 'Application approved without completed payment.',
          },
        })
      );

      mockedFetchWithCache.mockResolvedValueOnce({
        success: true,
        data: {
          ...sampleApplications[0],
          status: 'approved',
          _warning: 'Application approved without completed payment.',
        },
      });

      const result = await applicationService.updateStatus(
        'app-1',
        'approved' as any,
        'Override: approved without payment',
        true // force flag
      );

      expect(result).toBeDefined();
      expect(result!.status).toBe('approved');

      // Verify force flag was sent
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.force).toBe(true);
    });

    it('should handle pagination correctly for large application lists', async () => {
      const mockedFetchWithCache = vi.mocked(fetchWithCache);

      // Page 1
      mockedFetchWithCache.mockResolvedValueOnce({
        success: true,
        data: {
          applications: sampleApplications,
          totalCount: 50,
          page: 1,
          pageSize: 20,
        },
      });

      const page1 = await applicationService.list({ page: 1, pageSize: 20 });
      expect(page1!.totalCount).toBe(50);
      expect(page1!.page).toBe(1);

      // Page 2
      mockedFetchWithCache.mockResolvedValueOnce({
        success: true,
        data: {
          applications: [sampleApplications[0]],
          totalCount: 50,
          page: 2,
          pageSize: 20,
        },
      });

      const page2 = await applicationService.list({ page: 2, pageSize: 20 });
      expect(page2!.page).toBe(2);
    });

    it('should handle rejection with notes', async () => {
      const mockedFetchWithCache = vi.mocked(fetchWithCache);

      mockFetch.mockResolvedValueOnce(
        createFetchResponse({
          success: true,
          data: {
            ...sampleApplications[1],
            status: 'rejected',
          },
        })
      );

      mockedFetchWithCache.mockResolvedValueOnce({
        success: true,
        data: {
          ...sampleApplications[1],
          status: 'rejected',
        },
      });

      const result = await applicationService.updateStatus(
        'app-2',
        'rejected' as any,
        'Does not meet minimum grade requirements for Pharmacy programme.'
      );

      expect(result).toBeDefined();
      expect(result!.status).toBe('rejected');

      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.notes).toContain('minimum grade requirements');
    });
  });
});
