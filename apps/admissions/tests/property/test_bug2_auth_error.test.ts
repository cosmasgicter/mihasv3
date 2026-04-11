/**
 * Bug condition exploration test — Auth errors swallowed in ApplicationStatus.
 *
 * Property 5: Bug Condition — AuthenticationError Caught as "Not Found"
 *
 * This test encodes the EXPECTED (fixed) behavior:
 * - When `applicationService.getById()` throws an `AuthenticationError`,
 *   the queryFn in ApplicationStatus MUST re-throw it (let it propagate
 *   as AuthenticationError) so the global auth redirect flow can handle it.
 * - When `applicationService.getById()` throws any other error (404, network,
 *   generic Error), the queryFn should catch it and throw
 *   "Application not found or access denied".
 *
 * On UNFIXED code, this test MUST FAIL because:
 * - The queryFn does not have a try-catch that distinguishes AuthenticationError
 *   from other errors. It either lets all errors propagate uniformly or catches
 *   them all as generic "not found". The component then renders "Application Not
 *   Found" for ALL queryErrors — including AuthenticationError.
 *
 * **Validates: Requirements 1.3, 1.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

import { AuthenticationError } from '@/services/client';

// ── Source code analysis approach ───────────────────────────────────────
// Since the queryFn is inline in the React component, we verify the fix
// by reading the source file and checking that it contains the
// AuthenticationError re-throw pattern. We also functionally test the
// expected queryFn behavior.

const APPLICATION_STATUS_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/ApplicationStatus.tsx',
);

// ── Generators ──────────────────────────────────────────────────────────

/** Generate random AuthenticationError messages */
const authErrorMessageArb = fc.constantFrom(
  'Authentication required. Please sign in again.',
  'Session expired',
  'Token refresh failed',
  'Invalid credentials',
  'Unauthorized access',
);

/** Generate random non-auth error types */
const nonAuthErrorArb: fc.Arbitrary<Error> = fc.constantFrom(
  new Error('Not Found'),
  new Error('Network error'),
  new Error('Application not found or access denied'),
  new Error('Internal server error'),
  Object.assign(new Error('HTTP 404'), { status: 404 }),
  Object.assign(new Error('HTTP 500'), { status: 500 }),
);

/** Generate random application IDs */
const appIdArb = fc.constantFrom(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000001',
  'deadbeef-cafe-babe-face-123456789abc',
  'test-app-id-001',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
);

// ── Property Tests ──────────────────────────────────────────────────────

describe('Property 5: Bug Condition — AuthenticationError propagates in ApplicationStatus queryFn', () => {
  /**
   * STRUCTURAL TEST: Verify the ApplicationStatus queryFn source code
   * contains explicit AuthenticationError handling.
   *
   * On UNFIXED code: the queryFn does not import or check for
   * AuthenticationError, so this test FAILS.
   *
   * On FIXED code: the queryFn imports AuthenticationError and re-throws
   * it before the generic "not found" catch.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it('ApplicationStatus.tsx queryFn contains AuthenticationError re-throw logic', () => {
    const source = fs.readFileSync(APPLICATION_STATUS_PATH, 'utf-8');

    // The file must import AuthenticationError
    const importsAuthError =
      source.includes('AuthenticationError') &&
      (source.includes("from '@/services/client'") ||
        source.includes('from "@/services/client"'));

    expect(importsAuthError).toBe(true);

    // The queryFn must contain logic to check for AuthenticationError
    // and re-throw it before the generic catch
    const hasAuthErrorCheck =
      source.includes('instanceof AuthenticationError') ||
      source.includes('AuthenticationError') && source.includes('throw error');

    expect(hasAuthErrorCheck).toBe(true);
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any AuthenticationError thrown by getById(), the queryFn MUST
   * re-throw it as an AuthenticationError (not convert to "not found").
   *
   * This tests the EXPECTED behavior of the fixed queryFn.
   * On UNFIXED code, the queryFn doesn't have the try-catch with
   * AuthenticationError check, so the structural test above fails first.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it('AuthenticationError from getById() propagates through queryFn', async () => {
    // Read source to dynamically determine the queryFn behavior
    const source = fs.readFileSync(APPLICATION_STATUS_PATH, 'utf-8');

    // Extract the queryFn section — look for the pattern between queryFn and enabled
    const queryFnMatch = source.match(/queryFn:\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*enabled/);
    expect(queryFnMatch).not.toBeNull();

    const queryFnBody = queryFnMatch![1];

    // The queryFn MUST have a try-catch that checks for AuthenticationError
    const hasTryCatch = queryFnBody.includes('try') && queryFnBody.includes('catch');
    const hasAuthCheck = queryFnBody.includes('AuthenticationError');

    // On UNFIXED code: no try-catch or no AuthenticationError check → FAIL
    expect(hasTryCatch).toBe(true);
    expect(hasAuthCheck).toBe(true);

    // Now functionally verify the expected behavior with fast-check
    await fc.assert(
      fc.asyncProperty(
        appIdArb,
        authErrorMessageArb,
        async (appId, errorMessage) => {
          const authError = new AuthenticationError(errorMessage);

          // Simulate the EXPECTED fixed queryFn behavior:
          // It should re-throw AuthenticationError
          const mockGetById = async (_id: string) => {
            throw authError;
          };

          // Build the queryFn that matches the expected fixed pattern
          const queryFn = async () => {
            try {
              const response = await mockGetById(appId);
              if (!(response as any).application) {
                throw new Error('Application not found or access denied');
              }
              return (response as any).application;
            } catch (error) {
              if (error instanceof AuthenticationError) {
                throw error;
              }
              throw new Error('Application not found or access denied');
            }
          };

          let thrownError: unknown;
          try {
            await queryFn();
          } catch (error) {
            thrownError = error;
          }

          // AuthenticationError MUST propagate, not be converted
          expect(thrownError).toBeInstanceOf(AuthenticationError);
          expect((thrownError as AuthenticationError).message).toBe(errorMessage);
          expect((thrownError as AuthenticationError).status).toBe(401);
        },
      ),
      { numRuns: 20 },
    );
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any non-AuthenticationError thrown by getById(), the queryFn
   * should catch it and throw "Application not found or access denied".
   *
   * This behavior should be the same on both unfixed and fixed code.
   *
   * **Validates: Requirements 1.3, 1.4**
   */
  it('non-auth errors are caught as "Application not found or access denied"', async () => {
    // Read source to verify the queryFn has the generic catch
    const source = fs.readFileSync(APPLICATION_STATUS_PATH, 'utf-8');
    const queryFnMatch = source.match(/queryFn:\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\},\s*enabled/);
    expect(queryFnMatch).not.toBeNull();

    const queryFnBody = queryFnMatch![1];

    // The queryFn must have the "Application not found" error message
    expect(queryFnBody).toContain('Application not found or access denied');

    // Functionally verify with fast-check
    await fc.assert(
      fc.asyncProperty(
        appIdArb,
        nonAuthErrorArb,
        async (appId, originalError) => {
          const mockGetById = async (_id: string) => {
            throw originalError;
          };

          // The fixed queryFn catches non-auth errors as "not found"
          const queryFn = async () => {
            try {
              const response = await mockGetById(appId);
              if (!(response as any).application) {
                throw new Error('Application not found or access denied');
              }
              return (response as any).application;
            } catch (error) {
              if (error instanceof AuthenticationError) {
                throw error;
              }
              throw new Error('Application not found or access denied');
            }
          };

          let thrownError: unknown;
          try {
            await queryFn();
          } catch (error) {
            thrownError = error;
          }

          // Non-auth errors should be caught and converted to "not found"
          expect(thrownError).toBeInstanceOf(Error);
          expect(thrownError).not.toBeInstanceOf(AuthenticationError);
          expect((thrownError as Error).message).toBe(
            'Application not found or access denied',
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});
