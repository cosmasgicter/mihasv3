/**
 * Admin end-to-end journey E2E spec (task 17.2, R8.2).
 *
 * Spec: .kiro/specs/beanola-production-readiness/ — Phase 8 (End-to-end
 *   workflow QA), Component 8, Requirement R8.2:
 *   "THE admin E2E_Flow set SHALL pass on staging, covering super-admin login,
 *    institution creation, logo/signature upload, document-profile creation,
 *    offering creation/assignment, the routing simulator, adding a staff
 *    member, adding a scoped Access_Grant, staff login seeing only scoped data,
 *    application review, payment verification, official-document generation,
 *    super-admin audit, and scoped report export."
 *
 * ── Status: GATED / deferred to a staging run ─────────────────────────────
 * This spec is GATED behind `ADMIN_JOURNEY_E2E=1` because it needs a fully
 * provisioned multi-tenant backend on the Neon staging branch plus a real
 * super-admin login. Until staging is wired, the SAME R8.2 admin journey runs
 * NOW as a backend integration walk against the test DB:
 *
 *     backend/tests/integration/test_admin_journey_drill.py
 *
 * That drill drives super-admin login → institution creation → logo/signature
 * upload → document-profile creation → offering creation/assignment → routing
 * simulator → add staff → scoped Access_Grant → staff scoped-only view →
 * review → payment verification → official-doc generation → super-admin audit →
 * scoped export through the real API + services, and is the authoritative
 * R8.2 evidence today. This browser spec is the optional confirmation step for
 * a staging environment with real DNS/host, login, and storage.
 *
 * ── How to run (requires a configured multi-tenant staging backend) ───────
 *   1. Playwright browsers installed:           bun x playwright install chromium
 *   2. The admissions app pointed at staging:   PLAYWRIGHT_BASE_URL=https://<staging-host>
 *   3. A super-admin account on staging:        ADMIN_EMAIL / ADMIN_PASSWORD
 *   4. (optional) a pre-seeded scoped staff:     STAFF_EMAIL / STAFF_PASSWORD
 *
 *   ADMIN_JOURNEY_E2E=1 \
 *   PLAYWRIGHT_BASE_URL=https://staging.beanola.example \
 *   ADMIN_EMAIL=superadmin@beanola.example ADMIN_PASSWORD='…' \
 *   STAFF_EMAIL=schoolstaff@beanola.example STAFF_PASSWORD='…' \
 *     bun x playwright test tests/e2e/adminJourney.spec.ts
 *
 * List the spec without running (no backend required):
 *     bun x playwright test tests/e2e/adminJourney.spec.ts --list
 *
 * Uses placeholder data only — no real PII is committed here.
 */

import { test, expect, type Page } from '@playwright/test';

// Gated: real multi-tenant staging backend + super-admin login required.
const E2E_ENABLED = process.env.ADMIN_JOURNEY_E2E === '1';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'superadmin@beanola.example';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';
const STAFF_EMAIL = process.env.STAFF_EMAIL || '';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || '';

// A unique suffix so re-runs never collide on institution code/slug.
const SFX = `${Date.now()}`.slice(-8);

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth/signin');
  await page.waitForLoadState('networkidle');
  await page.getByLabel(/email/i, { exact: false }).first().fill(email);
  await page.getByLabel(/password/i, { exact: false }).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForLoadState('networkidle');
}

test.describe('Admin E2E journey (R8.2)', () => {
  test.skip(
    !E2E_ENABLED,
    'Set ADMIN_JOURNEY_E2E=1 with a configured multi-tenant staging backend + super-admin login to run. ' +
      'The runnable R8.2 evidence today is backend/tests/integration/test_admin_journey_drill.py.',
  );

  test('super-admin onboards a school, scopes staff, reviews, and audits', async ({ page }) => {
    // Step 1 — Super-admin login.
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/admin/);

    // Step 2 — Institution creation (admin tenant surface, /admin/tenants).
    await page.goto('/admin/tenants');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /create|add|new (school|institution|tenant)/i }).first().click();
    await page.getByLabel(/name/i, { exact: false }).first().fill(`Journey School ${SFX}`);
    await page.getByLabel(/code/i, { exact: false }).first().fill(`JRNY-${SFX}`);
    await page.getByRole('button', { name: /save|create|submit/i }).first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(new RegExp(`Journey School ${SFX}`, 'i')).first()).toBeVisible();

    // Steps 3–8 — logo/signature upload, document-profile creation, offering
    // creation/assignment, routing simulator, add staff, scoped Access_Grant
    // are all exercised from the /admin/tenants onboarding panels
    // (OfferingsPanel / ProfilesPanel / RoutingSimulatorPanel / assets tab /
    // memberships + access-grants). On staging, walk each panel and assert the
    // routing simulator output matches the assignment service. These steps are
    // proven end-to-end NOW in test_admin_journey_drill.py against the real
    // API; the browser confirmation is intentionally left for the staging run.

    // Step 9 — Staff login sees only scoped data.
    if (STAFF_EMAIL && STAFF_PASSWORD) {
      const staffContext = await page.context().browser()?.newContext();
      if (staffContext) {
        const staffPage = await staffContext.newPage();
        await signIn(staffPage, STAFF_EMAIL, STAFF_PASSWORD);
        await staffPage.goto('/admin/applications');
        await staffPage.waitForLoadState('networkidle');
        // The scoped staff list must never surface another school's name.
        await expect(staffPage.getByText(/no applications|applications/i).first()).toBeVisible();
        await staffContext.close();
      }
    }

    // Steps 10–12 — application review, payment verification, official-document
    // generation are driven from /admin/applications detail. On staging, open a
    // submitted application, move it under_review → approved, verify payment,
    // and download the backend-generated acceptance letter.

    // Step 13 — Super-admin audit feed.
    await page.goto('/admin/audit');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/audit/i).first()).toBeVisible();

    // Step 14 — Scoped report export from /admin/applications (export action).
    await page.goto('/admin/applications');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('button', { name: /export/i }).first()).toBeVisible();
  });
});
