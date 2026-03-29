/**
 * Property-based tests for CSRF Protection Module
 * Feature: website-quality-remediation
 *
 * P4: Token uniqueness and entropy
 * P5: Rejection on invalid token
 * P6: Token rotation on refresh
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { hashToken } from '../../lib/csrf';

// ── Mock DB layer ───────────────────────────────────────────────────────

// In-memory store simulating the csrf_tokens table
let tokenStore: Map<string, { user_id: string; token_hash: string; expires_at: string }>;

vi.mock('../../lib/db', () => ({
  query: vi.fn(async (text: string, values?: unknown[]) => {
    const sql = text.trim().toUpperCase();

    if (sql.startsWith('DELETE FROM CSRF_TOKENS')) {
      const userId = values?.[0] as string;
      for (const [id, row] of tokenStore.entries()) {
        if (row.user_id === userId) tokenStore.delete(id);
      }
      return { rows: [], rowCount: 0, command: 'DELETE' };
    }

    if (sql.startsWith('INSERT INTO CSRF_TOKENS')) {
      const userId = values?.[0] as string;
      const tokenHash = values?.[1] as string;
      const expiresAt = values?.[2] as string;
      const id = crypto.randomUUID();
      tokenStore.set(id, { user_id: userId, token_hash: tokenHash, expires_at: expiresAt });
      return { rows: [{ id }], rowCount: 1, command: 'INSERT' };
    }

    if (sql.startsWith('SELECT')) {
      const userId = values?.[0] as string;
      const tokenHash = values?.[1] as string;
      const now = new Date();
      const matches = [...tokenStore.entries()]
        .filter(([, row]) =>
          row.user_id === userId &&
          row.token_hash === tokenHash &&
          new Date(row.expires_at) > now
        )
        .map(([id]) => ({ id }));
      return { rows: matches, rowCount: matches.length, command: 'SELECT' };
    }

    return { rows: [], rowCount: 0, command: 'UNKNOWN' };
  }),
}));

// Must import AFTER mock is set up
const { generateToken, validateToken, rotateToken } = await import('../../lib/csrf');

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Arbitrary UUID-like user ID */
const userIdArb = fc.uuid();

/** Arbitrary non-empty string for invalid tokens */
const invalidTokenArb = fc.string({ minLength: 1, maxLength: 128 })
  .filter((s) => s.length > 0 && !/^[a-f0-9]{64}$/.test(s));

// ── Tests ───────────────────────────────────────────────────────────────

describe('CSRF Property Tests', () => {
  beforeEach(() => {
    tokenStore = new Map();
  });

  // Feature: website-quality-remediation, Property 4: CSRF token uniqueness and entropy
  // **Validates: Requirements 2.1**
  describe('P4: Token uniqueness and entropy', () => {
    it('every generated token is unique and has at least 32 bytes of entropy', async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          const token1 = await generateToken(userId);
          const token2 = await generateToken(userId);

          // Tokens must be distinct
          expect(token1).not.toBe(token2);

          // Each token is a hex string of 32 random bytes → 64 hex chars
          expect(token1).toMatch(/^[a-f0-9]{64}$/);
          expect(token2).toMatch(/^[a-f0-9]{64}$/);

          // 32 bytes = 256 bits of entropy
          expect(Buffer.from(token1, 'hex').length).toBe(32);
          expect(Buffer.from(token2, 'hex').length).toBe(32);
        }),
        { numRuns: 10 },
      );
    });

    it('hashToken produces a 64-char hex SHA-256 digest', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (raw) => {
            const hash = hashToken(raw);
            expect(hash).toMatch(/^[a-f0-9]{64}$/);
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  // Feature: website-quality-remediation, Property 5: CSRF rejection on invalid token
  // **Validates: Requirements 2.2, 2.3**
  describe('P5: Rejection on invalid token', () => {
    it('rejects missing or empty tokens', async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          // Generate a valid token first so the user has a record
          await generateToken(userId);

          // Empty string should fail
          const resultEmpty = await validateToken(userId, '');
          expect(resultEmpty).toBe(false);
        }),
        { numRuns: 50 },
      );
    });

    it('rejects tokens that do not match the stored hash', async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, invalidTokenArb, async (userId, fakeToken) => {
          // Generate a valid token
          const validToken = await generateToken(userId);

          // The fake token should not validate (unless it happens to equal the valid one)
          if (fakeToken !== validToken) {
            const result = await validateToken(userId, fakeToken);
            expect(result).toBe(false);
          }
        }),
        { numRuns: 10 },
      );
    });

    it('accepts the correct token for the correct user', async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          const token = await generateToken(userId);
          const result = await validateToken(userId, token);
          expect(result).toBe(true);
        }),
        { numRuns: 10 },
      );
    });

    it('rejects a valid token used with a different user ID', async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, userIdArb, async (userId1, userId2) => {
          // Skip if same user
          fc.pre(userId1 !== userId2);

          const token = await generateToken(userId1);
          const result = await validateToken(userId2, token);
          expect(result).toBe(false);
        }),
        { numRuns: 10 },
      );
    });
  });

  // Feature: website-quality-remediation, Property 6: CSRF token rotation on refresh
  // **Validates: Requirements 2.5**
  describe('P6: Token rotation on refresh', () => {
    it('rotateToken returns a new token different from the previous one', async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          const originalToken = await generateToken(userId);
          const rotatedToken = await rotateToken(userId);

          // New token must differ from the old one
          expect(rotatedToken).not.toBe(originalToken);

          // New token must be valid
          const isValid = await validateToken(userId, rotatedToken);
          expect(isValid).toBe(true);

          // Old token must be invalid (deleted during rotation)
          const isOldValid = await validateToken(userId, originalToken);
          expect(isOldValid).toBe(false);
        }),
        { numRuns: 10 },
      );
    });
  });
});
