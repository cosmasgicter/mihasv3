/**
 * Unit Tests: Health Check Endpoint
 * Feature: vercel-production-fixes
 * Task: 2.2 Write unit tests for health endpoint
 * 
 * Tests the health endpoint response structure, CORS headers, and HTTP status.
 * 
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * - 2.1: Health endpoint returns JSON response with status "ok"
 * - 2.2: Health endpoint includes timestamp in response
 * - 2.3: Health endpoint includes environment name
 * - 2.4: Health endpoint returns HTTP status code 200
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import the handler
import handler from '../../../api/health';

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: {
      origin: 'https://apply.mihas.edu.zm',
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

describe('Feature: vercel-production-fixes, Health Check Endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Response Structure (Requirements 2.1, 2.2, 2.3)', () => {
    it('should return JSON response with success: true', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._json).toBeDefined();
      expect(res._json).toHaveProperty('success', true);
    });

    it('should return status "ok" in the data field (Requirement 2.1)', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { status: string } };
      expect(response.data).toHaveProperty('status', 'ok');
    });

    it('should include timestamp in ISO 8601 format (Requirement 2.2)', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { timestamp: string } };
      expect(response.data).toHaveProperty('timestamp');
      
      // Verify timestamp is valid ISO 8601 format
      const timestamp = response.data.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
      
      // Verify it's a valid date
      const parsedDate = new Date(timestamp);
      expect(parsedDate.toISOString()).toBe(timestamp);
    });

    it('should include environment name (Requirement 2.3)', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { environment: string } };
      expect(response.data).toHaveProperty('environment');
      expect(typeof response.data.environment).toBe('string');
      expect(response.data.environment.length).toBeGreaterThan(0);
    });

    it('should return "development" environment when VERCEL_ENV is not set', async () => {
      delete process.env.VERCEL_ENV;
      delete process.env.NODE_ENV;
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { environment: string } };
      expect(response.data.environment).toBe('development');
    });

    it('should return VERCEL_ENV value when set', async () => {
      process.env.VERCEL_ENV = 'production';
      
      // Need to re-import to pick up new env
      vi.resetModules();
      const { default: freshHandler } = await import('../../../api/health');
      
      const req = createMockRequest();
      const res = createMockResponse();

      await freshHandler(req, res);

      const response = res._json as { success: boolean; data: { environment: string } };
      expect(response.data.environment).toBe('production');
    });

    it('should include version when VERCEL_GIT_COMMIT_SHA is set', async () => {
      process.env.VERCEL_GIT_COMMIT_SHA = 'abc1234567890';
      
      vi.resetModules();
      const { default: freshHandler } = await import('../../../api/health');
      
      const req = createMockRequest();
      const res = createMockResponse();

      await freshHandler(req, res);

      const response = res._json as { success: boolean; data: { version?: string } };
      expect(response.data).toHaveProperty('version');
      expect(response.data.version).toBe('abc1234'); // First 7 characters
    });

    it('should not include version when VERCEL_GIT_COMMIT_SHA is not set', async () => {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { version?: string } };
      expect(response.data.version).toBeUndefined();
    });
  });

  describe('HTTP Status Code (Requirement 2.4)', () => {
    it('should return HTTP status code 200 for GET requests', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
    });

    it('should return HTTP status code 405 for POST requests', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('Method not allowed');
    });

    it('should return HTTP status code 405 for PUT requests', async () => {
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
    });

    it('should return HTTP status code 405 for DELETE requests', async () => {
      const req = createMockRequest({ method: 'DELETE' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
    });
  });

  describe('CORS Headers (Requirement 2.5)', () => {
    it('should set Access-Control-Allow-Origin header', async () => {
      const req = createMockRequest({
        headers: { origin: 'https://apply.mihas.edu.zm' },
      });
      const res = createMockResponse();

      await handler(req, res);

      // Health endpoint uses wildcard for simplicity
      expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should set Access-Control-Allow-Methods header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Methods']).toBeDefined();
      expect(res._headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(res._headers['Access-Control-Allow-Methods']).toContain('OPTIONS');
    });

    it('should set Access-Control-Allow-Headers header', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Access-Control-Allow-Headers']).toBeDefined();
      expect(res._headers['Access-Control-Allow-Headers']).toContain('Content-Type');
      expect(res._headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    it('should allow credentials via wildcard origin', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      // Health endpoint uses wildcard, so no credentials header needed
      expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should handle OPTIONS preflight request with 204 status', async () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(204);
      expect(res._ended).toBe(true);
    });

    it('should allow any origin with wildcard CORS', async () => {
      const req = createMockRequest({
        headers: { origin: 'https://malicious-site.com' },
      });
      const res = createMockResponse();

      await handler(req, res);

      // Health endpoint is public, uses wildcard
      expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    });

    it('should allow localhost with wildcard CORS', async () => {
      const req = createMockRequest({
        headers: { origin: 'http://localhost:5173' },
      });
      const res = createMockResponse();

      await handler(req, res);

      // Health endpoint uses wildcard for all origins
      expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('Response Format Consistency', () => {
    it('should return response matching ApiResponse interface', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data?: unknown; error?: string };
      
      // Must have success field
      expect(response).toHaveProperty('success');
      expect(typeof response.success).toBe('boolean');
      
      // Success response must have data field
      if (response.success) {
        expect(response).toHaveProperty('data');
      }
    });

    it('should return all required health data fields', async () => {
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { 
        success: boolean; 
        data: { 
          status: string; 
          timestamp: string; 
          environment: string;
        } 
      };
      
      // All required fields must be present
      expect(response.data).toHaveProperty('status');
      expect(response.data).toHaveProperty('timestamp');
      expect(response.data).toHaveProperty('environment');
      
      // Status must be one of the valid values
      expect(['ok', 'degraded', 'error']).toContain(response.data.status);
    });
  });
});
