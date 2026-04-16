/**
 * E2E tests for the complete MIHAS application flow.
 *
 * Flow: Registration → Login → Dashboard → Wizard Step 1 (Basic KYC) →
 *       Step 2 (Education & Documents) → Step 3 (Payment readiness)
 *
 * Uses placeholder Zambian test data — no real PII.
 *
 * Run against local dev server:
 *   cd apps/admissions && bunx playwright test tests/e2e/applicationFlow.spec.ts --headed
 *
 * Run against production:
 *   PLAYWRIGHT_BASE_URL=***REMOVED*** bunx playwright test tests/e2e/applicationFlow.spec.ts --headed
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Test data — placeholder values only, no real PII
// ---------------------------------------------------------------------------
const TEST_FIRST_NAME = 'Test';
const TEST_LAST_NAME = 'Applicant';
const TEST_EMAIL = `e2e.test.${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPass123!';
const TEST_PHONE = '+260971234567';
const TEST_DOB = '2000-01-15';
const TEST_NRC = '123456/78/9';
const TEST_CITY = 'Kitwe';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitForUrl(page: Page, pattern: string | RegExp, timeout = 15_000) {
  await page.waitForURL(pattern, { timeout });
}

async function fillByLabel(page: Page, label: string, value: string) {
  await page.getByLabel(label, { exact: false }).fill(value);
}

async function clickButton(page: Page, text: string) {
  await page.getByRole('button', { name: text, exact: false }).click();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

async function completeRegistration(page: Page) {
  await page.goto('/auth/signup');
  await page.waitForLoadState('networkidle');

  await fillByLabel(page, 'Account email', TEST_EMAIL);
  await fillByLabel(page, 'Create password', TEST_PASSWORD);
  await fillByLabel(page, 'Confirm password', TEST_PASSWORD);
  await fillByLabel(page, 'First name', TEST_FIRST_NAME);
  await fillByLabel(page, 'Last name', TEST_LAST_NAME);
  await fillByLabel(page, 'Phone number', TEST_PHONE);

  await clickButton(page, 'Create account');
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function completeLogin(page: Page) {
  await page.goto('/auth/signin');
  await page.waitForLoadState('networkidle');

  await fillByLabel(page, 'Account email', TEST_EMAIL);
  await fillByLabel(page, 'Account password', TEST_PASSWORD);
  await clickButton(page, 'Sign in');
}

// ---------------------------------------------------------------------------
// Wizard helpers
// ---------------------------------------------------------------------------

async function navigateToWizard(page: Page) {
  // From dashboard, click "New Application" or navigate directly
  await page.goto('/student/application-wizard');
  await page.waitForLoadState('networkidle');
}

async function completeStep1BasicKyc(page: Page) {
  await page.waitForSelector('[data-testid="basic-kyc-step"]', { timeout: 15_000 });

  // Fields may be pre-populated from profile; fill/overwrite key fields
  const fullNameInput = page.getByLabel('Full Name', { exact: false });
  if (await fullNameInput.isVisible()) {
    await fullNameInput.fill(`${TEST_FIRST_NAME} ${TEST_LAST_NAME}`);
  }

  const nrcInput = page.getByLabel('NRC Number', { exact: false });
  if (await nrcInput.isVisible()) {
    await nrcInput.fill(TEST_NRC);
  }

  const dobInput = page.getByLabel('Date of Birth', { exact: false });
  if (await dobInput.isVisible()) {
    await dobInput.fill(TEST_DOB);
  }

  // Sex combobox
  const sexCombo = page.getByRole('combobox', { name: /sex/i });
  if (await sexCombo.isVisible()) {
    await sexCombo.click();
    await page.getByRole('option', { name: 'Male' }).click();
  }

  // Phone
  const phoneInput = page.getByLabel('Phone', { exact: false });
  if (await phoneInput.isVisible()) {
    await phoneInput.fill(TEST_PHONE);
  }

  // Residence
  const cityInput = page.getByLabel('Residence', { exact: false });
  if (await cityInput.isVisible()) {
    await cityInput.fill(TEST_CITY);
  }

  // Program select — pick first available option
  const programCombo = page.getByRole('combobox', { name: /program/i });
  if (await programCombo.isVisible()) {
    await programCombo.click();
    const firstProgramOption = page.getByRole('option').first();
    await firstProgramOption.click();
  }

  // Intake select — pick first available option
  const intakeCombo = page.getByRole('combobox', { name: /intake/i });
  if (await intakeCombo.isVisible()) {
    const intakeDisabled = await intakeCombo.isDisabled();
    if (!intakeDisabled) {
      await intakeCombo.click();
      const firstIntakeOption = page.getByRole('option').first();
      await firstIntakeOption.click();
    }
  }

  await clickButton(page, 'Next');
}

async function completeStep2Education(page: Page) {
  await page.waitForSelector('[data-testid="education-step"]', { timeout: 15_000 });

  // Add 5 subject grades (minimum required)
  for (let i = 0; i < 5; i++) {
    const addButton = page.getByRole('button', { name: /add.*subject/i });
    if (await addButton.isVisible()) {
      await addButton.click();
    }

    // Subject select for this row
    const subjectSelect = page.locator(`[data-testid="subject-select-${i}"]`);
    if (await subjectSelect.isVisible()) {
      await subjectSelect.click();
      const firstAvailableOption = page.getByRole('option').filter({ hasNot: page.locator('[aria-disabled="true"]') }).first();
      await firstAvailableOption.click();
    }

    // Grade select for this row
    const gradeSelect = page.locator(`[data-testid="grade-select-${i}"]`);
    if (await gradeSelect.isVisible()) {
      await gradeSelect.click();
      await page.getByRole('option').nth(2).click(); // Pick a passing grade
    }
  }

  // Upload a minimal PDF as result slip
  const resultSlipInput = page.locator('input[type="file"]').first();
  if (await resultSlipInput.isVisible()) {
    const pdfContent = Buffer.from('%PDF-1.4 test result slip', 'utf-8');
    await resultSlipInput.setInputFiles({
      name: 'result_slip.pdf',
      mimeType: 'application/pdf',
      buffer: pdfContent,
    });
  }

  await clickButton(page, 'Next');
}

async function verifyPaymentStep(page: Page) {
  await page.waitForSelector('[data-testid="payment-step"]', { timeout: 15_000 });

  // Fee should be displayed (K150 for local or $50 for international)
  await expect(page.getByText(/application fee/i)).toBeVisible();

  // Pay Now button should be visible
  await expect(page.getByTestId('pay-now-button')).toBeVisible();

  // Lenco security notice
  await expect(page.getByText(/payments are processed securely by lenco/i)).toBeVisible();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Complete Application Flow', () => {
  test('user can register and land on the student dashboard', async ({ page }) => {
    await completeRegistration(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('registered user can log in and reach the dashboard', async ({ page }) => {
    await completeRegistration(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);

    // Navigate to sign in
    await page.goto('/auth/signin');
    await page.waitForLoadState('networkidle');

    await completeLogin(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);
    await expect(page).toHaveURL(/\/student\/dashboard/);
  });

  test('student can reach the payment step in the application wizard', async ({ page }) => {
    await completeRegistration(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);

    await navigateToWizard(page);
    await completeStep1BasicKyc(page);
    await completeStep2Education(page);
    await verifyPaymentStep(page);
  });
});

test.describe('Registration form validation', () => {
  test('shows error when submitting empty registration form', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await clickButton(page, 'Create account');
    await expect(page.getByText(/required|at least|valid/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('shows error for invalid email format', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForLoadState('networkidle');

    await fillByLabel(page, 'Account email', 'not-an-email');
    await fillByLabel(page, 'First name', TEST_FIRST_NAME);
    await clickButton(page, 'Create account');

    await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Login form validation', () => {
  test('shows error for wrong credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.waitForLoadState('networkidle');

    await fillByLabel(page, 'Account email', 'nobody@example.com');
    await fillByLabel(page, 'Account password', 'WrongPassword1!');
    await clickButton(page, 'Sign in');

    await expect(page.getByText(/invalid|incorrect|failed/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Wizard navigation guard', () => {
  test('unauthenticated user is redirected away from the wizard', async ({ page }) => {
    await page.goto('/student/application-wizard');
    await page.waitForURL((url) => !url.pathname.includes('/application-wizard'), { timeout: 10_000 });
    expect(page.url()).not.toMatch(/\/application-wizard/);
  });
});

test.describe('Logout flow', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('student can log out and protected routes are blocked', async ({ page }) => {
    await completeRegistration(page);
    await waitForUrl(page, /\/student\/dashboard/, 15_000);

    // Find and click logout
    const logoutButton = page.getByRole('button', { name: /log out|sign out/i }).first();
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      await waitForUrl(page, /\/auth\/signin/, 15_000);
    }

    // Verify protected route redirects
    await page.goto('/student/dashboard');
    await waitForUrl(page, /\/auth\/signin/, 15_000);
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
