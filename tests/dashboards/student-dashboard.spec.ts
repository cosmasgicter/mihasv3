import { test, expect } from '@playwright/test'

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
  })

  test('Dashboard loads with correct elements', async ({ page }) => {
    await page.goto('/student/dashboard')
    
    // Check main dashboard elements
    await expect(page.locator('h1')).toContainText('Dashboard')
    await expect(page.locator('[data-testid="application-status"]')).toBeVisible()
    await expect(page.locator('[data-testid="quick-actions"]')).toBeVisible()
  })

  test('Application wizard access', async ({ page }) => {
    await page.goto('/student/dashboard')
    
    const applyButton = page.locator('text=Start New Application')
    await expect(applyButton).toBeVisible()
    await applyButton.click()
    
    await expect(page).toHaveURL(/application-wizard/)
  })

  test('Application status display', async ({ page }) => {
    await page.goto('/student/dashboard')
    
    // Mock applications data
    await page.route('**/applications', async route => {
      await route.fulfill({
        json: [{
          id: '1',
          status: 'pending',
          program: 'Computer Science',
          created_at: new Date().toISOString()
        }]
      })
    })
    
    await page.reload()
    await expect(page.locator('[data-testid="application-card"]')).toBeVisible()
  })

  test('Notification bell functionality', async ({ page }) => {
    await page.goto('/student/dashboard')
    
    const notificationBell = page.locator('[data-testid="notification-bell"]')
    await expect(notificationBell).toBeVisible()
    
    await notificationBell.click()
    await expect(page.locator('[data-testid="notification-dropdown"]')).toBeVisible()
  })

  test('Settings navigation', async ({ page }) => {
    await page.goto('/student/dashboard')
    
    await page.click('[data-testid="user-menu"]')
    await page.click('text=Settings')
    await expect(page).toHaveURL(/settings/)
  })
})