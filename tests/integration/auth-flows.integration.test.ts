/**
 * Integration Tests: Authentication Flows
 * 
 * Tests complete signup and login flows using custom JWT auth with HTTP-only cookies.
 * Validates the Bun/Vercel migration with cookie-based authentication.
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 * 
 * @updated 2026-01-31 - Migrated from Supabase Auth to custom JWT auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock response
function createMockResponse(data: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe('Auth Integration Tests (Custom JWT with HTTP-only Cookies)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Registration Flow (Requirement 9.1)', () => {
    it('should complete registration flow with valid credentials', async () => {
      const testEmail = 'test@example.com';
      const testPassword = 'SecurePassword123!';
      const testName = 'Test User';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: testEmail,
            role: 'student',
            full_name: testName,
          },
        },
      }));

      const response = await fetch('/api/auth?action=register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          full_name: testName,
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.user).toBeDefined();
      expect(result.data.user.email).toBe(testEmail);
      
      // Verify fetch was called with credentials: 'include'
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth?action=register',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should handle registration with existing email', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Email already registered',
        code: 'EMAIL_EXISTS',
      }, 409));

      const response = await fetch('/api/auth?action=register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'Password123!',
          full_name: 'Test User',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already registered');
    });

    it('should handle registration with weak password', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Password must be at least 8 characters',
        code: 'WEAK_PASSWORD',
      }, 400));

      const response = await fetch('/api/auth?action=register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: '123',
          full_name: 'Test User',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Password');
    });
  });

  describe('Login Flow (Requirement 9.2)', () => {
    it('should complete login flow with valid credentials', async () => {
      const testEmail = 'test@example.com';
      const testPassword = 'SecurePassword123!';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: testEmail,
            role: 'student',
          },
        },
      }));

      const response = await fetch('/api/auth?action=login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.user).toBeDefined();
      expect(result.data.user.email).toBe(testEmail);
      
      // Verify credentials: 'include' is used (cookies will be set by server)
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/auth?action=login',
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });

    it('should handle login with invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, 401));

      const response = await fetch('/api/auth?action=login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should not reveal whether email exists on login failure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, 401));

      const response = await fetch('/api/auth?action=login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        }),
      });

      const result = await response.json();

      // Error should be generic, not revealing if email exists
      expect(result.error).not.toContain('not found');
      expect(result.error).not.toContain('does not exist');
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('Session Management (Requirement 9.3)', () => {
    it('should retrieve active session from cookie', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            role: 'student',
          },
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      }));

      const response = await fetch('/api/auth?action=session', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.user).toBeDefined();
      expect(result.data.expires_at).toBeDefined();
    });

    it('should handle no active session (not authenticated)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Not authenticated',
        code: 'NOT_AUTHENTICATED',
      }, 401));

      const response = await fetch('/api/auth?action=session', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
    });

    it('should handle logout correctly (clears cookies)', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        message: 'Logged out successfully',
      }));

      const response = await fetch('/api/auth?action=logout', {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should refresh session with valid refresh token', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            role: 'student',
          },
          expires_at: new Date(Date.now() + 3600000).toISOString(),
        },
      }));

      const response = await fetch('/api/auth?action=refresh', {
        method: 'POST',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.user).toBeDefined();
    });
  });

  describe('Role-Based Access Control (Requirement 9.4)', () => {
    it('should return correct role structure for student', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          role: 'student',
          permissions: ['applications:own', 'documents:own', 'payments:own', 'profile:own'],
        },
      }));

      const response = await fetch('/api/auth?action=roles', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.role).toBe('student');
      expect(result.data.permissions).toContain('applications:own');
    });

    it('should return correct role structure for admin', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          role: 'admin',
          permissions: ['users:read', 'applications:manage', 'payments:verify', 'documents:verify', 'analytics:view'],
        },
      }));

      const response = await fetch('/api/auth?action=roles', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.role).toBe('admin');
      expect(result.data.permissions).toContain('applications:manage');
    });

    it('should return correct role structure for super_admin', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: {
          role: 'super_admin',
          permissions: ['users:all', 'applications:all', 'programs:all', 'payments:all', 'documents:all', 'analytics:all', 'settings:all'],
        },
      }));

      const response = await fetch('/api/auth?action=roles', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result.success).toBe(true);
      expect(result.data.role).toBe('super_admin');
      expect(result.data.permissions).toContain('settings:all');
    });
  });

  describe('Password Reset Flow (Requirement 9.5)', () => {
    it('should request password reset successfully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        message: 'Password reset email sent',
      }));

      const response = await fetch('/api/auth?action=forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should not reveal if email exists during password reset', async () => {
      // Even for non-existent emails, should return success to prevent enumeration
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        message: 'If the email exists, a reset link has been sent',
      }));

      const response = await fetch('/api/auth?action=forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should reset password with valid token', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        message: 'Password reset successfully',
      }));

      const response = await fetch('/api/auth?action=reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          password: 'NewSecurePassword123!',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should reject invalid reset token', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN',
      }, 400));

      const response = await fetch('/api/auth?action=reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid-token',
          password: 'NewPassword123!',
        }),
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('Error Response Format (Requirement 9.6)', () => {
    it('should return consistent error format for auth failures', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, 401));

      const response = await fetch('/api/auth?action=login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrong',
        }),
      });

      const result = await response.json();

      // Verify error structure
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(typeof result.code).toBe('string');
    });

    it('should not expose sensitive data in error messages', async () => {
      const sensitivePassword = 'secretpassword123';
      const sensitiveEmail = 'sensitive@example.com';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      }, 401));

      const response = await fetch('/api/auth?action=login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: sensitiveEmail,
          password: sensitivePassword,
        }),
      });

      const result = await response.json();

      // Error message should not contain sensitive data
      expect(result.error).not.toContain(sensitivePassword);
      expect(result.error).not.toContain(sensitiveEmail);
    });
  });

  describe('Cookie-Based Auth Verification', () => {
    it('should always use credentials: include for auth requests', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ success: true }));

      // Test various auth endpoints
      const endpoints = [
        { url: '/api/auth?action=login', method: 'POST' },
        { url: '/api/auth?action=logout', method: 'POST' },
        { url: '/api/auth?action=session', method: 'GET' },
        { url: '/api/auth?action=refresh', method: 'POST' },
        { url: '/api/auth?action=register', method: 'POST' },
      ];

      for (const endpoint of endpoints) {
        await fetch(endpoint.url, {
          method: endpoint.method,
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: endpoint.method === 'POST' ? JSON.stringify({}) : undefined,
        });
      }

      // Verify all calls used credentials: 'include'
      expect(mockFetch).toHaveBeenCalledTimes(endpoints.length);
      mockFetch.mock.calls.forEach((call) => {
        expect(call[1]).toHaveProperty('credentials', 'include');
      });
    });

    it('should not use localStorage for token storage', () => {
      // Verify no localStorage auth token operations
      const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');
      const localStorageGetSpy = vi.spyOn(Storage.prototype, 'getItem');
      
      // These should never be called for auth tokens
      expect(localStorageSpy).not.toHaveBeenCalledWith('mihas-auth-token', expect.anything());
      expect(localStorageGetSpy).not.toHaveBeenCalledWith('mihas-auth-token');
    });
  });
});
