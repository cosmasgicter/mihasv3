/**
 * Unit Tests: Catch-All 404 Handler
 * Feature: vercel-production-fixes, admin-system-health-fixes
 * Task: 7.1 Add 404 handler for non-existent API routes
 * Task: 8.1 Add helpful 404 for legacy admin-settings endpoint
 * 
 * Tests the catch-all 404 handler for non-existent API routes.
 * 
 * **Validates: Requirements 1.5, 2.5, 6.4**
 * - 1.5: Non-existent API paths return 404 JSON error response
 * - 2.5: Legacy /api/admin-settings returns 404 with guidance to use /api/admin?action=settings
 * - 6.4: Error response format is consistent: { success: false, error: string, code?: string }
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the handler
import handler from '../../../api/[...path]';

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    url: '/api/nonexistent',
    headers: {
      origin: '***REMOVED***',
    },
    query: {},
    body: null,
    ...overrides,
  } as unknown as VercelRequest;
}

/**
 * Create a mock VercelResponse object with tracking
 */
function createMockResponse(): VercelResponse & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _ended: boolean;
} {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    _ended: false,
    
    status(code: number) {
      this._status = code;
      return this;
    },
    
    json(data: unknown) {
      this._json = data;
      return this;
    },
    
    setHeader(key: string, value: string) {
      this._headers[key] = value;
      return this;
    },
    
    end() {
      this._ended = true;
      return this;
    },
  };
  
  return res as unknown as VercelResponse & {
    _status: number;
    _json: unknown;
    _headers: Record<string, string>;
    _ended: boolean;
  };
}

describe('Feature: vercel-production-fixes, Catch-All 404 Handler', () => {
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    // Mock console.warn to prevent test output noise
    console.warn = vi.fn();
  });

  afterEach(() => {
    console.warn = originalConsoleWarn;
  });

  describe('404 Response (Requirement 1.5)', () => {
    it('should return HTTP status code 404 for non-existent routes', async () => {
      const req = createMockRequest({ url: '/api/nonexistent' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it('should return JSON response with success: false', async () => {
      const req = createMockRequest({ url: '/api/unknown-endpoint' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._json).toBeDefined();
      expect(res._json).toHaveProperty('success', false);
    });

    it('should return error message "API endpoint not found"', async () => {
      const req = createMockRequest({ url: '/api/does-not-exist' });
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; error: string };
      expect(response.error).toBe('API endpoint not found');
    });

    it('should return error code "NOT_FOUND"', async () => {
      const req = createMockRequest({ url: '/api/missing' });
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; error: string; code?: string };
      expect(response.code).toBe('NOT_FOUND');
    });
  });

  describe('Error Response Format (Requirement 6.4)', () => {
    it('should return response matching ApiErrorResponse interface', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; error?: string; code?: string };
      
      // Must have success field set to false
      expect(response).toHaveProperty('success', false);
      
      // Must have error string
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error!.length).toBeGreaterThan(0);
      
      // Should have code field
      expect(response).toHaveProperty('code');
      expect(typeof response.code).toBe('string');
    });

    it('should not expose internal details in error response', async () => {
      const req = createMockRequest({ url: '/api/some/nested/path' });
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; error: string };
      
      // Error message should be generic, not expose file paths or stack traces
      expect(response.error).not.toContain('.ts');
      expect(response.error).not.toContain('Error:');
      expect(response.error).not.toContain('at ');
    });
  });

  describe('HTTP Methods', () => {
    it('should return 404 for GET requests', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it('should return 404 for POST requests', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it('should return 404 for PUT requests', async () => {
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it('should return 404 for DELETE requests', async () => {
      const req = createMockRequest({ method: 'DELETE' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
    });

    it('should return 404 for PATCH requests', async () => {
      const req = createMockRequest({ method: 'PATCH' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
    });
  });

  describe('CORS Headers', () => {
    it('should set Access-Control-Allow-Origin header', async () => {
      const req = createMockRequest({
        headers: { origin: '***REMOVED***' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Origin']).toBe('***REMOVED***');
    });

    it('should set Access-Control-Allow-Methods header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Methods']).toBeDefined();
    });

    it('should set Access-Control-Allow-Headers header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Headers']).toBeDefined();
    });

    it('should handle OPTIONS preflight request with 204 status', async () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(204);
      expect(res._ended).toBe(true);
    });

    it('should set CORS headers for localhost development', async () => {
      const req = createMockRequest({
        headers: { origin: 'http://localhost:5173' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });
  });

  describe('Logging', () => {
    it('should log 404 requests for monitoring', async () => {
      const req = createMockRequest({ url: '/api/test-path' });
      const res = createMockResponse();

      await handler(req, res);

      expect(console.warn).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('[api/404]')
      );
    });

    it('should include requested path in log message', async () => {
      const req = createMockRequest({ url: '/api/some/path' });
      const res = createMockResponse();

      await handler(req, res);

      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('/api/some/path')
      );
    });
  });

  describe('Various Path Patterns', () => {
    it('should handle simple non-existent paths', async () => {
      const req = createMockRequest({ url: '/api/foo' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      expect((res._json as { success: boolean }).success).toBe(false);
    });

    it('should handle nested non-existent paths', async () => {
      const req = createMockRequest({ url: '/api/foo/bar/baz' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      expect((res._json as { success: boolean }).success).toBe(false);
    });

    it('should handle paths with query parameters', async () => {
      const req = createMockRequest({ url: '/api/nonexistent?action=test&id=123' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      expect((res._json as { success: boolean }).success).toBe(false);
    });

    it('should handle undefined url gracefully', async () => {
      const req = createMockRequest({ url: undefined });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      expect((res._json as { success: boolean }).success).toBe(false);
    });
  });

  describe('Legacy Admin Settings Endpoint Guidance (Requirement 2.5)', () => {
    it('should return 404 with helpful message for /api/admin-settings', async () => {
      const req = createMockRequest({ url: '/api/admin-settings' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      const response = res._json as { success: boolean; error: string; code?: string };
      expect(response.success).toBe(false);
      expect(response.error).toContain('/api/admin?action=settings');
      expect(response.error).toContain('consolidated');
    });

    it('should return 404 with helpful message for /api/admin-settings with query params', async () => {
      const req = createMockRequest({ url: '/api/admin-settings?id=123' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      const response = res._json as { success: boolean; error: string };
      expect(response.error).toContain('/api/admin?action=settings');
    });

    it('should return 404 with helpful message for POST to /api/admin-settings', async () => {
      const req = createMockRequest({ method: 'POST', url: '/api/admin-settings' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      const response = res._json as { success: boolean; error: string };
      expect(response.error).toContain('/api/admin?action=settings');
    });

    it('should return 404 with helpful message for PUT to /api/admin-settings', async () => {
      const req = createMockRequest({ method: 'PUT', url: '/api/admin-settings' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      const response = res._json as { success: boolean; error: string };
      expect(response.error).toContain('/api/admin?action=settings');
    });

    it('should return 404 with helpful message for DELETE to /api/admin-settings', async () => {
      const req = createMockRequest({ method: 'DELETE', url: '/api/admin-settings' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      const response = res._json as { success: boolean; error: string };
      expect(response.error).toContain('/api/admin?action=settings');
    });

    it('should return generic 404 for other non-existent endpoints', async () => {
      const req = createMockRequest({ url: '/api/other-endpoint' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(404);
      const response = res._json as { success: boolean; error: string };
      expect(response.error).toBe('API endpoint not found');
      expect(response.error).not.toContain('/api/admin?action=settings');
    });
  });
});
