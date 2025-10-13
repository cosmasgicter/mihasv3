import { test, expect } from '@playwright/test';

test.describe('Password Reset Flow Tests', () => {
  test('Should display forgot password form', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator('text=Enter your email address')).toBeVisible();
  });

  test('Should validate email field', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Email is required')).toBeVisible();
  });

  test('Should validate email format', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await page.fill('input[type="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email format')).toBeVisible();
  });

  test('Should show success message for valid email', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Reset link sent')).toBeVisible();
  });

  test('Should navigate back to login', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await page.click('text=Back to Sign In');
    
    await expect(page).toHaveURL(/signin/);
  });

  test('Should show loading state during reset request', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    
    await page.fill('input[type="email"]', 'test@example.com');
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    await expect(submitButton).toBeDisabled();
    await expect(page.locator('text=Sending reset link...')).toBeVisible();
  });
});