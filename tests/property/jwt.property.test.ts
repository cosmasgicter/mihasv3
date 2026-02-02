/**
 * Property-Based Tests: JWT Manager
 * Feature: auth-security-hardening
 * Task: 3.4 Write property tests for JWT manager
 * 
 * **Property 3: Access token round-trip**
 * *For any* valid user data, generating then verifying an access token SHALL return the original claims.
 * **Validates: Requirements 3.1, 3.3, 3.5**
 * 
 * **Property 4: Token type separation**
 * *For any* access token, attempting to verify it as a refresh token SHALL fail.
 * **Validates: Requirements 3.9**
 * 
 * @vitest-environment node
 */

// Set environment variables BEFORE any imports
process.env.JWT_SECRET = 'test-access-secret-at-least-32-characters-long-for-jwt';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long-for-jwt';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type UserRole,
} from '../../lib/auth/jwt';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * JWT operations are async but relatively fast.
 * Using 25 runs for good coverage while keeping execution time reasonable.
 */
const JWT_NUM_RUNS = 25;

/**
 * Store original environment variables to restore after tests
 */
let originalJwtSecret: string | undefined;
let originalJwtRefreshSecret: string | undefined;

beforeAll(() => {
  // Store original values (in case they were set before our module-level assignment)
  originalJwtSecret = process.env.JWT_SECRET;
  originalJwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  
  // Ensure test secrets are set
  process.env.JWT_SECRET = 'test-access-secret-at-least-32-characters-long-for-jwt';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long-for-jwt';
});

afterAll(() => {
  // Restore original values if they existed before tests
  if (originalJwtSecret !== undefined && originalJwtSecret !== 'test-access-secret-at-least-32-characters-long-for-jwt') {
    process.env.JWT_SECRET = originalJwtSecret;
  }
  
  if (originalJwtRefreshSecret !== undefined && originalJwtRefreshSecret !== 'test-refresh-secret-at-least-32-characters-long-for-jwt') {
    process.env.JWT_REFRESH_SECRET = originalJwtRefreshSecret;
  }
});

// ============================================================================
// Arbitrary Generators
// ============================================================================

/**
 * Valid UUID arbitrary generator
 * Generates UUIDs in the standard format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const uuidArb = fc.uuid();

/**
 * Valid email arbitrary generator
 * Generates realistic email addresses
 */
const emailArb = fc.emailAddress();

/**
 * Valid user role arbitrary generator
 * Generates one of the valid roles: super_admin, admin, reviewer, student
 */
const roleArb: fc.Arbitrary<UserRole> = fc.constantFrom(
  'super_admin' as const,
  'admin' as const,
  'reviewer' as const,
  'student' as const
);

/**
 * Permission string arbitrary generator
 * Generates permission strings in the format "resource:action"
 */
const permissionArb = fc.tuple(
  fc.constantFrom('users', 'applications', 'programs', 'payments', 'documents', 'analytics', 'settings', 'profile'),
  fc.constantFrom('read', 'write', 'delete', 'create', 'update', 'verify', 'review', 'read_own', 'update_own', 'upload_own', 'make_own')
).map(([resource, action]) => `${resource}:${action}`);

/**
 * Permissions array arbitrary generator
 * Generates arrays of 0-10 unique permission strings
 */
const permissionsArb = fc.uniqueArray(permissionArb, { minLength: 0, maxLength: 10 });

/**
 * Valid user data arbitrary generator
 * Combines all user data fields into a single object
 */
const validUserDataArb = fc.record({
  userId: uuidArb,
  email: emailArb,
  role: roleArb,
  permissions: permissionsArb,
});

// ============================================================================
// Property 3: Access Token Round-Trip
// ============================================================================

describe('Property 3: Access token round-trip', () => {
  /**
   * **Validates: Requirements 3.1, 3.3, 3.5**
   * 
   * - 3.1: THE JWT_Manager SHALL generate access tokens with 15-minute expiration
   * - 3.3: WHEN verifying an access token, THE JWT_Manager SHALL validate signature, expiration, issuer, and audience claims
   * - 3.5: THE JWT_Manager SHALL include user ID (sub), email, role, and permissions array in access token payload
   */
  describe('Core Round-Trip Property', () => {
    it('PROPERTY: For any valid user data, generating then verifying an access token returns the original claims', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserDataArb,
          async ({ userId, email, role, permissions }) => {
            // Generate an access token with the user data
            const token = await generateAccessToken(userId, email, role, permissions);
            
            // Verify the access token
            const payload = await verifyAccessToken(token);
            
            // Assert that the verified payload contains the original claims
            expect(payload.sub).toBe(userId);
            expect(payload.email).toBe(email);
            expect(payload.role).toBe(role);
            expect(payload.permissions).toEqual(permissions);
            expect(payload.type).toBe('access');
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });

    it('PROPERTY: Access token contains required standard claims (iat, exp, iss, aud)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserDataArb,
          async ({ userId, email, role, permissions }) => {
            const token = await generateAccessToken(userId, email, role, permissions);
            const payload = await verifyAccessToken(token);
            
            // Verify standard JWT claims are present
            expect(payload.iat).toBeDefined();
            expect(typeof payload.iat).toBe('number');
            
            expect(payload.exp).toBeDefined();
            expect(typeof payload.exp).toBe('number');
            
            expect(payload.iss).toBe('mihas-auth');
            expect(payload.aud).toBe('mihas-app');
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });

    it('PROPERTY: Access token expiration is approximately 15 minutes from issuance', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserDataArb,
          async ({ userId, email, role, permissions }) => {
            const token = await generateAccessToken(userId, email, role, permissions);
            const payload = await verifyAccessToken(token);
            
            // Calculate expected expiration (15 minutes = 900 seconds)
            const expectedDuration = 15 * 60; // 900 seconds
            const actualDuration = payload.exp! - payload.iat!;
            
            // Allow 1 second tolerance for timing variations
            expect(actualDuration).toBeGreaterThanOrEqual(expectedDuration - 1);
            expect(actualDuration).toBeLessThanOrEqual(expectedDuration + 1);
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });
  });

  describe('Permissions Preservation Property', () => {
    /**
     * **Validates: Requirements 3.5**
     */
    it('PROPERTY: Empty permissions array is preserved in round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          emailArb,
          roleArb,
          async (userId, email, role) => {
            const emptyPermissions: string[] = [];
            
            const token = await generateAccessToken(userId, email, role, emptyPermissions);
            const payload = await verifyAccessToken(token);
            
            expect(payload.permissions).toEqual([]);
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });

    it('PROPERTY: Large permissions array is preserved in round-trip', async () => {
      const largePermissionsArb = fc.uniqueArray(permissionArb, { minLength: 5, maxLength: 20 });
      
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          emailArb,
          roleArb,
          largePermissionsArb,
          async (userId, email, role, permissions) => {
            const token = await generateAccessToken(userId, email, role, permissions);
            const payload = await verifyAccessToken(token);
            
            expect(payload.permissions).toEqual(permissions);
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });
  });

  describe('Role Preservation Property', () => {
    /**
     * **Validates: Requirements 3.5**
     */
    it('PROPERTY: Each valid role is correctly preserved in round-trip', async () => {
      const roles: UserRole[] = ['super_admin', 'admin', 'reviewer', 'student'];
      
      for (const role of roles) {
        await fc.assert(
          fc.asyncProperty(
            uuidArb,
            emailArb,
            permissionsArb,
            async (userId, email, permissions) => {
              const token = await generateAccessToken(userId, email, role, permissions);
              const payload = await verifyAccessToken(token);
              
              expect(payload.role).toBe(role);
            }
          ),
          { numRuns: 5 } // Fewer runs per role since we test all 4 roles
        );
      }
    });
  });
});

// ============================================================================
// Property 4: Token Type Separation
// ============================================================================

describe('Property 4: Token type separation', () => {
  /**
   * **Validates: Requirements 3.9**
   * 
   * - 3.9: IF an access token is used as a refresh token, THEN THE JWT_Manager SHALL reject it with an error
   */
  describe('Access Token as Refresh Token Rejection', () => {
    it('PROPERTY: For any access token, attempting to verify it as a refresh token SHALL fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserDataArb,
          async ({ userId, email, role, permissions }) => {
            // Generate an access token
            const accessToken = await generateAccessToken(userId, email, role, permissions);
            
            // Attempt to verify it as a refresh token - should fail
            await expect(verifyRefreshToken(accessToken)).rejects.toThrow();
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });

    it('PROPERTY: Access token verified as refresh token fails with appropriate error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserDataArb,
          async ({ userId, email, role, permissions }) => {
            const accessToken = await generateAccessToken(userId, email, role, permissions);
            
            // The error should indicate signature verification failure (different secrets)
            // or token type mismatch
            try {
              await verifyRefreshToken(accessToken);
              // Should not reach here
              expect.fail('Expected verifyRefreshToken to throw');
            } catch (error) {
              expect(error).toBeInstanceOf(Error);
              // Error message should indicate verification failure
              const errorMessage = (error as Error).message;
              expect(
                errorMessage.includes('signature') ||
                errorMessage.includes('verification failed') ||
                errorMessage.includes('token type')
              ).toBe(true);
            }
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });
  });

  describe('Refresh Token as Access Token Rejection', () => {
    it('PROPERTY: For any refresh token, attempting to verify it as an access token SHALL fail', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            // Generate a refresh token
            const refreshToken = await generateRefreshToken(userId);
            
            // Attempt to verify it as an access token - should fail
            await expect(verifyAccessToken(refreshToken)).rejects.toThrow();
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });

    it('PROPERTY: Refresh token verified as access token fails with appropriate error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            const refreshToken = await generateRefreshToken(userId);
            
            try {
              await verifyAccessToken(refreshToken);
              expect.fail('Expected verifyAccessToken to throw');
            } catch (error) {
              expect(error).toBeInstanceOf(Error);
              const errorMessage = (error as Error).message;
              // Error should indicate signature failure (different secrets)
              // or token type mismatch
              expect(
                errorMessage.includes('signature') ||
                errorMessage.includes('verification failed') ||
                errorMessage.includes('token type')
              ).toBe(true);
            }
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });
  });

  describe('Bidirectional Token Type Isolation', () => {
    /**
     * **Validates: Requirements 3.9**
     * 
     * Tests that token type separation works in both directions simultaneously.
     */
    it('PROPERTY: Access and refresh tokens for same user are not interchangeable', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserDataArb,
          async ({ userId, email, role, permissions }) => {
            // Generate both token types for the same user
            const accessToken = await generateAccessToken(userId, email, role, permissions);
            const refreshToken = await generateRefreshToken(userId);
            
            // Verify each token with its correct verifier
            const accessPayload = await verifyAccessToken(accessToken);
            const refreshPayload = await verifyRefreshToken(refreshToken);
            
            // Both should have the same user ID
            expect(accessPayload.sub).toBe(userId);
            expect(refreshPayload.sub).toBe(userId);
            
            // But they should have different types
            expect(accessPayload.type).toBe('access');
            expect(refreshPayload.type).toBe('refresh');
            
            // Cross-verification should fail
            await expect(verifyRefreshToken(accessToken)).rejects.toThrow();
            await expect(verifyAccessToken(refreshToken)).rejects.toThrow();
          }
        ),
        { numRuns: JWT_NUM_RUNS }
      );
    });
  });
});

// ============================================================================
// Refresh Token Round-Trip (Supporting Property)
// ============================================================================

describe('Refresh Token Round-Trip (Supporting Property)', () => {
  /**
   * Supporting property to ensure refresh tokens also work correctly.
   * While not explicitly required by the task, this validates the token
   * type separation works because refresh tokens function correctly.
   */
  it('PROPERTY: For any valid userId, generating then verifying a refresh token returns the original userId', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          const token = await generateRefreshToken(userId);
          const payload = await verifyRefreshToken(token);
          
          expect(payload.sub).toBe(userId);
          expect(payload.type).toBe('refresh');
        }
      ),
      { numRuns: JWT_NUM_RUNS }
    );
  });

  it('PROPERTY: Refresh token expiration is approximately 7 days from issuance', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          const token = await generateRefreshToken(userId);
          const payload = await verifyRefreshToken(token);
          
          // Calculate expected expiration (7 days = 604800 seconds)
          const expectedDuration = 7 * 24 * 60 * 60; // 604800 seconds
          const actualDuration = payload.exp! - payload.iat!;
          
          // Allow 1 second tolerance for timing variations
          expect(actualDuration).toBeGreaterThanOrEqual(expectedDuration - 1);
          expect(actualDuration).toBeLessThanOrEqual(expectedDuration + 1);
        }
      ),
      { numRuns: JWT_NUM_RUNS }
    );
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  /**
   * **Validates: Requirements 3.1, 3.3, 3.5, 3.9**
   */
  it('PROPERTY: Tokens with special characters in email are handled correctly', async () => {
    // Generate emails with special characters that are valid in email addresses
    const specialEmailArb = fc.tuple(
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789.+_-'.split('')), { minLength: 1, maxLength: 20 }).map(arr => arr.join('')),
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 10 }).map(arr => arr.join('')),
      fc.constantFrom('com', 'org', 'edu', 'zm', 'co.zm')
    ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);
    
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        specialEmailArb,
        roleArb,
        permissionsArb,
        async (userId, email, role, permissions) => {
          const token = await generateAccessToken(userId, email, role, permissions);
          const payload = await verifyAccessToken(token);
          
          expect(payload.email).toBe(email);
        }
      ),
      { numRuns: JWT_NUM_RUNS }
    );
  });

  it('PROPERTY: Tokens with various permission formats are handled correctly', async () => {
    // Test with standard permission format
    const standardPermissionArb = fc.tuple(
      fc.constantFrom('users', 'applications', 'programs', 'payments', 'documents'),
      fc.constantFrom('read', 'write', 'delete', 'create', 'update')
    ).map(([resource, action]) => `${resource}:${action}`);
    
    const standardPermissionsArb = fc.uniqueArray(standardPermissionArb, { minLength: 1, maxLength: 10 });
    
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        emailArb,
        roleArb,
        standardPermissionsArb,
        async (userId, email, role, permissions) => {
          const token = await generateAccessToken(userId, email, role, permissions);
          const payload = await verifyAccessToken(token);
          
          expect(payload.permissions).toEqual(permissions);
        }
      ),
      { numRuns: JWT_NUM_RUNS }
    );
  });
});

// ============================================================================
// Error Handling
// ============================================================================

describe('Error Handling', () => {
  /**
   * **Validates: Requirements 3.3, 3.9**
   */
  it('should throw error for empty userId in access token generation', async () => {
    await expect(
      generateAccessToken('', 'test@example.com', 'student', [])
    ).rejects.toThrow('User ID is required');
  });

  it('should throw error for empty email in access token generation', async () => {
    await expect(
      generateAccessToken('valid-uuid', '', 'student', [])
    ).rejects.toThrow('Email is required');
  });

  it('should throw error for empty userId in refresh token generation', async () => {
    await expect(generateRefreshToken('')).rejects.toThrow('User ID is required');
  });

  it('should throw error for empty token in access token verification', async () => {
    await expect(verifyAccessToken('')).rejects.toThrow('Token is required');
  });

  it('should throw error for empty token in refresh token verification', async () => {
    await expect(verifyRefreshToken('')).rejects.toThrow('Token is required');
  });

  it('should throw error for malformed token in access token verification', async () => {
    await expect(verifyAccessToken('not-a-valid-jwt')).rejects.toThrow();
  });

  it('should throw error for malformed token in refresh token verification', async () => {
    await expect(verifyRefreshToken('not-a-valid-jwt')).rejects.toThrow();
  });
});
