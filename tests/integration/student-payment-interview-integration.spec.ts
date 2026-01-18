/**
 * Student Payment & Interview Pages Integration Tests
 * 
 * Final checkpoint tests for the student-payment-interview-pages spec.
 * Tests complete user flows, navigation, and logout functionality.
 * 
 * Feature: student-payment-interview-pages
 * Task: 10. Final checkpoint - Full integration test
 * 
 * Requirements validated:
 * - 2.1, 2.2: Payment and Interview links in navigation
 * - 2.5, 2.6: Navigation targets correct pages
 * - 2.7: Links in both desktop sidebar and mobile bottom navigation
 * - 3.1, 3.2: Complete Payment navigates to /student/payment
 * - 1.1, 1.2, 1.3: Session termination without errors
 * - 5.4: Graceful handling of undefined auth state
 */

import { test, expect, Page } from '@playwright/test'

// Test configuration
const TEST_STUDENT_EMAIL = process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com'
const TEST_STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || '***REMOVED***'

test.describe('Student Payment & Interview Pages - Final Integration', () => {
  
  // Helper function to login as student
  async function loginAsStudent(page: Page) {
    await page.goto('/auth/signin')
    await page.fill('input[type="email"]', TEST_STUDENT_EMAIL)
    await page.fill('input[type="password"]', TEST_STUDENT_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/student/**', { timeout: 15000 })
  }

  // Helper function to check for console errors
  function setupConsoleErrorCapture(page: Page): string[] {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    return consoleErrors
  }

  test.describe('Complete User Flow: Dashboard → Payment → Interview', () => {
    
    test('should navigate from Dashboard to Payment page successfully', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      await page.goto('/student/dashboard')
      
      // Wait for dashboard to load
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Navigate to Payment page via sidebar (desktop)
      await page.setViewportSize({ width: 1280, height: 720 })
      
      // Look for Payment link in sidebar
      const paymentLink = page.locator('a[href="/student/payment"]').first()
      await expect(paymentLink).toBeVisible({ timeout: 5000 })
      await paymentLink.click()
      
      // Verify navigation to Payment page
      await expect(page).toHaveURL('/student/payment', { timeout: 5000 })
      
      // Verify no React errors occurred
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid') ||
        e.includes('undefined')
      )
      expect(reactErrors).toHaveLength(0)
    })

    test('should navigate from Dashboard to Interview page successfully', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      await page.goto('/student/dashboard')
      
      // Wait for dashboard to load
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Navigate to Interview page via sidebar (desktop)
      await page.setViewportSize({ width: 1280, height: 720 })
      
      // Look for Interview link in sidebar
      const interviewLink = page.locator('a[href="/student/interview"]').first()
      await expect(interviewLink).toBeVisible({ timeout: 5000 })
      await interviewLink.click()
      
      // Verify navigation to Interview page
      await expect(page).toHaveURL('/student/interview', { timeout: 5000 })
      
      // Verify no React errors occurred
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid') ||
        e.includes('undefined')
      )
      expect(reactErrors).toHaveLength(0)
    })

    test('should complete full navigation flow: Dashboard → Payment → Interview → Dashboard', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      
      // Step 1: Start at Dashboard
      await page.goto('/student/dashboard')
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Step 2: Navigate to Payment
      await page.click('a[href="/student/payment"]')
      await expect(page).toHaveURL('/student/payment', { timeout: 5000 })
      
      // Step 3: Navigate to Interview
      await page.click('a[href="/student/interview"]')
      await expect(page).toHaveURL('/student/interview', { timeout: 5000 })
      
      // Step 4: Navigate back to Dashboard
      await page.click('a[href="/student/dashboard"]')
      await expect(page).toHaveURL('/student/dashboard', { timeout: 5000 })
      
      // Verify no errors during navigation
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid')
      )
      expect(reactErrors).toHaveLength(0)
    })
  })

  test.describe('Logout Flow from Each Page', () => {
    
    test('should logout from Dashboard without errors', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      await page.goto('/student/dashboard')
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Find and click user menu
      const userMenu = page.locator('[data-testid="user-menu-trigger"]').first()
      if (await userMenu.isVisible()) {
        await userMenu.click()
        await page.click('text=Sign Out')
      } else {
        // Alternative: look for sign out button directly
        const signOutButton = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out")').first()
        if (await signOutButton.isVisible()) {
          await signOutButton.click()
        }
      }
      
      // Wait for redirect to signin or home page
      await page.waitForURL(/\/(auth\/signin|$)/, { timeout: 10000 })
      
      // Verify no React Error #130 occurred
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid')
      )
      expect(reactErrors).toHaveLength(0)
    })

    test('should logout from Payment page without errors', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      await page.goto('/student/payment')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Find and click user menu
      const userMenu = page.locator('[data-testid="user-menu-trigger"]').first()
      if (await userMenu.isVisible()) {
        await userMenu.click()
        await page.click('text=Sign Out')
      } else {
        // Alternative: look for sign out button directly
        const signOutButton = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out")').first()
        if (await signOutButton.isVisible()) {
          await signOutButton.click()
        }
      }
      
      // Wait for redirect
      await page.waitForURL(/\/(auth\/signin|$)/, { timeout: 10000 })
      
      // Verify no React Error #130 occurred
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid')
      )
      expect(reactErrors).toHaveLength(0)
    })

    test('should logout from Interview page without errors', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      await page.goto('/student/interview')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Find and click user menu
      const userMenu = page.locator('[data-testid="user-menu-trigger"]').first()
      if (await userMenu.isVisible()) {
        await userMenu.click()
        await page.click('text=Sign Out')
      } else {
        // Alternative: look for sign out button directly
        const signOutButton = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out")').first()
        if (await signOutButton.isVisible()) {
          await signOutButton.click()
        }
      }
      
      // Wait for redirect
      await page.waitForURL(/\/(auth\/signin|$)/, { timeout: 10000 })
      
      // Verify no React Error #130 occurred
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid')
      )
      expect(reactErrors).toHaveLength(0)
    })
  })

  test.describe('Navigation Indicators Update Correctly', () => {
    
    test('should highlight Payment link when on Payment page', async ({ page }) => {
      await loginAsStudent(page)
      await page.goto('/student/payment')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Check that Payment link has active state (aria-current="page")
      const paymentLink = page.locator('a[href="/student/payment"]').first()
      await expect(paymentLink).toHaveAttribute('aria-current', 'page')
    })

    test('should highlight Interview link when on Interview page', async ({ page }) => {
      await loginAsStudent(page)
      await page.goto('/student/interview')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Check that Interview link has active state (aria-current="page")
      const interviewLink = page.locator('a[href="/student/interview"]').first()
      await expect(interviewLink).toHaveAttribute('aria-current', 'page')
    })

    test('should highlight Dashboard link when on Dashboard page', async ({ page }) => {
      await loginAsStudent(page)
      await page.goto('/student/dashboard')
      
      // Wait for page to load
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Check that Dashboard link has active state (aria-current="page")
      const dashboardLink = page.locator('a[href="/student/dashboard"]').first()
      await expect(dashboardLink).toHaveAttribute('aria-current', 'page')
    })
  })

  test.describe('Mobile Bottom Navigation', () => {
    
    test('should display Payment and Interview links in mobile bottom navigation', async ({ page }) => {
      await loginAsStudent(page)
      
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/student/dashboard')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Check for bottom navigation
      const bottomNav = page.locator('nav[aria-label="Bottom navigation"]')
      await expect(bottomNav).toBeVisible({ timeout: 5000 })
      
      // Check for Payment link in bottom nav
      const paymentLink = bottomNav.locator('a[href="/student/payment"]')
      await expect(paymentLink).toBeVisible()
      
      // Check for Interview link in bottom nav
      const interviewLink = bottomNav.locator('a[href="/student/interview"]')
      await expect(interviewLink).toBeVisible()
    })

    test('should navigate to Payment page from mobile bottom navigation', async ({ page }) => {
      await loginAsStudent(page)
      
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/student/dashboard')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Click Payment link in bottom nav
      const bottomNav = page.locator('nav[aria-label="Bottom navigation"]')
      await bottomNav.locator('a[href="/student/payment"]').click()
      
      // Verify navigation
      await expect(page).toHaveURL('/student/payment', { timeout: 5000 })
    })

    test('should navigate to Interview page from mobile bottom navigation', async ({ page }) => {
      await loginAsStudent(page)
      
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto('/student/dashboard')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Click Interview link in bottom nav
      const bottomNav = page.locator('nav[aria-label="Bottom navigation"]')
      await bottomNav.locator('a[href="/student/interview"]').click()
      
      // Verify navigation
      await expect(page).toHaveURL('/student/interview', { timeout: 5000 })
    })
  })

  test.describe('Quick Actions Navigation', () => {
    
    test('should navigate to Payment page from Complete Payment quick action', async ({ page }) => {
      await loginAsStudent(page)
      await page.goto('/student/dashboard')
      
      // Wait for dashboard to load
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Look for Complete Payment action (only visible if user has pending payments)
      const completePaymentAction = page.locator('a[href="/student/payment"]:has-text("Complete Payment"), a[href="/student/payment"]:has-text("Payment")')
      
      if (await completePaymentAction.first().isVisible()) {
        await completePaymentAction.first().click()
        await expect(page).toHaveURL('/student/payment', { timeout: 5000 })
      } else {
        // If no pending payment, just verify the Payment link exists in sidebar
        const paymentLink = page.locator('a[href="/student/payment"]').first()
        await expect(paymentLink).toBeVisible()
      }
    })

    test('should navigate to Interview page from View Interview quick action', async ({ page }) => {
      await loginAsStudent(page)
      await page.goto('/student/dashboard')
      
      // Wait for dashboard to load
      await page.waitForSelector('text=Welcome back', { timeout: 10000 })
      
      // Look for Interview action (only visible if user has scheduled interviews)
      const interviewAction = page.locator('a[href="/student/interview"]:has-text("Interview")')
      
      if (await interviewAction.first().isVisible()) {
        await interviewAction.first().click()
        await expect(page).toHaveURL('/student/interview', { timeout: 5000 })
      } else {
        // If no scheduled interview, just verify the Interview link exists in sidebar
        const interviewLink = page.locator('a[href="/student/interview"]').first()
        await expect(interviewLink).toBeVisible()
      }
    })
  })

  test.describe('Error Handling and Resilience', () => {
    
    test('should not crash when navigating rapidly between pages', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      
      // Rapid navigation
      await page.goto('/student/dashboard')
      await page.goto('/student/payment')
      await page.goto('/student/interview')
      await page.goto('/student/dashboard')
      await page.goto('/student/payment')
      
      // Wait for final page to stabilize
      await page.waitForLoadState('networkidle')
      
      // Verify no React errors
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid') ||
        e.includes('Cannot read properties of undefined')
      )
      expect(reactErrors).toHaveLength(0)
    })

    test('should handle page refresh without errors', async ({ page }) => {
      const consoleErrors = setupConsoleErrorCapture(page)
      
      await loginAsStudent(page)
      await page.goto('/student/payment')
      
      // Wait for page to load
      await page.waitForLoadState('networkidle')
      
      // Refresh the page
      await page.reload()
      
      // Wait for page to reload
      await page.waitForLoadState('networkidle')
      
      // Verify still on Payment page
      await expect(page).toHaveURL('/student/payment')
      
      // Verify no errors
      const reactErrors = consoleErrors.filter(e => 
        e.includes('Error #130') || 
        e.includes('Element type is invalid')
      )
      expect(reactErrors).toHaveLength(0)
    })
  })
})
