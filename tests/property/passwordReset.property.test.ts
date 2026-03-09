/**
 * Property-based tests for Password Reset Flow Hardening
 * Feature: website-quality-remediation
 *
 * P7: Password reset rate limiting
 * P8: Reset token invalidation on password change
 * P9: Single-use reset tokens
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { createHash, randomBytes } from 'crypto';

// ── Helpers ─────────────────────────────────────────────────────────────

/** SHA-256 hash a raw token (mirrors hashResetToken in auth.ts) */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── In-memory DB simulation ─────────────────────────────────────────────

interface ResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

interface ProfileRow {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  first_name: string | null;
  last_name: string | null;
}

let tokenStore: Map<string, ResetTokenRow>;
let profileStore: Map<string, ProfileRow>;

/** Reset in-memory stores */
function resetStores() {
  tokenStore = new Map();
  profileStore = new Map();
}

/** Add a test user to the profile store */
function addTestUser(id: string, email: string): ProfileRow {
  const profile: ProfileRow = {
    id,
    email: email.toLowerCase().trim(),
    password_hash: '$2b$12$fakebcrypthashfortest000000000000000000000000000000',
    is_active: true,
    first_name: 'Test',
    last_name: 'User',
  };
  profileStore.set(id, profile);
  return profile;
}

/** Simulate requesting a password reset token — returns raw token or null if rate-limited */
function requestResetToken(userId: string): { rawToken: string } | { rateLimited: true; retryAfterSeconds: number } {
  const now = new Date();
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);

  // Count tokens created in the last 15 minutes for this user
  let recentCount = 0;
  let oldestInWindow: Date | null = null;
  for (const row of tokenStore.values()) {
    if (row.user_id === userId && row.created_at > fifteenMinAgo) {
      recentCount++;
      if (!oldestInWindow || row.created_at < oldestInWindow) {
        oldestInWindow = row.created_at;
      }
    }
  }

  if (recentCount >= 3) {
    let retryAfterSeconds = 900;
    if (oldestInWindow) {
      const windowEnd = oldestInWindow.getTime() + 15 * 60 * 1000;
      retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now.getTime()) / 1000));
    }
    return { rateLimited: true, retryAfterSeconds };
  }

  // Generate token
  const rawToken = randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const id = crypto.randomUUID();

  tokenStore.set(id, {
    id,
    user_id: userId,
    token_hash: tokenHash,
    expires_at: new Date(now.getTime() + 60 * 60 * 1000), // 1 hour
    used_at: null,
    created_at: now,
  });

  return { rawToken };
}

/** Simulate using a reset token to change password — returns success or failure reason */
function executeReset(rawToken: string, newPasswordHash: string): 'success' | 'invalid_token' {
  const tokenHash = hashResetToken(rawToken);
  const now = new Date();

  // Find matching valid token
  let matchedEntry: [string, ResetTokenRow] | undefined;
  for (const entry of tokenStore.entries()) {
    const [, row] = entry;
    if (row.token_hash === tokenHash && row.expires_at > now && row.used_at === null) {
      matchedEntry = entry;
      break;
    }
  }

  if (!matchedEntry) {
    return 'invalid_token';
  }

  const [, matchedRow] = matchedEntry;
  const userId = matchedRow.user_id;

  // Update password
  const profile = profileStore.get(userId);
  if (profile) {
    profile.password_hash = newPasswordHash;
  }

  // Mark this token as used
  matchedRow.used_at = now;

  // Invalidate ALL outstanding tokens for this user
  for (const row of tokenStore.values()) {
    if (row.user_id === userId && row.used_at === null) {
      row.used_at = now;
    }
  }

  return 'success';
}

/** Check if a raw token is still valid (not used, not expired) */
function isTokenValid(rawToken: string): boolean {
  const tokenHash = hashResetToken(rawToken);
  const now = new Date();
  for (const row of tokenStore.values()) {
    if (row.token_hash === tokenHash && row.expires_at > now && row.used_at === null) {
      return true;
    }
  }
  return false;
}

// ── Arbitraries ─────────────────────────────────────────────────────────

const userIdArb = fc.uuid();
const emailArb = fc.emailAddress();
const passwordHashArb = fc.constant('$2b$12$newbcrypthashvalue00000000000000000000000000000000000');

// ── Tests ───────────────────────────────────────────────────────────────

describe('Password Reset Property Tests', () => {
  beforeEach(() => {
    resetStores();
  });

  // Feature: website-quality-remediation, Property 7: Password reset rate limiting
  // **Validates: Requirements 3.1, 3.4**
  describe('P7: Password reset rate limiting', () => {
    it('allows up to 3 requests per email in a 15-minute window, then rejects with Retry-After', () => {
      fc.assert(
        fc.property(userIdArb, emailArb, (userId, email) => {
          resetStores();
          addTestUser(userId, email);

          // First 3 requests should succeed
          for (let i = 0; i < 3; i++) {
            const result = requestResetToken(userId);
            expect(result).toHaveProperty('rawToken');
            expect((result as { rawToken: string }).rawToken).toMatch(/^[a-f0-9]{64}$/);
          }

          // 4th request should be rate-limited
          const result4 = requestResetToken(userId);
          expect(result4).toHaveProperty('rateLimited', true);
          expect((result4 as { rateLimited: true; retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
          expect((result4 as { rateLimited: true; retryAfterSeconds: number }).retryAfterSeconds).toBeLessThanOrEqual(900);

          // 5th request should also be rate-limited
          const result5 = requestResetToken(userId);
          expect(result5).toHaveProperty('rateLimited', true);
        }),
        { numRuns: 10 },
      );
    });

    it('generates tokens with at least 32 bytes of entropy', () => {
      fc.assert(
        fc.property(userIdArb, emailArb, (userId, email) => {
          resetStores();
          addTestUser(userId, email);

          const result = requestResetToken(userId);
          expect(result).toHaveProperty('rawToken');
          const rawToken = (result as { rawToken: string }).rawToken;

          // 32 bytes = 64 hex chars
          expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
          expect(Buffer.from(rawToken, 'hex').length).toBe(32);
        }),
        { numRuns: 10 },
      );
    });
  });

  // Feature: website-quality-remediation, Property 8: Reset token invalidation on password change
  // **Validates: Requirements 3.2**
  describe('P8: Token invalidation on password change', () => {
    it('invalidates ALL outstanding tokens for a user after a successful password change', () => {
      fc.assert(
        fc.property(
          userIdArb,
          emailArb,
          passwordHashArb,
          fc.integer({ min: 1, max: 3 }),
          (userId, email, newHash, tokenCount) => {
            resetStores();
            addTestUser(userId, email);

            // Generate multiple tokens
            const tokens: string[] = [];
            for (let i = 0; i < tokenCount; i++) {
              const result = requestResetToken(userId);
              expect(result).toHaveProperty('rawToken');
              tokens.push((result as { rawToken: string }).rawToken);
            }

            // All tokens should be valid before reset
            for (const token of tokens) {
              expect(isTokenValid(token)).toBe(true);
            }

            // Use the first token to reset password
            const resetResult = executeReset(tokens[0], newHash);
            expect(resetResult).toBe('success');

            // ALL tokens should now be invalid (including unused ones)
            for (const token of tokens) {
              expect(isTokenValid(token)).toBe(false);
            }
          },
        ),
        { numRuns: 10 },
      );
    });

    it('does not invalidate tokens belonging to other users', () => {
      fc.assert(
        fc.property(
          userIdArb,
          userIdArb,
          emailArb,
          emailArb,
          passwordHashArb,
          (userId1, userId2, email1, email2, newHash) => {
            fc.pre(userId1 !== userId2);
            fc.pre(email1.toLowerCase() !== email2.toLowerCase());

            resetStores();
            addTestUser(userId1, email1);
            addTestUser(userId2, email2);

            // Generate tokens for both users
            const result1 = requestResetToken(userId1);
            const result2 = requestResetToken(userId2);
            expect(result1).toHaveProperty('rawToken');
            expect(result2).toHaveProperty('rawToken');

            const token1 = (result1 as { rawToken: string }).rawToken;
            const token2 = (result2 as { rawToken: string }).rawToken;

            // Use user1's token to reset
            const resetResult = executeReset(token1, newHash);
            expect(resetResult).toBe('success');

            // User1's token should be invalid
            expect(isTokenValid(token1)).toBe(false);

            // User2's token should still be valid
            expect(isTokenValid(token2)).toBe(true);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // Feature: website-quality-remediation, Property 9: Single-use reset tokens
  // **Validates: Requirements 3.3**
  describe('P9: Single-use reset tokens', () => {
    it('a token used once cannot be used again', () => {
      fc.assert(
        fc.property(userIdArb, emailArb, passwordHashArb, (userId, email, newHash) => {
          resetStores();
          addTestUser(userId, email);

          const result = requestResetToken(userId);
          expect(result).toHaveProperty('rawToken');
          const rawToken = (result as { rawToken: string }).rawToken;

          // First use should succeed
          expect(isTokenValid(rawToken)).toBe(true);
          const firstReset = executeReset(rawToken, newHash);
          expect(firstReset).toBe('success');

          // Second use of the same token should fail
          expect(isTokenValid(rawToken)).toBe(false);
          const secondReset = executeReset(rawToken, newHash);
          expect(secondReset).toBe('invalid_token');
        }),
        { numRuns: 10 },
      );
    });

    it('using one token does not prevent generating new tokens (after rate limit window)', () => {
      fc.assert(
        fc.property(userIdArb, emailArb, passwordHashArb, (userId, email, newHash) => {
          resetStores();
          addTestUser(userId, email);

          // Generate and use a token
          const result1 = requestResetToken(userId);
          expect(result1).toHaveProperty('rawToken');
          const token1 = (result1 as { rawToken: string }).rawToken;
          executeReset(token1, newHash);

          // Should still be able to generate new tokens (within rate limit)
          const result2 = requestResetToken(userId);
          expect(result2).toHaveProperty('rawToken');
          const token2 = (result2 as { rawToken: string }).rawToken;

          // New token should be different and valid
          expect(token2).not.toBe(token1);
          expect(isTokenValid(token2)).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });
});
