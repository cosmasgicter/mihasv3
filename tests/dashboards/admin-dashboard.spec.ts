import { test, expect } from '@playwright/test'

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock admin authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-admin-token',
        user: { id: 'admin-user', role: 'admin' }
      }))
    })
  })

  test('Admin dashboard loads with metrics', async ({ page }) => {
    await page.goto('/admin')
    
    await expect(page.locator('h1')).toContainText('Admin Dashboard')
    await expect(page.locator('[data-testid="metrics-cards"]')).toBeVisible()
    await expect(page.locator('[data-testid="recent-applications"]')).toBeVisible()
  })

  test('Navigation to applications management', async ({ page }) => {
    await page.goto('/admin')
    
    await page.click('text=Applications')
    await expect(page).toHaveURL(/admin\/applications/)
    await expect(page.locator('[data-testid="applications-table"]')).toBeVisible()
  })

  test('User management access', async ({ page }) => {
    await page.goto('/admin')
    
    await page.click('text=Users')
    await expect(page).toHaveURL(/admin\/users/)
    await expect(page.locator('[data-testid="users-table"]')).toBeVisible()
  })

  test('Analytics dashboard', async ({ page }) => {
    await page.goto('/admin/analytics')
    
    await expect(page.locator('[data-testid="analytics-charts"]')).toBeVisible()
    await expect(page.locator('[data-testid="performance-metrics"]')).toBeVisible()
  })

  test('Bulk operations functionality', async ({ page }) => {
    await page.goto('/admin/applications')
    
    // Select multiple applications
    await page.check('[data-testid="select-all"]')
    await expect(page.locator('[data-testid="bulk-actions"]')).toBeVisible()
    
    // Test bulk status update
    await page.click('[data-testid="bulk-status-update"]')
    await expect(page.locator('[data-testid="bulk-modal"]')).toBeVisible()
  })

  test('Real-time notifications', async ({ page }) => {
    await page.goto('/admin')
    
    // Mock real-time notification
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('notification', {
        detail: { type: 'new_application', message: 'New application received' }
      }))
    })
    
    await expect(page.locator('[data-testid="notification-toast"]')).toBeVisible()
  })

  test('Export functionality', async ({ page }) => {
    await page.goto('/admin/applications')
    
    const exportButton = page.locator('[data-testid="export-button"]')
    await expect(exportButton).toBeVisible()
    
    // Test export dialog
    await exportButton.click()
    await expect(page.locator('[data-testid="export-modal"]')).toBeVisible()
  })
})