import { test, expect } from '@playwright/test';

test.describe('Authentication API Tests', () => {
  test('Login endpoint should handle invalid credentials', async ({ request }) => {
    const response = await request.post('/api/auth/login', {
      data: {
        email: 'invalid@test.com',
        password: 'wrongpassword'
      }
    });
    
    expect(response.status()).toBe(401);
  });

  test('Register endpoint should validate required fields', async ({ request }) => {
    const response = await request.post('/api/auth/register', {
      data: {
        email: 'test@example.com'
        // Missing password and other required fields
      }
    });
    
    expect(response.status()).toBe(400);
  });

  test('Password reset should validate email format', async ({ request }) => {
    const response = await request.post('/api/auth/reset-password', {
      data: {
        email: 'invalid-email'
      }
    });
    
    expect(response.status()).toBe(400);
  });

  test('Password reset with valid email should return success', async ({ request }) => {
    const response = await request.post('/api/auth/reset-password', {
      data: {
        email: 'test@example.com'
      }
    });
    
    expect([200, 202]).toContain(response.status());
  });
});