import { test, expect } from '@playwright/test';

test.describe('Student Application Wizard Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Use production test credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'test.student@mihas.edu.zm');
    await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'TestStudent123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student/**');
  });

  test('Should display application wizard steps', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await expect(page.locator('[data-testid="wizard-steps"]')).toBeVisible();
    await expect(page.locator('text=Step 1 of 5')).toBeVisible();
  });

  test('Should show progress indicator', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="progress-percentage"]')).toContainText('20%');
  });

  test('Should navigate between steps', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Fill required fields in step 1
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    
    await page.click('[data-testid="next-step"]');
    
    await expect(page.locator('text=Step 2 of 5')).toBeVisible();
  });

  test('Should validate required fields before proceeding', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.click('[data-testid="next-step"]');
    
    await expect(page.locator('text=First name is required')).toBeVisible();
    await expect(page.locator('text=Last name is required')).toBeVisible();
  });

  test('Should save draft automatically', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="firstName"]', 'John');
    await page.waitForTimeout(31000); // Wait for auto-save
    
    await expect(page.locator('text=Draft saved')).toBeVisible();
  });

  test('Should restore draft on return', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="firstName"]', 'John');
    await page.waitForTimeout(31000); // Wait for auto-save
    
    // Navigate away and back
    await page.goto('/student/dashboard');
    await page.goto('/student/application-wizard');
    
    await expect(page.locator('input[name="firstName"]')).toHaveValue('John');
  });

  test('Should handle step navigation with back button', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Go to step 2
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    
    // Go back to step 1
    await page.click('[data-testid="previous-step"]');
    
    await expect(page.locator('text=Step 1 of 5')).toBeVisible();
  });

  test('Should show step completion indicators', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    
    await expect(page.locator('[data-testid="step-1-complete"]')).toBeVisible();
  });

  test('Should handle file uploads in wizard', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to documents step
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    
    // Continue to documents step
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'transcript.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('test pdf content')
    });
    
    await expect(page.locator('text=transcript.pdf')).toBeVisible();
  });

  test('Should validate academic information', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to academic step
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    
    // Fill academic info with invalid grades
    await page.fill('input[name="mathGrade"]', '15');
    await page.click('[data-testid="next-step"]');
    
    await expect(page.locator('text=Grade must be between 1 and 9')).toBeVisible();
  });

  test('Should show eligibility checker', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to academic step
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    
    await page.fill('input[name="mathGrade"]', '7');
    await page.fill('input[name="englishGrade"]', '8');
    
    await expect(page.locator('[data-testid="eligibility-status"]')).toBeVisible();
  });

  test('Should handle program selection', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to program selection
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    
    await page.click('[data-testid="program-option"]');
    
    await expect(page.locator('[data-testid="selected-program"]')).toBeVisible();
  });

  test('Should show application summary', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Complete all steps
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    
    // Continue through all steps
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    
    await expect(page.locator('[data-testid="application-summary"]')).toBeVisible();
    await expect(page.locator('text=Review Your Application')).toBeVisible();
  });

  test('Should submit application', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Complete wizard and submit
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    
    // Navigate through all steps
    for (let i = 0; i < 4; i++) {
      await page.click('[data-testid="next-step"]');
    }
    
    await page.click('[data-testid="submit-application"]');
    
    await expect(page.locator('text=Application submitted successfully')).toBeVisible();
  });

  test('Should handle wizard on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/student/application-wizard');
    
    await expect(page.locator('[data-testid="mobile-wizard"]')).toBeVisible();
    await expect(page.locator('[data-testid="mobile-progress"]')).toBeVisible();
  });

  test('Should show session timeout warning', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Mock session timeout
    await page.evaluate(() => {
      localStorage.setItem('session-timeout-warning', 'true');
    });
    
    await page.reload();
    
    await expect(page.locator('[data-testid="session-warning"]')).toBeVisible();
  });

  test('Should handle OCR auto-fill', async ({ page }) => {
    await page.goto('/student/application-wizard');
    
    // Navigate to documents step
    await page.fill('input[name="firstName"]', 'John');
    await page.fill('input[name="lastName"]', 'Doe');
    await page.fill('input[name="email"]', 'john@example.com');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    await page.click('[data-testid="next-step"]');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'id-document.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('test image content')
    });
    
    await expect(page.locator('text=Extracting information...')).toBeVisible();
  });
});