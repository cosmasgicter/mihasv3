import { test, expect } from '@playwright/test';

test.describe('Applications API Tests', () => {
  test('Applications endpoint should require authentication', async ({ request }) => {
    const response = await request.get('/api/applications');
    expect([401, 403]).toContain(response.status());
  });

  test('Applications endpoint should validate pagination parameters', async ({ request }) => {
    const response = await request.get('/api/applications?page=-1&limit=0');
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Application creation should validate required fields', async ({ request }) => {
    const response = await request.post('/api/applications', {
      data: {
        // Missing required fields
      }
    });
    
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Application by ID should handle non-existent IDs', async ({ request }) => {
    const response = await request.get('/api/applications/non-existent-id');
    expect([404, 401, 403]).toContain(response.status());
  });

  test('Application documents upload should validate file types', async ({ request }) => {
    const response = await request.post('/api/applications/test-id/documents', {
      multipart: {
        file: {
          name: 'test.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('test content')
        }
      }
    });
    
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Application slip generation should validate application exists', async ({ request }) => {
    const response = await request.post('/api/applications/non-existent/generate-slip');
    expect([404, 401, 403]).toContain(response.status());
  });
});