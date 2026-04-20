/**
 * Property-based tests for admin role determination
 * Feature: single-source-of-truth-consolidation
 *
 * Property 8: Admin status determined solely by role
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { checkIsAdmin } from '@/hooks/auth/useSessionListener';
import { isAdminRole, ADMIN_ROLES } from '@/lib/auth/roles';
import type { User } from '@/types/auth';

// ── Arbitraries ─────────────────────────────────────────────────────────

/** All known roles (admin + non-admin) plus edge values */
const knownRoles = [
  ...ADMIN_ROLES,
  'student',
  'reviewer',
];

/** Arbitrary role value: known roles, random strings, undefined, or null */
const roleArb = fc.oneof(
  fc.constantFrom(...knownRoles),
  fc.constant(undefined),
  fc.constant(null),
  fc.string({ minLength: 0, maxLength: 20 }),
) as fc.Arbitrary<string | undefined | null>;

/** Arbitrary user object with random role fields, email, and id */
const userArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 36 }),
  email: fc.emailAddress(),
  role: roleArb as fc.Arbitrary<string>,
  user_metadata: fc.option(
    fc.record({ role: roleArb as fc.Arbitrary<unknown> }),
    { nil: undefined },
  ),
  app_metadata: fc.option(
    fc.record({ role: roleArb as fc.Arbitrary<unknown> }),
    { nil: undefined },
  ),
}) as fc.Arbitrary<User>;

// ── Tests ───────────────────────────────────────────────────────────────

describe('Admin Role Determination Property Tests', () => {
  // Feature: single-source-of-truth-consolidation, Property 8: Admin status determined solely by role
  // **Validates: Requirements 5.1, 5.5, 10.3**
  describe('Property 8: Admin status determined solely by role', () => {
    it('checkIsAdmin(user) matches isAdminRole on the top-level role for any user object', () => {
      fc.assert(
        fc.property(userArb, (user) => {
          const resolvedRole = user.role as string | undefined;
          const expected = isAdminRole(resolvedRole);
          const actual = checkIsAdmin(user);
          expect(actual).toBe(expected);
        }),
        { numRuns: 10 },
      );
    });

    it('checkIsAdmin(null) returns false', () => {
      expect(checkIsAdmin(null)).toBe(false);
    });

    it('email and id fields do not affect admin determination', () => {
      fc.assert(
        fc.property(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 36 }),
          roleArb as fc.Arbitrary<string>,
          (email, id, role) => {
            const user1: User = { id: 'fixed-id', email: 'a@b.com', role: role ?? '' };
            const user2: User = { id, email, role: role ?? '' };
            // Same role → same admin result, regardless of email/id
            expect(checkIsAdmin(user1)).toBe(checkIsAdmin(user2));
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});
