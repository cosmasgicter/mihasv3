/**
 * Accessibility tests using axe-core via @axe-core/playwright.
 *
 * Asserts zero `critical` or `serious` violations on:
 *   - Login page
 *   - Registration page
 *   - Wizard Step 1 (Basic KYC)
 *   - Wizard Step 2 (Education & Documents)
 *   - Wizard Step 3 (Payment)
 *
 * `moderate` and `minor` violations are logged but do NOT fail the test.
 *
 * Requires the dev server running at http://localhost:5173
 * Run with: bun x playwright test tests/e2e/accessibility.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// ---------------------------------------------------------------------------
// Test credentials — placeholder values only, no real PII
// ---------------------------------------------------------------------------
const TEST_EMAIL = `a11y.test.${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';
const TEST_FULL_NAME = 'A11y Test User';
const TEST_PHONE = '+260971234567';
const TEST_DOB = '2000-01-15';
const TEST_NRC = '123456/78/9';
const TEST_CITY = 'Kitwe';
const TEST_NATIONALITY = 'Zambian';
const TEST_NOK_NAME = 'Test Guardian';
const TEST_NOK_PHONE = '+260961234567';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run axe on the current page and assert no critical/serious violations. */
async function assertNoBlockingViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();

  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );

  const nonBlocking = results.violations.filter(
    (v) => v.impact === 'moderate' || v.impact === 'minor',
  );

  if (nonBlocking.length > 0) {
    console.log(
      `[a11y] ${label} — ${nonBlocking.length} non-blocking violation(s) (moderate/minor):`,
    );
    for (const v of nonBlocking) {
      console.log(`  • [${v.impact}] ${v.id}: ${v.description}`);
      console.log(`    Nodes: ${v.nodes.map((n) => n.target.join(', ')).join(' | ')}`);
    }
  }

  expect(
    blocking,
    `${label}: expected 0 critical/serious violations but found ${blocking.length}:\n` +
      blocking
        .map((v) => `  [${v.impact}] ${v.id}: ${v.description}`)
        .join('\n'),
  ).toHaveLength(0);
}

/** Register a new account and stay logged in. */
async function registerAndLogin(page: Page) {
  await page.goto('/auth/signup');
  await page.waitForLoadState('networkidle');

  await page.getByLabel('Full Name', { exact: false }).fill(TEST_FULL_NAME);
  await page.getByLabel('Email Address', { exact: false }).fill(TEST_EMAIL);
  await page.getByLabel('Create Password', { exact: false }).fill(TEST_PASSWORD);
  await page.getByLabel('Confirm Password', { exact: false }).fill(TEST_PASSWORD);
  await page.getByLabel('Phone Number', { exact: false }).fill(TEST_PHONE);
  await page.getByLabel('Date of Birth', { exact: false }).fill(TEST_DOB);

  const sexCombo = page.getByRole('combobox', { name: /sex/i });
  await sexCombo.click();
  await page.getByRole('option', { name: 'Male' }).click();

  await page.getByLabel('City/Town', { exact: false }).fill(TEST_CITY);
  await page.getByLabel('Nationality', { exact: false }).fill(TEST_NATIONALITY);
  await page.getByLabel('Next of Kin Name', { exact: false }).fill(TEST_NOK_NAME);
  await page.getByLabel('Next of Kin Phone', { exact: false }).fill(TEST_NOK_PHONE);

  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL(/\/student\/dashboard/, { timeout: 15_000 });
}

/** Navigate to the wizard and wait for it to load. */
async function goToWizard(page: Page) {
  await page.goto('/apply');
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Public pages
// ---------------------------------------------------------------------------

test.describe('Accessibility — public pages', () => {
  test('login page has no critical/serious violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    await assertNoBlockingViolations(page, 'Login page');
  });

  test('registration page has no critical/serious violations', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');
    await assertNoBlockingViolations(page, 'Registration page');
  });
});

// ---------------------------------------------------------------------------
// Wizard steps (require authentication)
// ---------------------------------------------------------------------------

test.describe('Accessibility — wizard steps', () => {
  // Register once and reuse the session across wizard step tests
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page);
    await goToWizard(page);
  });

  test('wizard step 1 (Basic KYC) has no critical/serious violations', async ({ page }) => {
    // Step 1 is the default landing step of the wizard
    await page.waitForSelector('[data-testid="basic-kyc-step"]', { timeout: 10_000 });
    await assertNoBlockingViolations(page, 'Wizard Step 1 — Basic KYC');
  });

  test('wizard step 2 (Education) has no critical/serious violations', async ({ page }) => {
    await page.waitForSelector('[data-testid="basic-kyc-step"]', { timeout: 10_000 });

    // Fill minimum required fields to advance
    await page.getByLabel('Full Name', { exact: false }).fill(TEST_FULL_NAME);
    await page.getByLabel('NRC Number', { exact: false }).fill(TEST_NRC);
    await page.getByLabel('Date of Birth', { exact: false }).fill(TEST_DOB);

    const sexCombo = page.getByRole('combobox', { name: /sex/i });
    await sexCombo.click();
    await page.getByRole('option', { name: 'Male' }).click();

    await page.getByLabel('Phone Number', { exact: false }).fill(TEST_PHONE);
    await page.getByLabel('Email Address', { exact: false }).fill(TEST_EMAIL);
    await page.getByLabel('Residence Town', { exact: false }).fill(TEST_CITY);
    await page.getByLabel('Nationality', { exact: false }).fill(TEST_NATIONALITY);

    const programCombo = page.getByRole('combobox', { name: /program/i });
    await programCombo.click();
    await page.getByRole('option').first().click();

    const intakeCombo = page.getByRole('combobox', { name: /intake/i });
    if (!(await intakeCombo.isDisabled())) {
      await intakeCombo.click();
      await page.getByRole('option').first().click();
    }

    await page.getByRole('button', { name: /next step/i }).click();
    await page.waitForSelector('[data-testid="education-step"]', { timeout: 10_000 });

    await assertNoBlockingViolations(page, 'Wizard Step 2 — Education');
  });

  test('wizard step 3 (Payment) has no critical/serious violations', async ({ page }) => {
    await page.waitForSelector('[data-testid="basic-kyc-step"]', { timeout: 10_000 });

    // Step 1 → Step 2
    await page.getByLabel('Full Name', { exact: false }).fill(TEST_FULL_NAME);
    await page.getByLabel('NRC Number', { exact: false }).fill(TEST_NRC);
    await page.getByLabel('Date of Birth', { exact: false }).fill(TEST_DOB);

    const sexCombo1 = page.getByRole('combobox', { name: /sex/i });
    await sexCombo1.click();
    await page.getByRole('option', { name: 'Male' }).click();

    await page.getByLabel('Phone Number', { exact: false }).fill(TEST_PHONE);
    await page.getByLabel('Email Address', { exact: false }).fill(TEST_EMAIL);
    await page.getByLabel('Residence Town', { exact: false }).fill(TEST_CITY);
    await page.getByLabel('Nationality', { exact: false }).fill(TEST_NATIONALITY);

    const programCombo = page.getByRole('combobox', { name: /program/i });
    await programCombo.click();
    await page.getByRole('option').first().click();

    const intakeCombo = page.getByRole('combobox', { name: /intake/i });
    if (!(await intakeCombo.isDisabled())) {
      await intakeCombo.click();
      await page.getByRole('option').first().click();
    }

    await page.getByRole('button', { name: /next step/i }).click();
    await page.waitForSelector('[data-testid="education-step"]', { timeout: 10_000 });

    // Step 2 → Step 3: add 5 subject grades
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: /add new subject/i }).click();

      const subjectSelect = page.locator(`[data-testid="subject-select-${i}"]`);
      await subjectSelect.click();
      await page
        .getByRole('option')
        .filter({ hasNot: page.locator('[aria-disabled="true"]') })
        .first()
        .click();

      const gradeSelect = page.locator(`[data-testid="grade-select-${i}"]`);
      await gradeSelect.click();
      await page.getByRole('option', { name: /3 \(B\+\)/i }).click();
    }

    const resultSlipInput = page.locator('input[type="file"]').first();
    await resultSlipInput.setInputFiles({
      name: 'result_slip.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test result slip'),
    });

    await page.getByRole('button', { name: /next step/i }).click();
    await page.waitForSelector('[data-testid="payment-step"]', { timeout: 10_000 });

    await assertNoBlockingViolations(page, 'Wizard Step 3 — Payment');
  });

});
