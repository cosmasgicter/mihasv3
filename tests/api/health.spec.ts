import { test, expect } from '@playwright/test';

test.describe('Health API Tests', () => {
  test('Health endpoint should return 200', async ({ request }) => {
    const response = await request.get('/.netlify/functions/health');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('status');
    expect(['ok', 'healthy']).toContain(data.status);
  });

  test('Health endpoint should include timestamp', async ({ request }) => {
    const response = await request.get('/.netlify/functions/health');
    const data = await response.json();
    
    expect(data).toHaveProperty('timestamp');
    expect(new Date(data.timestamp)).toBeInstanceOf(Date);
  });
});