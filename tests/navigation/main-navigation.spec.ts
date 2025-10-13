import { test, expect } from '@playwright/test';

test.describe('Main Navigation Tests', () => {
  test('Should display main navigation elements', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('text=MIHAS')).toBeVisible();
  });

  test('Should navigate to login from landing page', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Sign In');
    
    await expect(page).toHaveURL(/signin/);
  });

  test('Should navigate to register from landing page', async ({ page }) => {
    await page.goto('/');
    
    await page.click('text=Apply Now');
    
    await expect(page).toHaveURL(/signup/);
  });

  test('Should show mobile menu toggle on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    await expect(page.locator('[data-testid="mobile-menu-toggle"]')).toBeVisible();
  });

  test('Should open mobile menu when toggle is clicked', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    await page.click('[data-testid="mobile-menu-toggle"]');
    
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();
  });

  test('Should close mobile menu when clicking outside', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    await page.click('[data-testid="mobile-menu-toggle"]');
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();
    
    await page.click('body');
    
    await expect(page.locator('[data-testid="mobile-menu"]')).not.toBeVisible();
  });

  test('Should display breadcrumbs on inner pages', async ({ page }) => {
    await page.goto('/auth/signin');
    
    await expect(page.locator('[data-testid="breadcrumbs"]')).toBeVisible();
  });

  test('Should handle 404 pages gracefully', async ({ page }) => {
    await page.goto('/non-existent-page');
    
    await expect(page.locator('text=Page Not Found')).toBeVisible();
    await expect(page.locator('text=Go Home')).toBeVisible();
  });

  test('Should navigate back to home from 404', async ({ page }) => {
    await page.goto('/non-existent-page');
    
    await page.click('text=Go Home');
    
    await expect(page).toHaveURL('/');
  });
});