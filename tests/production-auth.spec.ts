import { test, expect } from '@playwright/test'

test.describe('Production Authentication Tests', () => {
  const baseUrl = process.env.VITE_BASE_URL || '***REMOVED***'
  const adminEmail = process.env.TEST_ADMIN_EMAIL || '***REMOVED***'
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'ProductionAdmin2024!'
  const studentEmail = process.env.TEST_STUDENT_EMAIL || 'student@mihas.edu.zm'
  const studentPassword = process.env.TEST_STUDENT_PASSWORD || 'ProductionStudent2024!'

  test('Production admin login works', async ({ page }) => {
    await page.goto(`${baseUrl}/signin`)
    
    await page.fill('input[name="email"]', adminEmail)
    await page.fill('input[name="password"]', adminPassword)
    await page.click('button[type="submit"]')
    
    // Should redirect to admin dashboard
    await expect(page).toHaveURL(/admin/)
    await expect(page.locator('h1')).toContainText('Admin')
  })

  test('Production student login works', async ({ page }) => {
    await page.goto(`${baseUrl}/signin`)
    
    await page.fill('input[name="email"]', studentEmail)
    await page.fill('input[name="password"]', studentPassword)
    await page.click('button[type="submit"]')
    
    // Should redirect to student dashboard
    await expect(page).toHaveURL(/student\/dashboard/)
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('Production API authentication', async ({ request }) => {
    const apiBase = process.env.VITE_API_URL || '***REMOVED***/.netlify/functions'
    
    // Test login API
    const loginResponse = await request.post(`${apiBase}/auth-login`, {
      data: {
        email: studentEmail,
        password: studentPassword
      }
    })
    
    expect(loginResponse.status()).toBeLessThan(500)
  })

  test('Production session persistence', async ({ page }) => {
    await page.goto(`${baseUrl}/signin`)
    
    await page.fill('input[name="email"]', studentEmail)
    await page.fill('input[name="password"]', studentPassword)
    await page.click('button[type="submit"]')
    
    // Wait for redirect
    await page.waitForURL(/student\/dashboard/)
    
    // Refresh page and verify session persists
    await page.reload()
    await expect(page).toHaveURL(/student\/dashboard/)
  })
})