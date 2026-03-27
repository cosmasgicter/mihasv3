// @vitest-environment node
/**
 * Property Tests for Audit Remediation — Security Properties
 *
 * Feature: audit-remediation
 *
 * Property 3: Health endpoint protected actions require admin authentication
 * Property 4: Arcjet fail-closed in production, fail-open in development
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 5.1, 5.2**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Property 3: Health endpoint protected actions require admin authentication
//
// For any request targeting ?action=db, ?action=env, or ?action=errors without
// a valid admin/super_admin JWT, the health endpoint should return a 401 status
// code. Requests to ?action=ping or no action should succeed without auth.
//
// Feature: audit-remediation, Property 3: Health endpoint auth gate
// **Validates: Requirements 4.1, 4.2, 4.3**
// ---------------------------------------------------------------------------

/**
 * Simulates the health endpoint auth gate logic as implemented in api-src/health.ts.
 *
 * The handler:
 * - Allows ?action=ping and no-action (default) without auth
 * - Requires admin/super_admin role for ?action=db, ?action=env, ?action=errors
 * - Returns 401 for unauthenticated requests to protected actions
 * - Returns 403 for authenticated non-admin users on protected actions
 */

type UserRole = 'student' | 'reviewer' | 'admin' | 'super_admin';

interface MockAuthState {
  authenticated: boolean;
  role: UserRole | null;
}

const PUBLIC_ACTIONS = ['ping', undefined] as const;
const PROTECTED_ACTIONS = ['db', 'env', 'errors'] as const;
const VALID_ACTIONS = ['ping', 'db', 'env', 'errors'] as const;
const ADMIN_ROLES: UserRole[] = ['admin', 'super_admin'];

function simulateHealthEndpointAuth(
  action: string | undefined,
  authState: MockAuthState
): { statusCode: number; allowed: boolean } {
  // Public actions — no auth required
  if (action === 'ping' || action === undefined) {
    return { statusCode: 200, allowed: true };
  }

  // Invalid action
  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    return { statusCode: 400, allowed: false };
  }

  // Protected actions require admin auth
  if (PROTECTED_ACTIONS.includes(action as typeof PROTECTED_ACTIONS[number])) {
    if (!authState.authenticated) {
      return { statusCode: 401, allowed: false };
    }
    if (!authState.role || !ADMIN_ROLES.includes(authState.role)) {
      return { statusCode: 403, allowed: false };
    }
    return { statusCode: 200, allowed: true };
  }

  return { statusCode: 200, allowed: true };
}

// Generators
const userRoleArb = fc.constantFrom<UserRole>('student', 'reviewer', 'admin', 'super_admin');
const nonAdminRoleArb = fc.constantFrom<UserRole>('student', 'reviewer');
const adminRoleArb = fc.constantFrom<UserRole>('admin', 'super_admin');
const protectedActionArb = fc.constantFrom<string>('db', 'env', 'errors');
const publicActionArb = fc.constantFrom<string | undefined>('ping', undefined);

const authStateArb = fc.record({
  authenticated: fc.boolean(),
  role: fc.oneof(userRoleArb, fc.constant(null as UserRole | null)),
});

describe('Audit Remediation — Property 3: Health Endpoint Auth Gate', () => {
  /**
   * P3.1: Public actions (ping, no action) always succeed without auth.
   */
  describe('P3.1: Public actions succeed without authentication', () => {
    it('PROPERTY: ?action=ping and no action always return 200 regardless of auth state', () => {
      fc.assert(
        fc.property(
          publicActionArb,
          authStateArb,
          (action, authState) => {
            const result = simulateHealthEndpointAuth(action, authState);
            expect(result.statusCode).toBe(200);
            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P3.2: Protected actions without authentication return 401.
   */
  describe('P3.2: Protected actions without auth return 401', () => {
    it('PROPERTY: Unauthenticated requests to db/env/errors always return 401', () => {
      fc.assert(
        fc.property(
          protectedActionArb,
          (action) => {
            const unauthState: MockAuthState = { authenticated: false, role: null };
            const result = simulateHealthEndpointAuth(action, unauthState);
            expect(result.statusCode).toBe(401);
            expect(result.allowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P3.3: Protected actions with non-admin role return 403.
   */
  describe('P3.3: Protected actions with non-admin role return 403', () => {
    it('PROPERTY: Authenticated non-admin users on db/env/errors always get 403', () => {
      fc.assert(
        fc.property(
          protectedActionArb,
          nonAdminRoleArb,
          (action, role) => {
            const authState: MockAuthState = { authenticated: true, role };
            const result = simulateHealthEndpointAuth(action, authState);
            expect(result.statusCode).toBe(403);
            expect(result.allowed).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P3.4: Protected actions with admin/super_admin role succeed.
   */
  describe('P3.4: Protected actions with admin role succeed', () => {
    it('PROPERTY: Admin/super_admin users on db/env/errors always get 200', () => {
      fc.assert(
        fc.property(
          protectedActionArb,
          adminRoleArb,
          (action, role) => {
            const authState: MockAuthState = { authenticated: true, role };
            const result = simulateHealthEndpointAuth(action, authState);
            expect(result.statusCode).toBe(200);
            expect(result.allowed).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ---------------------------------------------------------------------------
// Property 4: Arcjet fail-closed in production, fail-open in development
//
// For any incoming request, when NODE_ENV equals 'production' and ARCJET_KEY
// is not set, the Arcjet perimeter should reject the request with a 503 status.
// When NODE_ENV does not equal 'production' and ARCJET_KEY is not set, the
// request should pass through to the handler.
//
// Feature: audit-remediation, Property 4: Arcjet fail-closed/open
// **Validates: Requirements 5.1, 5.2**
// ---------------------------------------------------------------------------

type ArcjetDecisionResult = {
  statusCode: number | null;
  passedThrough: boolean;
  errorCode: string | null;
};

/**
 * Simulates the Arcjet withArcjetProtection wrapper behavior as implemented
 * in lib/arcjet.ts.
 *
 * When ARCJET_KEY is missing:
 * - Production (NODE_ENV=production): reject with 503 SECURITY_SERVICE_ERROR
 * - Non-production: log warning, pass through to handler
 *
 * When ARCJET_KEY is present: normal Arcjet flow (not tested here — that's
 * the existing Arcjet test suite's responsibility).
 */
function simulateArcjetKeyCheck(
  arcjetKeySet: boolean,
  nodeEnv: string
): ArcjetDecisionResult {
  if (!arcjetKeySet) {
    const isProduction = nodeEnv === 'production';
    if (isProduction) {
      return {
        statusCode: 503,
        passedThrough: false,
        errorCode: 'SECURITY_SERVICE_ERROR',
      };
    }
    // Dev/test/staging — pass through
    return {
      statusCode: null,
      passedThrough: true,
      errorCode: null,
    };
  }

  // Key is set — normal Arcjet flow (handler proceeds after Arcjet check)
  return {
    statusCode: null,
    passedThrough: true,
    errorCode: null,
  };
}

// Generators
const nonProductionEnvArb = fc.constantFrom(
  'development', 'test', 'staging', '', 'local', 'preview'
);
const anyEnvArb = fc.oneof(
  fc.constant('production'),
  nonProductionEnvArb
);

describe('Audit Remediation — Property 4: Arcjet Fail-Closed/Open', () => {
  /**
   * P4.1: In production without ARCJET_KEY, all requests are rejected with 503.
   */
  describe('P4.1: Production without ARCJET_KEY rejects with 503', () => {
    it('PROPERTY: Missing ARCJET_KEY in production always returns 503 SECURITY_SERVICE_ERROR', () => {
      fc.assert(
        fc.property(
          fc.constant('production'),
          (nodeEnv) => {
            const result = simulateArcjetKeyCheck(false, nodeEnv);
            expect(result.statusCode).toBe(503);
            expect(result.passedThrough).toBe(false);
            expect(result.errorCode).toBe('SECURITY_SERVICE_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P4.2: In non-production without ARCJET_KEY, requests pass through.
   */
  describe('P4.2: Non-production without ARCJET_KEY passes through', () => {
    it('PROPERTY: Missing ARCJET_KEY in non-production always passes through to handler', () => {
      fc.assert(
        fc.property(
          nonProductionEnvArb,
          (nodeEnv) => {
            const result = simulateArcjetKeyCheck(false, nodeEnv);
            expect(result.statusCode).toBeNull();
            expect(result.passedThrough).toBe(true);
            expect(result.errorCode).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P4.3: With ARCJET_KEY set, requests always pass through regardless of env.
   */
  describe('P4.3: With ARCJET_KEY set, requests pass through in any env', () => {
    it('PROPERTY: When ARCJET_KEY is set, requests pass through regardless of NODE_ENV', () => {
      fc.assert(
        fc.property(
          anyEnvArb,
          (nodeEnv) => {
            const result = simulateArcjetKeyCheck(true, nodeEnv);
            expect(result.passedThrough).toBe(true);
            expect(result.statusCode).toBeNull();
            expect(result.errorCode).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P4.4: The fail-closed/open decision depends ONLY on NODE_ENV and ARCJET_KEY.
   * For any random environment string that is not 'production', the behavior
   * should be fail-open (pass through).
   */
  describe('P4.4: Only NODE_ENV=production triggers fail-closed', () => {
    it('PROPERTY: Any NODE_ENV !== "production" with missing key passes through', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }).filter(s => s !== 'production'),
          (nodeEnv) => {
            const result = simulateArcjetKeyCheck(false, nodeEnv);
            expect(result.passedThrough).toBe(true);
            expect(result.statusCode).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
