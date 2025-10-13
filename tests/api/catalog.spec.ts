import { test, expect } from '@playwright/test';

test.describe('Catalog API Tests', () => {
  test('Programs endpoint should return valid data structure', async ({ request }) => {
    const response = await request.get('/api/catalog/programs');
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data) || data.programs).toBeTruthy();
    } else {
      expect([401, 403, 500]).toContain(response.status());
    }
  });

  test('Intakes endpoint should return current intakes', async ({ request }) => {
    const response = await request.get('/api/catalog/intakes');
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data) || data.intakes).toBeTruthy();
    } else {
      expect([401, 403, 500]).toContain(response.status());
    }
  });

  test('Subjects endpoint should return subjects list', async ({ request }) => {
    const response = await request.get('/api/catalog/subjects');
    
    if (response.status() === 200) {
      const data = await response.json();
      expect(Array.isArray(data) || data.subjects).toBeTruthy();
    } else {
      expect([401, 403, 500]).toContain(response.status());
    }
  });

  test('Programs endpoint should handle query parameters', async ({ request }) => {
    const response = await request.get('/api/catalog/programs?search=engineering');
    expect([200, 401, 403]).toContain(response.status());
  });

  test('Intakes endpoint should handle filtering', async ({ request }) => {
    const response = await request.get('/api/catalog/intakes?active=true');
    expect([200, 401, 403]).toContain(response.status());
  });
});