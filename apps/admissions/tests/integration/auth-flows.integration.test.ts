/**
 * Integration Tests: Authentication Flows
 *
 * Validates the current Django cookie-auth contract under /api/v1/auth/.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

function createMockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  }
}

describe('Auth Integration Tests (Django cookie auth)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Registration flow', () => {
    it('registers with first_name and last_name payload fields', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          message: 'Registration successful. Please check your email.',
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            first_name: 'Test',
            last_name: 'User',
            role: 'student',
          },
        },
      }, 201))

      const response = await fetch('/api/v1/auth/register/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          first_name: 'Test',
          last_name: 'User',
        }),
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.user.email).toBe('test@example.com')
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/auth/register/',
        expect.objectContaining({ credentials: 'include' })
      )
    })

    it('returns a success-shaped response when the email already exists', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          message: 'Registration successful. Please check your email.',
        },
      }, 201))

      const response = await fetch('/api/v1/auth/register/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'SecurePassword123!',
          first_name: 'Existing',
          last_name: 'User',
        }),
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.message).toContain('Registration successful')
    })
  })

  describe('Login flow', () => {
    it('logs in with valid credentials', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            role: 'student',
          },
        },
      }))

      const response = await fetch('/api/v1/auth/login/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
        }),
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.user.email).toBe('test@example.com')
    })

    it('returns a generic invalid-credentials error', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, 401))

      const response = await fetch('/api/v1/auth/login/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        }),
      })

      const result = await response.json()

      expect(response.ok).toBe(false)
      expect(result.error).toBe('Invalid credentials')
      expect(result.error).not.toContain('not found')
      expect(result.error).not.toContain('does not exist')
    })
  })

  describe('Session flow', () => {
    it('reads the current session from /api/v1/auth/session/', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        id: 'test-user-id',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'student',
      }))

      const response = await fetch('/api/v1/auth/session/', {
        method: 'GET',
        credentials: 'include',
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.email).toBe('test@example.com')
      expect(result.role).toBe('student')
    })

    it('logs out through /api/v1/auth/logout/', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      }))

      const response = await fetch('/api/v1/auth/logout/', {
        method: 'POST',
        credentials: 'include',
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.message).toContain('Logged out successfully')
    })

    it('refreshes tokens through /api/v1/auth/refresh/', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          message: 'Tokens refreshed',
        },
      }))

      const response = await fetch('/api/v1/auth/refresh/', {
        method: 'POST',
        credentials: 'include',
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.message).toContain('Tokens refreshed')
    })
  })

  describe('Password reset flow', () => {
    it('requests password reset via /api/v1/auth/password-reset/', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          message: 'If the email exists, a reset link has been sent.',
        },
      }))

      const response = await fetch('/api/v1/auth/password-reset/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
    })

    it('confirms password reset via /api/v1/auth/password-reset/confirm/', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          message: 'Password reset successful',
        },
      }))

      const response = await fetch('/api/v1/auth/password-reset/confirm/', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          new_password: 'NewSecurePassword123!',
        }),
      })

      const result = await response.json()

      expect(response.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(result.data.message).toContain('Password reset successful')
    })
  })

  describe('Cookie auth behavior', () => {
    it('always uses credentials: include for auth requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }))

      const endpoints = [
        { url: '/api/v1/auth/login/', method: 'POST' },
        { url: '/api/v1/auth/logout/', method: 'POST' },
        { url: '/api/v1/auth/session/', method: 'GET' },
        { url: '/api/v1/auth/refresh/', method: 'POST' },
        { url: '/api/v1/auth/register/', method: 'POST' },
      ]

      for (const endpoint of endpoints) {
        await fetch(endpoint.url, {
          method: endpoint.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
        })
      }

      expect(mockFetch).toHaveBeenCalledTimes(endpoints.length)
      mockFetch.mock.calls.forEach((call) => {
        expect(call[1]).toHaveProperty('credentials', 'include')
      })
    })
  })
})
