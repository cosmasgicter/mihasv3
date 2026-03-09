/**
 * Property-Based Tests: RBAC Determinism and Correctness (Property 4)
 * Spec: production-remediation
 * Task: 9.4
 *
 * **Property 4: RBAC determinism and correctness**
 *
 * *For any* role from the set {super_admin, admin, reviewer, student} and any action
 * from the set of all API actions, calling `hasPermission(role, action)` must always
 * return the same boolean result. Furthermore, student roles must be denied all admin
 * actions, and reviewer roles must be denied all write actions.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
 *
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  USER_ROLES,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
  roleHasPermission,
  type UserRole,
  type Permission,
} from '../../lib/auth/permissions';

const NUM_RUNS = 10;

// ============================================================================
// Generators
// ============================================================================

/** All four primary roles referenced in the spec */
const primaryRoleArb: fc.Arbitrary<UserRole> = fc.constantFrom(
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.REVIEWER,
  USER_ROLES.STUDENT
);

/** All roles in the system (including extended roles) */
const allRoleArb: fc.Arbitrary<UserRole> = fc.constantFrom(
  ...Object.values(USER_ROLES)
);

/** Collect every unique permission across all roles */
const ALL_PERMISSIONS: Permission[] = [
  ...new Set(Object.values(ROLE_PERMISSIONS).flat()),
];

/**
 * Admin-tier permissions: permissions from non-student roles.
 * super_admin should have all of these. Student _own permissions
 * are intentionally excluded since super_admin uses admin-level
 * equivalents (e.g. applications:read instead of applications:read_own).
 */
const ADMIN_TIER_PERMISSIONS: Permission[] = [
  ...new Set(
    Object.entries(ROLE_PERMISSIONS)
      .filter(([role]) => role !== USER_ROLES.STUDENT)
      .flatMap(([, perms]) => perms)
  ),
];

const anyPermissionArb: fc.Arbitrary<Permission> = fc.constantFrom(...ALL_PERMISSIONS);
const adminTierPermissionArb: fc.Arbitrary<Permission> = fc.constantFrom(...ADMIN_TIER_PERMISSIONS);

/** Generate resource:action style permission strings (may or may not exist) */
const syntheticPermissionArb: fc.Arbitrary<Permission> = fc.tuple(
  fc.constantFrom('users', 'applications', 'programs', 'payments', 'documents', 'analytics', 'settings', 'profile'),
  fc.constantFrom('read', 'write', 'delete', 'create', 'update', 'verify', 'review', 'read_own', 'update_own', 'upload_own', 'make_own')
).map(([r, a]) => `${r}:${a}`);

// ============================================================================
// Admin-only permissions (not held by student or reviewer)
// ============================================================================

/** Permissions that only admin/super_admin should have */
const ADMIN_ONLY_PERMISSIONS: Permission[] = [
  'users:read',
  'users:write',
  'users:delete',
  'settings:read',
  'settings:write',
];

/** Write/modify permissions that reviewers must NOT have */
const WRITE_PERMISSIONS: Permission[] = [
  'users:write',
  'users:delete',
  'applications:write',
  'programs:write',
  'payments:verify',
  'documents:verify',
  'settings:write',
];

// ============================================================================
// Property 4: RBAC Determinism — hasPermission is pure
// ============================================================================

describe('Property 4: RBAC determinism and correctness', () => {
  /**
   * **Validates: Requirements 9.6**
   * Same role + same action = same boolean result, every time.
   */
  describe('Determinism (purity)', () => {
    it('PROPERTY: roleHasPermission is pure — same role+action always returns the same result', () => {
      fc.assert(
        fc.property(allRoleArb, anyPermissionArb, (role, permission) => {
          const first = roleHasPermission(role, permission);
          for (let i = 0; i < 5; i++) {
            expect(roleHasPermission(role, permission)).toBe(first);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: hasPermission is pure — same permissions array + action always returns the same result', () => {
      fc.assert(
        fc.property(allRoleArb, syntheticPermissionArb, (role, permission) => {
          const perms = getPermissionsForRole(role);
          const first = hasPermission(perms, permission);
          for (let i = 0; i < 5; i++) {
            expect(hasPermission(perms, permission)).toBe(first);
          }
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: roleHasPermission agrees with hasPermission(getPermissionsForRole(role), perm)', () => {
      fc.assert(
        fc.property(allRoleArb, syntheticPermissionArb, (role, permission) => {
          const viaRole = roleHasPermission(role, permission);
          const viaLookup = hasPermission(getPermissionsForRole(role), permission);
          expect(viaRole).toBe(viaLookup);
        }),
        { numRuns: NUM_RUNS }
      );
    });
  });

  // ==========================================================================
  // Student denied all admin actions — Req 9.3
  // ==========================================================================

  /**
   * **Validates: Requirements 9.3**
   * Student roles must be denied all admin actions.
   */
  describe('Student denied all admin actions', () => {
    it('PROPERTY: student is denied every admin-only permission', () => {
      const adminOnlyArb = fc.constantFrom(...ADMIN_ONLY_PERMISSIONS);
      fc.assert(
        fc.property(adminOnlyArb, (perm) => {
          expect(roleHasPermission(USER_ROLES.STUDENT, perm)).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('student has no overlap with admin-only permissions', () => {
      const studentPerms = new Set(getPermissionsForRole(USER_ROLES.STUDENT));
      for (const perm of ADMIN_ONLY_PERMISSIONS) {
        expect(studentPerms.has(perm)).toBe(false);
      }
    });

    it('student permissions are all _own scoped', () => {
      const studentPerms = getPermissionsForRole(USER_ROLES.STUDENT);
      for (const perm of studentPerms) {
        const action = perm.split(':')[1];
        // Student permissions should be own-scoped (e.g. read_own, update_own)
        // or create (which is inherently own-scoped)
        expect(
          action.endsWith('_own') || action === 'create'
        ).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Reviewer denied all write actions — Req 9.4
  // ==========================================================================

  /**
   * **Validates: Requirements 9.4**
   * Reviewer roles must be denied all write actions.
   */
  describe('Reviewer denied all write actions', () => {
    it('PROPERTY: reviewer is denied every write/modify permission', () => {
      const writePermArb = fc.constantFrom(...WRITE_PERMISSIONS);
      fc.assert(
        fc.property(writePermArb, (perm) => {
          expect(roleHasPermission(USER_ROLES.REVIEWER, perm)).toBe(false);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('reviewer permissions contain only read and review actions', () => {
      const reviewerPerms = getPermissionsForRole(USER_ROLES.REVIEWER);
      for (const perm of reviewerPerms) {
        const action = perm.split(':')[1];
        expect(['read', 'review']).toContain(action);
      }
    });
  });

  // ==========================================================================
  // Super_admin has access to everything — Req 9.1, 9.2
  // ==========================================================================

  /**
   * **Validates: Requirements 9.1, 9.2**
   * super_admin has access to every defined permission.
   */
  describe('Super_admin has full access', () => {
    it('PROPERTY: super_admin has every admin-tier permission (non-student scoped)', () => {
      fc.assert(
        fc.property(adminTierPermissionArb, (perm) => {
          expect(roleHasPermission(USER_ROLES.SUPER_ADMIN, perm)).toBe(true);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('super_admin permission set is a superset of every other role', () => {
      const superPerms = new Set(getPermissionsForRole(USER_ROLES.SUPER_ADMIN));
      for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
        if (role === USER_ROLES.SUPER_ADMIN || role === USER_ROLES.STUDENT) continue;
        // Student has _own permissions that super_admin doesn't need
        for (const perm of perms) {
          expect(superPerms.has(perm)).toBe(true);
        }
      }
    });
  });

  // ==========================================================================
  // Auth required before business logic — Req 9.1, 9.5
  // ==========================================================================

  /**
   * **Validates: Requirements 9.1, 9.5**
   * Every authenticated action must go through permission check.
   * We verify the permission model is complete for all roles.
   */
  describe('Permission model completeness', () => {
    it('PROPERTY: every role has a non-empty permission set', () => {
      fc.assert(
        fc.property(allRoleArb, (role) => {
          const perms = getPermissionsForRole(role);
          expect(perms.length).toBeGreaterThan(0);
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: permission check never throws for any role+permission combination', () => {
      fc.assert(
        fc.property(allRoleArb, syntheticPermissionArb, (role, permission) => {
          // Should never throw, always return boolean
          const result = roleHasPermission(role, permission);
          expect(typeof result).toBe('boolean');
        }),
        { numRuns: NUM_RUNS }
      );
    });

    it('admin has applications:write but reviewer does not', () => {
      expect(roleHasPermission(USER_ROLES.ADMIN, 'applications:write')).toBe(true);
      expect(roleHasPermission(USER_ROLES.REVIEWER, 'applications:write')).toBe(false);
    });
  });
});
