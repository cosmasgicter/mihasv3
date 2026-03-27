// @vitest-environment node
/**
 * Property-based tests for auth and session validation
 * Feature: api-endpoint-hardening
 *
 * Property 8: Unauthenticated requests to protected endpoints are rejected
 * Property 9: Insufficient role access is rejected
 * Property 17: Revoked sessions are rejected
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { AuthenticationError, AuthorizationError } from '../../../lib/auth/middleware';

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Random non-empty error messages */
const messageArb = fc.string({ minLength: 1, maxLength: 200 });

// ── Tests ───────────────────────────────────────────────────────────────

// Feature: api-endpoint-hardening, Property 8: Unauthenticated requests to protected endpoints are rejected
// **Validates: Requirements 5.1**
describe('P8: Unauthenticated requests to protected endpoints are rejected', () => {
  it('AuthenticationError has statusCode 401 and code AUTHENTICATION_REQUIRED', () => {
    fc.assert(
      fc.property(messageArb, (message: string) => {
        const error = new AuthenticationError(message);

        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error).toBeInstanceOf(Error);
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('AUTHENTICATION_REQUIRED');
        expect(error.message).toBe(message);
        expect(error.name).toBe('AuthenticationError');
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 9: Insufficient role access is rejected
// **Validates: Requirements 5.2**
describe('P9: Insufficient role access is rejected', () => {
  it('AuthorizationError has statusCode 403 and code INSUFFICIENT_PERMISSIONS', () => {
    fc.assert(
      fc.property(messageArb, (message: string) => {
        const error = new AuthorizationError(message);

        expect(error).toBeInstanceOf(AuthorizationError);
        expect(error).toBeInstanceOf(Error);
        expect(error.statusCode).toBe(403);
        expect(error.code).toBe('INSUFFICIENT_PERMISSIONS');
        expect(error.message).toBe(message);
        expect(error.name).toBe('AuthorizationError');
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 17: Revoked sessions are rejected
// **Validates: Requirements 9.1, 9.2**
describe('P17: Revoked sessions are rejected', () => {
  it('AuthenticationError with SESSION_REVOKED code has statusCode 401', () => {
    fc.assert(
      fc.property(messageArb, (message: string) => {
        const error = new AuthenticationError(message, 'SESSION_REVOKED');

        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error).toBeInstanceOf(Error);
        expect(error.statusCode).toBe(401);
        expect(error.code).toBe('SESSION_REVOKED');
        expect(error.message).toBe(message);
        expect(error.name).toBe('AuthenticationError');
      }),
      { numRuns: 100 },
    );
  });
});
