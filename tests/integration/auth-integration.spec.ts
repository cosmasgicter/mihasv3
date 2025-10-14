import { test, expect } from '@playwright/test'

test.describe('Authentication Integration', () => {
  test('Sign up flow with validation', async ({ page }) => {
    await page.goto('/auth/signup')
    
    // Test form validation
    await page.click('button[type="submit"]')
    await expect(page.locator('.error-message')).toBeVisible()
    
    // Test password mismatch
    await page.fill('input[name="email"]', 'alexisstar8@gmail.com')
    await page.fill('input[name="password"]', '***REMOVED***')
    await page.fill('input[name="confirmPassword"]', 'different')
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Passwords do not match')).toBeVisible()
    
    // Test successful signup
    await page.fill('input[name="confirmPassword"]', '***REMOVED***')
    
    // Mock successful registration
    await page.route('**/auth-register', async route => {
      await route.fulfill({
        json: { success: true, message: 'Registration successful' }
      })
    })
    
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Registration successful')).toBeVisible()
  })

  test('Sign in with remember me', async ({ page }) => {
    await page.goto('/signin')
    
    await page.fill('input[name="email"]', 'alexisstar8@gmail.com')
    await page.fill('input[name="password"]', '***REMOVED***')
    await page.check('input[name="rememberMe"]')
    
    // Mock successful login
    await page.route('**/auth-login', async route => {
      await route.fulfill({
        json: { 
          success: true, 
          user: { id: 'test-user', role: 'student' },
          session: { access_token: 'mock-token' }
        }
      })
    })
    
    await page.click('button[type="submit"]')
    await expect(page).toHaveURL(/dashboard/)
    
    // Verify token is stored
    const token = await page.evaluate(() => 
      localStorage.getItem('supabase.auth.token')
    )
    expect(token).toBeTruthy()
  })

  test('Password reset flow', async ({ page }) => {
    await page.goto('/auth/forgot-password')
    
    await page.fill('input[name="email"]', 'alexisstar8@gmail.com')
    
    // Mock password reset request
    await page.route('**/auth-reset-password', async route => {
      await route.fulfill({
        json: { success: true, message: 'Reset email sent' }
      })
    })
    
    await page.click('button[type="submit"]')
    await expect(page.locator('text=Reset email sent')).toBeVisible()
  })

  test('Session persistence', async ({ page }) => {
    // Set up authenticated session
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/student/dashboard')
    await expect(page.locator('h1')).toContainText('Dashboard')
    
    // Refresh page and verify session persists
    await page.reload()
    await expect(page.locator('h1')).toContainText('Dashboard')
  })

  test('Logout functionality', async ({ page }) => {
    // Set up authenticated session
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/student/dashboard')
    
    // Click logout
    await page.click('[data-testid="user-menu"]')
    await page.click('text=Logout')
    
    // Verify redirect to landing page
    await expect(page).toHaveURL('/')
    
    // Verify token is cleared
    const token = await page.evaluate(() => 
      localStorage.getItem('supabase.auth.token')
    )
    expect(token).toBeFalsy()
  })

  test('Role-based access control', async ({ page }) => {
    // Test student access
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/admin')
    await expect(page).toHaveURL(/signin/)
    
    // Test admin access
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-admin-token',
        user: { id: 'admin-user', role: 'admin' }
      }))
    })
    
    await page.goto('/admin')
    await expect(page.locator('h1')).toContainText('Admin Dashboard')
  })
})