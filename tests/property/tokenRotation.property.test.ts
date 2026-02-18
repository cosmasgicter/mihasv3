/**
 * Feature: migration-recovery-hardening, Property 12: Refresh token rotation produces a new token on every use
 *
 * **Validates: Requirements 10.3**
 *
 * For any valid refresh request, the newly issued refresh token should differ
 * from the one that was submitted, ensuring replay attack prevention.
 *
 * We test generateRefreshToken directly — each call with the same userId
 * must produce a distinct token (due to unique iat/exp claims).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';

import { generateRefreshToken } from '../../lib/auth/jwt';

const TEST_SECRET = 'test-jwt-refresh-secret-at-least-32-chars!!';

describe('Property 12: Refresh token rotation', () => {
  let original: string | undefined;

  beforeAll(() => {
    original = process.env.JWT_REFRESH_SECRET;
    process.env.JWT_REFRESH_SECRET = TEST_SECRET;
  });

  afterAll(() => {
    process.env.JWT_REFRESH_SECRET = original;
  });

  it('consecutive refresh tokens for the same user are always distinct', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (userId) => {
        const token1 = await generateRefreshToken(userId);
        const token2 = await generateRefreshToken(userId);
        expect(token1).not.toBe(token2);
      }),
      { numRuns: 3 }
    );
  });

  it('refresh tokens contain the refresh type marker', async () => {
    const token = await generateRefreshToken('test-user-id');
    // JWT is base64url encoded — the payload section (index 1) should decode
    // to contain "refresh" type
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    expect(payload.type).toBe('refresh');
    expect(payload.sub).toBe('test-user-id');
  });
});
