import { test, expect } from '@playwright/test';

test('Production site loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toBeVisible();
  console.log('✅ Test completed - sent to TestMonitor');
});