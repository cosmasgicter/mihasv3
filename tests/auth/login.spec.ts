import { test, expect } from '@playwright/test';

test.describe('Login Flow Tests', () => {
  test('Should display login form', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Should validate email format', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('input[type="email"]', 'invalid-email');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email')).toBeVisible();
  });

  test('Should show error for empty fields', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Email is required')).toBeVisible();
    await expect(page.locator('text=Password is required')).toBeVisible();
  });

  test('Should navigate to forgot password', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.click('text=Forgot Password');
    
    await expect(page).toHaveURL(/forgot-password/);
  });

  test('Should navigate to register', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.click('text=Sign Up');
    
    await expect(page).toHaveURL(/signup/);
  });

  test('Should handle login attempt with invalid credentials', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible();
  });

  test('Should show loading state during login', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    await expect(submitButton).toBeDisabled();
    await expect(page.locator('text=Signing in...')).toBeVisible();
  });
});