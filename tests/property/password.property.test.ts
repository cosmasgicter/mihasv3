// @ts-nocheck
/**
 * Property-Based Tests: Password Hasher
 * Feature: auth-security-hardening
 * Task: 3.2 Write property tests for password hasher
 * 
 * **Property 2: Password hash round-trip**
 * 
 * *For any* valid password string, hashing then verifying SHALL return true.
 * 
 * Additional properties tested:
 * - Different passwords should produce different hashes
 * - Verification with wrong password should return false
 * - Hash format should be valid bcrypt ($2b$12$...)
 * 
 * **Validates: Requirements 1.6**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { hashPassword, verifyPassword, getBcryptRounds } from '../../lib/auth/password';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Bcrypt operations are computationally expensive (12 rounds).
 * Limit numRuns to keep test execution time reasonable.
 * Using 10 runs as a balance between coverage and execution time.
 */
const BCRYPT_NUM_RUNS = 10;

/**
 * Valid password arbitrary generator
 * Generates non-empty strings with reasonable length (1-100 chars)
 * Includes ASCII, unicode, special characters
 */
const validPasswordArb = fc.string({ minLength: 1, maxLength: 100 });

/**
 * Password with special characters arbitrary
 * Ensures we test passwords with special chars that might cause issues
 */
const specialCharPasswordArb = fc.array(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~ \t\n'.split('')
  ),
  { minLength: 1, maxLength: 100 }
).map(chars => chars.join(''));

/**
 * Unicode password arbitrary
 * Tests passwords with unicode characters
 */
const unicodePasswordArb = fc.string({ minLength: 1, maxLength: 50 });

// ============================================================================
// Property Tests
// ============================================================================

describe('Property 2: Password hash round-trip', () => {
  /**
   * **Validates: Requirements 1.6**
   * 
   * THE Password_Hasher SHALL use bcrypt with minimum 12 rounds for all password hashing operations.
   * For any valid password string, hashing then verifying SHALL return true.
   */
  describe('Core Round-Trip Property', () => {
    it('PROPERTY: For any valid password, hashing then verifying returns true', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPasswordArb,
          async (password) => {
            // Hash the password
            const hash = await hashPassword(password);
            
            // Verify the hash with the original password
            const isValid = await verifyPassword(password, hash);
            
            // Round-trip must succeed
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: For any password with special characters, hashing then verifying returns true', async () => {
      await fc.assert(
        fc.asyncProperty(
          specialCharPasswordArb,
          async (password) => {
            const hash = await hashPassword(password);
            const isValid = await verifyPassword(password, hash);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: For any unicode password, hashing then verifying returns true', async () => {
      await fc.assert(
        fc.asyncProperty(
          unicodePasswordArb,
          async (password) => {
            const hash = await hashPassword(password);
            const isValid = await verifyPassword(password, hash);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });
  });

  describe('Hash Uniqueness Property', () => {
    /**
     * **Validates: Requirements 1.6**
     * 
     * Different passwords should produce different hashes.
     * Note: Same password hashed twice will also produce different hashes due to random salt.
     */
    it('PROPERTY: Different passwords produce different hashes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(validPasswordArb, validPasswordArb).filter(([p1, p2]) => p1 !== p2),
          async ([password1, password2]) => {
            const hash1 = await hashPassword(password1);
            const hash2 = await hashPassword(password2);
            
            // Different passwords must produce different hashes
            expect(hash1).not.toBe(hash2);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Same password hashed twice produces different hashes (due to salt)', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPasswordArb,
          async (password) => {
            const hash1 = await hashPassword(password);
            const hash2 = await hashPassword(password);
            
            // Same password should produce different hashes due to random salt
            expect(hash1).not.toBe(hash2);
            
            // But both should verify correctly
            expect(await verifyPassword(password, hash1)).toBe(true);
            expect(await verifyPassword(password, hash2)).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });
  });

  describe('Wrong Password Rejection Property', () => {
    /**
     * **Validates: Requirements 1.6**
     * 
     * Verification with wrong password should return false.
     */
    it('PROPERTY: Verification with wrong password returns false', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPasswordArb,
          validPasswordArb,
          async (correctPassword, wrongPassword) => {
            // Skip if passwords happen to be the same
            fc.pre(correctPassword !== wrongPassword);
            
            const hash = await hashPassword(correctPassword);
            const isValid = await verifyPassword(wrongPassword, hash);
            
            // Wrong password must not verify
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Verification with modified password returns false', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPasswordArb,
          fc.string({ minLength: 1, maxLength: 10 }),
          async (password, suffix) => {
            const hash = await hashPassword(password);
            const modifiedPassword = password + suffix;
            
            // Modified password must not verify
            const isValid = await verifyPassword(modifiedPassword, hash);
            expect(isValid).toBe(false);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });
  });

  describe('Hash Format Property', () => {
    /**
     * **Validates: Requirements 1.6**
     * 
     * Hash format should be valid bcrypt ($2b$12$...).
     * Bcrypt hashes have a specific format: $2a$, $2b$, or $2y$ followed by cost factor.
     */
    it('PROPERTY: Hash format is valid bcrypt with 12 rounds', async () => {
      await fc.assert(
        fc.asyncProperty(
          validPasswordArb,
          async (password) => {
            const hash = await hashPassword(password);
            
            // Bcrypt hash format: $2a$XX$ or $2b$XX$ or $2y$XX$ where XX is the cost factor
            // We expect $2b$12$ for bcrypt with 12 rounds
            expect(hash).toMatch(/^\$2[aby]\$12\$/);
            
            // Bcrypt hashes are always 60 characters
            expect(hash.length).toBe(60);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Configured bcrypt rounds is 12', () => {
      // Verify the configuration matches requirements
      expect(getBcryptRounds()).toBe(12);
    });
  });

  describe('Edge Cases', () => {
    /**
     * **Validates: Requirements 1.6**
     */
    it('PROPERTY: Single character passwords hash and verify correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 1 }),
          async (password) => {
            const hash = await hashPassword(password);
            const isValid = await verifyPassword(password, hash);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Long passwords (up to 72 bytes) hash and verify correctly', async () => {
      // Note: bcrypt has a 72-byte limit, but we test up to 100 chars
      // The implementation should handle this gracefully
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 50, maxLength: 100 }),
          async (password) => {
            const hash = await hashPassword(password);
            const isValid = await verifyPassword(password, hash);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Passwords with only whitespace hash and verify correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 }).map(chars => chars.join('')),
          async (password) => {
            const hash = await hashPassword(password);
            const isValid = await verifyPassword(password, hash);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Passwords with null bytes hash and verify correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 20 }),
          async (basePassword) => {
            // Add null byte in the middle
            const password = basePassword.slice(0, Math.floor(basePassword.length / 2)) + 
                           '\0' + 
                           basePassword.slice(Math.floor(basePassword.length / 2));
            
            const hash = await hashPassword(password);
            const isValid = await verifyPassword(password, hash);
            
            expect(isValid).toBe(true);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });
  });

  describe('Error Handling', () => {
    /**
     * **Validates: Requirements 1.6**
     */
    it('should throw error for empty password', async () => {
      await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
    });

    it('should return false for empty password verification', async () => {
      const hash = await hashPassword('validPassword');
      const isValid = await verifyPassword('', hash);
      
      expect(isValid).toBe(false);
    });

    it('should return false for empty hash verification', async () => {
      const isValid = await verifyPassword('password', '');
      
      expect(isValid).toBe(false);
    });

    it('should return false for invalid hash format', async () => {
      const isValid = await verifyPassword('password', 'not-a-valid-hash');
      
      expect(isValid).toBe(false);
    });

    it('should return false for null inputs', async () => {
      // @ts-expect-error - Testing null handling
      const isValid1 = await verifyPassword(null, 'hash');
      // @ts-expect-error - Testing null handling
      const isValid2 = await verifyPassword('password', null);
      
      expect(isValid1).toBe(false);
      expect(isValid2).toBe(false);
    });
  });

  describe('Security Properties', () => {
    /**
     * **Validates: Requirements 1.6**
     * 
     * Additional security-focused property tests.
     */
    it('PROPERTY: Hash does not contain the original password', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 }),
          async (password) => {
            const hash = await hashPassword(password);
            
            // The hash should never contain the original password
            expect(hash).not.toContain(password);
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });

    it('PROPERTY: Verification is case-sensitive', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(p => p.toLowerCase() !== p.toUpperCase()),
          async (password) => {
            // Skip passwords that are case-insensitive (all numbers, symbols, etc.)
            fc.pre(password.toLowerCase() !== password.toUpperCase());
            
            const hash = await hashPassword(password);
            
            // Original should verify
            expect(await verifyPassword(password, hash)).toBe(true);
            
            // Case-changed version should not verify (if different)
            const caseChanged = password.toLowerCase() === password 
              ? password.toUpperCase() 
              : password.toLowerCase();
            
            if (caseChanged !== password) {
              expect(await verifyPassword(caseChanged, hash)).toBe(false);
            }
          }
        ),
        { numRuns: BCRYPT_NUM_RUNS }
      );
    });
  });
});

// ============================================================================
// Feature: website-quality-remediation
// Property 10: Bcrypt-only password hashing
// Property 11: SHA-256 to bcrypt migration correctness
// ============================================================================

import { isSha256Hash, verifySha256Password } from '../../lib/auth/password';
import { createHash } from 'crypto';

/**
 * Helper: produce a SHA-256 hex hash of a password (simulates legacy storage).
 */
function sha256Hash(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// Feature: website-quality-remediation, Property 10: Bcrypt-only password hashing
describe('Property 10: Bcrypt-only password hashing', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * *For any* non-empty password string, `hashPassword()` should produce a string
   * matching the bcrypt format (`$2b$12$...`), and `verifyPassword(password, hash)`
   * should return true for the original password and false for any different password.
   */
  it('PROPERTY: hashPassword always produces bcrypt $2b$12$ format and verifyPassword round-trips correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 72 }),
        async (password) => {
          const hash = await hashPassword(password);

          // Must be bcrypt format with 12 rounds
          expect(hash).toMatch(/^\$2b\$12\$/);
          expect(hash.length).toBe(60);

          // Round-trip: original password verifies
          expect(await verifyPassword(password, hash)).toBe(true);
        }
      ),
      { numRuns: BCRYPT_NUM_RUNS }
    );
  });

  it('PROPERTY: verifyPassword rejects any different password against a bcrypt hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (original, other) => {
          fc.pre(original !== other);

          const hash = await hashPassword(original);
          expect(await verifyPassword(other, hash)).toBe(false);
        }
      ),
      { numRuns: BCRYPT_NUM_RUNS }
    );
  });
});

// Feature: website-quality-remediation, Property 11: SHA-256 to bcrypt migration correctness
describe('Property 11: SHA-256 to bcrypt migration correctness', () => {
  /**
   * **Validates: Requirements 4.4**
   *
   * *For any* password, if it was previously hashed with SHA-256, the migration
   * function should: (a) successfully verify the password against the SHA-256 hash,
   * (b) produce a new bcrypt hash, and (c) the new bcrypt hash should verify
   * correctly against the original password.
   */
  it('PROPERTY: SHA-256 hash is correctly detected by isSha256Hash', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 72 }),
        async (password) => {
          const legacyHash = sha256Hash(password);

          // SHA-256 hash should be detected as legacy format
          expect(isSha256Hash(legacyHash)).toBe(true);

          // A bcrypt hash should NOT be detected as SHA-256
          const bcryptHash = await hashPassword(password);
          expect(isSha256Hash(bcryptHash)).toBe(false);
        }
      ),
      { numRuns: BCRYPT_NUM_RUNS }
    );
  });

  it('PROPERTY: verifySha256Password correctly verifies and rejects passwords', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 72 }),
        fc.string({ minLength: 1, maxLength: 72 }),
        async (password, wrongPassword) => {
          fc.pre(password !== wrongPassword);

          const legacyHash = sha256Hash(password);

          // Correct password verifies against SHA-256 hash
          expect(verifySha256Password(password, legacyHash)).toBe(true);

          // Wrong password does not verify
          expect(verifySha256Password(wrongPassword, legacyHash)).toBe(false);
        }
      ),
      { numRuns: BCRYPT_NUM_RUNS }
    );
  });

  it('PROPERTY: Full migration round-trip — SHA-256 verify then bcrypt re-hash verifies original password', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 72 }),
        async (password) => {
          // Step 1: Simulate legacy SHA-256 hash
          const legacyHash = sha256Hash(password);

          // Step 2: Verify password against SHA-256 hash (migration detection)
          expect(isSha256Hash(legacyHash)).toBe(true);
          expect(verifySha256Password(password, legacyHash)).toBe(true);

          // Step 3: Re-hash with bcrypt (migration step)
          const bcryptHash = await hashPassword(password);

          // Step 4: New bcrypt hash verifies correctly
          expect(bcryptHash).toMatch(/^\$2b\$12\$/);
          expect(await verifyPassword(password, bcryptHash)).toBe(true);

          // Step 5: The new hash is no longer detected as SHA-256
          expect(isSha256Hash(bcryptHash)).toBe(false);
        }
      ),
      { numRuns: BCRYPT_NUM_RUNS }
    );
  });
});
