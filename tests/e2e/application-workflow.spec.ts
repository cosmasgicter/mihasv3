import { test, expect } from '@playwright/test'

test.describe('Complete Application Workflow', () => {
  test('Full application submission flow', async ({ page }) => {
    // Step 1: Registration
    await page.goto('/auth/signup')
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="password"]', 'TestPassword123!')
    await page.fill('input[name="confirmPassword"]', 'TestPassword123!')
    await page.click('button[type="submit"]')
    
    // Mock successful registration
    await page.route('**/auth-register', async route => {
      await route.fulfill({
        json: { success: true, user: { id: 'test-user' } }
      })
    })
    
    // Step 2: Login
    await page.goto('/signin')
    await page.fill('input[name="email"]', 'test@example.com')
    await page.fill('input[name="password"]', 'TestPassword123!')
    await page.click('button[type="submit"]')
    
    // Mock successful login
    await page.route('**/auth-login', async route => {
      await route.fulfill({
        json: { success: true, user: { id: 'test-user', role: 'student' } }
      })
    })
    
    // Step 3: Start application
    await page.goto('/student/dashboard')
    await page.click('text=Start New Application')
    
    // Step 4: Fill application form
    await expect(page).toHaveURL(/application-wizard/)
    
    // Personal Information
    await page.fill('input[name="firstName"]', 'John')
    await page.fill('input[name="lastName"]', 'Doe')
    await page.fill('input[name="dateOfBirth"]', '1995-01-01')
    await page.click('button:has-text("Next")')
    
    // Academic Information
    await page.selectOption('select[name="program"]', 'computer-science')
    await page.fill('input[name="previousSchool"]', 'Test High School')
    await page.click('button:has-text("Next")')
    
    // Documents Upload
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.count() > 0) {
      // Mock file upload
      await page.route('**/documents-upload', async route => {
        await route.fulfill({
          json: { success: true, url: 'mock-file-url' }
        })
      })
    }
    await page.click('button:has-text("Next")')
    
    // Review and Submit
    await expect(page.locator('text=Review Application')).toBeVisible()
    await page.click('button:has-text("Submit Application")')
    
    // Mock submission
    await page.route('**/applications', async route => {
      await route.fulfill({
        json: { success: true, applicationId: 'APP-001' }
      })
    })
    
    // Verify success
    await expect(page.locator('text=Application Submitted')).toBeVisible()
  })

  test('Application status tracking', async ({ page }) => {
    // Mock authenticated user
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/student/dashboard')
    
    // Mock application data
    await page.route('**/applications', async route => {
      await route.fulfill({
        json: [{
          id: 'APP-001',
          status: 'under_review',
          program: 'Computer Science',
          created_at: new Date().toISOString(),
          documents: ['transcript.pdf', 'certificate.pdf']
        }]
      })
    })
    
    await page.reload()
    
    // Check application appears in dashboard
    await expect(page.locator('[data-testid="application-card"]')).toBeVisible()
    await expect(page.locator('text=APP-001')).toBeVisible()
    await expect(page.locator('text=Under Review')).toBeVisible()
    
    // Click to view details
    await page.click('[data-testid="application-card"]')
    await expect(page).toHaveURL(/application\/APP-001/)
  })

  test('Admin application review workflow', async ({ page }) => {
    // Mock admin authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-admin-token',
        user: { id: 'admin-user', role: 'admin' }
      }))
    })
    
    await page.goto('/admin/applications')
    
    // Mock applications data
    await page.route('**/applications', async route => {
      await route.fulfill({
        json: [{
          id: 'APP-001',
          status: 'pending',
          applicant_name: 'John Doe',
          program: 'Computer Science',
          created_at: new Date().toISOString()
        }]
      })
    })
    
    await page.reload()
    
    // Review application
    await page.click('[data-testid="review-button"]')
    await expect(page.locator('[data-testid="review-modal"]')).toBeVisible()
    
    // Update status
    await page.selectOption('select[name="status"]', 'approved')
    await page.fill('textarea[name="comments"]', 'Application approved')
    await page.click('button:has-text("Update Status")')
    
    // Mock status update
    await page.route('**/applications/APP-001', async route => {
      await route.fulfill({
        json: { success: true }
      })
    })
    
    await expect(page.locator('text=Status updated')).toBeVisible()
  })
})