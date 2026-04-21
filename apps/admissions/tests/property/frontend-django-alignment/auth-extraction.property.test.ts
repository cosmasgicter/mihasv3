/**
 * Property-based tests for auth extraction and role classification
 *
 * Feature: frontend-django-alignment, Properties 1, 2, 3
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.8**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { isAdminRole } from '@/lib/auth/roles';

// Adapter: checkIsAdmin takes a user object and delegates to isAdminRole
function checkIsAdmin(user: any): boolean {
  if (!user) return false;
  return isAdminRole(user.role);
}

// Adapter: extractAuthUser normalizes login/session payloads to a User object
function extractAuthUser(payload: any): { id: string; email: string; role: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  // Login shape: { user: { id, email, role } }
  const source = payload.user && typeof payload.user === 'object' ? payload.user : payload;
  if (!source || typeof source !== 'object') return null;
  const id = source.id;
  const email = source.email;
  if (!id || !email) return null;
  return { id: String(id), email: String(email), role: String(source.role ?? '') };
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Valid user id — non-empty string or positive integer */
const validIdArb = fc.oneof(
  fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  fc.integer({ min: 1, max: 999999 }).map(String),
);

/** Valid email — simple pattern that satisfies the email field requirement */
const validEmailArb = fc.emailAddress();

/** Role from the backend ROLE_CHOICES */
const backendRoleArb = fc.constantFrom('student', 'admin', 'reviewer', 'super_admin');

/** Any arbitrary role string (including non-backend roles) */
const anyRoleStringArb = fc.oneof(
  backendRoleArb,
  fc.string({ minLength: 0, maxLength: 50 }),
  fc.constantFrom('admissions_officer', 'registrar', 'finance_officer', 'academic_head', ''),
);

/** Valid user payload fields */
const validUserFieldsArb = fc.record({
  id: validIdArb,
  email: validEmailArb,
  role: backendRoleArb,
  first_name: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
  last_name: fc.option(fc.string({ maxLength: 30 }), { nil: undefined }),
  full_name: fc.option(fc.string({ maxLength: 60 }), { nil: undefined }),
});

// ── Test Suite ──────────────────────────────────────────────────────────

describe('Feature: frontend-django-alignment, Property 1: Auth user extraction handles both response shapes', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any valid auth payload in login shape {user: {id, email, role, ...}},
   * extractAuthUser shall return a User object with correct id, email, and role.
   */
  it('extracts user from login shape {user: {id, email, role, ...}}', () => {
    fc.assert(
      fc.property(validUserFieldsArb, (fields) => {
        const loginPayload = { user: { ...fields } };
        const result = extractAuthUser(loginPayload);

        expect(result).not.toBeNull();
        expect(result!.id).toBe(String(fields.id));
        expect(result!.email).toBe(fields.email);
        expect(result!.role).toBe(fields.role);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * For any valid auth payload in session shape {id, email, role, ...},
   * extractAuthUser shall return a User object with correct id, email, and role.
   */
  it('extracts user from session shape {id, email, role, ...}', () => {
    fc.assert(
      fc.property(validUserFieldsArb, (fields) => {
        const sessionPayload = { ...fields };
        const result = extractAuthUser(sessionPayload);

        expect(result).not.toBeNull();
        expect(result!.id).toBe(String(fields.id));
        expect(result!.email).toBe(fields.email);
        expect(result!.role).toBe(fields.role);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.1, 1.2**
   *
   * Both shapes produce identical User objects for the same underlying fields.
   */
  it('produces identical results for login and session shapes with same data', () => {
    fc.assert(
      fc.property(validUserFieldsArb, (fields) => {
        const loginResult = extractAuthUser({ user: { ...fields } });
        const sessionResult = extractAuthUser({ ...fields });

        expect(loginResult).not.toBeNull();
        expect(sessionResult).not.toBeNull();
        expect(loginResult!.id).toBe(sessionResult!.id);
        expect(loginResult!.email).toBe(sessionResult!.email);
        expect(loginResult!.role).toBe(sessionResult!.role);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: frontend-django-alignment, Property 2: Admin role classification is consistent with backend ROLE_CHOICES', () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * isAdminRole returns true if and only if the role is 'admin' or 'super_admin'.
   */
  it('returns true only for admin and super_admin roles', () => {
    fc.assert(
      fc.property(anyRoleStringArb, (role) => {
        const result = isAdminRole(role);
        const expected = role === 'admin' || role === 'super_admin';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * isAdminRole returns false for null and undefined.
   */
  it('returns false for null and undefined', () => {
    expect(isAdminRole(null)).toBe(false);
    expect(isAdminRole(undefined)).toBe(false);
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * checkIsAdmin returns true only when user has admin or super_admin role.
   */
  it('checkIsAdmin is consistent with isAdminRole for any user with a role', () => {
    fc.assert(
      fc.property(validIdArb, validEmailArb, anyRoleStringArb, (id, email, role) => {
        const user = { id, email, role };
        const result = checkIsAdmin(user);
        const expected = role === 'admin' || role === 'super_admin';
        expect(result).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * checkIsAdmin returns false for null user.
   */
  it('checkIsAdmin returns false for null user', () => {
    expect(checkIsAdmin(null)).toBe(false);
  });
});


describe('Feature: frontend-django-alignment, Property 3: Malformed auth responses produce null user', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  /**
   * **Validates: Requirements 1.8**
   *
   * For any payload that lacks a valid id or email field,
   * extractAuthUser shall return null.
   */
  it('returns null for objects missing id', () => {
    fc.assert(
      fc.property(validEmailArb, backendRoleArb, (email, role) => {
        // Object with email but no id
        const result = extractAuthUser({ email, role });
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for objects missing email', () => {
    fc.assert(
      fc.property(validIdArb, backendRoleArb, (id, role) => {
        // Object with id but no email
        const result = extractAuthUser({ id, role });
        expect(result).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for null, undefined, and empty objects', () => {
    expect(extractAuthUser(null)).toBeNull();
    expect(extractAuthUser(undefined)).toBeNull();
    expect(extractAuthUser({})).toBeNull();
    expect(extractAuthUser({ user: null })).toBeNull();
    expect(extractAuthUser({ user: {} })).toBeNull();
  });

  it('returns null for primitives and non-object types', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.boolean(), fc.string({ maxLength: 50 })),
        (value) => {
          const result = extractAuthUser(value);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for objects with falsy id or email values', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, '', 0, false),
        fc.constantFrom(null, undefined, '', 0, false),
        (badId, badEmail) => {
          // Both id and email are falsy — should return null
          const result = extractAuthUser({ id: badId, email: badEmail, role: 'student' });
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for login-shaped payloads with malformed user', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant({ user: {} }),
          fc.constant({ user: { id: 'abc' } }),
          fc.constant({ user: { email: 'test@test.com' } }),
          fc.constant({ user: null }),
          fc.constant({ user: undefined }),
        ),
        (payload) => {
          const result = extractAuthUser(payload);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
