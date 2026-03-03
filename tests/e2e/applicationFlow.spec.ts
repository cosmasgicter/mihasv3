/**
 * E2E tests for the complete MIHAS application flow.
 *
 * Flow: Registration → Login → Wizard Step 1 (Basic KYC) →
 *       Step 2 (Education & Documents) → Step 3 (Payment) →
 *       Step 4 (Review & Submit) → Submission
 *
 * Uses placeholder Zambian test data — no real PII.
 * Requires the dev server running at http://localhost:5173
 *
 * Run with: bunx playwright test tests/e2e/applicationFlow.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test data — placeholder values only, no real PII
// ---------------------------------------------------------------------------
const TEST_EMAIL = `e2e.test.${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';
const TEST_FULL_NAME = 'Test Applicant';
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

/** Wait for navigation to a URL pattern and assert it. */
async function waitForUrl(page: Page, pattern: string | RegExp, timeout = 15_000) {
  await page.waitForURL(pattern, { timeout });
}

/** Fill a labelled input by its label text. */
async function fillByLabel(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: false }).fill(value);
}

/** Click a button by its visible text. */
async function clickButton(page: Page, text: string) {
  await page.getByRole('button', { name: text, exact: false }).click();
}

// ---------------------------------------------------------------------------
// Registration helpers
// ---------------------------------------------------------------------------

async function completeRegistration(page: Page) {
  await page.goto('/auth/signup');
  await page.waitForLoadState('networkidle');

  // Personal details
  await fillByLabel(page, 'Full Name', TEST_FULL_NAME);
  await fillByLabel(page, 'Email Address', TEST_EMAIL);
  await fillByLabel(page, 'Create Password', TEST_PASSWORD);
  await fillByLabel(page, 'Confirm Password', TEST_PASSWORD);
  await fillByLabel(page, 'Phone Number', TEST_PHONE);
  await fillByLabel(page, 'Date of Birth', TEST_DOB);

  // Sex select — Radix UI select, trigger by role
  await page.getByRole('combobox', { name: /sex/i }).click();
  await page.getByRole('option', { name: 'Male' }).click();

  await fillByLabel(page, 'City/Town', TEST_CITY);
  await fillByLabel(page, 'Nationality', TEST_NATIONALITY);

  // Next of kin
  await fillByLabel(page, 'Next of Kin Name', TEST_NOK_NAME);
  await fillByLabel(page, 'Next of Kin Phone', TEST_NOK_PHONE);

  await clickButton(page, 'Create Account');
}

// ---------------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------------

async function completeLogin(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  await fillByLabel(page, 'Email address', TEST_EMAIL);
  await fillByLabel(page, 'Password', TEST_PASSWORD);
  await clickButton(page, 'Sign in');
}

// ---------------------------------------------------------------------------
// Wizard helpers
// ---------------------------------------------------------------------------

async function navigateToWizard(page: Page) {
  await page.goto('/apply');
  await page.waitForLoadState('networkidle');
}

async function completeStep1BasicKyc(page: Page) {
  // Wait for the step to render
  await page.waitForSelector('[data-testid="basic-kyc-step"]', { timeout: 10_000 });

  // Fields may be pre-populated from profile; fill/overwrite key fields
  const fullNameInput = page.getByLabel('Full Name', { exact: false });
  await fullNameInput.fill(TEST_FULL_NAME);

  // NRC — identified by aria-label in BasicKycStep
  const nrcInput = page.getByLabel('NRC Number', { exact: false });
  await nrcInput.fill(TEST_NRC);

  await page.getByLabel('Date of Birth', { exact: false }).fill(TEST_DOB);

  // Sex combobox
  const sexCombo = page.getByRole('combobox', { name: /sex/i });
  await sexCombo.click();
  await page.getByRole('option', { name: 'Male' }).click();

  // Phone — identified by aria-label
  await page.getByLabel('Phone Number', { exact: false }).fill(TEST_PHONE);

  await page.getByLabel('Email Address', { exact: false }).fill(TEST_EMAIL);
  await page.getByLabel('Residence Town', { exact: false }).fill(TEST_CITY);
  await page.getByLabel('Nationality', { exact: false }).fill(TEST_NATIONALITY);

  // Program select — pick first available option
  const programCombo = page.getByRole('combobox', { name: /program/i });
  await programCombo.click();
  const firstProgramOption = page.getByRole('option').first();
  await firstProgramOption.click();

  // Intake select — pick first available option (may be disabled if no intakes)
  const intakeCombo = page.getByRole('combobox', { name: /intake/i });
  const intakeDisabled = await intakeCombo.isDisabled();
  if (!intakeDisabled) {
    await intakeCombo.click();
    const firstIntakeOption = page.getByRole('option').first();
    await firstIntakeOption.click();
  }

  await clickButton(page, 'Next Step');
}

async function completeStep2Education(page: Page) {
  await page.waitForSelector('[data-testid="education-step"]', { timeout: 10_000 });

  // Add 5 subject grades (minimum required)
  for (let i = 0; i < 5; i++) {
    await clickButton(page, '+ Add New Subject');

    // Subject select for this row
    const subjectSelect = page.locator(`[data-testid="subject-select-${i}"]`);
    await subjectSelect.click();
    // Pick first non-disabled option
    const firstAvailableOption = page.getByRole('option').filter({ hasNot: page.locator('[aria-disabled="true"]') }).first();
    await firstAvailableOption.click();

    // Grade select for this row
    const gradeSelect = page.locator(`[data-testid="grade-select-${i}"]`);
    await gradeSelect.click();
    // Pick grade 3 (B+) — a passing grade
    await page.getByRole('option', { name: /3 \(B\+\)/i }).click();
  }

  // Upload a minimal PDF as result slip
  const resultSlipInput = page.locator('input[type="file"]').first();
  const pdfContent = Buffer.from('%PDF-1.4 test result slip');
  await resultSlipInput.setInputFiles({
    name: 'result_slip.pdf',
    mimeType: 'application/pdf',
    buffer: pdfContent,
  });

  await clickButton(page, 'Next Step');
}

async function completeStep3Payment(page: Page) {
  await page.waitForSelector('[data-testid="payment-step"]', { timeout: 10_000 });

  // Payment method
  const paymentMethodCombo = page.getByRole('combobox', { name: /payment method/i });
  await paymentMethodCombo.click();
  await page.getByRole('option', { name: 'MTN Money' }).click();

  await fillByLabel(page, 'Payer Name', TEST_FULL_NAME);
  await fillByLabel(page, 'Payer Phone', TEST_PHONE);

  // Amount defaults to 153 — leave as-is
  // Payment date
  const now = new Date();
  const dateTimeLocal = now.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
  await fillByLabel(page, 'Payment Date & Time', dateTimeLocal);

  await fillByLabel(page, 'Mobile Money Reference', 'TXN123456789');

  // Upload proof of payment
  const popInput = page.locator('input[type="file"]').first();
  const pdfContent = Buffer.from('%PDF-1.4 proof of payment');
  await popInput.setInputFiles({
    name: 'proof_of_payment.pdf',
    mimeType: 'application/pdf',
    buffer: pdfContent,
  });

  await clickButton(page, 'Next Step');
}

async function completeStep4Submit(page: Page) {
  await page.waitForSelector('[data-testid="submit-step"]', { timeout: 10_000 });

  // Check the confirmation checkbox
  await page.locator('#confirm').check();

  // Submit
  await clickButton(page, 'Submit Application');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Complete Application Flow', () => {
  test('user can register and land on the student dashboard', async ({ page }) => {
    await completeRegistration(page);

    // After successful registration the app redirects to /student/dashboard
    await waitForUrl(page, /\/student\/dashboard/, 15_000);
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('registered user can log in and reach the student dashboard', async ({ page }) => {
    // Register first so the account exists
    await completeRegistration(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);

    // Log out by navigating away and back to login
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await completeLogin(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('logged-in student can complete the full wizard and submit', async ({ page }) => {
    // Register + auto-login
    await completeRegistration(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);

    // Navigate to wizard
    await navigateToWizard(page);

    // Step 1 — Basic KYC
    await completeStep1BasicKyc(page);

    // Step 2 — Education & Documents
    await completeStep2Education(page);

    // Step 3 — Payment
    await completeStep3Payment(page);

    // Step 4 — Review & Submit
    await completeStep4Submit(page);

    // After submission the wizard shows a success state
    // The SubmissionSuccess component or a success message should appear
    await expect(
      page.getByText(/application submitted|submitted successfully|thank you/i)
    ).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Registration form validation', () => {
  test('shows error when submitting empty registration form', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await clickButton(page, 'Create Account');

    // At least one validation error should appear
    await expect(page.getByText(/required|at least|valid/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await fillByLabel(page, 'Email Address', 'not-an-email');
    await fillByLabel(page, 'Full Name', TEST_FULL_NAME);
    await clickButton(page, 'Create Account');

    await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Login form validation', () => {
  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await fillByLabel(page, 'Email address', 'nobody@example.com');
    await fillByLabel(page, 'Password', 'WrongPassword1!');
    await clickButton(page, 'Sign in');

    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Wizard navigation', () => {
  test('unauthenticated user is redirected away from /apply', async ({ page }) => {
    await page.goto('/apply');
    // Should redirect to login or home — not stay on /apply
    await page.waitForURL((url) => !url.pathname.startsWith('/apply'), { timeout: 10_000 });
    expect(page.url()).not.toMatch(/\/apply/);
  });
});
