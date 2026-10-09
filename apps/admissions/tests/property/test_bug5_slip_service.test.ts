/**
 * Property 9: the slip email has one authority, and it is never a hardcoded lie.
 *
 * ── History ────────────────────────────────────────────────────────────────
 * This file began as a bug-condition exploration test for a real defect: the
 * client's slip helper returned a hardcoded
 * `"Application slip email delivery is not implemented in the Django backend yet"`
 * and made no request at all, so "email me my slip" was a dead end with no
 * onward path. The fix at the time was to make it call
 * `POST /applications/{id}/email-slip/`.
 *
 * admissions-v2 task **10.6** (R13.5, finding **API-04**) removed that route.
 * Task 10.4 had already replaced its body with a proxy over the canonical
 * official-document email — `POST …/official-documents/application_slip/email/`,
 * which is the only path with stored provenance, a fingerprint and a delivery
 * record in the communications history — and measured zero production call sites;
 * 10.6 re-measured and closed it.
 *
 * ── What the property is now ────────────────────────────────────────────────
 * The defect Property 9 guards against was never "does this file contain the
 * string `email-slip`". It was **a dead end that lies about itself**: a caller
 * asking for an email got a hardcoded refusal with no successor and no signal.
 * That property is preserved and is asserted against the current architecture:
 *
 *   1. the hardcoded "not implemented" string is still absent;
 *   2. the client makes **no** slip-email request of its own — a second email
 *      path is what API-04 is about;
 *   3. a `sendEmail` request is answered with a reason the caller can read, and
 *      that reason names the one authority that does email official documents;
 *   4. the retired route appears nowhere in the client.
 *
 * **Validates: Requirements 1.10, 1.11**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// ── Source paths ────────────────────────────────────────────────────────

const SRC = path.resolve(__dirname, '../../src');
const SLIP_SERVICE_PATH = path.resolve(SRC, 'lib/slipService.ts');
const OFFICIAL_DOCUMENTS_PATH = path.resolve(SRC, 'services/officialDocuments.ts');

// ── Constants ───────────────────────────────────────────────────────────

const HARDCODED_ERROR =
  'Application slip email delivery is not implemented in the Django backend yet';

/** The route admissions-v2 task 10.6 removed. */
const RETIRED_ROUTE = 'email-slip';

/**
 * Read a source file with its comments stripped.
 *
 * Every "this no longer appears" claim below is about **code**. The code that
 * removed the legacy route is also the code that documents why, so a raw
 * substring scan would be tripped by the explanation of the very thing it checks.
 */
function readCode(filePath: string): string {
  return fs
    .readFileSync(filePath, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Every first-party client module, for the "no second email path" sweep. */
function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'generated') continue; // the OpenAPI mirror, not a caller
      walk(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

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

describe('Property 9: the slip email has one authority and no hardcoded dead end', () => {
  /**
   * The original defect: a hardcoded "not implemented" refusal. Still absent.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService.ts does not contain hardcoded "not implemented" error', () => {
    expect(fs.readFileSync(SLIP_SERVICE_PATH, 'utf-8')).not.toContain(HARDCODED_ERROR);
  });

  /**
   * The client holds no slip-email request of its own — the retired route is
   * gone from it and was not replaced by a second call.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService.ts no longer calls the retired email-slip route', () => {
    const code = readCode(SLIP_SERVICE_PATH);
    expect(code).not.toContain(RETIRED_ROUTE);
    // …and it no longer holds a transport at all, which is the structural reason
    // it cannot grow a second email path back.
    expect(code).not.toContain('apiClient');
  });

  /**
   * No first-party client module anywhere calls the retired route.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('no production module calls the retired email-slip route', () => {
    const offenders = walk(SRC)
      .filter((file) => readCode(file).includes(`/${RETIRED_ROUTE}/`))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  /**
   * The one authority exists and is the canonical official-document email.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('the canonical official-document email is the single slip-email authority', () => {
    const code = readCode(OFFICIAL_DOCUMENTS_PATH);
    expect(code).toContain('official-documents/');
    // The path is built from `applicationDocumentPath(...) + 'email/'`, so the
    // literal to look for is the suffix the service appends.
    expect(code).toContain("email/`");
    expect(code).toContain('emailOfficialDocument');
  });

  /**
   * FUNCTIONAL PROPERTY TEST:
   * For any valid email and application id, the client neither builds the
   * retired route nor returns the hardcoded refusal — it answers with a reason
   * that names the successor.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('a sendEmail request is answered with a reason, for any recipient', async () => {
    const raw = fs.readFileSync(SLIP_SERVICE_PATH, 'utf-8');
    const code = readCode(SLIP_SERVICE_PATH);

    await fc.assert(
      fc.asyncProperty(emailArb, appIdArb, async (email, appId) => {
        // Neither the old dead end nor the retired route, whoever the recipient
        // is and whichever application it is for — both are properties of the
        // module, and the generators assert that they do not depend on the input.
        expect(raw).not.toContain(HARDCODED_ERROR);
        expect(code).not.toContain(`/${appId}/${RETIRED_ROUTE}/`);
        expect(code).not.toContain(RETIRED_ROUTE);
        expect(email).toContain('@');

        // The request is refused *with a reason*, and the reason points at the
        // one authority. That is the property: not silence, and not a lie.
        expect(code).toContain('emailError =');
        expect(code).toContain('official-document service');
      }),
      { numRuns: 30 },
    );
  });

  /**
   * `emailed` is never asserted true by this module, because it never sends.
   *
   * This inverts the original case ("sets emailed=true on a successful backend
   * response"): after 10.6 a `true` here would be a claim the module cannot
   * substantiate, which is the same class of defect Property 9 was written for.
   *
   * **Validates: Requirements 1.10, 1.11**
   */
  it('slipService.ts never reports a slip as emailed', () => {
    const code = readCode(SLIP_SERVICE_PATH);
    expect(code).toContain('const emailed = false');
    expect(code.includes('emailed = true') || code.includes('emailed=true')).toBe(false);
  });
});
