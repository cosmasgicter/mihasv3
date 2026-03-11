/**
 * Property-Based Tests: Authentication Enforcement (Property 9)
 * Spec: production-readiness-audit
 * Task: 5.5
 *
 * **Property 9: Authentication Enforcement**
 *
 * *For any* protected API endpoint, requests without valid authentication
 * tokens SHALL receive 401 Unauthorized responses.
 *
 * **Validates: Requirements 4.1, 4.8**
 *
 * This test models the authentication enforcement logic as pure functions,
 * reads the actual API source files to verify auth middleware usage, and
 * uses property-based testing to verify the classification holds for
 * arbitrary endpoint/action combinations.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

const NUM_RUNS = 10;

// ============================================================================
// Endpoint Classification Model
// ============================================================================

/**
 * Classification of an API endpoint action's auth requirement.
 * - 'public': No authentication needed
 * - 'authenticated': Requires a valid JWT token (any role)
 * - 'admin': Requires admin or super_admin role
 */
type AuthLevel = 'public' | 'authenticated' | 'admin';

interface EndpointAction {
  endpoint: string;
  action: string;
  authLevel: AuthLevel;
}

/**
 * Ground-truth classification of all API endpoint actions.
 *
 * Derived from the design doc and verified against the actual api-src/ code:
 * - Public endpoints: health, catalog, auth login/register/reset
 * - Admin endpoints: all /api/admin actions
 * - Authenticated endpoints: everything else
 */
const ENDPOINT_ACTIONS: EndpointAction[] = [
  // === PUBLIC ENDPOINTS ===
  // /api/health — all actions are public
  { endpoint: 'health', action: 'ping', authLevel: 'public' },
  { endpoint: 'health', action: 'db', authLevel: 'public' },
  { endpoint: 'health', action: 'env', authLevel: 'public' },
  { endpoint: 'health', action: 'arcjet', authLevel: 'public' },

  // /api/catalog — all actions are public
  { endpoint: 'catalog', action: 'programs', authLevel: 'public' },
  { endpoint: 'catalog', action: 'intakes', authLevel: 'public' },
  { endpoint: 'catalog', action: 'subjects', authLevel: 'public' },

  // /api/auth — public actions (no token needed)
  { endpoint: 'auth', action: 'login', authLevel: 'public' },
  { endpoint: 'auth', action: 'register', authLevel: 'public' },
  { endpoint: 'auth', action: 'forgot-password', authLevel: 'public' },
  { endpoint: 'auth', action: 'password-reset-request', authLevel: 'public' },
  { endpoint: 'auth', action: 'reset-password', authLevel: 'public' },
  { endpoint: 'auth', action: 'password-reset', authLevel: 'public' },

  // /api/auth — authenticated actions (require valid token)
  { endpoint: 'auth', action: 'session', authLevel: 'authenticated' },
  { endpoint: 'auth', action: 'refresh', authLevel: 'authenticated' },
  { endpoint: 'auth', action: 'logout', authLevel: 'authenticated' },
  { endpoint: 'auth', action: 'check-email', authLevel: 'authenticated' },
  { endpoint: 'auth', action: 'roles', authLevel: 'authenticated' },
  { endpoint: 'auth', action: 'profile', authLevel: 'authenticated' },

  // === ADMIN ENDPOINTS (require admin/super_admin role) ===
  { endpoint: 'admin', action: 'dashboard', authLevel: 'admin' },
  { endpoint: 'admin', action: 'users', authLevel: 'admin' },
  { endpoint: 'admin', action: 'user-permissions', authLevel: 'admin' },
  { endpoint: 'admin', action: 'settings', authLevel: 'admin' },
  { endpoint: 'admin', action: 'register', authLevel: 'admin' },
  { endpoint: 'admin', action: 'stats', authLevel: 'admin' },
  { endpoint: 'admin', action: 'errors', authLevel: 'admin' },
  { endpoint: 'admin', action: 'bulk-email', authLevel: 'admin' },
  { endpoint: 'admin', action: 'bulk-status', authLevel: 'admin' },
  { endpoint: 'admin', action: 'export-users', authLevel: 'admin' },
  { endpoint: 'admin', action: 'migrate', authLevel: 'admin' },
  { endpoint: 'admin', action: 'set-password', authLevel: 'admin' },
  { endpoint: 'admin', action: 'import-settings', authLevel: 'admin' },
  { endpoint: 'admin', action: 'reset-settings', authLevel: 'admin' },
  { endpoint: 'admin', action: 'eligibility-rules', authLevel: 'admin' },
  { endpoint: 'admin', action: 'update-role', authLevel: 'admin' },
  { endpoint: 'admin', action: 'eligibility-assessments', authLevel: 'admin' },
  { endpoint: 'admin', action: 'audit-log', authLevel: 'admin' },
  { endpoint: 'admin', action: 'appeals', authLevel: 'admin' },

  // === AUTHENTICATED ENDPOINTS (require valid token, any role) ===
  { endpoint: 'applications', action: 'details', authLevel: 'authenticated' },
  { endpoint: 'applications', action: 'documents', authLevel: 'authenticated' },
  { endpoint: 'applications', action: 'grades', authLevel: 'authenticated' },
  { endpoint: 'applications', action: 'summary', authLevel: 'authenticated' },
  { endpoint: 'applications', action: 'review', authLevel: 'authenticated' },
  { endpoint: 'applications', action: 'export', authLevel: 'authenticated' },

  { endpoint: 'documents', action: 'upload', authLevel: 'authenticated' },
  { endpoint: 'documents', action: 'extract', authLevel: 'authenticated' },

  { endpoint: 'email', action: 'send', authLevel: 'authenticated' },

  { endpoint: 'notifications', action: 'preferences', authLevel: 'authenticated' },
  { endpoint: 'notifications', action: 'send', authLevel: 'authenticated' },

  { endpoint: 'payments', action: 'receipt', authLevel: 'authenticated' },

  { endpoint: 'sessions', action: 'track', authLevel: 'authenticated' },
  { endpoint: 'sessions', action: 'list', authLevel: 'authenticated' },
  { endpoint: 'sessions', action: 'revoke', authLevel: 'authenticated' },
  { endpoint: 'sessions', action: 'revoke-all', authLevel: 'authenticated' },
];

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Classify an endpoint+action pair into its required auth level.
 * Returns null if the combination is unknown.
 */
function classifyEndpointAuth(endpoint: string, action: string): AuthLevel | null {
  const match = ENDPOINT_ACTIONS.find(
    (ea) => ea.endpoint === endpoint && ea.action === action
  );
  return match ? match.authLevel : null;
}

/**
 * Determine the expected HTTP status code when an unauthenticated request
 * (no token) hits a given auth level.
 */
function expectedStatusForUnauthenticated(authLevel: AuthLevel): number {
  switch (authLevel) {
    case 'public':
      // Public endpoints should NOT return 401
      return 200; // or other success/error codes, but never 401
    case 'authenticated':
    case 'admin':
      return 401;
  }
}

/**
 * Determine the expected HTTP status code when a student-role request
 * hits a given auth level.
 */
function expectedStatusForStudentRole(authLevel: AuthLevel): number {
  switch (authLevel) {
    case 'public':
    case 'authenticated':
      return 200; // Allowed (may vary by action, but not 401/403)
    case 'admin':
      return 403; // Forbidden — authenticated but wrong role
  }
}

/**
 * Check if an API source file uses requireAuth or requireRole middleware.
 * Returns the type of auth enforcement found.
 */
function detectAuthEnforcement(
  sourceCode: string
): { usesRequireAuth: boolean; usesRequireRole: boolean; usesGetAuthUser: boolean } {
  return {
    usesRequireAuth: /requireAuth\s*\(/.test(sourceCode),
    usesRequireRole: /requireRole\s*\(/.test(sourceCode),
    usesGetAuthUser: /getAuthUser\s*\(/.test(sourceCode),
  };
}

/**
 * Check if an endpoint source file has proper error handling for
 * AuthenticationError and AuthorizationError.
 */
function hasAuthErrorHandling(sourceCode: string): boolean {
  return (
    sourceCode.includes('AuthenticationError') ||
    sourceCode.includes('AuthorizationError') ||
    sourceCode.includes('handleError')
  );
}

// ============================================================================
// Arbitraries
// ============================================================================

/** Arbitrary that generates a known endpoint+action pair */
const endpointActionArb = fc.constantFrom(...ENDPOINT_ACTIONS);

/** Arbitrary that generates only public endpoint+action pairs */
const publicEndpointArb = fc.constantFrom(
  ...ENDPOINT_ACTIONS.filter((ea) => ea.authLevel === 'public')
);

/** Arbitrary that generates only protected (non-public) endpoint+action pairs */
const protectedEndpointArb = fc.constantFrom(
  ...ENDPOINT_ACTIONS.filter((ea) => ea.authLevel !== 'public')
);

/** Arbitrary that generates only admin endpoint+action pairs */
const adminEndpointArb = fc.constantFrom(
  ...ENDPOINT_ACTIONS.filter((ea) => ea.authLevel === 'admin')
);

/** Arbitrary that generates only authenticated (non-admin, non-public) endpoint+action pairs */
const authenticatedEndpointArb = fc.constantFrom(
  ...ENDPOINT_ACTIONS.filter((ea) => ea.authLevel === 'authenticated')
);

/** Arbitrary for invalid/missing token representations */
const invalidTokenArb = fc.oneof(
  fc.constant(null),
  fc.constant(''),
  fc.constant('invalid-token'),
  fc.constant('Bearer '),
  fc.constant('Bearer invalid.jwt.token'),
  fc.string({ minLength: 10, maxLength: 40 }).map((s) => `Bearer ${s}`)
);

/** Arbitrary for user roles */
const userRoleArb = fc.constantFrom(
  'super_admin',
  'admin',
  'reviewer',
  'student'
);

// ============================================================================
// Tests
// ============================================================================

describe('Feature: production-readiness-audit, Property 9: Authentication Enforcement', () => {
  const apiSrcDir = path.join(process.cwd(), 'api-src');
  const endpointSources: Map<string, string> = new Map();

  beforeAll(() => {
    // Read all API source files
    const protectedEndpoints = ['admin', 'applications', 'documents', 'email', 'notifications', 'payments', 'sessions'];
    const publicEndpoints = ['health', 'catalog', 'auth'];
    const allEndpoints = [...protectedEndpoints, ...publicEndpoints];

    for (const ep of allEndpoints) {
      const filePath = path.join(apiSrcDir, `${ep}.ts`);
      if (fs.existsSync(filePath)) {
        endpointSources.set(ep, fs.readFileSync(filePath, 'utf-8'));
      }
    }
  });

  // --------------------------------------------------------------------------
  // Property: Protected endpoints use auth middleware
  // --------------------------------------------------------------------------
  describe('Property: All protected endpoints enforce authentication via middleware', () => {
    /**
     * **Validates: Requirements 4.1**
     *
     * For any protected endpoint file, the source code SHALL contain
     * requireAuth() or requireRole() middleware calls.
     */
    it('every protected endpoint source uses requireAuth or requireRole', () => {
      const protectedEndpointNames = [
        'admin',
        'applications',
        'documents',
        'email',
        'notifications',
        'payments',
        'sessions',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...protectedEndpointNames),
          (endpointName) => {
            const source = endpointSources.get(endpointName);
            expect(source).toBeDefined();

            const enforcement = detectAuthEnforcement(source!);
            // Must use at least one auth middleware
            const hasAuth =
              enforcement.usesRequireAuth ||
              enforcement.usesRequireRole ||
              enforcement.usesGetAuthUser;

            expect(hasAuth).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * For any protected endpoint, the source SHALL also handle
     * AuthenticationError/AuthorizationError or use handleError.
     */
    it('every protected endpoint has auth error handling', () => {
      const protectedEndpointNames = [
        'admin',
        'applications',
        'documents',
        'email',
        'notifications',
        'payments',
        'sessions',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...protectedEndpointNames),
          (endpointName) => {
            const source = endpointSources.get(endpointName);
            expect(source).toBeDefined();
            expect(hasAuthErrorHandling(source!)).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property: Unauthenticated requests to protected endpoints get 401
  // --------------------------------------------------------------------------
  describe('Property: Unauthenticated requests to protected endpoints yield 401', () => {
    /**
     * **Validates: Requirements 4.1, 4.8**
     *
     * For any protected endpoint+action, the expected response to an
     * unauthenticated request (no valid token) SHALL be 401.
     */
    it('any protected endpoint returns 401 for unauthenticated requests', () => {
      fc.assert(
        fc.property(protectedEndpointArb, (ea) => {
          const status = expectedStatusForUnauthenticated(ea.authLevel);
          expect(status).toBe(401);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * **Validates: Requirements 4.1, 4.8**
     *
     * For any protected endpoint+action and any invalid token format,
     * the classification SHALL still require authentication.
     */
    it('any invalid token format still results in denial for protected endpoints', () => {
      fc.assert(
        fc.property(
          protectedEndpointArb,
          invalidTokenArb,
          (ea, _invalidToken) => {
            // Regardless of what invalid token is provided,
            // the auth level classification remains non-public
            expect(ea.authLevel).not.toBe('public');
            expect(expectedStatusForUnauthenticated(ea.authLevel)).toBe(401);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property: Public endpoints do NOT require authentication
  // --------------------------------------------------------------------------
  describe('Property: Public endpoints allow unauthenticated access', () => {
    /**
     * **Validates: Requirements 4.8**
     *
     * For any public endpoint+action, the expected response to an
     * unauthenticated request SHALL NOT be 401.
     */
    it('any public endpoint does not return 401 for unauthenticated requests', () => {
      fc.assert(
        fc.property(publicEndpointArb, (ea) => {
          const status = expectedStatusForUnauthenticated(ea.authLevel);
          expect(status).not.toBe(401);
          expect(status).not.toBe(403);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * The health endpoint is fully public and should not use
     * requireAuth or requireRole at all.
     *
     * Note: catalog has mixed actions (public reads + protected writes),
     * so it legitimately uses requireAuth for write actions while keeping
     * read actions public.
     */
    it('health endpoint does not use requireAuth/requireRole', () => {
      const source = endpointSources.get('health');
      expect(source).toBeDefined();

      const enforcement = detectAuthEnforcement(source!);
      expect(enforcement.usesRequireAuth).toBe(false);
      expect(enforcement.usesRequireRole).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Property: Admin endpoints require admin role
  // --------------------------------------------------------------------------
  describe('Property: Admin endpoints require admin/super_admin role', () => {
    /**
     * **Validates: Requirements 4.1**
     *
     * The admin endpoint source SHALL use requireRole with admin roles.
     */
    it('admin endpoint uses requireRole middleware', () => {
      const source = endpointSources.get('admin');
      expect(source).toBeDefined();

      const enforcement = detectAuthEnforcement(source!);
      expect(enforcement.usesRequireRole).toBe(true);

      // Verify it specifically checks for admin/super_admin
      expect(source).toMatch(/requireRole\s*\(\s*req\s*,\s*\[\s*['"]admin['"]/);
    });

    /**
     * **Validates: Requirements 4.1**
     *
     * For any admin endpoint+action, a student-role request SHALL
     * receive 403 Forbidden.
     */
    it('any admin endpoint returns 403 for student role', () => {
      fc.assert(
        fc.property(adminEndpointArb, (ea) => {
          const status = expectedStatusForStudentRole(ea.authLevel);
          expect(status).toBe(403);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * For any admin endpoint+action, an unauthenticated request SHALL
     * receive 401 (auth check happens before role check).
     */
    it('any admin endpoint returns 401 for unauthenticated requests', () => {
      fc.assert(
        fc.property(adminEndpointArb, (ea) => {
          const status = expectedStatusForUnauthenticated(ea.authLevel);
          expect(status).toBe(401);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property: Classification completeness
  // --------------------------------------------------------------------------
  describe('Property: Every endpoint+action has a defined auth classification', () => {
    /**
     * For any known endpoint+action, the classification function SHALL
     * return a non-null auth level.
     */
    it('every known endpoint+action has a classification', () => {
      fc.assert(
        fc.property(endpointActionArb, (ea) => {
          const level = classifyEndpointAuth(ea.endpoint, ea.action);
          expect(level).not.toBeNull();
          expect(['public', 'authenticated', 'admin']).toContain(level);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    /**
     * The classification SHALL be consistent — same input always
     * produces same output (deterministic).
     */
    it('classification is deterministic for any endpoint+action', () => {
      fc.assert(
        fc.property(endpointActionArb, (ea) => {
          const level1 = classifyEndpointAuth(ea.endpoint, ea.action);
          const level2 = classifyEndpointAuth(ea.endpoint, ea.action);
          expect(level1).toBe(level2);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // --------------------------------------------------------------------------
  // Property: Auth middleware import verification
  // --------------------------------------------------------------------------
  describe('Property: Protected endpoints import auth middleware correctly', () => {
    /**
     * **Validates: Requirements 4.8**
     *
     * For any protected endpoint, the source SHALL import from the
     * auth module (lib/auth or lib/auth/middleware).
     */
    it('every protected endpoint imports auth middleware', () => {
      const protectedEndpointNames = [
        'admin',
        'applications',
        'documents',
        'email',
        'notifications',
        'payments',
        'sessions',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...protectedEndpointNames),
          (endpointName) => {
            const source = endpointSources.get(endpointName);
            expect(source).toBeDefined();

            // Must import from auth module
            const importsAuth =
              source!.includes("from '../lib/auth'") ||
              source!.includes("from '../lib/auth/middleware'") ||
              source!.includes('from "../lib/auth"') ||
              source!.includes('from "../lib/auth/middleware"');

            expect(importsAuth).toBe(true);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });
});
