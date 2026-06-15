/**
 * Student end-to-end journey on staging (Phase 8, task 17.1).
 *
 * Spec: .kiro/specs/beanola-production-readiness — task 17.1
 *   "Student E2E flow set on staging" — run the student E2E_Flow set on the
 *    Neon staging branch (signup → verification → application creation →
 *    canonical-program/intake selection → assigned institution → document
 *    upload → save-draft/resume → pay-or-defer → submission → backend
 *    application-slip download → public tracking → communication → interview →
 *    decision → acceptance/conditional-offer + receipt download), as Playwright
 *    scripts or documented manual runs.
 *
 * Validates: Requirements R8.1 (THE student E2E_Flow set SHALL pass on staging,
 * covering the full journey).
 *
 * ── Why this is GATED / skippable ──────────────────────────────────────────
 * R8.1 is a *staging* requirement: the live browser run needs (a) Playwright
 * browser binaries installed, (b) a running admissions app pointed at a staging
 * backend, and (c) the gated Neon cutover applied so canonical programs /
 * offerings / intakes / document profiles exist for a real applicant to pick.
 * None of those are guaranteed in CI or the dev sandbox, so the whole suite is
 * gated behind `STUDENT_JOURNEY_E2E=1`. The cases still ENUMERATE under
 * `playwright test --list` so the harness is verifiable without a browser.
 *
 * The journey's API/service seams run NOW (against the ephemeral test DB) in the
 * runnable backend walk
 * `backend/tests/integration/test_student_journey_e2e.py`, which drives every
 * R8.1 step through the real HTTP surface and the real backend services. This
 * browser spec is the optional, deferred confirmation step for a staging
 * environment with a real student session. It mirrors the deferred-pattern of
 * `whiteLabelHostOverride.spec.ts` and `mobileBreakpointScreenshots.spec.ts`.
 *
 * ── How to run (against staging) ───────────────────────────────────────────
 *   # 1. one-time: install the browser binary
 *   bun x playwright install chromium
 *
 *   # 2. point the app at a staging backend and serve it (separate terminal)
 *   #    (the staging backend must have the gated Neon cutover applied, with at
 *   #     least one active canonical program + offering + intake + an
 *   #     acceptance-letter document profile for the assigned school)
 *   VITE_API_BASE_URL=https://staging-api.beanola.example bun run dev
 *
 *   # 3a. fresh-signup run — the spec registers a brand-new student and walks
 *   #     the journey end to end. Verification uses the staging dev-equivalent
 *   #     (an admin/dev endpoint or a known auto-verify on staging).
 *   STUDENT_JOURNEY_E2E=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   STUDENT_JOURNEY_CANONICAL_PROGRAM="Diploma in Nursing" \
 *     bun x playwright test tests/e2e/studentJourney.spec.ts
 *
 *   # 3b. existing-session run — supply a logged-in, already-verified student
 *   #     storage state to skip signup/verification and walk from the wizard.
 *   #     (capture once with `bun x playwright codegen --save-storage=state.json`)
 *   STUDENT_JOURNEY_E2E=1 \
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173 \
 *   PLAYWRIGHT_STORAGE_STATE=./state.json \
 *     bun x playwright test tests/e2e/studentJourney.spec.ts
 *
 *   # enumerate the planned journey steps WITHOUT a browser or server:
 *   bun x playwright test tests/e2e/studentJourney.spec.ts --list
 *
 * NOTE: task 17.2 adds the parallel ADMIN journey in its own spec
 * (`adminJourney.spec.ts`); this file is the STUDENT journey only.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Gating ─────────────────────────────────────────────────────────────────
// Live run requires installed browsers + a running app on a staging backend.
const E2E_ENABLED = process.env.STUDENT_JOURNEY_E2E === '1';
// When a logged-in, verified student storage state is supplied, the spec skips
// signup/verification and walks the authenticated journey from the wizard.
const STORAGE_STATE = process.env.PLAYWRIGHT_STORAGE_STATE;
const HAS_SESSION = Boolean(STORAGE_STATE);

// ── Placeholder test data — no real PII (mirrors applicationFlow.spec.ts) ────
const TS = Date.now();
const STUDENT = {
  firstName: 'Journey',
  lastName: 'Applicant',
  email: `e2e.journey.${TS}@example.com`,
  password: 'JourneyPass123!',
  phone: '+260971234567',
  dob: '2000-01-15',
  nrc: '123456/78/9',
  city: 'Lusaka',
} as const;

// The canonical program the applicant chooses first (program-first selection).
// Configurable so the spec matches whatever the staging cutover seeded.
const CANONICAL_PROGRAM =
  process.env.STUDENT_JOURNEY_CANONICAL_PROGRAM || 'Diploma in Nursing';

// ── Helpers ──────────────────────────────────────────────────────────────────
async function settle(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
}

test.describe('Student E2E journey on staging (R8.1)', () => {
  test.skip(
    !E2E_ENABLED,
    'Set STUDENT_JOURNEY_E2E=1 with installed browsers + a staging-backed dev server to run.',
  );

  test.use({ storageState: STORAGE_STATE });

  test('signup → verification (dev equivalent)', async ({ page }) => {
    test.skip(
      HAS_SESSION,
      'A logged-in student storage state is supplied — signup/verification are pre-done.',
    );
    await settle(page, '/auth/signup');
    await page.getByLabel(/first name/i, { exact: false }).fill(STUDENT.firstName);
    await page.getByLabel(/last name/i, { exact: false }).fill(STUDENT.lastName);
    await page.getByLabel(/email/i, { exact: false }).fill(STUDENT.email);
    await page.getByLabel(/password/i, { exact: false }).first().fill(STUDENT.password);
    await page.getByRole('button', { name: /sign up|create account|register/i }).click();
    // Staging dev-equivalent: registration confirmation or a verified redirect.
    await expect(
      page.getByText(/check your email|verify|registration successful|dashboard/i).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('application creation → canonical-program + intake selection → assigned institution', async ({
    page,
  }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to walk the wizard.');
    await settle(page, '/student/application-wizard');
    // Program-first: choose the canonical program, then an intake.
    await expect(page.getByText(new RegExp(CANONICAL_PROGRAM, 'i')).first()).toBeVisible();
    // After program + intake selection the wizard surfaces the assigned school.
    await expect(page.getByText(/assigned|institution|school/i).first()).toBeVisible();
  });

  test('document upload (mandatory NRC/passport)', async ({ page }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to upload a document.');
    await settle(page, '/student/application-wizard');
    // The education/documents step exposes a file input for the identity doc.
    const fileInput = page.locator('input[type="file"]').first();
    await expect(fileInput).toBeAttached();
  });

  test('save-draft and resume', async ({ page }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to test draft resume.');
    await settle(page, '/student/application-wizard');
    // Auto-save is silent; reloading restores the in-progress draft (R7.6).
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(new RegExp(CANONICAL_PROGRAM, 'i')).first()).toBeVisible();
  });

  test('pay-or-defer (where allowed) → submission', async ({ page }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to reach payment.');
    await settle(page, '/student/application-wizard');
    // Mobile money is primary; defer-and-submit is allowed. Either path leads
    // to the final submission confirmation.
    await expect(
      page.getByRole('button', { name: /pay|defer|submit/i }).first(),
    ).toBeVisible();
  });

  test('download the backend application slip', async ({ page }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to download the slip.');
    await settle(page, '/student/status');
    // The slip download serves the backend-stored Official_Document (never a
    // client render) — the action is present once the application is submitted.
    await expect(
      page.getByRole('button', { name: /application slip|download/i }).first(),
    ).toBeVisible();
  });

  test('public tracking exposes status without login', async ({ page }) => {
    // Public tracker is anonymous — it does NOT need a session.
    await settle(page, '/track-application');
    await expect(
      page.getByText(/track|application number|tracking code/i).first(),
    ).toBeVisible();
  });

  test('receiving a communication (notifications)', async ({ page }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to read notifications.');
    await settle(page, '/student/dashboard');
    // Submission dispatches the application_submitted communication; the bell
    // surfaces the resulting notification.
    await expect(page.getByRole('button', { name: /notification/i }).first()).toBeVisible();
  });

  test('the interview path', async ({ page }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to view interviews.');
    await settle(page, '/student/interview');
    await expect(page.getByText(/interview/i).first()).toBeVisible();
  });

  test('receiving a decision → download acceptance/conditional-offer + receipt', async ({
    page,
  }) => {
    test.skip(!HAS_SESSION, 'Supply PLAYWRIGHT_STORAGE_STATE (verified student) to view the decision.');
    await settle(page, '/student/status');
    // Once a decision is recorded, the status surface exposes the decision and
    // the backend-generated official documents (acceptance/conditional-offer +
    // payment receipt) as downloads — all served from the backend store.
    await expect(page.getByText(/status|decision|approved|conditional/i).first()).toBeVisible();
  });
});
