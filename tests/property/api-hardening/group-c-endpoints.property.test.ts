// @vitest-environment node
/**
 * Property-based tests for Group C endpoint hardening (email, documents)
 * Feature: api-endpoint-hardening
 *
 * Property 14: Path traversal patterns are rejected
 * Property 18: Idempotency key round-trip
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { documentPathSchema } from '../../../lib/validation/documents';
import { scopeIdempotencyKey } from '../../../lib/idempotency';

// ── Property 14: Path traversal patterns are rejected ───────────────────────
// **Validates: Requirements 7.6**

describe('P14: Path traversal patterns are rejected', () => {
  it('known traversal patterns are rejected by documentPathSchema', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '../etc/passwd',
          '..\\windows\\system32',
          'docs/%00evil',
          'path/\0null',
          '../../secret',
          'a/../b/../c',
        ),
        (path: string) => {
          const result = documentPathSchema.safeParse(path);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('random strings with ../ injected are rejected', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}../${suffix}`),
        (path: string) => {
          const result = documentPathSchema.safeParse(path);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('random strings with ..\\ injected are rejected', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}..\\${suffix}`),
        (path: string) => {
          const result = documentPathSchema.safeParse(path);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('random strings with %00 injected are rejected', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}%00${suffix}`),
        (path: string) => {
          const result = documentPathSchema.safeParse(path);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('random strings with null byte injected are rejected', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => `${prefix}\0${suffix}`),
        (path: string) => {
          const result = documentPathSchema.safeParse(path);
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clean paths pass validation', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('user123/doc.pdf', 'uploads/image.jpg', 'files/report.pdf'),
        (path: string) => {
          const result = documentPathSchema.safeParse(path);
          expect(result.success).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 18: Idempotency key round-trip ─────────────────────────────────
// **Validates: Requirements 10.1, 10.2, 10.3**

describe('P18: Idempotency key round-trip', () => {
  it('scopeIdempotencyKey produces deterministic {userId}:{endpoint}:{key} format', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userId: string, endpoint: string, key: string) => {
          const result = scopeIdempotencyKey(userId, endpoint, key);
          expect(result).toBe(`${userId}:${endpoint}:${key}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('same inputs always produce the same output (deterministic)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userId: string, endpoint: string, key: string) => {
          const result1 = scopeIdempotencyKey(userId, endpoint, key);
          const result2 = scopeIdempotencyKey(userId, endpoint, key);
          expect(result1).toBe(result2);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different inputs produce different outputs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userIdA: string, userIdB: string, endpoint: string, key: string) => {
          fc.pre(userIdA !== userIdB);
          const resultA = scopeIdempotencyKey(userIdA, endpoint, key);
          const resultB = scopeIdempotencyKey(userIdB, endpoint, key);
          expect(resultA).not.toBe(resultB);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different endpoints produce different scoped keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userId: string, endpointA: string, endpointB: string, key: string) => {
          fc.pre(endpointA !== endpointB);
          const resultA = scopeIdempotencyKey(userId, endpointA, key);
          const resultB = scopeIdempotencyKey(userId, endpointB, key);
          expect(resultA).not.toBe(resultB);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('different keys produce different scoped keys', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (userId: string, endpoint: string, keyA: string, keyB: string) => {
          fc.pre(keyA !== keyB);
          const resultA = scopeIdempotencyKey(userId, endpoint, keyA);
          const resultB = scopeIdempotencyKey(userId, endpoint, keyB);
          expect(resultA).not.toBe(resultB);
        },
      ),
      { numRuns: 100 },
    );
  });
});
