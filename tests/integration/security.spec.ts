import { test, expect } from '@playwright/test'

test.describe('Security Tests', () => {
  test('XSS protection', async ({ page }) => {
    await page.goto('/signin')
    
    // Attempt XSS injection in form fields
    const xssPayload = '<script>alert("XSS")</script>'
    
    await page.fill('input[name="email"]', xssPayload)
    await page.fill('input[name="password"]', xssPayload)
    
    // Check that script tags are not executed
    const alerts = []
    page.on('dialog', dialog => {
      alerts.push(dialog.message())
      dialog.dismiss()
    })
    
    await page.click('button[type="submit"]')
    
    expect(alerts).toHaveLength(0)
  })

  test('CSRF protection', async ({ page }) => {
    await page.goto('/signin')
    
    // Check for CSRF token or other protection mechanisms
    const form = page.locator('form')
    const csrfToken = await form.locator('input[name="_token"]').count()
    const csrfMeta = await page.locator('meta[name="csrf-token"]').count()
    
    // Should have some form of CSRF protection
    expect(csrfToken + csrfMeta).toBeGreaterThan(0)
  })

  test('SQL injection protection', async ({ page }) => {
    await page.goto('/track-application')
    
    // Attempt SQL injection in application tracking
    const sqlPayload = "'; DROP TABLE applications; --"
    
    await page.fill('input[placeholder*="application"]', sqlPayload)
    await page.click('button[type="submit"]')
    
    // Should not cause server error or expose database structure
    await expect(page.locator('text=Database error')).not.toBeVisible()
    await expect(page.locator('text=SQL')).not.toBeVisible()
  })

  test('Authentication bypass attempts', async ({ page }) => {
    // Try to access protected routes without authentication
    const protectedRoutes = [
      '/student/dashboard',
      '/admin',
      '/admin/users'
    ]
    
    for (const route of protectedRoutes) {
      await page.goto(route)
      
      // Should redirect to login
      await expect(page).toHaveURL(/signin/)
    }
  })

  test('Role-based access control', async ({ page }) => {
    // Test student trying to access admin routes
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/admin')
    
    // Should be denied access
    await expect(page).toHaveURL(/signin/)
  })

  test('File upload security', async ({ page }) => {
    // Mock student authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/apply')
    
    const fileInput = page.locator('input[type="file"]')
    if (await fileInput.count() > 0) {
      // Test malicious file upload
      const maliciousFile = new File(['<?php echo "hack"; ?>'], 'malicious.php', {
        type: 'application/x-php'
      })
      
      // Should reject PHP files
      await fileInput.setInputFiles([maliciousFile as any])
      
      await expect(page.locator('text=Invalid file type')).toBeVisible()
    }
  })

  test('Content Security Policy headers', async ({ page }) => {
    const response = await page.goto('/')
    
    const headers = response?.headers()
    const csp = headers?.['content-security-policy']
    
    // Should have CSP header
    expect(csp).toBeTruthy()
    
    // Should restrict script sources
    expect(csp).toContain("script-src")
  })

  test('Secure headers present', async ({ page }) => {
    const response = await page.goto('/')
    
    const headers = response?.headers()
    
    // Check for security headers
    expect(headers?.['x-frame-options']).toBeTruthy()
    expect(headers?.['x-content-type-options']).toBe('nosniff')
    expect(headers?.['x-xss-protection']).toBeTruthy()
    expect(headers?.['strict-transport-security']).toBeTruthy()
  })

  test('Session security', async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' },
        expires_at: Date.now() + 3600000 // 1 hour
      }))
    })
    
    await page.goto('/student/dashboard')
    
    // Check session timeout handling
    await page.evaluate(() => {
      const token = JSON.parse(localStorage.getItem('supabase.auth.token') || '{}')
      token.expires_at = Date.now() - 1000 // Expired
      localStorage.setItem('supabase.auth.token', JSON.stringify(token))
    })
    
    await page.reload()
    
    // Should redirect to login for expired session
    await expect(page).toHaveURL(/signin/)
  })

  test('Password strength validation', async ({ page }) => {
    await page.goto('/auth/signup')
    
    // Test weak password
    await page.fill('input[name="password"]', '123')
    await page.fill('input[name="confirmPassword"]', '123')
    await page.click('button[type="submit"]')
    
    // Should show password strength error
    await expect(page.locator('text=Password too weak')).toBeVisible()
  })

  test('Rate limiting protection', async ({ page }) => {
    await page.goto('/signin')
    
    // Attempt multiple rapid login attempts
    for (let i = 0; i < 10; i++) {
      await page.fill('input[name="email"]', 'alexisstar8@gmail.com')
      await page.fill('input[name="password"]', 'wrongpassword')
      await page.click('button[type="submit"]')
      await page.waitForTimeout(100)
    }
    
    // Should show rate limiting message
    await expect(page.locator('text=Too many attempts')).toBeVisible()
  })

  test('Data sanitization', async ({ page }) => {
    // Mock student authentication
    await page.addInitScript(() => {
      window.localStorage.setItem('supabase.auth.token', JSON.stringify({
        access_token: 'mock-token',
        user: { id: 'test-user', role: 'student' }
      }))
    })
    
    await page.goto('/apply')
    
    // Test HTML injection in form fields
    const htmlPayload = '<img src="x" onerror="alert(1)">'
    
    const textInputs = page.locator('input[type="text"], textarea')
    const count = await textInputs.count()
    
    if (count > 0) {
      await textInputs.first().fill(htmlPayload)
      
      // Should not execute JavaScript
      const alerts = []
      page.on('dialog', dialog => {
        alerts.push(dialog.message())
        dialog.dismiss()
      })
      
      await page.click('button:has-text("Next")')
      
      expect(alerts).toHaveLength(0)
    }
  })

  test('Secure cookie settings', async ({ page }) => {
    await page.goto('/')
    
    // Check cookie security attributes
    const cookies = await page.context().cookies()
    
    for (const cookie of cookies) {
      if (cookie.name.includes('auth') || cookie.name.includes('session')) {
        expect(cookie.secure).toBeTruthy()
        expect(cookie.httpOnly).toBeTruthy()
        expect(cookie.sameSite).toBe('Strict')
      }
    }
  })
})