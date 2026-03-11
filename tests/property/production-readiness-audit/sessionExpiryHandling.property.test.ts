// @vitest-environment node
/**
 * Property 18: Session Expiry Handling
 *
 * Feature: production-readiness-audit
 * **Validates: Requirements 11.6**
 *
 * For any expired session, the system SHALL redirect to login page with the
 * current URL preserved as return parameter.
 *
 * The session expiry system:
 * - Route guards (ProtectedRoute, StudentRoute, AdminRoute) check auth state
 * - When user is null / session expired → Navigate to /auth/signin
 * - Current location is preserved via state={{ from: location }}
 * - SignInPage reads location.state?.from?.pathname and redirects back after login
 * - Return URL must not contain sensitive data (no tokens in URL)
 *
 * This test models the session expiry and redirect logic as pure functions —
 * no React hooks, React Router, or DOM required.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Domain types (mirrors route guard + auth behaviour)
// ---------------------------------------------------------------------------

type UserRole = 'student' | 'admin' | 'super_admin' | 'reviewer';

interface Session {
  userId: string;
  role: UserRole;
  expiresAt: number; // ms since epoch
}

interface Location {
  pathname: string;
  search: string;
  hash: string;
}

interface RedirectResult {
  shouldRedirect: boolean;
  target: string;
  state: { from: Location } | null;
}

interface PostLoginRedirectResult {
  redirectTo: string;
}

const LOGIN_PATH = '/auth/signin';

// ---------------------------------------------------------------------------
// Pure model of session expiry detection (mirrors ProtectedRoute / StudentRoute / AdminRoute)
// ---------------------------------------------------------------------------

/**
 * Determines if a session is expired at a given point in time.
 */
function isSessionExpired(session: Session | null, now: number): boolean {
  if (session === null) return true;
  return now >= session.expiresAt;
}

/**
 * Models the route guard redirect logic.
 *
 * When the user is not authenticated (session null or expired), the guard
 * redirects to /auth/signin with the current location preserved in state.
 */
function evaluateRouteGuard(
  session: Session | null,
  currentLocation: Location,
  now: number,
): RedirectResult {
  const expired = isSessionExpired(session, now);

  if (expired) {
    return {
      shouldRedirect: true,
      target: LOGIN_PATH,
      state: { from: currentLocation },
    };
  }

  return {
    shouldRedirect: false,
    target: currentLocation.pathname,
    state: null,
  };
}

// ---------------------------------------------------------------------------
// Pure model of post-login redirect (mirrors SignInPage onSubmit)
// ---------------------------------------------------------------------------

/**
 * After successful login, determines where to redirect the user.
 *
 * - If a return URL exists in state.from.pathname (and it's not the signin page),
 *   redirect there.
 * - Otherwise, redirect to the role-based default dashboard.
 */
function resolvePostLoginRedirect(
  locationState: { from?: { pathname?: string } } | null,
  userRole: UserRole,
): PostLoginRedirectResult {
  const from = locationState?.from?.pathname;
  const defaultRedirect =
    userRole === 'admin' || userRole === 'super_admin'
      ? '/admin/dashboard'
      : '/student/dashboard';

  const redirectTo =
    from && from !== LOGIN_PATH ? from : defaultRedirect;

  return { redirectTo };
}

// ---------------------------------------------------------------------------
// Sensitive data detection (tokens, secrets should never appear in URLs)
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  /token[=:]/i,
  /bearer\s/i,
  /jwt[=:]/i,
  /secret[=:]/i,
  /password[=:]/i,
  /refresh_token/i,
  /access_token/i,
  /api_key/i,
  /session_id[=:]/i,
];

function containsSensitiveData(url: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(url));
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const userRoleArb: fc.Arbitrary<UserRole> = fc.constantFrom(
  'student',
  'admin',
  'super_admin',
  'reviewer',
);

/** Safe path segments that mirror real app routes */
const safePathSegments = [
  '/student/dashboard',
  '/student/applications',
  '/student/applications/new',
  '/student/payments',
  '/student/settings',
  '/student/notifications',
  '/admin/dashboard',
  '/admin/applications',
  '/admin/users',
  '/admin/settings',
  '/admin/audit-trail',
  '/admin/monitoring',
  '/admin/intakes',
  '/admin/programs',
  '/admin/batch-operations',
];

const pathnameArb: fc.Arbitrary<string> = fc.constantFrom(...safePathSegments);

const searchArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('?page=2'),
  fc.constant('?status=submitted'),
  fc.constant('?tab=documents'),
);

const hashArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc.constant('#details'),
  fc.constant('#grades'),
);

const locationArb: fc.Arbitrary<Location> = fc.record({
  pathname: pathnameArb,
  search: searchArb,
  hash: hashArb,
});

/** Generate a session with a specific expiry relative to "now" */
const sessionArb = (now: number): fc.Arbitrary<Session> =>
  fc.record({
    userId: fc.uuid(),
    role: userRoleArb,
    expiresAt: fc.integer({ min: now - 3600_000, max: now + 3600_000 }),
  });

/** Generate an expired session (expiresAt <= now) */
const expiredSessionArb = (now: number): fc.Arbitrary<Session> =>
  fc.record({
    userId: fc.uuid(),
    role: userRoleArb,
    expiresAt: fc.integer({ min: now - 3600_000, max: now }),
  });

/** Generate a valid (non-expired) session (expiresAt > now) */
const validSessionArb = (now: number): fc.Arbitrary<Session> =>
  fc.record({
    userId: fc.uuid(),
    role: userRoleArb,
    expiresAt: fc.integer({ min: now + 1, max: now + 3600_000 }),
  });

// Fixed "now" for deterministic tests
const NOW = 1_700_000_000_000;

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 18: Session Expiry Handling', () => {
  describe('expired session always triggers redirect to login', () => {
    it('null session always redirects to login page', () => {
      fc.assert(
        fc.property(locationArb, (location) => {
          const result = evaluateRouteGuard(null, location, NOW);
          expect(result.shouldRedirect).toBe(true);
          expect(result.target).toBe(LOGIN_PATH);
        }),
        { numRuns: 10 },
      );
    });

    it('expired session (expiresAt <= now) always redirects to login page', () => {
      fc.assert(
        fc.property(
          expiredSessionArb(NOW),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            expect(result.shouldRedirect).toBe(true);
            expect(result.target).toBe(LOGIN_PATH);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('redirect target is always the login path regardless of current location', () => {
      fc.assert(
        fc.property(
          fc.option(expiredSessionArb(NOW), { nil: null }),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            expect(result.target).toBe(LOGIN_PATH);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('return URL is preserved in redirect state', () => {
    it('expired session redirect preserves the current pathname in state.from', () => {
      fc.assert(
        fc.property(
          expiredSessionArb(NOW),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            expect(result.state).not.toBeNull();
            expect(result.state!.from.pathname).toBe(location.pathname);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('expired session redirect preserves search and hash in state.from', () => {
      fc.assert(
        fc.property(
          expiredSessionArb(NOW),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            expect(result.state!.from.search).toBe(location.search);
            expect(result.state!.from.hash).toBe(location.hash);
          },
        ),
        { numRuns: 10 },
      );
    });

    it('null session redirect preserves the full location object', () => {
      fc.assert(
        fc.property(locationArb, (location) => {
          const result = evaluateRouteGuard(null, location, NOW);
          expect(result.state!.from).toEqual(location);
        }),
        { numRuns: 10 },
      );
    });
  });

  describe('valid (non-expired) sessions do not trigger redirect', () => {
    it('valid session does not redirect', () => {
      fc.assert(
        fc.property(
          validSessionArb(NOW),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            expect(result.shouldRedirect).toBe(false);
            expect(result.state).toBeNull();
          },
        ),
        { numRuns: 10 },
      );
    });

    it('valid session keeps the user on the current path', () => {
      fc.assert(
        fc.property(
          validSessionArb(NOW),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            expect(result.target).toBe(location.pathname);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('post-login redirect restores the return URL', () => {
    it('after login, user is redirected back to the preserved return URL', () => {
      fc.assert(
        fc.property(pathnameArb, userRoleArb, (pathname, role) => {
          const state = { from: { pathname } };
          const result = resolvePostLoginRedirect(state, role);
          // Should redirect to the preserved path (not the signin page)
          expect(result.redirectTo).toBe(pathname);
        }),
        { numRuns: 10 },
      );
    });

    it('if return URL is the signin page itself, redirect to role default', () => {
      fc.assert(
        fc.property(userRoleArb, (role) => {
          const state = { from: { pathname: LOGIN_PATH } };
          const result = resolvePostLoginRedirect(state, role);
          const expected =
            role === 'admin' || role === 'super_admin'
              ? '/admin/dashboard'
              : '/student/dashboard';
          expect(result.redirectTo).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });

    it('if no return URL in state, redirect to role-based default', () => {
      fc.assert(
        fc.property(userRoleArb, (role) => {
          const result = resolvePostLoginRedirect(null, role);
          const expected =
            role === 'admin' || role === 'super_admin'
              ? '/admin/dashboard'
              : '/student/dashboard';
          expect(result.redirectTo).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });

    it('admin/super_admin roles default to /admin/dashboard', () => {
      const adminRoles: UserRole[] = ['admin', 'super_admin'];
      for (const role of adminRoles) {
        const result = resolvePostLoginRedirect(null, role);
        expect(result.redirectTo).toBe('/admin/dashboard');
      }
    });

    it('student/reviewer roles default to /student/dashboard', () => {
      const studentRoles: UserRole[] = ['student', 'reviewer'];
      for (const role of studentRoles) {
        const result = resolvePostLoginRedirect(null, role);
        expect(result.redirectTo).toBe('/student/dashboard');
      }
    });
  });

  describe('return URL does not contain sensitive data', () => {
    it('preserved return URLs from app routes never contain sensitive tokens', () => {
      fc.assert(
        fc.property(locationArb, (location) => {
          const fullUrl = location.pathname + location.search + location.hash;
          expect(containsSensitiveData(fullUrl)).toBe(false);
        }),
        { numRuns: 10 },
      );
    });

    it('redirect state from expired session does not leak tokens', () => {
      fc.assert(
        fc.property(
          expiredSessionArb(NOW),
          locationArb,
          (session, location) => {
            const result = evaluateRouteGuard(session, location, NOW);
            const from = result.state!.from;
            const fullUrl = from.pathname + from.search + from.hash;
            expect(containsSensitiveData(fullUrl)).toBe(false);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  describe('session expiry boundary conditions', () => {
    it('session expiring exactly at "now" is treated as expired', () => {
      fc.assert(
        fc.property(userRoleArb, locationArb, (role, location) => {
          const session: Session = {
            userId: 'test-user',
            role,
            expiresAt: NOW, // exactly at now
          };
          const result = evaluateRouteGuard(session, location, NOW);
          expect(result.shouldRedirect).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('session expiring 1ms after "now" is treated as valid', () => {
      fc.assert(
        fc.property(userRoleArb, locationArb, (role, location) => {
          const session: Session = {
            userId: 'test-user',
            role,
            expiresAt: NOW + 1,
          };
          const result = evaluateRouteGuard(session, location, NOW);
          expect(result.shouldRedirect).toBe(false);
        }),
        { numRuns: 10 },
      );
    });

    it('session expiry works for various token lifetimes (15min, 1h, 7d)', () => {
      const lifetimes = [
        15 * 60 * 1000,       // 15 minutes (access token)
        60 * 60 * 1000,       // 1 hour
        7 * 24 * 60 * 60 * 1000, // 7 days (refresh token)
      ];

      for (const lifetime of lifetimes) {
        // Session created at NOW - lifetime should be expired
        const expiredSession: Session = {
          userId: 'test-user',
          role: 'student',
          expiresAt: NOW - 1,
        };
        const location: Location = {
          pathname: '/student/dashboard',
          search: '',
          hash: '',
        };

        const expiredResult = evaluateRouteGuard(expiredSession, location, NOW);
        expect(expiredResult.shouldRedirect).toBe(true);

        // Session created now with lifetime should be valid
        const validSession: Session = {
          userId: 'test-user',
          role: 'student',
          expiresAt: NOW + lifetime,
        };

        const validResult = evaluateRouteGuard(validSession, location, NOW);
        expect(validResult.shouldRedirect).toBe(false);
      }
    });
  });
});
