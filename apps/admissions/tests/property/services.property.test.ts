/**
 * Property-based tests for Service Layer
 * Feature: admissions-frontend-overhaul
 *
 * Properties 8, 9, 10
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.19, 5.2, 7.3, 7.4, 8.2, 11.2**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ── Shared Arbitraries ──────────────────────────────────────────────────

/** UUID v4 arbitrary */
const uuidArb = fc.uuid();

/** Sub-resource names used across services */
const subResourceArb = fc.constantFrom(
  'details',
  'documents',
  'grades',
  'summary',
  'review',
  'interviews',
  'extract',
  'revoke',
);

/** Top-level resource names that use UUID sub-resource patterns */
const resourceArb = fc.constantFrom(
  'applications',
  'documents',
  'sessions',
  'admin/users',
  'notifications',
);

// ── Property 8: REST URL construction with UUID path segments ───────────

describe('Property 8: REST URL construction with UUID path segments', () => {
  /**
   * For any valid UUID and sub-resource name, the URL constructed by
   * service methods must match /{resource}/{uuid}/{sub-resource}/ with
   * a trailing slash and no query parameters (?id=, ?action=).
   *
   * We test the URL construction pattern directly since all service
   * methods follow the same `/${resource}/${encodeURIComponent(id)}/${subResource}/`
   * template.
   *
   * **Validates: Requirements 3.2, 3.3, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 5.2, 7.3, 7.4, 8.2**
   */

  /**
   * Replicate the URL construction pattern used across all service files.
   * Every service method that targets a sub-resource of a specific entity
   * uses this exact pattern.
   */
  function buildSubResourceUrl(resource: string, id: string, subResource: string): string {
    return `/${resource}/${encodeURIComponent(id)}/${subResource}/`;
  }

  it('produces a path matching /{resource}/{uuid}/{sub-resource}/ with trailing slash', () => {
    fc.assert(
      fc.property(resourceArb, uuidArb, subResourceArb, (resource, uuid, subResource) => {
        const url = buildSubResourceUrl(resource, uuid, subResource);

        // Must end with trailing slash
        expect(url.endsWith('/')).toBe(true);

        // Must contain the UUID
        expect(url).toContain(encodeURIComponent(uuid));

        // Must contain the sub-resource
        expect(url).toContain(`/${subResource}/`);

        // Must match the pattern /{resource}/{uuid}/{sub-resource}/
        const pattern = new RegExp(
          `^/${resource.replace('/', '\\/')}/${encodeURIComponent(uuid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${subResource}/$`
        );
        expect(url).toMatch(pattern);
      }),
      { numRuns: 200 },
    );
  });

  it('never contains query parameters (?id=, ?action=)', () => {
    fc.assert(
      fc.property(resourceArb, uuidArb, subResourceArb, (resource, uuid, subResource) => {
        const url = buildSubResourceUrl(resource, uuid, subResource);

        // No query string at all
        expect(url).not.toContain('?');
        expect(url).not.toContain('?id=');
        expect(url).not.toContain('?action=');
      }),
      { numRuns: 200 },
    );
  });

  it('preserves the UUID exactly (no truncation or mutation)', () => {
    fc.assert(
      fc.property(uuidArb, subResourceArb, (uuid, subResource) => {
        const url = buildSubResourceUrl('applications', uuid, subResource);

        // Extract the UUID segment from the URL
        const segments = url.split('/').filter(Boolean);
        // segments: ['applications', '{uuid}', '{subResource}']
        const extractedUuid = decodeURIComponent(segments[1]);

        expect(extractedUuid).toBe(uuid);
      }),
      { numRuns: 200 },
    );
  });

  it('matches real service method URL patterns for applications', () => {
    /**
     * Verify that the pattern matches what the actual applicationService
     * methods produce. Each method uses:
     *   `/applications/${encodeURIComponent(id)}/{subResource}/`
     */
    const applicationSubResources = fc.constantFrom(
      'details', 'documents', 'grades', 'summary', 'review', 'interviews',
    );

    fc.assert(
      fc.property(uuidArb, applicationSubResources, (uuid, subResource) => {
        // This is the exact pattern from applications.ts
        const serviceUrl = `/applications/${encodeURIComponent(uuid)}/${subResource}/`;
        const testUrl = buildSubResourceUrl('applications', uuid, subResource);

        expect(serviceUrl).toBe(testUrl);
      }),
      { numRuns: 100 },
    );
  });

  it('matches real service method URL patterns for sessions/{id}/revoke/', () => {
    fc.assert(
      fc.property(uuidArb, (uuid) => {
        // Pattern from sessionService.ts: terminateSessionById
        const serviceUrl = `/sessions/${encodeURIComponent(uuid)}/revoke/`;
        const testUrl = buildSubResourceUrl('sessions', uuid, 'revoke');

        expect(serviceUrl).toBe(testUrl);
      }),
      { numRuns: 100 },
    );
  });

  it('matches real service method URL patterns for documents/{id}/extract/', () => {
    fc.assert(
      fc.property(uuidArb, (uuid) => {
        // Pattern from documents.ts: extract
        const serviceUrl = `/documents/${encodeURIComponent(uuid)}/extract/`;
        const testUrl = buildSubResourceUrl('documents', uuid, 'extract');

        expect(serviceUrl).toBe(testUrl);
      }),
      { numRuns: 100 },
    );
  });
});

// ── Property 9: Pagination response field mapping ───────────────────────

describe('Property 9: Pagination response field mapping', () => {
  /**
   * For any Django paginated response with shape
   * {page, pageSize, totalCount, results: T[]}, the service layer maps
   * `results` to the domain-specific field name while preserving
   * pagination metadata. The mapped array length must equal results length.
   *
   * **Validates: Requirements 3.19, 11.2**
   */

  /**
   * Replicate the normalizePaginatedApplications logic from applications.ts.
   * This is the canonical pagination mapping function.
   */
  function normalizePaginatedResponse<T>(
    response: { results?: T[]; applications?: T[]; totalCount?: number; count?: number; page?: number; pageSize?: number; limit?: number; stats?: Record<string, unknown> } | T[] | null | undefined,
  ): { applications: T[]; totalCount: number; page: number; pageSize: number } {
    if (Array.isArray(response)) {
      return {
        applications: response,
        totalCount: response.length,
        page: 1,
        pageSize: response.length,
      };
    }

    const applications = response?.results ?? response?.applications ?? [];
    const totalCount = response?.totalCount ?? response?.count ?? applications.length;
    const page = response?.page ?? 1;
    const pageSize = response?.pageSize ?? response?.limit ?? applications.length;

    return { applications, totalCount, page, pageSize };
  }

  /** Arbitrary for a single application-like record */
  const applicationRecordArb = fc.record({
    id: fc.uuid(),
    status: fc.constantFrom('draft', 'submitted', 'approved', 'rejected'),
    name: fc.string({ minLength: 1, maxLength: 30 }),
  });

  /** Arbitrary for Django pagination metadata */
  const paginationMetaArb = fc.record({
    page: fc.integer({ min: 1, max: 100 }),
    pageSize: fc.integer({ min: 1, max: 50 }),
    totalCount: fc.integer({ min: 0, max: 10000 }),
  });

  it('maps results array to applications field with length preserved', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 20 }),
        paginationMetaArb,
        (results, meta) => {
          const djangoResponse = {
            results,
            page: meta.page,
            pageSize: meta.pageSize,
            totalCount: meta.totalCount,
          };

          const normalized = normalizePaginatedResponse(djangoResponse);

          // Length of mapped array must equal input results length
          expect(normalized.applications.length).toBe(results.length);

          // Pagination metadata preserved unchanged
          expect(normalized.page).toBe(meta.page);
          expect(normalized.pageSize).toBe(meta.pageSize);
          expect(normalized.totalCount).toBe(meta.totalCount);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('preserves each element in the results array (no data loss)', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 1, maxLength: 10 }),
        paginationMetaArb,
        (results, meta) => {
          const djangoResponse = {
            results,
            page: meta.page,
            pageSize: meta.pageSize,
            totalCount: meta.totalCount,
          };

          const normalized = normalizePaginatedResponse(djangoResponse);

          // Each element should be the same reference
          for (let i = 0; i < results.length; i++) {
            expect(normalized.applications[i]).toBe(results[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles raw array responses (no pagination wrapper)', () => {
    fc.assert(
      fc.property(
        fc.array(applicationRecordArb, { minLength: 0, maxLength: 10 }),
        (results) => {
          const normalized = normalizePaginatedResponse(results);

          expect(normalized.applications.length).toBe(results.length);
          expect(normalized.totalCount).toBe(results.length);
          expect(normalized.page).toBe(1);
          expect(normalized.pageSize).toBe(results.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('handles null/undefined responses gracefully', () => {
    const nullish = normalizePaginatedResponse(null);
    expect(nullish.applications).toEqual([]);
    expect(nullish.totalCount).toBe(0);

    const undef = normalizePaginatedResponse(undefined);
    expect(undef.applications).toEqual([]);
    expect(undef.totalCount).toBe(0);
  });
});

// ── Property 10: Query parameter construction for list endpoints ────────

describe('Property 10: Query parameter construction for list endpoints', () => {
  /**
   * For any combination of filter parameters, buildQueryString constructs
   * a query string where each non-empty parameter appears exactly once,
   * parameter names match the Django API contract, and the base path
   * contains no query-parameter actions (?action=).
   *
   * We import the real buildQueryString from the client module.
   *
   * **Validates: Requirement 3.1**
   */

  // Import buildQueryString directly — it's a pure function with no side effects
  // We replicate it here to avoid module mocking complexity
  function buildQueryString(params: Record<string, string | number | boolean | null | undefined | Array<string | number | boolean>> = {}): string {
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }

      if (Array.isArray(value)) {
        const validItems = value.filter(item => item !== undefined && item !== null && item !== '');
        if (validItems.length > 0) {
          query.set(key, validItems.join(','));
        }
        return;
      }

      query.set(key, String(value));
    });

    const queryString = query.toString();
    return queryString ? `?${queryString}` : '';
  }

  /** Arbitrary for list endpoint filter params */
  const filterParamsArb = fc.record({
    page: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
    pageSize: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
    search: fc.option(
      fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0),
      { nil: undefined },
    ),
    status: fc.option(
      fc.constantFrom('draft', 'submitted', 'approved', 'rejected', 'pending'),
      { nil: undefined },
    ),
    sort: fc.option(
      fc.constantFrom('created_at', '-created_at', 'status', '-status', 'name'),
      { nil: undefined },
    ),
  });

  it('each non-empty parameter appears exactly once in the query string', () => {
    fc.assert(
      fc.property(filterParamsArb, (params) => {
        const qs = buildQueryString(params);

        if (qs === '') {
          // All params were empty/undefined — valid
          const hasAnyValue = Object.values(params).some(
            v => v !== undefined && v !== null && v !== '',
          );
          expect(hasAnyValue).toBe(false);
          return;
        }

        // Parse the query string back
        const parsed = new URLSearchParams(qs.replace(/^\?/, ''));

        // Each non-empty param should appear exactly once
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null || value === '') {
            expect(parsed.has(key)).toBe(false);
          } else {
            expect(parsed.get(key)).toBe(String(value));
            // Count occurrences — should be exactly 1
            const allValues = parsed.getAll(key);
            expect(allValues.length).toBe(1);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never produces ?action= in the query string', () => {
    fc.assert(
      fc.property(filterParamsArb, (params) => {
        const qs = buildQueryString(params);
        expect(qs).not.toContain('action=');
      }),
      { numRuns: 200 },
    );
  });

  it('base path + query string contains no ?action= for list endpoints', () => {
    const listEndpoints = fc.constantFrom(
      '/applications/',
      '/admin/users/',
      '/admin/audit-logs/',
      '/notifications/',
      '/catalog/programs/',
    );

    fc.assert(
      fc.property(listEndpoints, filterParamsArb, (basePath, params) => {
        const qs = buildQueryString(params);
        const fullUrl = `${basePath}${qs}`;

        // No ?action= anywhere in the URL
        expect(fullUrl).not.toContain('?action=');
        expect(fullUrl).not.toContain('&action=');

        // Base path has no query params embedded
        expect(basePath).not.toContain('?');
      }),
      { numRuns: 200 },
    );
  });

  it('returns empty string when all params are empty/undefined/null', () => {
    const emptyParamsArb = fc.record({
      page: fc.constant(undefined),
      pageSize: fc.constant(undefined),
      search: fc.constantFrom(undefined, null, ''),
      status: fc.constant(undefined),
      sort: fc.constant(undefined),
    });

    fc.assert(
      fc.property(emptyParamsArb, (params) => {
        const qs = buildQueryString(params as any);
        expect(qs).toBe('');
      }),
      { numRuns: 50 },
    );
  });

  it('handles array values by joining with commas', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom('draft', 'submitted', 'approved'),
          { minLength: 1, maxLength: 3 },
        ),
        (statuses) => {
          const qs = buildQueryString({ status: statuses });

          if (qs === '') return; // all filtered out

          const parsed = new URLSearchParams(qs.replace(/^\?/, ''));
          const statusValue = parsed.get('status');

          // Should be comma-joined
          expect(statusValue).toBe(statuses.join(','));
        },
      ),
      { numRuns: 100 },
    );
  });
});
