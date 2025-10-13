import { test, expect } from '@playwright/test';

test.describe('Admin Applications Management Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Use production test credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'test.***REMOVED***');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/**');
  });

  test('Should display applications table', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await expect(page.locator('[data-testid="applications-table"]')).toBeVisible();
    await expect(page.locator('th')).toContainText(['Name', 'Program', 'Status', 'Date']);
  });

  test('Should filter applications by status', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.selectOption('[data-testid="status-filter"]', 'pending');
    
    await expect(page.locator('[data-testid="application-row"]')).toHaveCount.greaterThan(0);
  });

  test('Should search applications by name', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.fill('[data-testid="search-input"]', 'John Doe');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    await expect(page.locator('text=John Doe')).toBeVisible();
  });

  test('Should sort applications by date', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="sort-by-date"]');
    
    // Check if sorting indicator is visible
    await expect(page.locator('[data-testid="sort-indicator"]')).toBeVisible();
  });

  test('Should open application details modal', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    
    await expect(page.locator('[data-testid="application-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="application-details"]')).toBeVisible();
  });

  test('Should approve application', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.click('[data-testid="approve-button"]');
    
    await expect(page.locator('text=Application approved')).toBeVisible();
  });

  test('Should reject application with reason', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.click('[data-testid="reject-button"]');
    
    await page.fill('[data-testid="rejection-reason"]', 'Incomplete documents');
    await page.click('[data-testid="confirm-rejection"]');
    
    await expect(page.locator('text=Application rejected')).toBeVisible();
  });

  test('Should request additional documents', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.click('[data-testid="request-documents"]');
    
    await page.fill('[data-testid="document-request"]', 'Please provide birth certificate');
    await page.click('[data-testid="send-request"]');
    
    await expect(page.locator('text=Document request sent')).toBeVisible();
  });

  test('Should bulk approve applications', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.check('[data-testid="select-all"]');
    await page.click('[data-testid="bulk-approve"]');
    
    await expect(page.locator('text=Applications approved')).toBeVisible();
  });

  test('Should export applications data', async ({ page }) => {
    await page.goto('/admin/applications');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-applications"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('applications-export');
  });

  test('Should paginate through applications', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="next-page"]');
    
    await expect(page.locator('text=Page 2')).toBeVisible();
  });

  test('Should view application documents', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.click('[data-testid="view-documents"]');
    
    await expect(page.locator('[data-testid="documents-viewer"]')).toBeVisible();
  });

  test('Should add notes to application', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.fill('[data-testid="notes-input"]', 'Excellent candidate');
    await page.click('[data-testid="save-notes"]');
    
    await expect(page.locator('text=Notes saved')).toBeVisible();
  });

  test('Should view application history', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.click('[data-testid="view-history"]');
    
    await expect(page.locator('[data-testid="history-timeline"]')).toBeVisible();
  });

  test('Should generate application report', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.click('[data-testid="generate-report"]');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-report"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('application-report');
  });

  test('Should handle application status changes', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="application-row"]');
    await page.selectOption('[data-testid="status-select"]', 'under-review');
    
    await expect(page.locator('text=Status updated')).toBeVisible();
  });
});