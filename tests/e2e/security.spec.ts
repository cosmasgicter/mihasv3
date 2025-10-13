import { test, expect } from '@playwright/test';

test.describe('Security Tests', () => {
  test('Should prevent XSS attacks', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Try to inject script in email field
    const maliciousScript = '<script>alert("XSS")</script>';
    await page.fill('input[type="email"]', maliciousScript);
    
    // Check that script is not executed
    const emailValue = await page.inputValue('input[type="email"]');
    expect(emailValue).toBe(maliciousScript); // Should be treated as text
    
    // Check no alert dialog appears
    page.on('dialog', () => {
      throw new Error('XSS vulnerability detected!');
    });
    
    await page.click('button[type="submit"]');
  });

  test('Should sanitize user input', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Try various malicious inputs
    const maliciousInputs = [
      '<img src=x onerror=alert(1)>',
      'javascript:alert(1)',
      '"><script>alert(1)</script>',
      'onmouseover="alert(1)"'
    ];
    
    for (const input of maliciousInputs) {
      await page.fill('input[name="firstName"]', input);
      const value = await page.inputValue('input[name="firstName"]');
      
      // Should not contain executable code
      expect(value).not.toContain('<script>');
      expect(value).not.toContain('javascript:');
      expect(value).not.toContain('onerror=');
      expect(value).not.toContain('onmouseover=');
    }
  });

  test('Should enforce HTTPS in production', async ({ page }) => {
    // Check if running in production mode
    const url = page.url();
    
    if (url.includes('mihas.edu.zm') || url.includes('production')) {
      expect(url).toMatch(/^https:/);
    }
  });

  test('Should have secure headers', async ({ page }) => {
    const response = await page.goto('/');
    
    const headers = response?.headers();
    
    if (headers) {
      // Check for security headers
      expect(headers['x-frame-options'] || headers['X-Frame-Options']).toBeTruthy();
      expect(headers['x-content-type-options'] || headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['x-xss-protection'] || headers['X-XSS-Protection']).toBeTruthy();
    }
  });

  test('Should protect against CSRF', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Check for CSRF token in forms
    const csrfToken = await page.locator('input[name="_token"], input[name="csrf_token"]').count();
    const metaCsrf = await page.locator('meta[name="csrf-token"]').count();
    
    expect(csrfToken > 0 || metaCsrf > 0).toBeTruthy();
  });

  test('Should validate file uploads securely', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to file upload
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    
    // Try to upload executable file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'malicious.exe',
      mimeType: 'application/x-executable',
      buffer: Buffer.from('MZ') // PE header
    });
    
    // Should reject executable files
    await expect(page.locator('text=Invalid file type')).toBeVisible();
  });

  test('Should handle authentication securely', async ({ page }) => {
    await page.goto('/auth/signin');
    
    // Check password field is properly masked
    const passwordField = page.locator('input[type="password"]');
    const type = await passwordField.getAttribute('type');
    expect(type).toBe('password');
    
    // Check for password strength requirements
    await page.goto('/auth/signup');
    await page.fill('input[type="password"]', 'weak');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('text=Password must be at least 8 characters')).toBeVisible();
  });

  test('Should protect sensitive data in localStorage', async ({ page }) => {
    await page.goto('/');
    
    // Check that sensitive data is not stored in plain text
    const localStorage = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          items[key] = localStorage.getItem(key);
        }
      }
      return items;
    });
    
    // Check for common sensitive data patterns
    Object.values(localStorage).forEach(value => {
      if (typeof value === 'string') {
        expect(value).not.toMatch(/password/i);
        expect(value).not.toMatch(/secret/i);
        expect(value).not.toMatch(/private.*key/i);
      }
    });
  });

  test('Should handle session timeout securely', async ({ page }) => {
    // Mock expired session
    await page.addInitScript(() => {
      localStorage.setItem('auth-token', 'expired-token');
      localStorage.setItem('token-expiry', '1000'); // Past timestamp
    });
    
    await page.goto('/student/dashboard');
    
    // Should redirect to login
    await expect(page).toHaveURL(/signin/);
  });

  test('Should validate API endpoints', async ({ page }) => {
    // Test unauthorized access
    const response = await page.request.get('/api/admin/dashboard');
    expect([401, 403]).toContain(response.status());
    
    // Test SQL injection attempts
    const sqlInjection = "'; DROP TABLE users; --";
    const searchResponse = await page.request.get(`/api/applications?search=${encodeURIComponent(sqlInjection)}`);
    expect([400, 401, 403]).toContain(searchResponse.status());
  });
});