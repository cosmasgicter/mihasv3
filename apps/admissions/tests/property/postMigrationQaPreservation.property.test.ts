/**
 * Post-Migration Production QA — Preservation Property Tests (Frontend)
 *
 * These tests MUST PASS on unfixed code. They establish the baseline behavior
 * that must remain unchanged after bug fixes are applied.
 *
 * Covers:
 *   - normalizeCollection with valid response shapes (Req 3.4)
 *   - normalizeAuthUser with explicit top-level role (Req 3.7)
 *   - unwrapApiResponse with {success: true, data: T} envelopes (Req 3.9)
 *   - Route resolution for student logins (Req 3.7)
 *
 * **Validates: Requirements 3.2, 3.3, 3.4, 3.7, 3.9**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Replicated production functions (tested in isolation without full app context)
// ============================================================================

// --- From catalog.ts: normalizeCollection ---
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

// --- From useSessionListener.ts: normalizeAuthUser ---
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

  return {
    id: String(payload.id),
    email: payload.email,
    role: payload.role || 'student',
    full_name: fullName || undefined,
  };
}

// --- From useSessionListener.ts: extractAuthUser ---
function hasUserEnvelope(result: unknown): result is { user?: PartialUser | null } {
  return Boolean(result && typeof result === 'object' && 'user' in result);
}

function extractAuthUser(
  result: unknown,
): { id: string; email: string; role: string; full_name?: string } | null {
  if (!result) return null;
  if (hasUserEnvelope(result)) {
    return normalizeAuthUser(result.user ?? null);
  }
  return normalizeAuthUser(result as PartialUser);
}

// --- From client.ts: unwrapApiResponse ---
function unwrapApiResponse<T>(response: T | null, contentType?: string): T | null {
  if (response === null || response === undefined) return null;
  if (contentType && !contentType.includes('application/json')) return response;
  if (typeof response !== 'object' || Array.isArray(response)) return response;
  const obj = response as Record<string, unknown>;
  if ('success' in obj && 'data' in obj && obj.success === true) {
    return (obj.data ?? null) as T | null;
  }
  return response;
}

// --- From SignInPage.tsx / roles.ts: route resolution ---
const ADMIN_ROLES = [
  'admin', 'super_admin', 'admissions_officer',
  'registrar', 'finance_officer', 'academic_head',
] as const;

function isAdminRole(role?: string | null): boolean {
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

function resolvePostLoginRedirect(role: string | null | undefined): string {
  const admin = isAdminRole(role);
  return admin ? '/admin/dashboard' : '/student/dashboard';
}

// Identity normalizer for catalog tests
const identityNormalize = <T>(item: T | null | undefined): T | null => item ?? null;

// ============================================================================
// Generators
// ============================================================================

/** Generate a catalog item with id and name */
const catalogItemArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
});

/** Generate a non-empty array of catalog items */
const nonEmptyCatalogItemsArb = fc.array(catalogItemArb, { minLength: 1, maxLength: 10 });

/** Generate a valid user payload with explicit top-level role */
const studentUserPayloadArb = fc.record({
  id: fc.uuid(),
  email: fc.emailAddress(),
  role: fc.constant('student'),
  first_name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  last_name: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

// ============================================================================
// Property Tests
// ============================================================================

describe('Preservation: normalizeCollection for valid catalog response shapes', () => {
  /**
   * For all valid catalog response shapes (raw array, paginated, keyed),
   * normalizeCollection returns a non-empty array when items exist.
   *
   * **Validates: Requirements 3.4**
   */

  it('raw array input returns all items', () => {
    fc.assert(
      fc.property(nonEmptyCatalogItemsArb, (items) => {
        const result = normalizeCollection(items, 'programs', identityNormalize);
        expect(result).toHaveLength(items.length);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it('{results: [...]} paginated input returns all items', () => {
    fc.assert(
      fc.property(
        nonEmptyCatalogItemsArb,
        fc.nat({ max: 1000 }),
        (items, count) => {
          const response = { results: items, count };
          const result = normalizeCollection(response, 'programs', identityNormalize);
          expect(result).toHaveLength(items.length);
          expect(result.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('{programs: [...]} keyed input returns all items', () => {
    fc.assert(
      fc.property(nonEmptyCatalogItemsArb, (items) => {
        const response = { programs: items };
        const result = normalizeCollection(response, 'programs', identityNormalize);
        expect(result).toHaveLength(items.length);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });

  it('{intakes: [...]} keyed input returns all items for intakes key', () => {
    fc.assert(
      fc.property(nonEmptyCatalogItemsArb, (items) => {
        const response = { intakes: items };
        const result = normalizeCollection(response, 'intakes', identityNormalize);
        expect(result).toHaveLength(items.length);
        expect(result.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 },
    );
  });
});

describe('Preservation: normalizeAuthUser preserves explicit top-level role', () => {
  /**
   * For all user payloads with explicit top-level `role`, normalizeAuthUser
   * preserves the role value unchanged.
   *
   * This tests the NON-BUG path: when role IS at the top level, it works.
   * The bug is when role is missing/nested — that's tested in the bug exploration tests.
   *
   * **Validates: Requirements 3.7**
   */

  it('preserves role="student" when set at top level', () => {
    fc.assert(
      fc.property(studentUserPayloadArb, (payload) => {
        const user = normalizeAuthUser(payload);
        expect(user).not.toBeNull();
        expect(user!.role).toBe('student');
      }),
      { numRuns: 50 },
    );
  });

  it('preserves any explicit top-level role value', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.emailAddress(),
        fc.constantFrom('student', 'admin', 'super_admin', 'registrar', 'finance_officer'),
        (id, email, role) => {
          const user = normalizeAuthUser({ id, email, role });
          expect(user).not.toBeNull();
          expect(user!.role).toBe(role);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('extractAuthUser with {user: {id, email, role}} envelope returns correct user', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.emailAddress(),
        fc.constantFrom('student', 'admin', 'super_admin'),
        (id, email, role) => {
          const envelope = { user: { id, email, role } };
          const user = extractAuthUser(envelope);
          expect(user).not.toBeNull();
          expect(user!.id).toBe(id);
          expect(user!.email).toBe(email);
          expect(user!.role).toBe(role);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Preservation: unwrapApiResponse extracts data from envelopes', () => {
  /**
   * For all {success: true, data: T} envelopes, unwrapApiResponse returns T.
   *
   * **Validates: Requirements 3.9**
   */

  it('unwraps {success: true, data: T} to T for object payloads', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          name: fc.string({ minLength: 1, maxLength: 30 }),
          value: fc.integer(),
        }),
        (innerData) => {
          const envelope = { success: true, data: innerData };
          const result = unwrapApiResponse(envelope);
          expect(result).toEqual(innerData);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('unwraps {success: true, data: array} to the array', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: fc.uuid() }), { minLength: 1, maxLength: 5 }),
        (innerArray) => {
          const envelope = { success: true, data: innerArray };
          const result = unwrapApiResponse(envelope);
          expect(result).toEqual(innerArray);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns null for {success: true, data: null}', () => {
    const envelope = { success: true, data: null };
    const result = unwrapApiResponse(envelope);
    expect(result).toBeNull();
  });

  it('passes through non-envelope objects unchanged', () => {
    fc.assert(
      fc.property(
        fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }) }),
        (obj) => {
          // Object without success+data keys passes through
          const result = unwrapApiResponse(obj);
          expect(result).toEqual(obj);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('passes through null and undefined', () => {
    expect(unwrapApiResponse(null)).toBeNull();
    expect(unwrapApiResponse(undefined)).toBeNull();
  });
});

describe('Preservation: student login route resolution', () => {
  /**
   * For all student user logins, route resolution navigates to /student/dashboard.
   *
   * **Validates: Requirements 3.7**
   */

  it('student role resolves to /student/dashboard', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('student', null, undefined, ''),
        (role) => {
          const path = resolvePostLoginRedirect(role);
          expect(path).toBe('/student/dashboard');
        },
      ),
      { numRuns: 20 },
    );
  });

  it('non-admin roles default to /student/dashboard', () => {
    fc.assert(
      fc.property(
        // Roles that are NOT in the ADMIN_ROLES list
        fc.constantFrom('student', 'viewer', 'guest', 'applicant'),
        (role) => {
          const path = resolvePostLoginRedirect(role);
          expect(path).toBe('/student/dashboard');
        },
      ),
      { numRuns: 20 },
    );
  });

  it('admin roles resolve to /admin/dashboard (not /student/dashboard)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('admin', 'super_admin', 'registrar'),
        (role) => {
          const path = resolvePostLoginRedirect(role);
          expect(path).toBe('/admin/dashboard');
        },
      ),
      { numRuns: 20 },
    );
  });
});
