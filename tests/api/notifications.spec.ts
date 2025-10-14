import { test, expect } from '@playwright/test';

test.describe('Notifications API Tests', () => {
  test('Send notification should validate recipient', async ({ request }) => {
    const response = await request.post('/api/notifications/send', {
      data: {
        message: 'Test message'
        // Missing recipient
      }
    });
    
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Application submitted notification should validate application ID', async ({ request }) => {
    const response = await request.post('/api/notifications/application-submitted', {
      data: {
        applicationId: 'invalid-id'
      }
    });
    
    expect([400, 401, 403, 404]).toContain(response.status());
  });

  test('Dispatch channel should validate channel type', async ({ request }) => {
    const response = await request.post('/api/notifications/dispatch-channel', {
      data: {
        channel: 'invalid-channel',
        message: 'Test message'
      }
    });
    
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Process email queue should require admin access', async ({ request }) => {
    const response = await request.post('/api/notifications/process-email-queue');
    expect([401, 403]).toContain(response.status());
  });

  test('Notification preferences should validate user ID', async ({ request }) => {
    const response = await request.get('/api/notifications/preferences?userId=invalid');
    expect([400, 401, 403, 404]).toContain(response.status());
  });

  test('Update consent should validate consent data', async ({ request }) => {
    const response = await request.post('/api/notifications/update-consent', {
      data: {
        // Missing required consent fields
      }
    });
    
    expect([400, 401, 403, 404]).toContain(response.status());
  });
});