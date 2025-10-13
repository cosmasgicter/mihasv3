import { test, expect, devices } from '@playwright/test';

test.use({ ...devices['iPhone 13'] });

test.describe('Mobile Navigation', () => {
  test('Mobile menu functionality', async ({ page }) => {
    await page.goto('/');
    
    // Check mobile menu toggle is visible
    await expect(page.locator('[data-testid="mobile-menu-toggle"]')).toBeVisible();
    
    // Click to open mobile menu
    await page.click('[data-testid="mobile-menu-toggle"]');
    
    // Check menu is open
    await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();
  });

  test('Mobile navigation items', async ({ page }) => {
    await page.goto('/');
    
    await page.click('[data-testid="mobile-menu-toggle"]');
    
    // Check navigation items are present
    await expect(page.locator('text=Home')).toBeVisible();
    await expect(page.locator('text=Apply')).toBeVisible();
    await expect(page.locator('text=Sign In')).toBeVisible();
  });

  test('Mobile responsive layout', async ({ page }) => {
    await page.goto('/');
    
    // Check viewport is mobile size
    const viewport = page.viewportSize();
    expect(viewport?.width).toBeLessThan(768);
    
    // Check mobile-specific elements
    await expect(page.locator('[data-testid="mobile-header"]')).toBeVisible();
  });
});