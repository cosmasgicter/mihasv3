import { test, expect } from '@playwright/test';

test.describe('Student Dashboard Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Use production test credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com');
    await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student/dashboard');
  });

  test('Should display student dashboard', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
  });

  test('Should show application status cards', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="application-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="application-progress"]')).toBeVisible();
  });

  test('Should display quick actions', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('text=New Application')).toBeVisible();
    await expect(page.locator('text=View Applications')).toBeVisible();
    await expect(page.locator('text=Update Profile')).toBeVisible();
  });

  test('Should navigate to application wizard', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('text=New Application');
    
    await expect(page).toHaveURL(/application-wizard/);
  });

  test('Should navigate to applications list', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('text=View Applications');
    
    await expect(page).toHaveURL(/applications/);
  });

  test('Should show recent notifications', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="notifications-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="notification-item"]')).toHaveCount.greaterThan(0);
  });

  test('Should display upcoming deadlines', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="deadlines-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="deadline-item"]')).toHaveCount.greaterThan(0);
  });

  test('Should show application progress', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('text=% Complete')).toBeVisible();
  });

  test('Should display profile completion status', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="profile-completion"]')).toBeVisible();
    await expect(page.locator('text=Profile')).toBeVisible();
  });

  test('Should show document upload status', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="documents-status"]')).toBeVisible();
  });

  test('Should display application timeline', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="application-timeline"]')).toBeVisible();
  });

  test('Should show help and support section', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="help-section"]')).toBeVisible();
    await expect(page.locator('text=Contact Support')).toBeVisible();
  });

  test('Should handle notification preferences', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('[data-testid="notification-settings"]');
    
    await expect(page.locator('[data-testid="notification-preferences"]')).toBeVisible();
  });

  test('Should refresh dashboard data', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await page.click('[data-testid="refresh-button"]');
    
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
  });

  test('Should show application recommendations', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="recommendations"]')).toBeVisible();
    await expect(page.locator('[data-testid="recommended-program"]')).toHaveCount.greaterThan(0);
  });

  test('Should display academic calendar', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="academic-calendar"]')).toBeVisible();
  });

  test('Should show application statistics', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="application-stats"]')).toBeVisible();
    await expect(page.locator('text=Applications Submitted')).toBeVisible();
  });

  test('Should handle mobile view', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="mobile-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible();
  });

  test('Should show offline indicator when disconnected', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    // Simulate offline
    await page.context().setOffline(true);
    
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
  });

  test('Should handle auto-save notifications', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="auto-save-status"]')).toBeVisible();
  });
});