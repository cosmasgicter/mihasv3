/**
 * Unit Tests for Role-Based Permissions Module
 * 
 * Tests the permissions module implementation for:
 * - USER_ROLES constant definition (Requirement 8.1)
 * - ROLE_PERMISSIONS mapping (Requirement 8.3)
 * - hasPermission() check (Requirement 8.4)
 * - Permission determinism (no database lookup)
 * 
 * @module tests/unit/auth-permissions.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  USER_ROLES,
  ALL_USER_ROLES,
  ROLE_PERMISSIONS,
  getPermissionsForRole,
  isValidRole,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  roleHasPermission,
  getPermissionDescription,
  getAllPermissionsGrouped,
  type UserRole,
  type Permission,
} from "../../api/_lib/auth/permissions";

describe("Role-Based Permissions Module", () => {
  describe("USER_ROLES constant (Requirement 8.1)", () => {
    it("should define super_admin role", () => {
      expect(USER_ROLES.SUPER_ADMIN).toBe("super_admin");
    });

    it("should define admin role", () => {
      expect(USER_ROLES.ADMIN).toBe("admin");
    });

    it("should define reviewer role", () => {
      expect(USER_ROLES.REVIEWER).toBe("reviewer");
    });

    it("should define student role", () => {
      expect(USER_ROLES.STUDENT).toBe("student");
    });

    it("should have exactly 4 roles", () => {
      expect(Object.keys(USER_ROLES)).toHaveLength(4);
    });

    it("should have all roles in ALL_USER_ROLES array", () => {
      expect(ALL_USER_ROLES).toContain("super_admin");
      expect(ALL_USER_ROLES).toContain("admin");
      expect(ALL_USER_ROLES).toContain("reviewer");
      expect(ALL_USER_ROLES).toContain("student");
      expect(ALL_USER_ROLES).toHaveLength(4);
    });
  });

  describe("ROLE_PERMISSIONS mapping (Requirement 8.3)", () => {
    describe("super_admin permissions", () => {
      const permissions = ROLE_PERMISSIONS.super_admin;

      it("should have user management permissions", () => {
        expect(permissions).toContain("users:read");
        expect(permissions).toContain("users:write");
        expect(permissions).toContain("users:delete");
      });

      it("should have application management permissions", () => {
        expect(permissions).toContain("applications:read");
        expect(permissions).toContain("applications:write");
        expect(permissions).toContain("applications:review");
      });

      it("should have program management permissions", () => {
        expect(permissions).toContain("programs:read");
        expect(permissions).toContain("programs:write");
      });

      it("should have payment management permissions", () => {
        expect(permissions).toContain("payments:read");
        expect(permissions).toContain("payments:verify");
      });

      it("should have document management permissions", () => {
        expect(permissions).toContain("documents:read");
        expect(permissions).toContain("documents:verify");
      });

      it("should have analytics access", () => {
        expect(permissions).toContain("analytics:read");
      });

      it("should have settings management permissions", () => {
        expect(permissions).toContain("settings:read");
        expect(permissions).toContain("settings:write");
      });
    });

    describe("admin permissions", () => {
      const permissions = ROLE_PERMISSIONS.admin;

      it("should have read-only user access", () => {
        expect(permissions).toContain("users:read");
        expect(permissions).not.toContain("users:write");
        expect(permissions).not.toContain("users:delete");
      });

      it("should have application management permissions", () => {
        expect(permissions).toContain("applications:read");
        expect(permissions).toContain("applications:write");
        expect(permissions).toContain("applications:review");
      });

      it("should have read-only program access", () => {
        expect(permissions).toContain("programs:read");
        expect(permissions).not.toContain("programs:write");
      });

      it("should have payment verification permissions", () => {
        expect(permissions).toContain("payments:read");
        expect(permissions).toContain("payments:verify");
      });

      it("should have document verification permissions", () => {
        expect(permissions).toContain("documents:read");
        expect(permissions).toContain("documents:verify");
      });

      it("should have analytics access", () => {
        expect(permissions).toContain("analytics:read");
      });

      it("should NOT have settings management permissions", () => {
        expect(permissions).not.toContain("settings:read");
        expect(permissions).not.toContain("settings:write");
      });
    });

    describe("reviewer permissions", () => {
      const permissions = ROLE_PERMISSIONS.reviewer;

      it("should have application read and review permissions", () => {
        expect(permissions).toContain("applications:read");
        expect(permissions).toContain("applications:review");
      });

      it("should NOT have application write permissions", () => {
        expect(permissions).not.toContain("applications:write");
      });

      it("should have document read permissions", () => {
        expect(permissions).toContain("documents:read");
      });

      it("should NOT have document verify permissions", () => {
        expect(permissions).not.toContain("documents:verify");
      });

      it("should NOT have user permissions", () => {
        expect(permissions).not.toContain("users:read");
        expect(permissions).not.toContain("users:write");
      });

      it("should NOT have payment permissions", () => {
        expect(permissions).not.toContain("payments:read");
        expect(permissions).not.toContain("payments:verify");
      });

      it("should have limited permissions (only 3)", () => {
        expect(permissions).toHaveLength(3);
      });
    });

    describe("student permissions", () => {
      const permissions = ROLE_PERMISSIONS.student;

      it("should have own application permissions", () => {
        expect(permissions).toContain("applications:create");
        expect(permissions).toContain("applications:read_own");
        expect(permissions).toContain("applications:update_own");
      });

      it("should NOT have general application permissions", () => {
        expect(permissions).not.toContain("applications:read");
        expect(permissions).not.toContain("applications:write");
        expect(permissions).not.toContain("applications:review");
      });

      it("should have own document permissions", () => {
        expect(permissions).toContain("documents:upload_own");
        expect(permissions).toContain("documents:read_own");
      });

      it("should NOT have general document permissions", () => {
        expect(permissions).not.toContain("documents:read");
        expect(permissions).not.toContain("documents:verify");
      });

      it("should have own payment permissions", () => {
        expect(permissions).toContain("payments:make_own");
        expect(permissions).toContain("payments:read_own");
      });

      it("should NOT have general payment permissions", () => {
        expect(permissions).not.toContain("payments:read");
        expect(permissions).not.toContain("payments:verify");
      });

      it("should have own profile permissions", () => {
        expect(permissions).toContain("profile:read_own");
        expect(permissions).toContain("profile:update_own");
      });

      it("should NOT have user management permissions", () => {
        expect(permissions).not.toContain("users:read");
        expect(permissions).not.toContain("users:write");
      });
    });

    it("should have permissions defined for all roles", () => {
      for (const role of ALL_USER_ROLES) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
        expect(Array.isArray(ROLE_PERMISSIONS[role])).toBe(true);
        expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
      }
    });
  });

  describe("getPermissionsForRole()", () => {
    it("should return permissions for valid roles", () => {
      const superAdminPerms = getPermissionsForRole("super_admin");
      expect(superAdminPerms).toContain("users:delete");

      const studentPerms = getPermissionsForRole("student");
      expect(studentPerms).toContain("applications:create");
    });

    it("should return a copy of permissions (not the original array)", () => {
      const perms1 = getPermissionsForRole("admin");
      const perms2 = getPermissionsForRole("admin");

      expect(perms1).toEqual(perms2);
      expect(perms1).not.toBe(perms2); // Different array instances

      // Modifying one should not affect the other
      perms1.push("test:permission");
      expect(perms2).not.toContain("test:permission");
    });

    it("should return empty array for invalid roles", () => {
      const perms = getPermissionsForRole("invalid_role" as UserRole);
      expect(perms).toEqual([]);
    });
  });

  describe("isValidRole()", () => {
    it("should return true for valid roles", () => {
      expect(isValidRole("super_admin")).toBe(true);
      expect(isValidRole("admin")).toBe(true);
      expect(isValidRole("reviewer")).toBe(true);
      expect(isValidRole("student")).toBe(true);
    });

    it("should return false for invalid roles", () => {
      expect(isValidRole("invalid")).toBe(false);
      expect(isValidRole("")).toBe(false);
      expect(isValidRole("ADMIN")).toBe(false); // Case sensitive
      expect(isValidRole("superadmin")).toBe(false); // No underscore
    });
  });

  describe("hasPermission() (Requirement 8.4)", () => {
    it("should return true when user has the permission", () => {
      const userPermissions = ["users:read", "applications:write"];
      expect(hasPermission(userPermissions, "users:read")).toBe(true);
      expect(hasPermission(userPermissions, "applications:write")).toBe(true);
    });

    it("should return false when user lacks the permission", () => {
      const userPermissions = ["users:read", "applications:write"];
      expect(hasPermission(userPermissions, "users:delete")).toBe(false);
      expect(hasPermission(userPermissions, "settings:write")).toBe(false);
    });

    it("should return false for empty permissions array", () => {
      expect(hasPermission([], "users:read")).toBe(false);
    });

    it("should return false for invalid permissions input", () => {
      expect(hasPermission(null as unknown as Permission[], "users:read")).toBe(false);
      expect(hasPermission(undefined as unknown as Permission[], "users:read")).toBe(false);
      expect(hasPermission("not-an-array" as unknown as Permission[], "users:read")).toBe(false);
    });

    it("should be case-sensitive", () => {
      const userPermissions = ["users:read"];
      expect(hasPermission(userPermissions, "users:read")).toBe(true);
      expect(hasPermission(userPermissions, "Users:Read")).toBe(false);
      expect(hasPermission(userPermissions, "USERS:READ")).toBe(false);
    });
  });

  describe("hasAllPermissions()", () => {
    it("should return true when user has all required permissions", () => {
      const userPermissions = ["users:read", "users:write", "applications:read"];
      expect(hasAllPermissions(userPermissions, ["users:read", "users:write"])).toBe(true);
    });

    it("should return false when user lacks any required permission", () => {
      const userPermissions = ["users:read", "applications:read"];
      expect(hasAllPermissions(userPermissions, ["users:read", "users:write"])).toBe(false);
    });

    it("should return true for empty required permissions", () => {
      const userPermissions = ["users:read"];
      expect(hasAllPermissions(userPermissions, [])).toBe(true);
    });

    it("should return false for invalid inputs", () => {
      expect(hasAllPermissions(null as unknown as Permission[], ["users:read"])).toBe(false);
      expect(hasAllPermissions(["users:read"], null as unknown as Permission[])).toBe(false);
    });
  });

  describe("hasAnyPermission()", () => {
    it("should return true when user has at least one required permission", () => {
      const userPermissions = ["users:read", "applications:read"];
      expect(hasAnyPermission(userPermissions, ["users:delete", "users:read"])).toBe(true);
    });

    it("should return false when user has none of the required permissions", () => {
      const userPermissions = ["users:read", "applications:read"];
      expect(hasAnyPermission(userPermissions, ["users:delete", "settings:write"])).toBe(false);
    });

    it("should return false for empty required permissions", () => {
      const userPermissions = ["users:read"];
      expect(hasAnyPermission(userPermissions, [])).toBe(false);
    });

    it("should return false for invalid inputs", () => {
      expect(hasAnyPermission(null as unknown as Permission[], ["users:read"])).toBe(false);
      expect(hasAnyPermission(["users:read"], null as unknown as Permission[])).toBe(false);
    });
  });

  describe("roleHasPermission()", () => {
    it("should return true when role has the permission", () => {
      expect(roleHasPermission("super_admin", "users:delete")).toBe(true);
      expect(roleHasPermission("admin", "applications:review")).toBe(true);
      expect(roleHasPermission("student", "applications:create")).toBe(true);
    });

    it("should return false when role lacks the permission", () => {
      expect(roleHasPermission("student", "users:delete")).toBe(false);
      expect(roleHasPermission("reviewer", "users:read")).toBe(false);
      expect(roleHasPermission("admin", "settings:write")).toBe(false);
    });

    it("should return false for invalid roles", () => {
      expect(roleHasPermission("invalid" as UserRole, "users:read")).toBe(false);
    });
  });

  describe("getPermissionDescription()", () => {
    it("should return human-readable description", () => {
      expect(getPermissionDescription("users:read")).toBe("Read users");
      expect(getPermissionDescription("users:delete")).toBe("Delete users");
      expect(getPermissionDescription("applications:write")).toBe("Write applications");
    });

    it("should handle _own suffix", () => {
      expect(getPermissionDescription("applications:read_own")).toBe("Read own applications");
      expect(getPermissionDescription("documents:upload_own")).toBe("Upload own documents");
    });

    it("should return original string for invalid format", () => {
      expect(getPermissionDescription("invalid")).toBe("invalid");
      expect(getPermissionDescription("")).toBe("");
    });
  });

  describe("getAllPermissionsGrouped()", () => {
    it("should return permissions grouped by resource", () => {
      const grouped = getAllPermissionsGrouped();

      expect(grouped.users).toBeDefined();
      expect(grouped.applications).toBeDefined();
      expect(grouped.documents).toBeDefined();
      expect(grouped.payments).toBeDefined();
    });

    it("should include all unique permissions", () => {
      const grouped = getAllPermissionsGrouped();

      // Check users group
      expect(grouped.users).toContain("users:read");
      expect(grouped.users).toContain("users:write");
      expect(grouped.users).toContain("users:delete");

      // Check applications group
      expect(grouped.applications).toContain("applications:read");
      expect(grouped.applications).toContain("applications:create");
      expect(grouped.applications).toContain("applications:read_own");
    });

    it("should sort permissions within each group", () => {
      const grouped = getAllPermissionsGrouped();

      for (const resource of Object.keys(grouped)) {
        const permissions = grouped[resource];
        const sorted = [...permissions].sort();
        expect(permissions).toEqual(sorted);
      }
    });
  });

  describe("Permission determinism (Requirement 8.3)", () => {
    it("should return identical permissions across multiple invocations", () => {
      // Call getPermissionsForRole multiple times
      const results: Permission[][] = [];
      for (let i = 0; i < 10; i++) {
        results.push(getPermissionsForRole("admin"));
      }

      // All results should be identical
      const first = results[0];
      for (const result of results) {
        expect(result).toEqual(first);
      }
    });

    it("should not require database access for permission checks", () => {
      // This test verifies that permission checks are synchronous
      // and don't involve any async database operations
      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        hasPermission(ROLE_PERMISSIONS.admin, "users:read");
        roleHasPermission("super_admin", "settings:write");
        getPermissionsForRole("student");
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 1000 iterations should complete in under 100ms (no DB calls)
      expect(duration).toBeLessThan(100);
    });

    it("should have immutable role permissions", () => {
      // Get permissions and try to modify
      const originalLength = ROLE_PERMISSIONS.admin.length;

      // Attempt to modify (should not affect original due to getPermissionsForRole returning copy)
      const perms = getPermissionsForRole("admin");
      perms.push("test:permission");

      // Original should be unchanged
      expect(ROLE_PERMISSIONS.admin.length).toBe(originalLength);
      expect(ROLE_PERMISSIONS.admin).not.toContain("test:permission");
    });
  });
});
