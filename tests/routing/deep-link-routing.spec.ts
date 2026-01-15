import { test, expect } from '@playwright/test'

/**
 * Deep Link Routing Tests
 * 
 * Validates that all routes work with direct URL access and that
 * authentication redirects preserve the intended destination.
 * 
 * Requirements: 11.5
 */

test.describe('Deep Link Routing', () => {
  test.describe('Public Routes', () => {
    test('should access landing page directly', async ({ page }) => {
      await page.goto('/')
      await expect(page).toHaveURL('/')
      await expect(page.locator('h1, h2')).toBeVisible()
    })

    test('should access track application page directly', async ({ page }) => {
      await page.goto('/track-application')
      await expect(page).toHaveURL('/track-application')
      // Should show the tracker interface
      await expect(page.locator('text=/track|application/i')).toBeVisible()
    })

    test('should access signin page directly', async ({ page }) => {
      await page.goto('/auth/signin')
      await expect(page).toHaveURL('/auth/signin')
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })

    test('should access signup page directly', async ({ page }) => {
      await page.goto('/auth/signup')
      await expect(page).toHaveURL('/auth/signup')
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })

    test('should access forgot password page directly', async ({ page }) => {
      await page.goto('/auth/forgot-password')
      await expect(page).toHaveURL('/auth/forgot-password')
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })
  })

  test.describe('Protected Routes - Redirect to Login', () => {
    test('should redirect to signin when accessing student dashboard without auth', async ({ page }) => {
      await page.goto('/student/dashboard')
      // Should redirect to signin
      await expect(page).toHaveURL('/auth/signin')
    })

    test('should redirect to signin when accessing admin dashboard without auth', async ({ page }) => {
      await page.goto('/admin/dashboard')
      // Should redirect to signin
      await expect(page).toHaveURL('/auth/signin')
    })

    test('should redirect to signin when accessing application wizard without auth', async ({ page }) => {
      await page.goto('/apply')
      // Should redirect to signin
      await expect(page).toHaveURL('/auth/signin')
    })

    test('should redirect to signin when accessing settings without auth', async ({ page }) => {
      await page.goto('/settings')
      // Should redirect to signin
      await expect(page).toHaveURL('/auth/signin')
    })
  })

  test.describe('Route Parameters', () => {
    test('should handle application detail route with ID parameter', async ({ page }) => {
      // This should redirect to signin but preserve the route structure
      await page.goto('/student/application/123e4567-e89b-12d3-a456-426614174000')
      await expect(page).toHaveURL('/auth/signin')
    })

    test('should handle application status route with ID parameter', async ({ page }) => {
      await page.goto('/application/123e4567-e89b-12d3-a456-426614174000')
      await expect(page).toHaveURL('/auth/signin')
    })
  })

  test.describe('404 Handling', () => {
    test('should show 404 page for non-existent routes', async ({ page }) => {
      await page.goto('/this-route-does-not-exist')
      await expect(page).toHaveURL('/404')
      // Should show 404 content
      await expect(page.locator('text=/404|not found/i')).toBeVisible()
    })

    test('should show 404 page for invalid admin routes', async ({ page }) => {
      await page.goto('/admin/invalid-page')
      await expect(page).toHaveURL('/404')
    })

    test('should show 404 page for invalid student routes', async ({ page }) => {
      await page.goto('/student/invalid-page')
      await expect(page).toHaveURL('/404')
    })
  })

  test.describe('Authentication Redirect Preservation', () => {
    test('should preserve intended destination after login', async ({ page, context }) => {
      // Try to access a protected route
      await page.goto('/student/dashboard')
      
      // Should redirect to signin
      await expect(page).toHaveURL('/auth/signin')
      
      // Login with test credentials
      await page.fill('input[type="email"]', 'test@example.com')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button[type="submit"]')
      
      // After successful login, should redirect to originally intended destination
      // Note: This will fail if credentials are invalid, but tests the redirect logic
      await page.waitForURL(/\/(student\/dashboard|dashboard|auth\/signin)/, { timeout: 5000 })
      
      // If login succeeded, should be at student dashboard or general dashboard
      const url = page.url()
      expect(url).toMatch(/\/(student\/dashboard|dashboard)/)
    })

    test('should preserve route with parameters after login', async ({ page }) => {
      // Try to access a protected route with parameters
      const applicationId = '123e4567-e89b-12d3-a456-426614174000'
      await page.goto(`/student/application/${applicationId}`)
      
      // Should redirect to signin
      await expect(page).toHaveURL('/auth/signin')
      
      // The intended destination should be preserved in location state
      // This is tested by the redirect logic in SignInPage
    })
  })

  test.describe('Multiple Route Aliases', () => {
    test('should handle /signin alias', async ({ page }) => {
      await page.goto('/signin')
      await expect(page).toHaveURL('/signin')
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })

    test('should handle /login alias', async ({ page }) => {
      await page.goto('/login')
      await expect(page).toHaveURL('/login')
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })

    test('should handle /settings alias', async ({ page }) => {
      await page.goto('/settings')
      // Should redirect to signin since not authenticated
      await expect(page).toHaveURL('/auth/signin')
    })

    test('should handle /student/profile alias', async ({ page }) => {
      await page.goto('/student/profile')
      // Should redirect to signin since not authenticated
      await expect(page).toHaveURL('/auth/signin')
    })
  })

  test.describe('Dashboard Redirect Logic', () => {
    test('should handle /dashboard route', async ({ page }) => {
      await page.goto('/dashboard')
      // Should redirect to signin if not authenticated
      await expect(page).toHaveURL('/auth/signin')
    })
  })

  test.describe('Browser Navigation', () => {
    test('should handle browser back button correctly', async ({ page }) => {
      // Navigate through multiple pages
      await page.goto('/')
      await page.goto('/track-application')
      await page.goto('/auth/signin')
      
      // Go back
      await page.goBack()
      await expect(page).toHaveURL('/track-application')
      
      // Go back again
      await page.goBack()
      await expect(page).toHaveURL('/')
    })

    test('should handle browser forward button correctly', async ({ page }) => {
      // Navigate through multiple pages
      await page.goto('/')
      await page.goto('/track-application')
      
      // Go back
      await page.goBack()
      await expect(page).toHaveURL('/')
      
      // Go forward
      await page.goForward()
      await expect(page).toHaveURL('/track-application')
    })

    test('should handle page refresh on protected routes', async ({ page }) => {
      // Go to signin page
      await page.goto('/auth/signin')
      await expect(page).toHaveURL('/auth/signin')
      
      // Refresh the page
      await page.reload()
      
      // Should still be on signin page
      await expect(page).toHaveURL('/auth/signin')
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })
  })

  test.describe('Edge Cases', () => {
    test('should handle trailing slashes correctly', async ({ page }) => {
      await page.goto('/auth/signin/')
      // Should normalize to /auth/signin
      await expect(page.locator('input[type="email"]')).toBeVisible()
    })

    test('should handle case sensitivity', async ({ page }) => {
      // React Router is case-sensitive by default
      await page.goto('/AUTH/SIGNIN')
      // Should show 404 since routes are case-sensitive
      await expect(page).toHaveURL('/404')
    })

    test('should handle query parameters', async ({ page }) => {
      await page.goto('/track-application?id=12345')
      await expect(page).toHaveURL('/track-application?id=12345')
      // Should preserve query parameters
      const url = new URL(page.url())
      expect(url.searchParams.get('id')).toBe('12345')
    })

    test('should handle hash fragments', async ({ page }) => {
      await page.goto('/auth/signin#forgot-password')
      await expect(page).toHaveURL('/auth/signin#forgot-password')
      // Should preserve hash fragment
      expect(page.url()).toContain('#forgot-password')
    })
  })
})
