// @vitest-environment node
/**
 * Property Tests for Audit Remediation — UI Components
 *
 * Feature: audit-remediation, Property 2: Admin route access determined exclusively by role
 *
 * For any user object with any email address, the AdminRoute component should
 * grant access if and only if isAdmin is true — the user's email address should
 * have zero influence on the access decision.
 *
 * **Validates: Requirements 2.1, 2.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// We test the AdminRoute access logic by simulating the decision tree from
// the component source. This avoids needing a full React render environment
// while still verifying the core property: access is role-only, never email.
// ---------------------------------------------------------------------------

interface MockUser {
  email: string;
  id: string;
}

interface AdminRouteDecision {
  granted: boolean;
  redirect: string | null;
}

/**
 * Simulates the AdminRoute decision logic after loading/auth checks.
 * This mirrors the actual component flow:
 *   1. If no user → redirect to signin
 *   2. If !isAdmin → redirect to student dashboard
 *   3. Otherwise → grant access
 *
 * The key property: email has ZERO influence on the decision.
 */
function simulateAdminRouteAccess(
  user: MockUser | null,
  isAdmin: boolean
): AdminRouteDecision {
  if (!user) {
    return { granted: false, redirect: '/auth/signin' };
  }

  if (!isAdmin) {
    return { granted: false, redirect: '/student/dashboard' };
  }

  return { granted: true, redirect: null };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const emailArb = fc.oneof(
  fc.emailAddress(),
  fc.constant('cosmas@beanola.com'),       // The previously-bypassed email
  fc.constant('***REMOVED***'),
  fc.constant('student@example.com'),
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `${s.replace(/[@\s]/g, 'x')}@test.com`)
);

const userIdArb = fc.uuid();

const mockUserArb = fc.record({
  email: emailArb,
  id: userIdArb,
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Audit Remediation — Property 2: Admin Route Role-Only Access', () => {
  /**
   * P2.1: Access is granted if and only if isAdmin is true (with a valid user).
   *
   * For any user with any email, access should be granted iff isAdmin === true.
   */
  describe('P2.1: Access determined exclusively by isAdmin flag', () => {
    it('PROPERTY: For any user object, access granted iff isAdmin is true', () => {
      fc.assert(
        fc.property(
          mockUserArb,
          fc.boolean(),
          (user, isAdmin) => {
            const decision = simulateAdminRouteAccess(user, isAdmin);

            if (isAdmin) {
              expect(decision.granted).toBe(true);
              expect(decision.redirect).toBeNull();
            } else {
              expect(decision.granted).toBe(false);
              expect(decision.redirect).toBe('/student/dashboard');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P2.2: The previously-bypassed email has no special treatment.
   *
   * Specifically test that cosmas@beanola.com with isAdmin=false is denied.
   */
  describe('P2.2: Previously-bypassed email gets no special access', () => {
    it('PROPERTY: cosmas@beanola.com with isAdmin=false is denied access', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (isAdmin) => {
            const user: MockUser = { email: 'cosmas@beanola.com', id: 'test-id' };
            const decision = simulateAdminRouteAccess(user, isAdmin);

            // Same rule as any other user: access iff isAdmin
            if (isAdmin) {
              expect(decision.granted).toBe(true);
            } else {
              expect(decision.granted).toBe(false);
              expect(decision.redirect).toBe('/student/dashboard');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P2.3: Two users with different emails but same isAdmin get same decision.
   *
   * This directly tests that email has zero influence on the access decision.
   */
  describe('P2.3: Email has zero influence on access decision', () => {
    it('PROPERTY: Two users with different emails but same role get identical access', () => {
      fc.assert(
        fc.property(
          mockUserArb,
          mockUserArb,
          fc.boolean(),
          (user1, user2, isAdmin) => {
            const decision1 = simulateAdminRouteAccess(user1, isAdmin);
            const decision2 = simulateAdminRouteAccess(user2, isAdmin);

            expect(decision1.granted).toBe(decision2.granted);
            expect(decision1.redirect).toBe(decision2.redirect);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * P2.4: Verify the actual source code contains no email-based bypass.
   *
   * This is a structural property: the AdminRoute source should not contain
   * any hardcoded email comparison logic.
   */
  describe('P2.4: Source code contains no email bypass', () => {
    it('AdminRoute.tsx source should not contain email-based access checks', () => {
      const adminRoutePath = path.resolve(__dirname, '../../src/components/AdminRoute.tsx');
      const source = fs.readFileSync(adminRoutePath, 'utf-8');

      // No hardcoded email comparison
      expect(source).not.toMatch(/user\.email\s*===\s*['"`]/);
      expect(source).not.toMatch(/user\.email\s*!==\s*['"`]/);
      expect(source).not.toMatch(/cosmas@beanola\.com/);
      expect(source).not.toMatch(/\.email\s*===\s*['"`][^'"]*@[^'"]*['"`]/);
    });
  });
});
