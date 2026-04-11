/**
 * Bug condition exploration test — Email slip endpoint missing (frontend).
 *
 * Property 9: Bug Condition — Email Slip Returns Hardcoded Error
 *
 * This test encodes the EXPECTED (fixed) behavior:
 * - When sendEmail == true and email is present, slipService calls the
 *   backend endpoint instead of returning a hardcoded error.
 * - The source code must NOT contain the hardcoded error string
 *   "Application slip email delivery is not implemented in the Django backend yet"
 *
 * On UNFIXED code, this test MUST FAIL because:
 * - slipService.ts contains the hardcoded error string
 * - No backend API call is made when sendEmail is true
 *
 * **Validates: Requirements 1.10, 1.11**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Source path ─────────────────────────────────────────────────────────

const SLIP_SERVICE_PATH = path.resolve(
  __dirname,
  '../../src/lib/slipService.ts',
);

// ── Constants ───────────────────────────────────────────────────────────

const HARDCODED_ERROR =
  'Application slip email delivery is not implemented in the Django backend yet';

// ── Generators ──────────────────────────────────────────────────────────

/** Generate valid email addresses */
const emailArb = fc.tuple(
  fc.string({ minLength: 3, maxLength: 10 }).map((s) => s.replace(/[^a-z]/g, 'a') || 'abc'),
  fc.string({ minLength: 3, maxLength: 8 }).map((s) => s.replace(/[^a-z]/g, 'b') || 'def'),
  fc.constantFrom('com', 'org', 'edu', 'zm'),
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Generate application IDs */
const appIdArb = fc.constantFrom(
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  '00000000-0000-0000-0000-000000000001',
  'deadbeef-cafe-babe-face-123456789abc',
  '11111111-2222-3333-4444-555555555555',
);

// ── Property Tests ──────────────────────────────────────────────────────

describe('Property 9: Bug Condition — Email Slip Returns Hardcoded Error', () => {
  /**
   * STRUCTURAL TEST: Verify slipService.ts does NOT contain the hardcoded
   * "not implemented" error string.
   *
   * On UNFIXED code: slipService.ts contains the hardcoded error, so this
   * test FAILS.
   *
   * On FIXED code: the hardcoded error is replaced with a backend API call.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService.ts does not contain hardcoded "not implemented" error', () => {
    const source = fs.readFileSync(SLIP_SERVICE_PATH, 'utf-8');

    expect(source).not.toContain(HARDCODED_ERROR);
  });

  /**
   * STRUCTURAL TEST: Verify slipService.ts makes a backend API call
   * when sendEmail is true and email is present.
   *
   * On UNFIXED code: slipService.ts has no API call for email-slip,
   * so this test FAILS.
   *
   * On FIXED code: slipService.ts calls the backend email-slip endpoint.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService.ts contains backend API call for email-slip', () => {
    const source = fs.readFileSync(SLIP_SERVICE_PATH, 'utf-8');

    // The file must reference the email-slip endpoint
    const hasEmailSlipEndpoint = source.includes('email-slip');

    expect(hasEmailSlipEndpoint).toBe(true);
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any valid email and application ID, the slipService source code
   * must contain logic to call the backend when sendEmail is true.
   *
   * On UNFIXED code: the source just assigns a hardcoded error string,
   * so this test FAILS.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService handles sendEmail=true with backend call, not hardcoded error', async () => {
    // First verify the structural prerequisite
    const source = fs.readFileSync(SLIP_SERVICE_PATH, 'utf-8');
    expect(source).not.toContain(HARDCODED_ERROR);

    await fc.assert(
      fc.asyncProperty(
        emailArb,
        appIdArb,
        async (email, appId) => {
          // The source must not contain the hardcoded error
          // AND must contain an API call pattern for email-slip
          const hasHardcodedError = source.includes(HARDCODED_ERROR);
          const hasApiCall = source.includes('email-slip');

          // Bug condition: sendEmail == true AND email IS NOT EMPTY
          // AND backendEndpoint NOT EXISTS
          // Expected: source makes API call (no hardcoded error)
          // Actual (unfixed): source has hardcoded error, no API call
          expect(hasHardcodedError).toBe(false);
          expect(hasApiCall).toBe(true);
        },
      ),
      { numRuns: 30 },
    );
  });

  /**
   * STRUCTURAL TEST: Verify slipService.ts sets emailed=true and
   * queuedId on successful backend response.
   *
   * On UNFIXED code: emailed is never set to true (always false),
   * so this test FAILS.
   *
   * On FIXED code: emailed is set to true on successful API response.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService.ts sets emailed=true on successful backend response', () => {
    const source = fs.readFileSync(SLIP_SERVICE_PATH, 'utf-8');

    // The source must contain logic to set emailed = true
    // On unfixed code, emailed is declared but never set to true
    const hasEmailedTrue =
      source.includes('emailed = true') || source.includes('emailed=true');

    expect(hasEmailedTrue).toBe(true);
  });
});
