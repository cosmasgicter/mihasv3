import { test, expect } from '@playwright/test'

const STUDENT_EMAIL = 'cosmaskanchepa8@gmail.com'
const STUDENT_PASSWORD = 'Beanola2025'
const ADMIN_EMAIL = 'cosmas@beanola.com'
const ADMIN_PASSWORD = 'Beanola2025'

test.describe('Phase 3: Critical Application Flows', () => {
  test.describe('Student Application Flow', () => {
    test('should complete full application submission', async ({ page }) => {
      // Login
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', STUDENT_EMAIL)
      await page.fill('input[type="password"]', STUDENT_PASSWORD)
      await page.click('button[type="submit"]')
      
      // Wait for dashboard
      await expect(page).toHaveURL(/\/student\/dashboard/)
      
      // Start new application
      await page.click('text=New Application')
      await expect(page).toHaveURL(/\/student\/application-wizard/)
      
      // Step 1: Basic KYC
      await expect(page.locator('text=Step 1 of 4')).toBeVisible()
      
      // Verify form fields are present
      await expect(page.locator('input[name="full_name"]')).toBeVisible()
      await expect(page.locator('select[name="program"]')).toBeVisible()
      await expect(page.locator('select[name="intake"]')).toBeVisible()
      
      // Fill required fields (if not pre-populated)
      const fullNameInput = page.locator('input[name="full_name"]')
      if (await fullNameInput.inputValue() === '') {
        await fullNameInput.fill('Test Student')
      }
      
      // Select program and intake
      await page.selectOption('select[name="program"]', { index: 1 })
      await page.selectOption('select[name="intake"]', { index: 1 })
      
      // Click Next
      await page.click('button:has-text("Next Step")')
      
      // Step 2: Education
      await expect(page.locator('text=Step 2 of 4')).toBeVisible()
      
      // Add a grade
      await page.click('button:has-text("Add Grade")')
      await page.selectOption('select[name="grades.0.subject_id"]', { index: 1 })
      await page.fill('input[name="grades.0.grade"]', '7')
      
      // Click Next
      await page.click('button:has-text("Next Step")')
      
      // Step 3: Payment
      await expect(page.locator('text=Step 3 of 4')).toBeVisible()
      
      // Fill payment details
      await page.selectOption('select[name="payment_method"]', 'MTN Money')
      await page.fill('input[name="amount"]', '153')
      
      // Click Next
      await page.click('button:has-text("Next Step")')
      
      // Step 4: Review & Submit
      await expect(page.locator('text=Step 4 of 4')).toBeVisible()
      
      // Accept terms
      await page.check('input[type="checkbox"]')
      
      // Submit
      await page.click('button:has-text("Submit Application")')
      
      // Verify success
      await expect(page.locator('text=Application Submitted Successfully')).toBeVisible({ timeout: 10000 })
    })

    test('should save and restore draft', async ({ page }) => {
      // Login
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', STUDENT_EMAIL)
      await page.fill('input[type="password"]', STUDENT_PASSWORD)
      await page.click('button[type="submit"]')
      
      await expect(page).toHaveURL(/\/student\/dashboard/)
      
      // Start new application
      await page.click('text=New Application')
      await expect(page).toHaveURL(/\/student\/application-wizard/)
      
      // Fill some data
      await page.fill('input[name="full_name"]', 'Draft Test Student')
      
      // Click Save Now
      await page.click('button:has-text("Save Now")')
      
      // Wait for save confirmation
      await expect(page.locator('text=Draft saved')).toBeVisible()
      
      // Navigate away
      await page.click('text=Back to Dashboard')
      await expect(page).toHaveURL(/\/student\/dashboard/)
      
      // Verify draft shows
      await expect(page.locator('text=Continue Draft')).toBeVisible()
      
      // Resume draft
      await page.click('text=Continue Draft')
      await expect(page).toHaveURL(/\/student\/application-wizard/)
      
      // Verify data restored
      await expect(page.locator('input[name="full_name"]')).toHaveValue('Draft Test Student')
    })

    test('should validate required fields', async ({ page }) => {
      // Login
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', STUDENT_EMAIL)
      await page.fill('input[type="password"]', STUDENT_PASSWORD)
      await page.click('button[type="submit"]')
      
      await expect(page).toHaveURL(/\/student\/dashboard/)
      
      // Start new application
      await page.click('text=New Application')
      
      // Try to proceed without filling required fields
      await page.click('button:has-text("Next Step")')
      
      // Should show validation errors
      await expect(page.locator('text=required')).toBeVisible()
    })
  })

  test.describe('Admin Review Flow', () => {
    test('should view applications list', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', ADMIN_EMAIL)
      await page.fill('input[type="password"]', ADMIN_PASSWORD)
      await page.click('button[type="submit"]')
      
      // Navigate to applications
      await page.click('text=Applications')
      await expect(page).toHaveURL(/\/admin\/applications/)
      
      // Verify table loads
      await expect(page.locator('table')).toBeVisible()
      
      // Verify columns
      await expect(page.locator('th:has-text("Application Number")')).toBeVisible()
      await expect(page.locator('th:has-text("Student")')).toBeVisible()
      await expect(page.locator('th:has-text("Status")')).toBeVisible()
    })

    test('should filter applications', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', ADMIN_EMAIL)
      await page.fill('input[type="password"]', ADMIN_PASSWORD)
      await page.click('button[type="submit"]')
      
      await page.click('text=Applications')
      await expect(page).toHaveURL(/\/admin\/applications/)
      
      // Apply status filter
      await page.selectOption('select[name="status"]', 'submitted')
      
      // Verify URL updated
      await expect(page).toHaveURL(/status=submitted/)
    })

    test('should view application details', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', ADMIN_EMAIL)
      await page.fill('input[type="password"]', ADMIN_PASSWORD)
      await page.click('button[type="submit"]')
      
      await page.click('text=Applications')
      
      // Click first application
      await page.click('table tbody tr:first-child')
      
      // Verify details page
      await expect(page.locator('text=Application Details')).toBeVisible()
      await expect(page.locator('text=Student Information')).toBeVisible()
      await expect(page.locator('text=Program Details')).toBeVisible()
    })
  })

  test.describe('Mobile Navigation', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should show mobile menu for student', async ({ page }) => {
      // Login
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', STUDENT_EMAIL)
      await page.fill('input[type="password"]', STUDENT_PASSWORD)
      await page.click('button[type="submit"]')
      
      await expect(page).toHaveURL(/\/student\/dashboard/)
      
      // Click hamburger menu
      await page.click('button[aria-label="Open menu"]')
      
      // Verify menu visible
      await expect(page.locator('text=Dashboard')).toBeVisible()
      await expect(page.locator('text=New Application')).toBeVisible()
      await expect(page.locator('text=Settings')).toBeVisible()
      await expect(page.locator('text=Sign Out')).toBeVisible()
    })

    test('should show mobile menu for admin', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', ADMIN_EMAIL)
      await page.fill('input[type="password"]', ADMIN_PASSWORD)
      await page.click('button[type="submit"]')
      
      await expect(page).toHaveURL(/\/admin/)
      
      // Click hamburger menu
      await page.click('button[aria-label="Open menu"]')
      
      // Verify menu visible with all items
      await expect(page.locator('text=Dashboard')).toBeVisible()
      await expect(page.locator('text=Applications')).toBeVisible()
      await expect(page.locator('text=Programs')).toBeVisible()
      await expect(page.locator('text=Users')).toBeVisible()
      await expect(page.locator('text=Sign Out')).toBeVisible()
    })
  })

  test.describe('Security', () => {
    test('should prevent student from accessing admin routes', async ({ page }) => {
      // Login as student
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', STUDENT_EMAIL)
      await page.fill('input[type="password"]', STUDENT_PASSWORD)
      await page.click('button[type="submit"]')
      
      // Try to access admin route
      await page.goto('/admin')
      
      // Should redirect to student dashboard or show error
      await expect(page).not.toHaveURL(/\/admin/)
    })

    test('should allow admin to access admin routes', async ({ page }) => {
      // Login as admin
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', ADMIN_EMAIL)
      await page.fill('input[type="password"]', ADMIN_PASSWORD)
      await page.click('button[type="submit"]')
      
      // Should be on admin dashboard
      await expect(page).toHaveURL(/\/admin/)
      
      // Verify admin content
      await expect(page.locator('text=Admin Dashboard')).toBeVisible()
    })
  })
})
