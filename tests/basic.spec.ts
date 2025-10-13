import { test, expect } from '@playwright/test';

test('Production MIHAS Application - Basic functionality', async ({ page }) => {
  await page.goto('/');
  
  // Check if the production page loads
  await expect(page).toHaveTitle(/MIHAS|Application/);
  
  // Check for main navigation elements
  await expect(page.locator('nav, header')).toBeVisible();
  
  // Verify production environment
  const url = page.url();
  expect(url).toContain('apply.mihas.edu.zm');
});

test('Production TestMonitor Integration - Verification', async ({ page }) => {
  await page.goto('/');
  
  // Verify production site is accessible
  await expect(page.locator('body')).toBeVisible();
  
  // Check for MIHAS branding - fixed syntax
  const mihasElements = page.locator('text=MIHAS');
  const applicationElements = page.locator('text=Application');
  const applyElements = page.locator('text=Apply');
  
  const totalElements = await mihasElements.count() + await applicationElements.count() + await applyElements.count();
  expect(totalElements).toBeGreaterThan(0);
  
  // This test result will be automatically sent to TestMonitor
  console.log('✅ Production test executed - Results sent to TestMonitor automatically');
  console.log('📊 View results at: https://beanola.testmonitor.com');
});