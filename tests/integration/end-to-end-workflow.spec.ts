import { test, expect } from '@playwright/test';

test.describe('End-to-End Workflow Tests', () => {
  test('Complete student application workflow', async ({ page }) => {
    // 1. Register new student with production environment
    await page.goto('/auth/signup');
    
    const timestamp = Date.now();
    const testEmail = `test.student.${timestamp}@mihas.edu.zm`;
    
    await page.fill('input[name="firstName"]', 'Jane');
    await page.fill('input[name="lastName"]', 'Smith');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');
    
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard after registration
    await expect(page).toHaveURL(/dashboard/);
    
    // 2. Start new application
    await page.click('text=New Application');
    await expect(page).toHaveURL(/application-wizard/);
    
    // 3. Complete personal information
    await page.fill('input[name="phone"]', '+260971234567');
    await page.fill('input[name="dateOfBirth"]', '2000-01-15');
    await page.selectOption('select[name="gender"]', 'female');
    await page.click('[data-testid="next-step"]');
    
    // 4. Complete contact information
    await page.fill('input[name="address"]', '123 Main Street');
    await page.fill('input[name="city"]', 'Lusaka');
    await page.selectOption('select[name="province"]', 'lusaka');
    await page.click('[data-testid="next-step"]');
    
    // 5. Complete academic information
    await page.fill('input[name="mathGrade"]', '7');
    await page.fill('input[name="englishGrade"]', '8');
    await page.fill('input[name="scienceGrade"]', '6');
    await page.selectOption('select[name="schoolType"]', 'government');
    await page.click('[data-testid="next-step"]');
    
    // 6. Upload documents
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'grade12-certificate.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('Grade 12 certificate content')
      },
      {
        name: 'birth-certificate.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('Birth certificate content')
      }
    ]);
    
    await expect(page.locator('text=grade12-certificate.pdf')).toBeVisible();
    await expect(page.locator('text=birth-certificate.pdf')).toBeVisible();
    await page.click('[data-testid="next-step"]');
    
    // 7. Select program
    await page.click('[data-testid="program-card"]');
    await page.click('[data-testid="next-step"]');
    
    // 8. Review and submit
    await expect(page.locator('[data-testid="application-summary"]')).toBeVisible();
    await expect(page.locator('text=Jane Smith')).toBeVisible();
    await expect(page.locator('text=+260971234567')).toBeVisible();
    
    await page.click('[data-testid="submit-application"]');
    
    // 9. Verify submission success
    await expect(page.locator('text=Application submitted successfully')).toBeVisible();
    await expect(page.locator('[data-testid="application-number"]')).toBeVisible();
    
    // 10. Check application appears in dashboard
    await page.goto('/student/dashboard');
    await expect(page.locator('[data-testid="application-card"]')).toBeVisible();
    await expect(page.locator('text=Pending Review')).toBeVisible();
  });

  test('Complete admin review workflow', async ({ page }) => {
    // Use production admin credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'test.admin@mihas.edu.zm');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/**');
    
    // 1. Navigate to admin applications
    await page.goto('/admin/applications');
    
    await expect(page.locator('[data-testid="applications-table"]')).toBeVisible();
    
    // 2. Filter for pending applications
    await page.selectOption('[data-testid="status-filter"]', 'pending');
    
    // 3. Open application for review
    await page.click('[data-testid="application-row"]');
    await expect(page.locator('[data-testid="application-modal"]')).toBeVisible();
    
    // 4. Review application details
    await expect(page.locator('[data-testid="applicant-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="academic-info"]')).toBeVisible();
    await expect(page.locator('[data-testid="documents-section"]')).toBeVisible();
    
    // 5. View uploaded documents
    await page.click('[data-testid="view-documents"]');
    await expect(page.locator('[data-testid="document-viewer"]')).toBeVisible();
    
    // 6. Add review notes
    await page.fill('[data-testid="review-notes"]', 'Strong academic performance. All documents verified.');
    
    // 7. Approve application
    await page.click('[data-testid="approve-button"]');
    await expect(page.locator('text=Application approved successfully')).toBeVisible();
    
    // 8. Verify status change
    await page.click('[data-testid="close-modal"]');
    await expect(page.locator('text=Approved')).toBeVisible();
    
    // 9. Check audit log
    await page.goto('/admin/audit-trail');
    await expect(page.locator('text=Application approved')).toBeVisible();
  });

  test('Complete notification workflow', async ({ page }) => {
    // Use production student credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'test.student@mihas.edu.zm');
    await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'TestStudent123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student/**');
    
    // 1. Navigate to student dashboard
    await page.goto('/student/dashboard');
    
    // 2. Check for notifications
    await expect(page.locator('[data-testid="notification-bell"]')).toBeVisible();
    
    // 3. Open notifications panel
    await page.click('[data-testid="notification-bell"]');
    await expect(page.locator('[data-testid="notifications-panel"]')).toBeVisible();
    
    // 4. Check for application status notification
    await expect(page.locator('text=Application Status Update')).toBeVisible();
    
    // 5. Mark notification as read
    await page.click('[data-testid="mark-as-read"]');
    
    // 6. Check notification preferences
    await page.click('[data-testid="notification-settings"]');
    await expect(page.locator('[data-testid="notification-preferences"]')).toBeVisible();
    
    // 7. Update preferences
    await page.check('[data-testid="email-notifications"]');
    await page.check('[data-testid="sms-notifications"]');
    await page.click('[data-testid="save-preferences"]');
    
    await expect(page.locator('text=Preferences saved')).toBeVisible();
  });

  test('Complete document management workflow', async ({ page }) => {
    // Use production student credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL || 'test.student@mihas.edu.zm');
    await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD || 'TestStudent123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/student/**');
    
    // 1. Navigate to application
    await page.goto('/student/applications');
    await page.click('[data-testid="application-card"]');
    
    // 2. Go to documents section
    await page.click('[data-testid="documents-tab"]');
    
    // 3. Upload additional document
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'additional-document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Additional document content')
    });
    
    // 4. Wait for upload completion
    await expect(page.locator('text=Upload complete')).toBeVisible();
    
    // 5. Verify document appears in list
    await expect(page.locator('text=additional-document.pdf')).toBeVisible();
    
    // 6. Download document
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-document"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toBe('additional-document.pdf');
    
    // 7. Delete document
    await page.click('[data-testid="delete-document"]');
    await page.click('[data-testid="confirm-delete"]');
    
    await expect(page.locator('text=Document deleted')).toBeVisible();
  });

  test('Complete reporting workflow', async ({ page }) => {
    // Use production admin credentials
    await page.goto('/auth/signin');
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'test.admin@mihas.edu.zm');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/admin/**');
    
    // 1. Navigate to analytics
    await page.goto('/admin/analytics');
    
    // 2. Select date range
    await page.click('[data-testid="date-range-picker"]');
    await page.click('[data-testid="last-30-days"]');
    
    // 3. View application statistics
    await expect(page.locator('[data-testid="applications-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="approval-rate"]')).toBeVisible();
    
    // 4. Generate detailed report
    await page.click('[data-testid="generate-report"]');
    
    // 5. Configure report parameters
    await page.check('[data-testid="include-demographics"]');
    await page.check('[data-testid="include-academic-data"]');
    await page.selectOption('[data-testid="report-format"]', 'pdf');
    
    // 6. Download report
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-report"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toContain('applications-report');
    
    // 7. Schedule recurring report
    await page.click('[data-testid="schedule-report"]');
    await page.selectOption('[data-testid="frequency"]', 'weekly');
    await page.fill('[data-testid="recipient-email"]', 'admin@mihas.edu.zm');
    await page.click('[data-testid="save-schedule"]');
    
    await expect(page.locator('text=Report scheduled successfully')).toBeVisible();
  });
});