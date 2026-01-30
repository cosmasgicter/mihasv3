/**
 * Property Tests: User Roles RLS Policies
 * Feature: admin-system-health-fixes
 * 
 * Property 5: Super Admin Role Management
 * Property 6: Non-Admin Role Management Rejection
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3**
 * - 4.1: WHEN an admin updates a user role, THE Database SHALL allow the update 
 *        if the admin has super_admin privileges
 * - 4.2: WHEN a non-admin attempts to update user roles, THE Database SHALL 
 *        reject the request with 403 status
 * - 4.3: THE RLS_Policy for user_roles SHALL permit super_admin users to perform 
 *        INSERT, UPDATE, and DELETE operations
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Types for user roles and profiles
interface Profile {
  id: string;
  email: string;
  role: 'student' | 'admin' | 'super_admin';
}

interface UserRole {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
}

type RoleOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';

interface RLSPolicyResult {
  allowed: boolean;
  statusCode: number;
  error?: string;
}

/**
 * Generator for valid UUID strings
 */
const uuidArb = fc.uuid();

/**
 * Generator for user roles
 */
const userRoleArb = fc.constantFrom('student', 'admin', 'super_admin', 'reviewer', 'staff');

/**
 * Generator for profile data
 */
const profileArb = fc.record({
  id: uuidArb,
  email: fc.emailAddress(),
  role: fc.constantFrom('student', 'admin', 'super_admin') as fc.Arbitrary<'student' | 'admin' | 'super_admin'>,
});

/**
 * Generator for super_admin profiles only
 */
const superAdminProfileArb = fc.record({
  id: uuidArb,
  email: fc.emailAddress(),
  role: fc.constant('super_admin') as fc.Arbitrary<'super_admin'>,
});

/**
 * Generator for non-super_admin profiles (student or admin)
 */
const nonSuperAdminProfileArb = fc.record({
  id: uuidArb,
  email: fc.emailAddress(),
  role: fc.constantFrom('student', 'admin') as fc.Arbitrary<'student' | 'admin'>,
});

/**
 * Generator for valid ISO date strings
 */
const isoDateArb = fc.integer({
  min: new Date('2020-01-01T00:00:00.000Z').getTime(),
  max: new Date('2030-12-31T23:59:59.999Z').getTime(),
}).map(timestamp => new Date(timestamp).toISOString());

/**
 * Generator for user_roles table entries
 */
const userRoleEntryArb = fc.record({
  id: uuidArb,
  user_id: uuidArb,
  role: userRoleArb,
  created_at: isoDateArb,
  updated_at: isoDateArb,
});

/**
 * Generator for role operations (INSERT, UPDATE, DELETE)
 */
const writeOperationArb = fc.constantFrom('INSERT', 'UPDATE', 'DELETE') as fc.Arbitrary<RoleOperation>;

/**
 * Generator for all operations including SELECT
 */
const allOperationArb = fc.constantFrom('INSERT', 'UPDATE', 'DELETE', 'SELECT') as fc.Arbitrary<RoleOperation>;

/**
 * Simulates the RLS policy check for user_roles table
 * This mirrors the SQL policy logic:
 * 
 * CREATE POLICY "super_admin_manage_roles" ON user_roles
 *   FOR ALL
 *   TO authenticated
 *   USING (
 *     EXISTS (
 *       SELECT 1 FROM profiles 
 *       WHERE profiles.id = auth.uid() 
 *       AND profiles.role = 'super_admin'
 *     )
 *   )
 *   WITH CHECK (
 *     EXISTS (
 *       SELECT 1 FROM profiles 
 *       WHERE profiles.id = auth.uid() 
 *       AND profiles.role = 'super_admin'
 *     )
 *   );
 * 
 * CREATE POLICY "users_view_own_roles" ON user_roles
 *   FOR SELECT
 *   TO authenticated
 *   USING (user_id = auth.uid());
 */
function evaluateRLSPolicy(
  currentUser: Profile | null,
  operation: RoleOperation,
  targetUserRole: UserRole
): RLSPolicyResult {
  // No authenticated user - reject all operations
  if (!currentUser) {
    return {
      allowed: false,
      statusCode: 401,
      error: 'Authentication required',
    };
  }

  // Check super_admin_manage_roles policy (FOR ALL operations)
  const isSuperAdmin = currentUser.role === 'super_admin';
  
  if (isSuperAdmin) {
    // Super admin can perform any operation
    return {
      allowed: true,
      statusCode: 200,
    };
  }

  // Check users_view_own_roles policy (FOR SELECT only)
  if (operation === 'SELECT') {
    const isOwnRole = targetUserRole.user_id === currentUser.id;
    if (isOwnRole) {
      return {
        allowed: true,
        statusCode: 200,
      };
    }
  }

  // Non-super_admin attempting write operation or viewing others' roles
  // RLS will reject with no matching policy (results in 403/empty result)
  return {
    allowed: false,
    statusCode: 403,
    error: 'Access denied. Super admin privileges required.',
  };
}

/**
 * Simulates batch operations on user_roles
 */
function evaluateBatchOperation(
  currentUser: Profile | null,
  operation: RoleOperation,
  targetRoles: UserRole[]
): RLSPolicyResult[] {
  return targetRoles.map(role => evaluateRLSPolicy(currentUser, operation, role));
}

describe('Feature: admin-system-health-fixes, Property 5: Super Admin Role Management', () => {
  
  describe('Property: Super admin can perform INSERT operations (Requirement 4.3)', () => {
    
    it('should allow super_admin to INSERT any user role', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          userRoleEntryArb,
          (superAdmin, newRole) => {
            const result = evaluateRLSPolicy(superAdmin, 'INSERT', newRole);
            
            // Super admin should be allowed to insert
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Super admin can perform UPDATE operations (Requirements 4.1, 4.3)', () => {
    
    it('should allow super_admin to UPDATE any user role', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          userRoleEntryArb,
          (superAdmin, existingRole) => {
            const result = evaluateRLSPolicy(superAdmin, 'UPDATE', existingRole);
            
            // Super admin should be allowed to update
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow super_admin to UPDATE roles for any user_id', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          uuidArb, // Random target user_id
          userRoleArb, // Random role to assign
          (superAdmin, targetUserId, newRole) => {
            const roleEntry: UserRole = {
              id: crypto.randomUUID(),
              user_id: targetUserId,
              role: newRole,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            const result = evaluateRLSPolicy(superAdmin, 'UPDATE', roleEntry);
            
            // Super admin should be allowed regardless of target user
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Super admin can perform DELETE operations (Requirement 4.3)', () => {
    
    it('should allow super_admin to DELETE any user role', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          userRoleEntryArb,
          (superAdmin, roleToDelete) => {
            const result = evaluateRLSPolicy(superAdmin, 'DELETE', roleToDelete);
            
            // Super admin should be allowed to delete
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Super admin can perform SELECT operations', () => {
    
    it('should allow super_admin to SELECT any user role', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          userRoleEntryArb,
          (superAdmin, roleToView) => {
            const result = evaluateRLSPolicy(superAdmin, 'SELECT', roleToView);
            
            // Super admin should be allowed to view any role
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Super admin can perform ALL operations (Requirement 4.3)', () => {
    
    it('should allow super_admin to perform any operation on any role', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          allOperationArb,
          userRoleEntryArb,
          (superAdmin, operation, targetRole) => {
            const result = evaluateRLSPolicy(superAdmin, operation, targetRole);
            
            // Super admin should be allowed for ALL operations
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Super admin batch operations succeed', () => {
    
    it('should allow super_admin to perform batch operations on multiple roles', async () => {
      await fc.assert(
        fc.property(
          superAdminProfileArb,
          writeOperationArb,
          fc.array(userRoleEntryArb, { minLength: 1, maxLength: 20 }),
          (superAdmin, operation, roles) => {
            const results = evaluateBatchOperation(superAdmin, operation, roles);
            
            // All operations should succeed
            results.forEach(result => {
              expect(result.allowed).toBe(true);
              expect(result.statusCode).toBe(200);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Feature: admin-system-health-fixes, Property 6: Non-Admin Role Management Rejection', () => {
  
  describe('Property: Non-super_admin cannot INSERT roles (Requirement 4.2)', () => {
    
    it('should reject INSERT from student users', async () => {
      const studentProfileArb = fc.record({
        id: uuidArb,
        email: fc.emailAddress(),
        role: fc.constant('student') as fc.Arbitrary<'student'>,
      });

      await fc.assert(
        fc.property(
          studentProfileArb,
          userRoleEntryArb,
          (student, newRole) => {
            const result = evaluateRLSPolicy(student, 'INSERT', newRole);
            
            // Student should be rejected
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject INSERT from admin users (only super_admin allowed)', async () => {
      const adminProfileArb = fc.record({
        id: uuidArb,
        email: fc.emailAddress(),
        role: fc.constant('admin') as fc.Arbitrary<'admin'>,
      });

      await fc.assert(
        fc.property(
          adminProfileArb,
          userRoleEntryArb,
          (admin, newRole) => {
            const result = evaluateRLSPolicy(admin, 'INSERT', newRole);
            
            // Regular admin should be rejected (only super_admin can manage roles)
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Non-super_admin cannot UPDATE roles (Requirement 4.2)', () => {
    
    it('should reject UPDATE from non-super_admin users', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          userRoleEntryArb,
          (nonSuperAdmin, roleToUpdate) => {
            const result = evaluateRLSPolicy(nonSuperAdmin, 'UPDATE', roleToUpdate);
            
            // Non-super_admin should be rejected
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject UPDATE even for own role entry', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          userRoleArb,
          (nonSuperAdmin, newRole) => {
            // Create a role entry for the current user
            const ownRoleEntry: UserRole = {
              id: crypto.randomUUID(),
              user_id: nonSuperAdmin.id, // Same as current user
              role: newRole,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            const result = evaluateRLSPolicy(nonSuperAdmin, 'UPDATE', ownRoleEntry);
            
            // Even updating own role should be rejected
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Non-super_admin cannot DELETE roles (Requirement 4.2)', () => {
    
    it('should reject DELETE from non-super_admin users', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          userRoleEntryArb,
          (nonSuperAdmin, roleToDelete) => {
            const result = evaluateRLSPolicy(nonSuperAdmin, 'DELETE', roleToDelete);
            
            // Non-super_admin should be rejected
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Non-super_admin can only SELECT own roles', () => {
    
    it('should allow non-super_admin to SELECT their own roles', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          userRoleArb,
          (nonSuperAdmin, role) => {
            // Create a role entry for the current user
            const ownRoleEntry: UserRole = {
              id: crypto.randomUUID(),
              user_id: nonSuperAdmin.id, // Same as current user
              role: role,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            
            const result = evaluateRLSPolicy(nonSuperAdmin, 'SELECT', ownRoleEntry);
            
            // Should be allowed to view own role
            expect(result.allowed).toBe(true);
            expect(result.statusCode).toBe(200);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-super_admin from SELECT other users roles', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          userRoleEntryArb.filter(role => true), // Any role entry
          (nonSuperAdmin, otherUserRole) => {
            // Ensure the role belongs to a different user
            const differentUserRole: UserRole = {
              ...otherUserRole,
              user_id: crypto.randomUUID(), // Different user
            };
            
            const result = evaluateRLSPolicy(nonSuperAdmin, 'SELECT', differentUserRole);
            
            // Should be rejected from viewing other users' roles
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Unauthenticated users are rejected (Requirement 4.2)', () => {
    
    it('should reject all operations from unauthenticated users', async () => {
      await fc.assert(
        fc.property(
          allOperationArb,
          userRoleEntryArb,
          (operation, targetRole) => {
            const result = evaluateRLSPolicy(null, operation, targetRole);
            
            // Unauthenticated should be rejected with 401
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(401);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: All write operations rejected for non-super_admin (Requirement 4.2)', () => {
    
    it('should reject all write operations from any non-super_admin user', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          writeOperationArb,
          userRoleEntryArb,
          (nonSuperAdmin, operation, targetRole) => {
            const result = evaluateRLSPolicy(nonSuperAdmin, operation, targetRole);
            
            // All write operations should be rejected
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Batch write operations rejected for non-super_admin', () => {
    
    it('should reject all batch write operations from non-super_admin', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          writeOperationArb,
          fc.array(userRoleEntryArb, { minLength: 1, maxLength: 20 }),
          (nonSuperAdmin, operation, roles) => {
            const results = evaluateBatchOperation(nonSuperAdmin, operation, roles);
            
            // All operations should be rejected
            results.forEach(result => {
              expect(result.allowed).toBe(false);
              expect(result.statusCode).toBe(403);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Feature: admin-system-health-fixes, RLS Policy Edge Cases', () => {
  
  describe('Property: Role hierarchy is correctly enforced', () => {
    
    it('should distinguish between admin and super_admin privileges', async () => {
      await fc.assert(
        fc.property(
          profileArb,
          writeOperationArb,
          userRoleEntryArb,
          (user, operation, targetRole) => {
            const result = evaluateRLSPolicy(user, operation, targetRole);
            
            if (user.role === 'super_admin') {
              // Super admin should always be allowed
              expect(result.allowed).toBe(true);
              expect(result.statusCode).toBe(200);
            } else {
              // Non-super_admin should always be rejected for write operations
              expect(result.allowed).toBe(false);
              expect(result.statusCode).toBe(403);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Consistent error responses', () => {
    
    it('should return consistent error format for rejected operations', async () => {
      await fc.assert(
        fc.property(
          nonSuperAdminProfileArb,
          writeOperationArb,
          userRoleEntryArb,
          (nonSuperAdmin, operation, targetRole) => {
            const result = evaluateRLSPolicy(nonSuperAdmin, operation, targetRole);
            
            // Error response should have consistent structure
            expect(result.allowed).toBe(false);
            expect(result.statusCode).toBe(403);
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
