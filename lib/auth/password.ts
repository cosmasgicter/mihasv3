/**
 * Password and Token Hasher Module
 * 
 * Provides secure password hashing using bcrypt and token hashing using SHA-256.
 * 
 * REQUIREMENTS:
 * - 1.6: THE Password_Hasher SHALL use bcrypt with minimum 12 rounds for all password hashing operations
 * - 1.8: THE Auth_System SHALL use Bun-native crypto exclusively with zero Supabase Auth SDK dependencies
 * - 1.9: IF a refresh token has been used previously, THEN THE Auth_System SHALL reject it (replay attack prevention)
 * - 3.8: THE JWT_Manager SHALL store refresh token hash in database for revocation capability
 * 
 * SECURITY NOTES:
 * - Uses bcrypt with 12 rounds for passwords (OWASP recommended minimum)
 * - Uses SHA-256 for token hashing (no length limit, unlike bcrypt's 72-byte limit)
 * - Constant-time comparison for all verification operations
 * - Never logs passwords, tokens, or hashes
 * - Returns false for verification failures (never throws)
 * 
 * IMPORTANT: bcrypt has a 72-byte input limit. JWT tokens are typically ~244 bytes,
 * and the first 72 bytes are identical for tokens generated for the same user.
 * Therefore, SHA-256 MUST be used for token hashing to ensure replay attack prevention works.
 */

import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "crypto";

/**
 * Number of bcrypt salt rounds
 * 12 rounds provides a good balance of security and performance
 * OWASP recommends minimum 10 rounds, we use 12 for additional security
 */
const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt with 12 rounds
 * 
 * @param password - Plain text password to hash
 * @returns Promise resolving to the bcrypt hash string
 * @throws Error if password is empty or hashing fails
 * 
 * @example
 * const hash = await hashPassword("userPassword123");
 * // Returns: "$2b$12$..."
 */
export async function hashPassword(password: string): Promise<string> {
  // Validate input - never process empty passwords
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }

  try {
    // Generate salt and hash in one operation
    // bcrypt.hash automatically generates a secure random salt
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return hash;
  } catch (error) {
    // Log error without exposing password details
    console.error("[PASSWORD] Hashing operation failed");
    throw new Error("Password hashing failed");
  }
}

/**
 * Verify a password against a bcrypt hash
 * 
 * Uses constant-time comparison to prevent timing attacks.
 * Returns false for any verification failure (never throws for invalid input).
 * 
 * @param password - Plain text password to verify
 * @param hash - Bcrypt hash to compare against
 * @returns Promise resolving to true if password matches, false otherwise
 * 
 * @example
 * const isValid = await verifyPassword("userPassword123", storedHash);
 * if (isValid) {
 *   // Password matches
 * }
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Return false for invalid inputs instead of throwing
  // This prevents information leakage about what went wrong
  if (!password || !hash) {
    return false;
  }

  // Validate hash format - bcrypt hashes start with $2a$, $2b$, or $2y$
  if (!hash.startsWith("$2")) {
    return false;
  }

  try {
    // bcrypt.compare uses constant-time comparison internally
    // This prevents timing attacks that could reveal password information
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error) {
    // Log error without exposing password or hash details
    console.error("[PASSWORD] Verification operation failed");
    // Return false on any error - don't expose internal state
    return false;
  }
}

/**
 * Get the configured bcrypt rounds
 * Useful for testing and configuration verification
 * 
 * @returns The number of bcrypt rounds used for hashing
 */
export function getBcryptRounds(): number {
  return BCRYPT_ROUNDS;
}


// ============================================================================
// Token Hashing (SHA-256)
// ============================================================================

/**
 * Hash a token using SHA-256
 * 
 * IMPORTANT: This function MUST be used for refresh token hashing instead of bcrypt.
 * bcrypt has a 72-byte input limit, but JWT tokens are ~244 bytes. The first 72 bytes
 * of JWT tokens for the same user are identical (same header + beginning of payload),
 * which means bcrypt would produce the same hash for different tokens, breaking
 * replay attack prevention.
 * 
 * SHA-256 has no input length limit and produces a unique hash for each unique input.
 * 
 * @param token - The token string to hash (e.g., JWT refresh token)
 * @returns The SHA-256 hash as a hex string
 * @throws Error if token is empty
 * 
 * @example
 * const hash = hashToken(refreshToken);
 * // Returns: "a1b2c3d4e5f6..." (64 character hex string)
 */
export function hashToken(token: string): string {
  // Validate input - never process empty tokens
  if (!token || token.length === 0) {
    throw new Error("Token cannot be empty");
  }

  try {
    // Use SHA-256 for token hashing
    // SHA-256 produces a 256-bit (32-byte) hash, represented as 64 hex characters
    const hash = createHash("sha256").update(token).digest("hex");
    return hash;
  } catch (error) {
    // Log error without exposing token details
    console.error("[TOKEN] Hashing operation failed");
    throw new Error("Token hashing failed");
  }
}

/**
 * Verify a token against a SHA-256 hash using constant-time comparison
 * 
 * Uses timing-safe comparison to prevent timing attacks that could
 * reveal information about the stored hash.
 * 
 * @param token - The token string to verify
 * @param storedHash - The SHA-256 hash to compare against (hex string)
 * @returns true if the token matches the hash, false otherwise
 * 
 * @example
 * const isValid = verifyTokenHash(refreshToken, storedHash);
 * if (isValid) {
 *   // Token matches - proceed with refresh
 * } else {
 *   // Token doesn't match - possible replay attack
 * }
 */
export function verifyTokenHash(token: string, storedHash: string): boolean {
  // Return false for invalid inputs instead of throwing
  // This prevents information leakage about what went wrong
  if (!token || !storedHash) {
    return false;
  }

  // Validate hash format - SHA-256 hex hashes are exactly 64 characters
  if (storedHash.length !== 64 || !/^[a-f0-9]+$/i.test(storedHash)) {
    return false;
  }

  try {
    // Hash the provided token
    const tokenHash = hashToken(token);
    
    // Use timing-safe comparison to prevent timing attacks
    // Convert both hashes to buffers for comparison
    const tokenHashBuffer = Buffer.from(tokenHash, "hex");
    const storedHashBuffer = Buffer.from(storedHash, "hex");
    
    // timingSafeEqual requires buffers of equal length
    // Both should be 32 bytes (256 bits) for SHA-256
    if (tokenHashBuffer.length !== storedHashBuffer.length) {
      return false;
    }
    
    return timingSafeEqual(tokenHashBuffer, storedHashBuffer);
  } catch (error) {
    // Log error without exposing token or hash details
    console.error("[TOKEN] Verification operation failed");
    // Return false on any error - don't expose internal state
    return false;
  }
}


// ============================================================================
// Password Migration Utilities
// ============================================================================

/**
 * Check if a user needs password hash upgrade
 * 
 * Users with null password_hash or non-bcrypt hashes need upgrade.
 * This supports the migration from legacy password formats to bcrypt.
 * 
 * @param user - Object with password_hash field
 * @returns true if password hash needs upgrade
 */
export function needsPasswordUpgrade(user: { password_hash: string | null }): boolean {
  if (!user.password_hash) {
    return true;
  }

  // Check if it's already a bcrypt hash ($2a$, $2b$, or $2y$)
  const isBcrypt = /^\$2[aby]\$\d{1,2}\$/.test(user.password_hash);
  return !isBcrypt;
}

/**
 * Upgrade user's password hash to bcrypt
 * 
 * Called when a legacy user logs in to upgrade their password hash
 * from the old format to bcrypt.
 * 
 * @param userId - User ID
 * @param newPassword - The new password to hash
 * @returns true if successful
 */
export async function upgradePasswordHash(userId: string, newPassword: string): Promise<boolean> {
  // Import query and UserQueries lazily to avoid circular dependencies
  const { query: dbQuery } = await import('../db');
  const { UserQueries } = await import('../queries');

  try {
    const passwordHash = await hashPassword(newPassword);
    const updateQuery = UserQueries.updatePassword(userId, passwordHash);
    await dbQuery(updateQuery.text, updateQuery.values);

    console.log(`[PASSWORD] Upgraded password hash for user: ${userId}`);
    return true;
  } catch (error) {
    console.error('[PASSWORD] Error upgrading password hash:', (error as Error).message);
    return false;
  }
}
