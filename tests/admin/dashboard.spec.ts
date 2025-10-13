import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Use production test credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'test.***REMOVED***');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/dashboard');
  });

  test('Should display admin dashboard overview', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
    await expect(page.locator('[data-testid="metrics-overview"]')).toBeVisible();
  });

  test('Should show key metrics cards', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="total-applications"]')).toBeVisible();
    await expect(page.locator('[data-testid="pending-applications"]')).toBeVisible();
    await expect(page.locator('[data-testid="approved-applications"]')).toBeVisible();
    await expect(page.locator('[data-testid="rejected-applications"]')).toBeVisible();
  });

  test('Should display analytics charts', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="applications-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="trends-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="demographics-chart"]')).toBeVisible();
  });

  test('Should show recent activities', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="recent-activities"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-item"]')).toHaveCount.greaterThan(0);
  });

  test('Should display system health status', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="system-health"]')).toBeVisible();
    await expect(page.locator('[data-testid="database-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="api-status"]')).toBeVisible();
  });

  test('Should show quick action buttons', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="quick-actions"]')).toBeVisible();
    await expect(page.locator('text=Review Applications')).toBeVisible();
    await expect(page.locator('text=Manage Users')).toBeVisible();
    await expect(page.locator('text=Generate Reports')).toBeVisible();
  });

  test('Should navigate to applications from quick actions', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Review Applications');
    
    await expect(page).toHaveURL(/admin\/applications/);
  });

  test('Should navigate to users from quick actions', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('text=Manage Users');
    
    await expect(page).toHaveURL(/admin\/users/);
  });

  test('Should refresh dashboard data', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('[data-testid="refresh-dashboard"]');
    
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
  });

  test('Should filter dashboard by date range', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('[data-testid="date-filter"]');
    await page.selectOption('[data-testid="date-range"]', 'last-30-days');
    
    await expect(page.locator('[data-testid="metrics-overview"]')).toBeVisible();
  });

  test('Should export dashboard data', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-dashboard"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('dashboard-export');
  });

  test('Should show real-time notifications', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="notifications-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="notification-count"]')).toBeVisible();
  });

  test('Should display pending tasks', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="pending-tasks"]')).toBeVisible();
    await expect(page.locator('[data-testid="task-item"]')).toHaveCount.greaterThan(0);
  });

  test('Should show performance metrics', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await expect(page.locator('[data-testid="performance-metrics"]')).toBeVisible();
    await expect(page.locator('[data-testid="response-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-rate"]')).toBeVisible();
  });

  test('Should handle dashboard customization', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    await page.click('[data-testid="customize-dashboard"]');
    
    await expect(page.locator('[data-testid="widget-selector"]')).toBeVisible();
  });
});