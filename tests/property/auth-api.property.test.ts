/**
 * Property-Based Tests: Auth API
 * Feature: auth-security-hardening
 * Task: 7.5 Write property tests for auth API
 * 
 * **Property 7: Token rotation on refresh**
 * *For any* valid refresh operation, the new refresh token hash SHALL differ from the previous hash.
 * **Validates: Requirements 1.4, 3.7**
 * 
 * **Property 8: Replay attack prevention**
 * *For any* refresh token that has been used once, subsequent use SHALL be rejected.
 * **Validates: Requirements 1.9**
 * 
 * @vitest-environment node
 */

// Set environment variables BEFORE any imports
process.env.JWT_SECRET = 'test-access-secret-at-least-32-characters-long-for-jwt';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-characters-long-for-jwt';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import { hashToken, verifyTokenHash } from '../../api/_lib/auth/password';
import { generateRefreshToken, verifyRefreshToken } from '../../api/_lib/auth/jwt';

// ============================================================================
// Test Configuration
// ============================================================================

/**
 * Token operations are fast with SHA-256 (no bcrypt overhead).
 * Using 10 runs for good coverage.
 */
const AUTH_API_NUM_RUNS = 10;

/**
 * Store original environment variables to restore after tests
 */
let originalJwtSecret: string | undefined;
let originalJwtRefreshSecret: string | undefined;

beforeAll(() => {
  // Store original values
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generates a refresh token and waits to ensure different timestamp.
 * JWT tokens use seconds precision for iat, so we need to wait at least 1 second
 * between token generations to guarantee different tokens.
 */
async function generateRefreshTokenWithDelay(userId: string, delayMs: number = 1100): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  return generateRefreshToken(userId);
}

// ============================================================================
// Property 7: Token Rotation on Refresh
// ============================================================================

describe('Property 7: Token rotation on refresh', () => {
  /**
   * **Validates: Requirements 1.4, 3.7**
   * 
   * - 1.4: WHEN a user calls POST /api/auth?action=refresh with a valid refresh token,
   *        THE Auth_System SHALL issue new access and refresh tokens (token rotation)
   * - 3.7: WHEN a token refresh occurs, THE JWT_Manager SHALL rotate both access and refresh tokens
   */
  describe('Core Token Rotation Property', () => {
    it('PROPERTY: For any valid refresh operation, the new refresh token hash SHALL differ from the previous hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            // Generate initial refresh token (simulating login)
            const oldToken = await generateRefreshToken(userId);
            const oldTokenHash = hashToken(oldToken);
            
            // Wait to ensure different timestamp, then generate new token (simulating refresh)
            const newToken = await generateRefreshTokenWithDelay(userId);
            const newTokenHash = hashToken(newToken);
            
            // The new token hash must be different from the old token hash
            // With SHA-256, different tokens ALWAYS produce different hashes
            expect(newTokenHash).not.toBe(oldTokenHash);
            
            // Additionally verify both tokens are valid
            const oldPayload = await verifyRefreshToken(oldToken);
            const newPayload = await verifyRefreshToken(newToken);
            expect(oldPayload.sub).toBe(userId);
            expect(newPayload.sub).toBe(userId);
          }
        ),
        { numRuns: AUTH_API_NUM_RUNS, timeout: 60000 }
      );
    }, 120000);

    it('PROPERTY: Token rotation produces tokens with different issuance times', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            // Generate first token
            const token1 = await generateRefreshToken(userId);
            const payload1 = await verifyRefreshToken(token1);
            
            // Wait to ensure different timestamp
            const token2 = await generateRefreshTokenWithDelay(userId);
            const payload2 = await verifyRefreshToken(token2);
            
            // Tokens should be different
            expect(token1).not.toBe(token2);
            
            // Issuance times should be different
            expect(payload2.iat).toBeGreaterThan(payload1.iat!);
          }
        ),
        { numRuns: AUTH_API_NUM_RUNS, timeout: 60000 }
      );
    }, 120000);
  });

  describe('Hash Determinism Property', () => {
    /**
     * **Validates: Requirements 1.4, 3.7**
     * 
     * Tests that SHA-256 produces deterministic hashes (same input = same output).
     */
    it('PROPERTY: Same token hashed twice produces identical hashes (SHA-256 determinism)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            const token = await generateRefreshToken(userId);
            
            // Hash the same token twice
            const hash1 = hashToken(token);
            const hash2 = hashToken(token);
            
            // Hashes should be identical (SHA-256 is deterministic)
            expect(hash1).toBe(hash2);
            
            // Both should verify correctly
            expect(verifyTokenHash(token, hash1)).toBe(true);
            expect(verifyTokenHash(token, hash2)).toBe(true);
          }
        ),
        { numRuns: AUTH_API_NUM_RUNS }
      );
    });
  });
});

// ============================================================================
// Property 8: Replay Attack Prevention
// ============================================================================

describe('Property 8: Replay attack prevention', () => {
  /**
   * **Validates: Requirements 1.9**
   * 
   * - 1.9: IF a refresh token has been used previously, THEN THE Auth_System SHALL
   *        reject it and require re-authentication (replay attack prevention)
   * 
   * The replay attack prevention mechanism works as follows:
   * 1. When a user logs in, a refresh token is generated and its hash is stored in the database
   * 2. When the user refreshes, the system:
   *    a. Verifies the presented token is a valid JWT
   *    b. Verifies the token hash matches the stored hash (using SHA-256 comparison)
   *    c. If valid, generates a new token and stores its hash (rotation)
   * 3. If an attacker tries to replay the old token:
   *    a. The JWT is still valid (not expired)
   *    b. But the hash comparison fails because the stored hash is now for the new token
   */
  describe('Core Replay Attack Prevention Property', () => {
    it('PROPERTY: For any refresh token used once, subsequent use SHALL be rejected (hash mismatch)', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            // === Step 1: User logs in ===
            // Generate initial token and store its hash (simulating database storage)
            const originalToken = await generateRefreshToken(userId);
            const originalHash = hashToken(originalToken);
            
            // Verify the original token matches its hash
            expect(verifyTokenHash(originalToken, originalHash)).toBe(true);
            
            // === Step 2: User refreshes token (legitimate use) ===
            // Wait to ensure different timestamp
            const rotatedToken = await generateRefreshTokenWithDelay(userId);
            const rotatedHash = hashToken(rotatedToken);
            
            // The rotated token should verify against its own hash
            expect(verifyTokenHash(rotatedToken, rotatedHash)).toBe(true);
            
            // === Step 3: Replay attack - attacker tries to use original token ===
            // The original token is still a valid JWT...
            const originalPayload = await verifyRefreshToken(originalToken);
            expect(originalPayload.sub).toBe(userId);
            
            // ...but it fails hash verification against the rotated hash!
            // This is the key property: old token doesn't match new stored hash
            expect(verifyTokenHash(originalToken, rotatedHash)).toBe(false);
          }
        ),
        { numRuns: AUTH_API_NUM_RUNS, timeout: 60000 }
      );
    }, 120000);

    it('PROPERTY: A token only verifies against its own hash', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            // Generate two different tokens (with delay to ensure different timestamps)
            const token1 = await generateRefreshToken(userId);
            const token2 = await generateRefreshTokenWithDelay(userId);
            
            // Hash both tokens
            const hash1 = hashToken(token1);
            const hash2 = hashToken(token2);
            
            // Token1 should verify against hash1
            expect(verifyTokenHash(token1, hash1)).toBe(true);
            
            // Token2 should verify against hash2
            expect(verifyTokenHash(token2, hash2)).toBe(true);
            
            // Token1 should NOT verify against hash2 (replay attack scenario)
            expect(verifyTokenHash(token1, hash2)).toBe(false);
            
            // Token2 should NOT verify against hash1
            expect(verifyTokenHash(token2, hash1)).toBe(false);
          }
        ),
        { numRuns: AUTH_API_NUM_RUNS, timeout: 60000 }
      );
    }, 120000);
  });

  describe('Multiple Rotation Scenario', () => {
    /**
     * **Validates: Requirements 1.9**
     * 
     * Tests that after multiple rotations, all previous tokens fail verification.
     */
    it('PROPERTY: After multiple rotations, all previous tokens fail verification', async () => {
      await fc.assert(
        fc.asyncProperty(
          uuidArb,
          async (userId) => {
            // Generate initial token
            const token1 = await generateRefreshToken(userId);
            
            // First rotation
            const token2 = await generateRefreshTokenWithDelay(userId);
            
            // Second rotation
            const token3 = await generateRefreshTokenWithDelay(userId);
            
            // Store the final hash (simulating current database state)
            const currentHash = hashToken(token3);
            
            // Current token should verify
            expect(verifyTokenHash(token3, currentHash)).toBe(true);
            
            // All previous tokens should fail verification
            expect(verifyTokenHash(token1, currentHash)).toBe(false);
            expect(verifyTokenHash(token2, currentHash)).toBe(false);
          }
        ),
        { numRuns: 5, timeout: 60000 } // Fewer runs due to multiple delays
      );
    }, 120000);
  });
});

// ============================================================================
// Integration Scenarios
// ============================================================================

describe('Integration Scenarios', () => {
  /**
   * **Validates: Requirements 1.4, 1.9, 3.7**
   * 
   * Tests that simulate real-world auth API scenarios.
   */
  it('SCENARIO: Complete refresh flow with replay attack attempt', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          // === Step 1: User logs in ===
          const loginToken = await generateRefreshToken(userId);
          let dbStoredHash = hashToken(loginToken);
          
          // Verify login token is valid
          const loginPayload = await verifyRefreshToken(loginToken);
          expect(loginPayload.sub).toBe(userId);
          
          // === Step 2: User refreshes token (legitimate) ===
          // Verify the presented token matches stored hash
          expect(verifyTokenHash(loginToken, dbStoredHash)).toBe(true);
          
          // Generate new tokens (rotation) - with delay for different timestamp
          const refreshedToken = await generateRefreshTokenWithDelay(userId);
          dbStoredHash = hashToken(refreshedToken);
          
          // Verify new token is valid
          const refreshPayload = await verifyRefreshToken(refreshedToken);
          expect(refreshPayload.sub).toBe(userId);
          
          // === Step 3: Attacker attempts replay with stolen login token ===
          // The old token is still a valid JWT...
          const attackerPayload = await verifyRefreshToken(loginToken);
          expect(attackerPayload.sub).toBe(userId);
          
          // ...but it fails hash verification (replay attack detected!)
          const replayAttempt = verifyTokenHash(loginToken, dbStoredHash);
          expect(replayAttempt).toBe(false);
          
          // === Step 4: Legitimate user can still use their new token ===
          expect(verifyTokenHash(refreshedToken, dbStoredHash)).toBe(true);
        }
      ),
      { numRuns: 5, timeout: 60000 }
    );
  }, 120000);

  it('SCENARIO: Token theft and rotation race condition', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          // User logs in
          const originalToken = await generateRefreshToken(userId);
          let dbStoredHash = hashToken(originalToken);
          
          // Attacker steals the token (copies it)
          const stolenToken = originalToken;
          
          // User refreshes their token (legitimate use)
          expect(verifyTokenHash(originalToken, dbStoredHash)).toBe(true);
          const newUserToken = await generateRefreshTokenWithDelay(userId);
          dbStoredHash = hashToken(newUserToken);
          
          // Attacker tries to use stolen token - REJECTED
          expect(verifyTokenHash(stolenToken, dbStoredHash)).toBe(false);
          
          // User's new token still works
          expect(verifyTokenHash(newUserToken, dbStoredHash)).toBe(true);
        }
      ),
      { numRuns: 5, timeout: 60000 }
    );
  }, 120000);

  it('SCENARIO: Different users have independent token rotation', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        async (userId1, userId2) => {
          // Skip if same user ID generated
          fc.pre(userId1 !== userId2);
          
          // Generate tokens for both users
          const token1 = await generateRefreshToken(userId1);
          const token2 = await generateRefreshToken(userId2);
          
          // Hash both tokens
          const hash1 = hashToken(token1);
          const hash2 = hashToken(token2);
          
          // Each token verifies against its own hash
          expect(verifyTokenHash(token1, hash1)).toBe(true);
          expect(verifyTokenHash(token2, hash2)).toBe(true);
          
          // Cross-verification should fail
          expect(verifyTokenHash(token1, hash2)).toBe(false);
          expect(verifyTokenHash(token2, hash1)).toBe(false);
          
          // Verify each token contains correct user ID
          const payload1 = await verifyRefreshToken(token1);
          const payload2 = await verifyRefreshToken(token2);
          expect(payload1.sub).toBe(userId1);
          expect(payload2.sub).toBe(userId2);
        }
      ),
      { numRuns: AUTH_API_NUM_RUNS }
    );
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  /**
   * **Validates: Requirements 1.4, 1.9, 3.7**
   */
  it('PROPERTY: Hash format is valid SHA-256 (64 hex characters)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        async (userId) => {
          const token = await generateRefreshToken(userId);
          const hash = hashToken(token);
          
          // SHA-256 produces 64 hex characters
          expect(hash.length).toBe(64);
          expect(/^[a-f0-9]+$/i.test(hash)).toBe(true);
        }
      ),
      { numRuns: AUTH_API_NUM_RUNS }
    );
  });

  it('should return false for invalid hash format', () => {
    const token = 'some-token';
    
    // Too short
    expect(verifyTokenHash(token, 'abc123')).toBe(false);
    
    // Too long
    expect(verifyTokenHash(token, 'a'.repeat(65))).toBe(false);
    
    // Invalid characters
    expect(verifyTokenHash(token, 'g'.repeat(64))).toBe(false);
    
    // Empty
    expect(verifyTokenHash(token, '')).toBe(false);
    expect(verifyTokenHash('', 'a'.repeat(64))).toBe(false);
  });

  it('should throw error for empty token in hashToken', () => {
    expect(() => hashToken('')).toThrow('Token cannot be empty');
  });
});
