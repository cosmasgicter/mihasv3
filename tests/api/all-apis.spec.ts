import { test, expect } from '@playwright/test'

const API_BASE = process.env.VITE_API_URL || '***REMOVED***/.netlify/functions'

test.describe('API Endpoints', () => {
  const endpoints = [
    'health',
    'auth-login',
    'auth-register', 
    'auth-reset-password',
    'applications',
    'catalog-programs',
    'catalog-intakes',
    'catalog-subjects',
    'documents-upload',
    'admin-dashboard',
    'admin-users',
    'admin-audit-log-stats',
    'analytics-telemetry',
    'notifications-send'
  ]

  endpoints.forEach(endpoint => {
    test(`${endpoint} API responds`, async ({ request }) => {
      const response = await request.get(`${API_BASE}/${endpoint}`)
      expect(response.status()).toBeLessThan(500)
    })
  })

  test('Health check returns OK', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(data.status).toBe('ok')
  })

  test('Programs API returns data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/catalog-programs`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
  })

  test('Intakes API returns data', async ({ request }) => {
    const response = await request.get(`${API_BASE}/catalog-intakes`)
    expect(response.ok()).toBeTruthy()
    const data = await response.json()
    expect(Array.isArray(data)).toBeTruthy()
  })
})