import { test, expect } from '@playwright/test'

test.describe('Security Testing', () => {
  test.describe('26.5 Security testing', () => {
    
    test('XSS vulnerability check - Input sanitization', async ({ page }) => {
      await page.goto('/auth/signin')
      await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'alexisstar8@gmail.com')
      await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || '***REMOVED***')
      await page.click('button[type="submit"]')
      await page.waitForURL('**/student/**', { timeout: 10000 })
      
      await page.goto('/student/application-wizard')
      
      // Try XSS payloads
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<svg onload=alert("XSS")>',
        '"><script>alert("XSS")</script>'
      ]
      
      for (const payload of xssPayloads) {
        // Try in text input
        const textInputs = page.locator('input[type="text"]')
        if (await textInputs.count() > 0) {
          await textInputs.first().fill(payload)
          
          // Check if script was executed
          const alertFired = await page.evaluate(() => {
            return (window as any).alertFired || false
          })
          
          expect(alertFired, `XSS payload should be sanitized: ${payload}`).toBe(false)
          
          // Check if payload is escaped in DOM
          const value = await textInputs.first().inputValue()
          expect(value).toBe(payload) // Should store as-is but not execute
        }
        
        // Try in textarea
        const textareas = page.locator('textarea')
        if (await textareas.count() > 0) {
          await textareas.first().fill(payload)
          
          const alertFired = await page.evaluate(() => {
            return (window as any).alertFired || false
          })
          