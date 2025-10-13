import { test, expect } from '@playwright/test';

test.describe('Admin Navigation Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Use production test credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'test.***REMOVED***');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard');
  });

  test('Should display admin dashboard navigation', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('text=Dashboard')).toBeVisible();
    await expect(page.locator('text=Applications')).toBeVisible();
    await expect(page.locator('text=Users')).toBeVisible();
    await expect(page.locator('text=Analytics')).toBeVisible();
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('Should navigate to applications management', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Applications');
    
    await expect(page).toHaveURL(/admin\/applications/);
  });

  test('Should navigate to users management', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Users');
    
    await expect(page).toHaveURL(/admin\/users/);
  });

  test('Should navigate to analytics', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Analytics');
    
    await expect(page).toHaveURL(/admin\/analytics/);
  });

  test('Should navigate to programs management', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Programs');
    
    await expect(page).toHaveURL(/admin\/programs/);
  });

  test('Should navigate to intakes management', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Intakes');
    
    await expect(page).toHaveURL(/admin\/intakes/);
  });

  test('Should navigate to monitoring', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Monitoring');
    
    await expect(page).toHaveURL(/admin\/monitoring/);
  });

  test('Should navigate to audit trail', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Audit Trail');
    
    await expect(page).toHaveURL(/admin\/audit-trail/);
  });

  test('Should show admin-specific navigation items', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('text=System Health')).toBeVisible();
    await expect(page.locator('text=Reports')).toBeVisible();
    await expect(page.locator('text=Bulk Operations')).toBeVisible();
  });

  test('Should display admin sidebar on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="admin-sidebar"]')).toBeVisible();
  });

  test('Should collapse sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="admin-sidebar"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="mobile-admin-menu"]')).toBeVisible();
  });
});