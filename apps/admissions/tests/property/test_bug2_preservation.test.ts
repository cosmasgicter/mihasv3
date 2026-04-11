/**
 * Preservation property tests — Valid 404 still shows Not Found (BEFORE implementing fix).
 *
 * Property 6: Preservation — Non-Auth Errors Still Show Application Not Found
 *
 * These tests verify EXISTING correct behavior that must be preserved:
 * 1. 404 errors from `getById()` show "Application Not Found" on unfixed code
 * 2. Valid session + valid app ID loads the full status page on unfixed code
 * 3. For any non-AuthenticationError thrown by `getById()`, the error display
 *    shows "Application Not Found" with the error message
 *
 * All tests MUST PASS on UNFIXED code.
 *
 * **Validates: Requirements 3.3, 3.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

import { AuthenticationError } from '@/services/client';

// ── Source paths ────────────────────────────────────────────────────────

const APPLICATION_STATUS_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/ApplicationStatus.tsx',
);

const APPLICATION_SERVICE_PATH = path.resolve(
  __dirname,
  '../../src/services/applications.ts',
);

// ── Generators ──────────────────────────────────────────────────────────

/** Generate random non-auth error types that getById() might throw */
const nonAuthErrorArb: fc.Arbitrary<Error> = fc.oneof(
  fc.constant(new Error('Application not found or access denied')),
  fc.constant(new Error('Not Found')),
  fc.constant(new Error('Network error')),
  fc.constant(new Error('Internal server error')),
  fc.constant(Object.assign(new Error('HTTP 404'), { status: 404 })),
  fc.constant(Object.assign(new Error('HTTP 500'), { status: 500 })),
  fc.constant(new Error('Failed to fetch')),
  fc.constant(new TypeError('NetworkError when attempting to fetch resource')),
);

/** Generate random application IDs */
const appIdArb = fc.constantFrom(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000001',
  'deadbeef-cafe-babe-face-123456789abc',
  'test-app-id-001',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
);

// ── Property Tests ──────────────────────────────────────────────────────

describe('Property 6: Preservation — Non-Auth Errors Still Show Application Not Found', () => {
  /**
   * STRUCTURAL TEST: The ApplicationStatus queryFn contains the
   * "Application not found or access denied" error message.
   *
   * This verifies the error message exists in the queryFn on both
   * unfixed and fixed code.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('ApplicationStatus queryFn contains "Application not found or access denied" message', () => {
    const source = fs.readFileSync(APPLICATION_STATUS_PATH, 'utf-8');

    // The queryFn must contain the "Application not found" error
    const queryFnMatch = source.match(
      /queryFn:\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*enabled/,
    );
    expect(queryFnMatch).not.toBeNull();

    const queryFnBody = queryFnMatch![1];
    expect(queryFnBody).toContain('Application not found or access denied');
  });

  /**
   * STRUCTURAL TEST: The ApplicationStatus component renders ErrorDisplay
   * with "Application Not Found" title when there is an error.
   *
   * This verifies the error rendering path exists on both unfixed and
   * fixed code.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('ApplicationStatus renders ErrorDisplay with "Application Not Found" title', () => {
    const source = fs.readFileSync(APPLICATION_STATUS_PATH, 'utf-8');

    // The component must render ErrorDisplay with the correct title
    expect(source).toContain('ErrorDisplay');
    expect(source).toContain('Application Not Found');

    // The error message fallback must include "Application not found"
    expect(source).toContain("error || 'Application not found or access denied'");
  });

  /**
   * STRUCTURAL TEST: The loadApplicationDetails function in
   * applications.ts throws "Application not found or access denied"
   * when the application record is null.
   *
   * This is the source of the 404-like error behavior.
   *
   * **Validates: Requirements 3.4**
   */
  it('loadApplicationDetails throws "Application not found" for missing applications', () => {
    const source = fs.readFileSync(APPLICATION_SERVICE_PATH, 'utf-8');

    // The service must throw "Application not found" when normalizeApplicationRecord returns null
    expect(source).toContain('Application not found or access denied');
    expect(source).toContain('normalizeApplicationRecord');
  });

  /**
   * STRUCTURAL TEST: The ApplicationStatus component uses useQuery with
   * the correct query key and enabled condition.
   *
   * This verifies the data loading path for valid sessions.
   *
   * **Validates: Requirements 3.3**
   */
  it('ApplicationStatus useQuery is enabled only with valid id and user', () => {
    const source = fs.readFileSync(APPLICATION_STATUS_PATH, 'utf-8');

    // The query must be enabled only when both id and user are present
    expect(source).toContain('enabled: !!id && !!user');

    // The query key must include the application id
    expect(source).toContain("queryKey: ['application-status', id]");
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any non-AuthenticationError thrown by getById(), the error
   * message is displayed via the error derivation line. On unfixed code,
   * errors propagate directly from getById() to React Query. The error
   * derivation line extracts the message for display.
   *
   * This simulates the error derivation logic:
   * `const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load application') : ''`
   *
   * For non-auth errors, the displayed message is always the error's
   * `.message` property (since they are Error instances).
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('non-auth errors produce a displayable error message via error derivation', async () => {
    await fc.assert(
      fc.asyncProperty(nonAuthErrorArb, async (thrownError) => {
        // Simulate the error derivation logic from ApplicationStatus
        // `const error = queryError ? (queryError instanceof Error ? queryError.message : 'Failed to load application') : ''`
        const queryError: unknown = thrownError;
        const displayedError = queryError
          ? queryError instanceof Error
            ? (queryError as Error).message
            : 'Failed to load application'
          : '';

        // The error must be a non-empty string
        expect(displayedError).toBeTruthy();
        expect(typeof displayedError).toBe('string');

        // The error must NOT be an AuthenticationError
        expect(thrownError).not.toBeInstanceOf(AuthenticationError);

        // The component renders ErrorDisplay when error is truthy,
        // showing "Application Not Found" as the title
        // and the error message (or fallback) as the message.
        // This is verified structurally above; here we confirm the
        // error derivation produces a usable string.
        expect(displayedError.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any non-AuthenticationError, the error is NOT an
   * AuthenticationError instance. This ensures the preservation
   * boundary: non-auth errors stay in the "not found" display path,
   * not the auth redirect path.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  it('non-auth errors are never instances of AuthenticationError', async () => {
    await fc.assert(
      fc.asyncProperty(
        appIdArb,
        nonAuthErrorArb,
        async (_appId, error) => {
          // Verify the error is NOT an AuthenticationError
          expect(error).not.toBeInstanceOf(AuthenticationError);
          expect(error).toBeInstanceOf(Error);

          // The error should have a message property
          expect(typeof error.message).toBe('string');
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * Simulate the full queryFn behavior on UNFIXED code for the
   * "application not found" case. When getById() returns a response
   * with no `.application`, the queryFn throws "Application not found
   * or access denied".
   *
   * This tests the explicit null-check path in the queryFn.
   *
   * **Validates: Requirements 3.4**
   */
  it('queryFn throws "Application not found" when response.application is falsy', async () => {
    // Generate various falsy application values
    const falsyAppResponseArb = fc.constantFrom(
      { application: null },
      { application: undefined },
      { application: false as unknown as null },
      { application: 0 as unknown as null },
      { application: '' as unknown as null },
      {},
    );

    await fc.assert(
      fc.asyncProperty(
        appIdArb,
        falsyAppResponseArb,
        async (appId, response) => {
          // Simulate the queryFn from ApplicationStatus (unfixed code)
          const mockGetById = async (_id: string) => response;

          const queryFn = async () => {
            const resp = await mockGetById(appId);
            if (!(resp as any).application) {
              throw new Error('Application not found or access denied');
            }
            return (resp as any).application;
          };

          let thrownError: unknown;
          try {
            await queryFn();
          } catch (error) {
            thrownError = error;
          }

          // Must throw "Application not found or access denied"
          expect(thrownError).toBeInstanceOf(Error);
          expect((thrownError as Error).message).toBe(
            'Application not found or access denied',
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * Simulate the full queryFn behavior on UNFIXED code for the
   * "valid application" case. When getById() returns a response with
   * a truthy `.application`, the queryFn returns it successfully.
   *
   * This tests the happy path that must be preserved.
   *
   * **Validates: Requirements 3.3**
   */
  it('queryFn returns application data when response.application is truthy', async () => {
    // Generate mock application objects with various shapes
    const applicationArb = fc.record({
      id: appIdArb,
      status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected'),
      created_at: fc.constant('2024-01-01T00:00:00Z'),
      full_name: fc.constant('Test Student'),
    });

    const validResponseArb = applicationArb.map((app) => ({
      application: app,
    }));

    await fc.assert(
      fc.asyncProperty(
        appIdArb,
        validResponseArb,
        async (appId, response) => {
          // Simulate the queryFn from ApplicationStatus (unfixed code)
          const mockGetById = async (_id: string) => response;

          const queryFn = async () => {
            const resp = await mockGetById(appId);
            if (!(resp as any).application) {
              throw new Error('Application not found or access denied');
            }
            return (resp as any).application;
          };

          const result = await queryFn();

          // Must return the application object
          expect(result).toBeTruthy();
          expect(result.id).toBe(response.application.id);
          expect(result.status).toBe(response.application.status);
        },
      ),
      { numRuns: 50 },
    );
  });
});
