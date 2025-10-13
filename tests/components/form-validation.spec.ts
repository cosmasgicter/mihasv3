import { test, expect } from '@playwright/test';

test.describe('Form Validation Component Tests', () => {
  test('Should validate required fields in application form', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=First name is required')).toBeVisible();
    await expect(page.locator('text=Last name is required')).toBeVisible();
    await expect(page.locator('text=Email is required')).toBeVisible();
  });

  test('Should validate email format', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid email format')).toBeVisible();
  });

  test('Should validate phone number format', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="phone"]', '123');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Invalid phone number')).toBeVisible();
  });

  test('Should validate date fields', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="dateOfBirth"]', '2030-01-01');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Date of birth cannot be in the future')).toBeVisible();
  });

  test('Should show real-time validation', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="email"]', 'invalid');
    await page.blur('input[name="email"]');
    
    await expect(page.locator('text=Invalid email format')).toBeVisible();
  });

  test('Should clear validation errors when field is corrected', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="email"]', 'invalid');
    await page.blur('input[name="email"]');
    await expect(page.locator('text=Invalid email format')).toBeVisible();
    
    await page.fill('input[name="email"]', 'valid@example.com');
    await page.blur('input[name="email"]');
    
    await expect(page.locator('text=Invalid email format')).not.toBeVisible();
  });

  test('Should validate grade inputs', async ({ page }) => {
    await page.goto('/student/application-wizard');
    await page.click('text=Academic Information');
    
    await page.fill('input[name="mathGrade"]', '15');
    await page.blur('input[name="mathGrade"]');
    
    await expect(page.locator('text=Grade must be between 1 and 9')).toBeVisible();
  });

  test('Should validate subject selection', async ({ page }) => {
    await page.goto('/student/application-wizard');
    await page.click('text=Academic Information');
    
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Please select at least 5 subjects')).toBeVisible();
  });

  test('Should show character count for text areas', async ({ page }) => {
    await page.goto('/student/application-wizard');
    await page.click('text=Personal Statement');
    
    await page.fill('textarea[name="personalStatement"]', 'Test statement');
    
    await expect(page.locator('text=14/500 characters')).toBeVisible();
  });

  test('Should validate minimum character requirements', async ({ page }) => {
    await page.goto('/student/application-wizard');
    await page.click('text=Personal Statement');
    
    await page.fill('textarea[name="personalStatement"]', 'Short');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Personal statement must be at least 100 characters')).toBeVisible();
  });
});