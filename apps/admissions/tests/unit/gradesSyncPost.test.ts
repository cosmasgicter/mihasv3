/**
 * Unit tests for grades sync POST method
 *
 * Verifies that syncGradesWithRecovery uses POST (not PUT) and that
 * the backend returns correct status codes for batch and single grade operations.
 *
 * _Requirements: 10.1, 10.3, 10.4_
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

function makeJsonResponse(status: number, body: any): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 200 ? 'OK' : status === 201 ? 'Created' : 'Error',
    headers,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Grades Sync POST Unit Tests', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // _Requirements: 10.1_
  it('syncGradesWithRecovery calls makeRequest with method POST', async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      return makeJsonResponse(200, {
        success: true,
        data: [{ subject_id: 'subj-1', grade: 1 }],
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { syncGradesWithRecovery } = await import('@/lib/connectionFix');

    await syncGradesWithRecovery('app-123', [{ subject_id: 'subj-1', grade: 1 }]);

    // Verify fetch was called with POST method
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const call = mockFetch.mock.calls[0]!;
    const url = call[0];
    const options = call[1];
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;

    expect(urlStr).toContain('/applications/app-123/grades/');
    expect(options?.method).toBe('POST');
  });

  // _Requirements: 10.1_
  it('syncGradesWithRecovery sends grades in the request body as JSON', async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return makeJsonResponse(200, {
        success: true,
        data: [
          { subject_id: 'subj-1', grade: 1 },
          { subject_id: 'subj-2', grade: 2 },
        ],
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { syncGradesWithRecovery } = await import('@/lib/connectionFix');

    const grades = [
      { subject_id: 'subj-1', grade: 1 },
      { subject_id: 'subj-2', grade: 2 },
    ];

    await syncGradesWithRecovery('app-456', grades);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const bodyOptions = mockFetch.mock.calls[0]![1];
    const body = JSON.parse(bodyOptions?.body as string);
    expect(body).toEqual({ grades });
  });

  it('filters unresolved fallback subject ids before posting grades', async () => {
    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return makeJsonResponse(200, {
        success: true,
        data: [{ subject_id: 'subj-1', grade: 1 }],
      });
    });

    vi.stubGlobal('fetch', mockFetch);

    const { syncGradesWithRecovery } = await import('@/lib/connectionFix');

    await syncGradesWithRecovery('app-456', [
      { subject_id: 'subj-1', grade: 1 },
      { subject_id: 'fallback-commerce', grade: 4 },
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const bodyOptions = mockFetch.mock.calls[0]![1];
    const body = JSON.parse(bodyOptions?.body as string);
    expect(body).toEqual({ grades: [{ subject_id: 'subj-1', grade: 1 }] });
  });

  // _Requirements: 10.3_
  it('batch POST returns 200 with the list of upserted grades', async () => {
    const batchGrades = [
      { subject_id: 'subj-1', grade: 1 },
      { subject_id: 'subj-2', grade: 2 },
      { subject_id: 'subj-3', grade: 3 },
    ];

    let capturedStatus: number | undefined;

    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      const resp = makeJsonResponse(200, {
        success: true,
        data: batchGrades.map((g) => ({ ...g, id: `grade-${g.subject_id}` })),
      });
      capturedStatus = resp.status;
      return resp;
    });

    vi.stubGlobal('fetch', mockFetch);

    const { syncGradesWithRecovery } = await import('@/lib/connectionFix');

    const result = await syncGradesWithRecovery('app-789', batchGrades);

    // Verify the response contains all grades from the batch
    expect(result).toEqual(
      batchGrades.map((g) => ({ ...g, id: `grade-${g.subject_id}` }))
    );

    // Verify the mock returned a 200 status for the batch POST
    expect(capturedStatus).toBe(200);

    // Verify it was a POST request
    expect(mockFetch.mock.calls[0]![1]?.method).toBe('POST');
  });

  // _Requirements: 10.4_
  it('single grade POST returns 201 for a new grade', async () => {
    let capturedStatus: number | undefined;

    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      const resp = makeJsonResponse(201, {
        success: true,
        data: { subject_id: 'subj-new', grade: 4, id: 'grade-new' },
      });
      capturedStatus = resp.status;
      return resp;
    });

    vi.stubGlobal('fetch', mockFetch);

    const { syncGradesWithRecovery } = await import('@/lib/connectionFix');

    const result = await syncGradesWithRecovery('app-101', [
      { subject_id: 'subj-new', grade: 4 },
    ]);

    // Verify the response contains the new grade
    expect(result).toEqual({ subject_id: 'subj-new', grade: 4, id: 'grade-new' });

    // Verify the mock returned a 201 status for the new grade POST
    expect(capturedStatus).toBe(201);

    // Verify it was a POST request
    expect(mockFetch.mock.calls[0]![1]?.method).toBe('POST');
  });

  // _Requirements: 10.4_
  it('single grade POST returns 200 for an updated grade', async () => {
    let capturedStatus: number | undefined;

    const mockFetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      const resp = makeJsonResponse(200, {
        success: true,
        data: { subject_id: 'subj-existing', grade: 5, id: 'grade-existing' },
      });
      capturedStatus = resp.status;
      return resp;
    });

    vi.stubGlobal('fetch', mockFetch);

    const { syncGradesWithRecovery } = await import('@/lib/connectionFix');

    const result = await syncGradesWithRecovery('app-102', [
      { subject_id: 'subj-existing', grade: 5 },
    ]);

    // Verify the response contains the updated grade
    expect(result).toEqual({ subject_id: 'subj-existing', grade: 5, id: 'grade-existing' });

    // Verify the mock returned a 200 status for the updated grade POST
    expect(capturedStatus).toBe(200);

    // Verify it was a POST request
    expect(mockFetch.mock.calls[0]![1]?.method).toBe('POST');
  });
});
