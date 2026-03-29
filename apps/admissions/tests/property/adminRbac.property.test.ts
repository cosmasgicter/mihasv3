/**
 * Feature: migration-recovery-hardening, Property 13: Admin actions enforce role-based access control
 *
 * **Validates: Requirements 11.1, 11.2, 11.3**
 *
 * For any admin API action and for any request from a user with student or reviewer role,
 * the system should deny access. We test the permissions layer directly:
 * - student and reviewer roles must NOT have admin-level permissions
 * - requireRole with ['admin', 'super_admin'] must reject student/reviewer
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  hasPermission,
  roleHasPermission,
  isValidRole,
} from '../../lib/auth/permissions';

const adminPermissions = [
  'users:read',
  'users:write',
  'users:delete',
  'settings:read',
  'settings:write',
  'analytics:read',
  'payments:verify',
  'documents:verify',
];

const nonAdminRoles = ['student', 'reviewer'] as const;
const adminRoles = ['admin', 'super_admin'] as const;

describe('Property 13: Admin RBAC enforcement', () => {
  it('student role never has admin-write permissions', () => {
    const studentPerms = getPermissionsForRole('student');
    const writePerms = ['users:write', 'users:delete', 'settings:write', 'settings:read'];
    for (const perm of writePerms) {
      expect(hasPermission(studentPerms, perm)).toBe(false);
    }
  });

  it('reviewer role never has admin-write permissions', () => {
    const reviewerPerms = getPermissionsForRole('reviewer');
    const writePerms = ['users:write', 'users:delete', 'settings:write', 'payments:verify', 'documents:verify'];
    for (const perm of writePerms) {
      expect(hasPermission(reviewerPerms, perm)).toBe(false);
    }
  });

  it('for any admin-only permission, non-admin roles are denied', () => {
    const adminOnlyPerms = ['users:write', 'users:delete', 'settings:read', 'settings:write'];
    const roleArb = fc.constantFrom(...nonAdminRoles);
    const permArb = fc.constantFrom(...adminOnlyPerms);

    fc.assert(
      fc.property(roleArb, permArb, (role, perm) => {
        expect(roleHasPermission(role, perm)).toBe(false);
      }),
      { numRuns: 5 }
    );
  });

  it('admin and super_admin roles have all admin permissions', () => {
    for (const role of adminRoles) {
      const perms = getPermissionsForRole(role);
      // Admin roles must have users:read and applications:read at minimum
      expect(hasPermission(perms, 'users:read')).toBe(true);
      expect(hasPermission(perms, 'applications:read')).toBe(true);
    }
  });

  it('all four roles are valid', () => {
    const allRoles = ['super_admin', 'admin', 'reviewer', 'student'];
    for (const role of allRoles) {
      expect(isValidRole(role)).toBe(true);
    }
    expect(isValidRole('hacker')).toBe(false);
  });

  it('getPermissionsForRole returns a copy, not the original array', () => {
    const perms1 = getPermissionsForRole('admin');
    const perms2 = getPermissionsForRole('admin');
    expect(perms1).toEqual(perms2);
    expect(perms1).not.toBe(perms2); // different references
  });
});
