/**
 * Password Hasher Module
 * 
 * Provides secure password hashing and verification using bcrypt.
 * 
 * REQUIREMENTS:
 * - 1.6: THE Password_Hasher SHALL use bcrypt with minimum 12 rounds for all password hashing operations
 * - 1.8: THE Auth_System SHALL use Bun-native crypto exclusively with zero Supabase Auth SDK dependencies
 * 
 * SECURITY NOTES:
 * - Uses bcrypt with 12 rounds (OWASP recommended minimum)
 * - Constant-time comparison for password verification
 * - Never logs passwords or hashes
 * - Returns false for verification failures (never throws)
 */

import bcrypt from "bcrypt";

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
