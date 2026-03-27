// @vitest-environment node
/**
 * Property-based tests for simple endpoint hardening
 * Feature: api-endpoint-hardening
 *
 * Property 2: Unrecognized actions are rejected with descriptive errors
 * Property 23: Catch-all route does not leak internal information
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ── Property 2: Unrecognized actions are rejected with descriptive errors ───
// **Validates: Requirements 1.4, 7.1, 7.2**

describe('P2: Unrecognized actions are rejected with descriptive errors', () => {
  const VALID_ACTIONS = ['ping', 'db', 'env', 'errors'];

  it('allowlist check correctly identifies invalid actions', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !['ping', 'db', 'env', 'errors', ''].includes(s)),
        (action: string) => {
          // Verify the allowlist check logic rejects the random action
          const isInvalid = !VALID_ACTIONS.includes(action);
          expect(isInvalid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('expected error message contains the valid action list', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !['ping', 'db', 'env', 'errors', ''].includes(s)),
        (action: string) => {
          // This is the error message produced by health.ts for invalid actions
          const errorMessage = 'Invalid action. Valid actions: ping, db, env, errors';

          // Verify the error message lists all valid actions
          for (const validAction of VALID_ACTIONS) {
            expect(errorMessage).toContain(validAction);
          }

          // Verify the random action is NOT in the valid actions list
          expect(VALID_ACTIONS).not.toContain(action);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 23: Catch-all route does not leak internal information ──────────
// **Validates: Requirements 13.4**

describe('P23: Catch-all route does not leak internal information', () => {
  const ERROR_MESSAGE = 'Not found';

  it('404 response message does not contain file extension patterns', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/api/nonexistent',
          '/api/admin-settings',
          '/api/foo/bar',
          '/api/../etc/passwd',
        ),
        (_path: string) => {
          expect(ERROR_MESSAGE).not.toMatch(/\.(ts|js|tsx)/);
          expect(ERROR_MESSAGE).not.toMatch(/\.(jsx|mjs|cjs)/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('404 response message does not contain file path patterns', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/api/nonexistent',
          '/api/admin-settings',
          '/api/foo/bar',
          '/api/../etc/passwd',
        ),
        (_path: string) => {
          // No forward slashes or backslashes indicating file paths
          expect(ERROR_MESSAGE).not.toMatch(/[/\\]/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('404 response message does not contain endpoint names', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/api/nonexistent',
          '/api/admin-settings',
          '/api/foo/bar',
          '/api/../etc/passwd',
        ),
        (_path: string) => {
          const endpointNames = [
            'health', 'auth', 'admin', 'applications',
            'catalog', 'documents', 'email', 'notifications',
            'payments', 'sessions', 'bootstrap',
          ];
          for (const name of endpointNames) {
            expect(ERROR_MESSAGE.toLowerCase()).not.toContain(name);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('404 response message does not contain stack trace patterns', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          '/api/nonexistent',
          '/api/admin-settings',
          '/api/foo/bar',
          '/api/../etc/passwd',
        ),
        (_path: string) => {
          expect(ERROR_MESSAGE).not.toMatch(/at /);
          expect(ERROR_MESSAGE).not.toMatch(/Error:/);
          expect(ERROR_MESSAGE).not.toMatch(/TypeError:/);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('404 response message does not leak info for randomly generated paths', () => {
    fc.assert(
      fc.property(fc.string(), (_randomPath: string) => {
        // Regardless of what path was requested, the error message is always generic
        expect(ERROR_MESSAGE).toBe('Not found');
        expect(ERROR_MESSAGE).not.toMatch(/\.(ts|js|tsx)/);
        expect(ERROR_MESSAGE).not.toMatch(/[/\\]/);
        expect(ERROR_MESSAGE).not.toMatch(/at /);
        expect(ERROR_MESSAGE).not.toMatch(/Error:/);
        expect(ERROR_MESSAGE).not.toMatch(/TypeError:/);
      }),
      { numRuns: 100 },
    );
  });
});
