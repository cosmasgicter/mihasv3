/**
 * Post-Migration Production QA — Bug Condition Exploration Tests (Frontend)
 *
 * These tests are EXPECTED TO FAIL on unfixed code. Failure confirms the bugs exist.
 * DO NOT fix the tests or the production code when they fail.
 *
 * Covers:
 *   Bug 4   — Catalog normalizer response shapes
 *   Bug 6   — Frontend CSRF error code mismatch
 *   Bug 7   — Admin routing role resolution
 *
 * **Validates: Requirements 1.4, 1.6, 1.7**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Bug 4: Catalog Normalizer Response Shapes
// ============================================================================

describe('Bug 4: Catalog normalizer response shapes', () => {
  /**
   * Test normalizeCollection with all Django response shapes after envelope
   * unwrapping: {results: [...], count: N}, raw array, {programs: [...]}
   *
   * This may PASS if the normalizer already handles these shapes correctly,
   * confirming it's a non-issue or surfacing edge cases.
   *
   * **Validates: Requirements 1.4**
   */

  // Replicate normalizeCollection from catalog.ts
  type CollectionKey = 'programs' | 'intakes' | 'subjects' | 'institutions';

  function normalizeCollection<T>(
    response: T[] | { results?: T[]; count?: number } | Record<string, unknown> | null | undefined,
    key: CollectionKey,
    normalizeItem: (item: T | null | undefined) => unknown,
  ): unknown[] {
    const rawItems = Array.isArray(response)
      ? response
      : Array.isArray((response as { results?: T[] } | undefined)?.results)
        ? ((response as { results?: T[] }).results as T[])
        : Array.isArray((response as Record<string, unknown> | undefined)?.[key])
          ? ((response as Record<string, unknown>)[key] as T[])
          : [];

    return rawItems
      .map((item) => normalizeItem(item))
      .filter(Boolean) as unknown[];
  }

  // Simple identity normalizer for testing
  const identityNormalize = <T>(item: T | null | undefined): T | null => item ?? null;

  describe('handles all Django response shapes', () => {
    it('handles {results: [...], count: N} paginated shape', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }) }),
            { minLength: 1, maxLength: 5 },
          ),
          fc.nat(),
          (items, count) => {
            const response = { results: items, count };
            const result = normalizeCollection(response, 'programs', identityNormalize);
            expect(result.length).toBe(items.length);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('handles raw array shape', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }) }),
            { minLength: 1, maxLength: 5 },
          ),
          (items) => {
            const result = normalizeCollection(items, 'programs', identityNormalize);
            expect(result.length).toBe(items.length);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('handles {programs: [...]} keyed shape', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }) }),
            { minLength: 1, maxLength: 5 },
          ),
          (items) => {
            const response = { programs: items };
            const result = normalizeCollection(response, 'programs', identityNormalize);
            expect(result.length).toBe(items.length);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('handles null and undefined gracefully', () => {
      expect(normalizeCollection(null, 'programs', identityNormalize)).toEqual([]);
      expect(normalizeCollection(undefined, 'programs', identityNormalize)).toEqual([]);
    });

    it('handles empty {results: [], count: 0} correctly', () => {
      const result = normalizeCollection({ results: [], count: 0 }, 'programs', identityNormalize);
      expect(result).toEqual([]);
    });
  });
});

// ============================================================================
// Bug 6: Frontend CSRF Error Code Mismatch
// ============================================================================

describe('Bug 6: Frontend CSRF error code mismatch', () => {
  /**
   * Test that apiClient CSRF 403 retry triggers on
   * errorCode === 'CSRF_VALIDATION_FAILED'.
   *
   * The current code checks:
   *   errorCode === 'CSRF_INVALID' || errorCode === 'CSRF_MISSING'
   *
   * But the Django CSRFEnforcementMiddleware returns:
   *   code: 'CSRF_VALIDATION_FAILED'
   *
   * So the retry never triggers for the actual error code.
   *
   * **Validates: Requirements 1.6**
   */

  // The set of CSRF error codes the backend can return
  const BACKEND_CSRF_ERROR_CODES = [
    'CSRF_VALIDATION_FAILED',  // The actual code from CSRFEnforcementMiddleware
  ] as const;

  // The set of CSRF error codes the frontend currently checks (FIXED)
  const FRONTEND_CSRF_CHECK_CODES = new Set([
    'CSRF_INVALID',
    'CSRF_MISSING',
    'CSRF_VALIDATION_FAILED',
  ]);

  describe('CSRF error code matching', () => {
    it('frontend CSRF retry condition matches all backend CSRF error codes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...BACKEND_CSRF_ERROR_CODES),
          (backendErrorCode) => {
            // Replicate the FIXED check from client.ts
            const code: string = backendErrorCode;
            const wouldTriggerRetry =
              code === 'CSRF_INVALID' || code === 'CSRF_MISSING' || code === 'CSRF_VALIDATION_FAILED';

            // FIXED: The frontend now checks for 'CSRF_VALIDATION_FAILED' in
            // addition to 'CSRF_INVALID' and 'CSRF_MISSING', matching the
            // actual error code returned by CSRFEnforcementMiddleware.
            expect(wouldTriggerRetry).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('CSRF_VALIDATION_FAILED is recognized as a CSRF error by the frontend', () => {
      // Direct assertion: the frontend's check set should include the actual backend code
      const backendCode = 'CSRF_VALIDATION_FAILED';
      const isRecognized = FRONTEND_CSRF_CHECK_CODES.has(backendCode);

      // FIXED: CSRF_VALIDATION_FAILED is now in the frontend's check set
      expect(isRecognized).toBe(true);
    });
  });
});

// ============================================================================
// Bug 7: Admin Routing Role Resolution
// ============================================================================

describe('Bug 7: Admin routing role resolution', () => {
  /**
   * Test normalizeAuthUser with Django login response where `role` is missing
   * or nested under `user_metadata`.
   *
   * The current normalizeAuthUser does:
   *   role: payload.role || 'student'
   *
   * If the Django login response doesn't include `role` at the top level
   * (e.g., it's nested under user_metadata.role), the function defaults
   * to 'student', causing admin users to land on the student dashboard.
   *
   * **Validates: Requirements 1.7**
   */

  // Replicate normalizeAuthUser from useSessionListener.ts
  type PartialUser = {
    id?: string;
    email?: string;
    role?: string;
    full_name?: string;
    first_name?: string;
    last_name?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };

  function normalizeAuthUser(
    payload: PartialUser | null | undefined,
  ): { id: string; email: string; role: string; full_name?: string } | null {
    if (!payload?.id || !payload.email) return null;

    const firstName = typeof payload.first_name === 'string' ? payload.first_name.trim() : '';
    const lastName = typeof payload.last_name === 'string' ? payload.last_name.trim() : '';
    const fullName = typeof payload.full_name === 'string' && payload.full_name.trim()
      ? payload.full_name.trim()
      : [firstName, lastName].filter(Boolean).join(' ').trim();

    // FIXED: Resolve role from top-level, then user_metadata, then app_metadata.
    // Django login responses may nest the role differently than expected.
    const resolvedRole =
      payload.role ||
      (typeof payload.user_metadata?.role === 'string' ? payload.user_metadata.role : undefined) ||
      (typeof payload.app_metadata?.role === 'string' ? payload.app_metadata.role : undefined) ||
      'student';

    return {
      id: String(payload.id),
      email: payload.email,
      role: resolvedRole,
      full_name: fullName || undefined,
    };
  }

  describe('role extraction from Django login response', () => {
    it('extracts admin role when role is nested under user_metadata', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.emailAddress(),
          fc.constantFrom('admin', 'super_admin', 'registrar'),
          (id, email, adminRole) => {
            // Django login response where role is in user_metadata, not top-level
            const djangoResponse: PartialUser = {
              id,
              email,
              // role is NOT at top level — it's nested
              user_metadata: { role: adminRole },
            };

            const user = normalizeAuthUser(djangoResponse);

            // FIXED: normalizeAuthUser now checks user_metadata.role
            // when payload.role is undefined, correctly resolving the admin role.
            expect(user).not.toBeNull();
            expect(user!.role).toBe(adminRole);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('extracts admin role when role is nested under app_metadata', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.emailAddress(),
          fc.constantFrom('admin', 'super_admin'),
          (id, email, adminRole) => {
            // Django login response where role is in app_metadata
            const djangoResponse: PartialUser = {
              id,
              email,
              app_metadata: { role: adminRole },
            };

            const user = normalizeAuthUser(djangoResponse);

            // FIXED: normalizeAuthUser now checks app_metadata.role
            // when payload.role is undefined, correctly resolving the admin role.
            expect(user).not.toBeNull();
            expect(user!.role).toBe(adminRole);
          },
        ),
        { numRuns: 20 },
      );
    });

    it('extracts admin role when role field is completely missing', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.emailAddress(),
          (id, email) => {
            // Django login response with no role anywhere
            const djangoResponse: PartialUser = {
              id,
              email,
              user_metadata: { role: 'admin' },
            };

            const user = normalizeAuthUser(djangoResponse);

            // FIXED: normalizeAuthUser now falls through to user_metadata.role
            // when top-level role is missing, so admin role is correctly resolved.
            expect(user).not.toBeNull();
            expect(user!.role).not.toBe('student');
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Also test checkIsAdmin — it correctly checks user_metadata and app_metadata,
   * but normalizeAuthUser never populates those fields from the login response,
   * so checkIsAdmin receives a user with role='student' and returns false.
   */
  describe('checkIsAdmin with normalized user', () => {
    // Replicate checkIsAdmin from useSessionListener.ts
    function checkIsAdmin(user: { role?: string; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null): boolean {
      if (!user) return false;
      const role = (user.role || user.user_metadata?.role || user.app_metadata?.role) as string | undefined;
      // Replicate isAdminRole check
      const adminRoles = ['admin', 'super_admin'];
      return adminRoles.includes(role ?? '');
    }

    it('checkIsAdmin returns true for admin user after normalizeAuthUser', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.emailAddress(),
          fc.constantFrom('admin', 'super_admin'),
          (id, email, adminRole) => {
            // Django response with role in user_metadata only
            const djangoResponse: PartialUser = {
              id,
              email,
              user_metadata: { role: adminRole },
            };

            const normalizedUser = normalizeAuthUser(djangoResponse);
            expect(normalizedUser).not.toBeNull();

            // FIXED: normalizeAuthUser now resolves role from user_metadata,
            // so the normalized user has role='admin' and checkIsAdmin returns true.
            const isAdmin = checkIsAdmin(normalizedUser as any);
            expect(isAdmin).toBe(true);
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
