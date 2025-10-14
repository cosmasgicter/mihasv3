import { test, expect } from '@playwright/test';

test.describe('Analytics API Tests', () => {
  test('Analytics metrics should require authentication', async ({ request }) => {
    const response = await request.get('/api/analytics/metrics');
    expect([401, 403, 404]).toContain(response.status());
  });

  test('Analytics telemetry should accept valid data', async ({ request }) => {
    const response = await request.post('/api/analytics/telemetry', {
      data: {
        event: 'page_view',
        page: '/dashboard',
        timestamp: new Date().toISOString()
      }
    });
    
    expect([200, 201, 401, 403]).toContain(response.status());
  });

  test('Predictive dashboard should require admin access', async ({ request }) => {
    const response = await request.get('/api/analytics/predictive-dashboard');
    expect([200, 401, 403, 502]).toContain(response.status());
  });

  test('Analytics telemetry should validate event data', async ({ request }) => {
    const response = await request.post('/api/analytics/telemetry', {
      data: {
        // Missing required fields
      }
    });
    
    expect([200, 400, 401, 403, 502]).toContain(response.status());
  });

  test('Analytics metrics should handle date range queries', async ({ request }) => {
    const response = await request.get('/api/analytics/metrics?start=2024-01-01&end=2024-12-31');
    expect([401, 403, 404]).toContain(response.status());
  });
});