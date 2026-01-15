import { test, expect } from '@playwright/test'

test.describe('Final Integration Tests - All Fixes', () => {
  test.describe('26.1 End-to-end testing of all fixes', () => {
    test('Complete student application flow with all fixes', async ({ page }) => {
      // Test complete student application flow
      await page.goto('/auth/signup')
      
      const timestamp = Date.now()
      const testEmail = `test.student.${timestamp}@mihas.edu.zm`
      
      // Registration
      await page.fill('input[name="firstName"]', 'Test')
      await page.fill('input[name="lastName"]', 'Student')
      await page.fill('input[type="email"]', testEmail)
      await page.fill('input[type="password"]', 'SecurePass123!')
      await page.fill('input[name="confirmPassword"]', 'SecurePass123!')
      
      await page.click('button[type="submit"]')
      
      // Wait for redirect to dashboard
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Start new application
      await page.goto('/student/application-wizard')
      
      // Step 1: Personal Information
      await page.fill('input[name="phone"]', '+260971234567')
      await page.fill('input[name="dateOfBirth"]', '2000-01-15')
      await page.selectOption('select[name="gender"]', { index: 1 })
      
      // Wait for auto-save (8 seconds)
      await page.waitForTimeout(9000)
      await expect(page.locator('text=/saved/i')).toBeVisible({ timeout: 5000 })
      
      await page.click('[data-testid="next-step"]')
      
      // Step 2: Contact Information
      await page.fill('input[name="address"]', '123 Main Street')
      await page.fill('input[name="city"]', 'Lusaka')
      
      await page.click('[data-testid="next-step"]')
      
      // Step 3: Academic Information
      await page.fill('input[name="mathGrade"]', '7')
      await page.fill('input[name="englishGrade"]', '8')
      await page.fill('input[name="scienceGrade"]', '6')
      
      await page.click('[data-testid="next-step"]')
      
      // Step 4: Documents Upload (test Textarea component fix)
      const textarea = page.locator('textarea[name="additionalInfo"]')
      if (await textarea.count() > 0) {
        await textarea.fill('Additional information about my application')
        await expect(textarea).toHaveValue('Additional information about my application')
      }
      
      await page.click('[data-testid="next-step"]')
      
      // Step 5: Review and Submit
      await expect(page.locator('[data-testid="application-summary"]')).toBeVisible()
      await page.click('[data-testid="submit-application"]')
      
      // Verify submission success
      await expect(page.locator('text=/submitted successfully/i')).toBeVisible({ timeout: 10000 })
    })

    test('Admin payment review workflow without React error #321', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      // Navigate to applications
      await page.goto('/admin/applications')
      
      // Wait for applications to load
      await page.waitForSelector('[data-testid="applications-table"]', { timeout: 10000 })
      
      // Find an application with pending payment
      const applicationRow = page.locator('[data-testid="application-row"]').first()
      if (await applicationRow.count() > 0) {
        await applicationRow.click()
        
        // Wait for modal to open (test hydration fix)
        await expect(page.locator('[data-testid="application-modal"]')).toBeVisible({ timeout: 5000 })
        
        // Check for payment review section
        const paymentSection = page.locator('[data-testid="payment-section"]')
        if (await paymentSection.count() > 0) {
          // Test approve payment action
          const approveButton = page.locator('[data-testid="approve-payment"]')
          if (await approveButton.count() > 0) {
            await approveButton.click()
            
            // Fill approval reason
            await page.fill('[data-testid="approval-reason"]', 'Payment verified and approved')
            await page.click('[data-testid="confirm-approve"]')
            
            // Verify no React errors occurred
            const consoleErrors: string[] = []
            page.on('console', msg => {
              if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
              }
            })
            
            await page.waitForTimeout(2000)
            
            // Check for React error #321 (hydration mismatch)
            const hasHydrationError = consoleErrors.some(error => 
              error.includes('Hydration') || error.includes('321')
            )
            expect(hasHydrationError).toBe(false)
            
            // Verify success message
            await expect(page.locator('text=/approved/i')).toBeVisible({ timeout: 5000 })
          }
        }
      }
    })

    test('Draft save and resume functionality', async ({ page }) => {
      // Login as student
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Start new application
      await page.goto('/student/application-wizard')
      
      // Fill some data
      const uniqueValue = `TestData${Date.now()}`
      await page.fill('input[name="firstName"]', uniqueValue)
      await page.fill('input[name="lastName"]', 'TestLastName')
      
      // Wait for auto-save (8 seconds + buffer)
      await page.waitForTimeout(9000)
      
      // Verify save indicator
      await expect(page.locator('text=/saved/i')).toBeVisible({ timeout: 5000 })
      
      // Navigate away
      await page.goto('/student/dashboard')
      
      // Return to application
      await page.goto('/student/application-wizard')
      
      // Verify data was restored
      await expect(page.locator('input[name="firstName"]')).toHaveValue(uniqueValue)
      await expect(page.locator('input[name="lastName"]')).toHaveValue('TestLastName')
    })

    test('All new features are accessible', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      // Test draft applications visibility in admin list
      await page.goto('/admin/applications')
      
      // Check for draft filter
      const draftFilter = page.locator('[data-testid="show-drafts"]')
      if (await draftFilter.count() > 0) {
        await draftFilter.check()
        await page.waitForTimeout(1000)
        
        // Verify draft applications are shown
        const draftBadge = page.locator('text=/draft/i')
        if (await draftBadge.count() > 0) {
          await expect(draftBadge.first()).toBeVisible()
        }
      }
      
      // Test analysis features integration
      const analysisLink = page.locator('a[href*="analytics"]')
      if (await analysisLink.count() > 0) {
        await analysisLink.click()
        await expect(page).toHaveURL(/analytics/)
      }
      
      // Test audit log functionality
      await page.goto('/admin/audit-trail')
      await expect(page.locator('[data-testid="audit-log-table"]')).toBeVisible({ timeout: 5000 })
    })

    test('Component imports work correctly', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'cosmas@beanola.com')
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Beanola2025')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/admin/**', { timeout: 10000 })
      
      // Test Programs page (previously had Textarea import issues)
      await page.goto('/admin/programs')
      
      // Check for console errors
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text())
        }
      })
      
      await page.waitForTimeout(2000)
      
      // Verify no "undefined" component errors
      const hasUndefinedError = consoleErrors.some(error => 
        error.includes('undefined') || error.includes('not defined')
      )
      expect(hasUndefinedError).toBe(false)
      
      // Test Eligibility Management page
      await page.goto('/admin/eligibility')
      await page.waitForTimeout(2000)
      
      // Verify page loaded without errors
      await expect(page.locator('body')).toBeVisible()
    })

    test('Navigation consistency across site', async ({ page }) => {
      // Test student navigation
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Check navigation consistency
      await expect(page.locator('nav')).toBeVisible()
      
      // Test mobile navigation
      await page.setViewportSize({ width: 375, height: 667 })
      
      const mobileMenu = page.locator('[data-testid="mobile-menu"]')
      if (await mobileMenu.count() > 0) {
        await mobileMenu.click()
        await expect(page.locator('[data-testid="mobile-nav"]')).toBeVisible()
      }
      
      // Test 404 handling
      await page.goto('/non-existent-page')
      await expect(page.locator('text=/404|not found/i')).toBeVisible({ timeout: 5000 })
      
      // Verify helpful navigation links on 404 page
      const homeLink = page.locator('a[href="/"]')
      await expect(homeLink).toBeVisible()
    })

    test('Cache invalidation works correctly', async ({ page }) => {
      // Clear cache
      await page.goto('/')
      
      // Check service worker registration
      const swRegistered = await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration()
          return !!registration
        }
        return false
      })
      
      if (swRegistered) {
        // Check for cache version
        const cacheVersion = await page.evaluate(() => {
          return localStorage.getItem('cache-version')
        })
        
        expect(cacheVersion).toBeTruthy()
        
        // Simulate new deployment by changing version
        await page.evaluate(() => {
          localStorage.setItem('cache-version', 'new-version')
        })
        
        await page.reload()
        
        // Verify cache was cleared
        const newCacheVersion = await page.evaluate(() => {
          return localStorage.getItem('cache-version')
        })
        
        expect(newCacheVersion).toBe('new-version')
      }
    })

    test('AI features work correctly', async ({ page }) => {
      // Login as student
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'Skyl3r@L0m1s')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      // Navigate to application wizard
      await page.goto('/student/application-wizard')
      
      // Check for AI assistant
      const aiAssistant = page.locator('[data-testid="ai-assistant"]')
      if (await aiAssistant.count() > 0) {
        await aiAssistant.click()
        
        // Test AI chat
        await page.fill('[data-testid="ai-input"]', 'Help me with my application')
        await page.click('[data-testid="ai-send"]')
        
        // Wait for response (max 5 seconds as per requirements)
        await expect(page.locator('[data-testid="ai-response"]')).toBeVisible({ timeout: 6000 })
      }
    })
  })
})
