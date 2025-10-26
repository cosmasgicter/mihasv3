import { test, expect } from '@playwright/test'

test.describe('Visual regression - layout shell', () => {
  test('Home / layout shell snapshot', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    // capture the main layout region
    const main = await page.locator('main')
    await expect(main).toHaveScreenshot('layout-shell-home.png')
  })

  test('Application wizard snapshot', async ({ page }) => {
    await page.goto('/student/application-wizard')
    await page.waitForLoadState('networkidle')
    const main = await page.locator('main')
    await expect(main).toHaveScreenshot('layout-application-wizard.png')
  })

  test('Admin applications snapshot', async ({ page }) => {
    await page.goto('/admin/applications')
    await page.waitForLoadState('networkidle')
    const main = await page.locator('main')
    await expect(main).toHaveScreenshot('layout-admin-applications.png')
  })
})
