import { test, expect } from '@playwright/test';

test.describe('Student Navigation Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Use production test credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com');
    await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student/dashboard');
  });

  test('Should display student dashboard navigation', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Applications')).toBeVisible();
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('Should navigate to application wizard', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('text=New Application');
    
    await expect(page).toHaveURL(/apply|application/);
  });

  test('Should navigate to application status', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('text=View Applications');
    
    await expect(page).toHaveURL(/applications/);
  });

  test('Should navigate to settings', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('text=Settings');
    
    await expect(page).toHaveURL(/settings/);
  });

  test('Should show notification bell', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="notification-bell"]').first()).toBeVisible();
  });

  test('Should open notifications panel', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('[data-testid="notification-bell"]');
    
    await expect(page.locator('[data-testid="notifications-panel"]')).toBeVisible();
  });

  test('Should display user profile menu', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('[data-testid="user-menu-trigger"]');
    
    await expect(page.locator('text=Profile')).toBeVisible();
    await expect(page.locator('text=Sign Out')).toBeVisible();
  });

  test('Should handle logout', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('[data-testid="user-menu-trigger"]');
    await page.click('text=Sign Out');
    
    await expect(page).toHaveURL(/signin/);
  });

  test('Should show mobile navigation on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible();
  });
});