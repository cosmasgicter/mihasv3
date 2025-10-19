import { test, expect } from '@playwright/test';

test('Jules Verification Test', async ({ page }) => {
  // Use a unique user identifier for each test run
  const uniqueId = new Date().getTime();
  const email = `jules.verification.${uniqueId}@example.com`;
  const password = 'password123';

  // Step 1: Sign up a new user
  await page.goto('http://localhost:5173/auth/signup');

  // Fill in the sign-up form
  await page.fill('input[name="full_name"]', 'Jules Verification');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirmPassword"]', password);
  await page.fill('input[name="phone"]', '1234567890');
  await page.fill('input[name="date_of_birth"]', '2000-01-01');
  await page.selectOption('select[name="sex"]', 'Male');
  await page.fill('input[name="nationality"]', 'Testland');
  await page.fill('textarea[name="address"]', '123 Test Street, Testville');
  await page.fill('input[name="city"]', 'Testville');
  await page.fill('input[name="next_of_kin_name"]', 'Kin Verification');
  await page.fill('input[name="next_of_kin_phone"]', '0987654321');

  await page.click('button[type="submit"]');

  // Wait for navigation to the sign-in page, which indicates successful signup
  await page.waitForURL('http://localhost:5173/auth/signin');

  // Step 2: Sign in with the new user
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for navigation to the dashboard
  await page.waitForURL('http://localhost:5173/');

  // Step 3: Wait for the theme toggle button to be visible
  const themeToggleButton = page.locator("button[aria-label='Toggle theme']");
  await themeToggleButton.waitFor({ state: 'visible', timeout: 10000 });

  // Take a screenshot after the theme toggle is visible
  await page.screenshot({ path: 'test-results/verification/after_login_and_toggle_visible.png' });

  // Step 4: Interact with the theme toggle and verify changes
  // Initial theme check (assuming default is light)
  await expect(page.locator('html')).not.toHaveClass('dark');

  // Click to switch to dark mode
  await themeToggleButton.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'test-results/verification/dark-mode.png' });

  // Click to switch back to light mode
  await themeToggleButton.click();
  await expect(page.locator('html')).not.toHaveClass('dark');
  await page.screenshot({ path: 'test-results/verification/light-mode.png' });
});
