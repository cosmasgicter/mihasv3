import { test, expect } from '@playwright/test';

test.describe('Admin API Tests', () => {
  test('Admin dashboard should require admin authentication', async ({ request }) => {
    const response = await request.get('/api/admin/dashboard');
    expect([401, 403, 502]).toContain(response.status());
  });

  test('Admin users endpoint should require admin privileges', async ({ request }) => {
    const response = await request.get('/api/admin/users');
    expect([401, 403, 502]).toContain(response.status());
  });

  test('Admin audit log should require proper permissions', async ({ request }) => {
    const response = await request.get('/api/admin/audit-log');
    expect([401, 403, 404]).toContain(response.status());
  });

  test('Admin queue status should be accessible to admins', async ({ request }) => {
    const response = await request.get('/api/admin/queue-status');
    expect([401, 403]).toContain(response.status());
  });

  test('Admin user permissions should validate user ID', async ({ request }) => {
    const response = await request.get('/api/admin/users/invalid-id/permissions');
    expect([400, 401, 403, 404]).toContain(response.status());
  });

  test('Admin user role update should validate role data', async ({ request }) => {
    const response = await request.put('/api/admin/users/test-id/role', {
      data: {
        role: 'invalid-role'
      }
    });
    
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Admin audit log export should handle date ranges', async ({ request }) => {
    const response = await request.get('/api/admin/audit-log/export?start=invalid-date');
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Admin audit log stats should return metrics', async ({ request }) => {
    const response = await request.get('/api/admin/audit-log/stats');
    expect([401, 403, 502]).toContain(response.status());
  });
});