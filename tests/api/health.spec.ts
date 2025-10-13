import { test, expect } from '@playwright/test';

test.describe('Health API Tests', () => {
  test('Health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('ok');
  });

  test('Health endpoint should include timestamp', async ({ request }) => {
    const response = await request.get('/api/health');
    const data = await response.json();
    
    expect(data).toHaveProperty('timestamp');
    expect(new Date(data.timestamp)).toBeInstanceOf(Date);
  });
});