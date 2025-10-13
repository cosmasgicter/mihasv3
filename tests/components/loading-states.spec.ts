import { test, expect } from '@playwright/test';

test.describe('Loading States Component Tests', () => {
  test('Should show loading spinner on page load', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
  });

  test('Should show skeleton loader for dashboard cards', async ({ page }) => {
    await page.goto('/student/dashboard');
    
    await expect(page.locator('[data-testid="skeleton-card"]')).toBeVisible();
  });

  test('Should show loading state for form submission', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    await expect(submitButton).toBeDisabled();
    await expect(page.locator('text=Saving...')).toBeVisible();
  });

  test('Should show loading state for file upload', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('test pdf content')
    });
    
    await expect(page.locator('text=Uploading...')).toBeVisible();
  });

  test('Should show progress bar for multi-step operations', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('text=Step 1 of 5')).toBeVisible();
  });

  test('Should show loading overlay for data fetching', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await expect(page.locator('[data-testid="loading-overlay"]')).toBeVisible();
  });

  test('Should show inline loading for button actions', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="refresh-button"]');
    
    await expect(page.locator('[data-testid="refresh-button"] [data-testid="spinner"]')).toBeVisible();
  });

  test('Should show loading state for search results', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.fill('input[name="search"]', 'test query');
    
    await expect(page.locator('text=Searching...')).toBeVisible();
  });

  test('Should show loading state for pagination', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="next-page"]');
    
    await expect(page.locator('text=Loading page...')).toBeVisible();
  });

  test('Should show loading state for export operations', async ({ page }) => {
    await page.goto('/admin/applications');
    
    await page.click('[data-testid="export-button"]');
    
    await expect(page.locator('text=Generating export...')).toBeVisible();
  });

  test('Should show different loading states based on operation type', async ({ page }) => {
    await page.goto('/admin/dashboard');
    
    // Analytics loading
    await expect(page.locator('[data-testid="analytics-loading"]')).toBeVisible();
    
    // Charts loading
    await expect(page.locator('[data-testid="charts-loading"]')).toBeVisible();
    
    // Metrics loading
    await expect(page.locator('[data-testid="metrics-loading"]')).toBeVisible();
  });
});