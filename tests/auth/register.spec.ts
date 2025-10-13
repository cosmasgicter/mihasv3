import { test, expect } from '@playwright/test';

test.describe('Registration Flow Tests', () => {
  test('Should display registration form', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Should validate required fields', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=First name is required')).toBeVisible();
    await expect(page.locator('text=Last name is required')).toBeVisible();
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('Should validate password confirmation', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[type="email"]', 'john@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'different123');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Passwords do not match')).toBeVisible();
  });

  test('Should validate email format', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.fill('input[type="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email format')).toBeVisible();
  });

  test('Should validate password strength', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.fill('input[type="password"]', '123');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
  });

  test('Should navigate to login', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.click('text=Sign In');
    
    await expect(page).toHaveURL(/signin/);
  });

  test('Should show loading state during registration', async ({ page }) => {
    await page.goto('/auth/signup');
    
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[type="email"]', 'john@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    await expect(submitButton).toBeDisabled();
    await expect(page.locator('text=Creating account...')).toBeVisible();
  });
});