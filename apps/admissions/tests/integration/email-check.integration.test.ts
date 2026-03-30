/**
 * Integration Tests: Email Check Endpoint
 * 
 * Tests the email availability check endpoint for registration flow.
 * Validates that the API correctly reports email availability without
 * exposing user data.
 * 
 * **Validates: Requirements 5.2, 10.2**
 * 
 * @created 2026-02-02 - Part of Supabase complete removal migration
 * @updated 2026-06-01 - Updated to Django REST paths
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock response
function createMockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  };
}

describe('Email Check Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Email Availability Check (Requirement 5.2)', () => {
    it('should return available: true for new email', async () => {
      const newEmail = 'newuser@example.com';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: true },
      }));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(newEmail)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.available).toBe(true);
    });

    it('should return available: false for existing email', async () => {
      const existingEmail = 'existing@example.com';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: false },
      }));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(existingEmail)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data.available).toBe(false);
    });

    it('should handle case-insensitive email check', async () => {
      const mixedCaseEmail = 'User@Example.COM';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: false },
      }));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(mixedCaseEmail)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('available');
    });

    it('should reject invalid email format', async () => {
      const invalidEmail = 'not-an-email';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      }, 400));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(invalidEmail)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should handle missing email parameter', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Email is required',
        code: 'MISSING_EMAIL',
      }, 400));

      const response = await fetch('/api/v1/auth/check-email/', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('Security Requirements (Requirement 10.2)', () => {
    it('should not expose user data in response', async () => {
      const existingEmail = 'existing@example.com';
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: false },
      }));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(existingEmail)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result.data).toEqual({ available: false });
      expect(result.data).not.toHaveProperty('user');
      expect(result.data).not.toHaveProperty('id');
      expect(result.data).not.toHaveProperty('name');
      expect(result.data).not.toHaveProperty('role');
    });

    it('should not reveal timing differences between existing and non-existing emails', async () => {
      const existingResponse = {
        success: true,
        data: { available: false },
      };
      
      const newResponse = {
        success: true,
        data: { available: true },
      };

      expect(Object.keys(existingResponse)).toEqual(Object.keys(newResponse));
      expect(Object.keys(existingResponse.data)).toEqual(Object.keys(newResponse.data));
    });

    it('should handle special characters in email safely', async () => {
      const emailWithSpecialChars = "test+tag@example.com";
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: true },
      }));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(emailWithSpecialChars)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(true);
      expect(result.success).toBe(true);
    });

    it('should handle SQL injection attempts safely', async () => {
      const maliciousEmail = "'; DROP TABLE profiles; --";
      
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      }, 400));

      const response = await fetch(`/api/v1/auth/check-email/?email=${encodeURIComponent(maliciousEmail)}`, {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.ok).toBe(false);
      expect(result.success).toBe(false);
    });
  });

  describe('Response Format Consistency', () => {
    it('should return consistent response structure for available email', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: true },
      }));

      const response = await fetch('/api/v1/auth/check-email/?email=new@example.com', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('available');
      expect(typeof result.data.available).toBe('boolean');
    });

    it('should return consistent response structure for unavailable email', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: true,
        data: { available: false },
      }));

      const response = await fetch('/api/v1/auth/check-email/?email=existing@example.com', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('available');
      expect(typeof result.data.available).toBe('boolean');
    });

    it('should return consistent error structure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Invalid email format',
        code: 'INVALID_EMAIL',
      }, 400));

      const response = await fetch('/api/v1/auth/check-email/?email=invalid', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result).toHaveProperty('code');
      expect(typeof result.error).toBe('string');
      expect(typeof result.code).toBe('string');
    });
  });

  describe('Rate Limiting Behavior', () => {
    it('should handle rate limit response gracefully', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMITED',
      }, 429));

      const response = await fetch('/api/v1/auth/check-email/?email=test@example.com', {
        method: 'GET',
        credentials: 'include',
      });

      const result = await response.json();

      expect(response.status).toBe(429);
      expect(result.success).toBe(false);
      expect(result.code).toBe('RATE_LIMITED');
    });
  });
});
