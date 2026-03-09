/**
 * Property Test: HEAD Method Support for API Endpoints
 * Feature: admin-system-health-fixes
 * Property 1: HEAD Method Support for API Endpoints
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3**
 * - 1.1: WHEN a HEAD request is sent to /api/applications, THE API_Endpoint SHALL return a 200 status with appropriate headers
 * - 1.2: WHEN a HEAD request is sent to /api/notifications, THE API_Endpoint SHALL return a 200 status with appropriate headers
 * - 1.3: WHEN a HEAD request is sent to any consolidated API endpoint, THE API_Endpoint SHALL handle the request without requiring authentication
 * 
 * For any consolidated API endpoint (/api/applications, /api/notifications, /api/admin, etc.), 
 * sending a HEAD request SHALL return a 200 status code without requiring authentication.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// List of all consolidated API endpoints
const API_ENDPOINTS = [
  'applications',
  'notifications',
  'admin',
  'auth',
  'catalog',
  'documents',
  'payments',
  'sessions',
] as const;

type ApiEndpoint = typeof API_ENDPOINTS[number];

/**
 * Create a mock VercelRequest object for HEAD requests
 */
function createMockRequest(method: string = 'HEAD', headers: Record<string, string> = {}): VercelRequest {
  return {
    method,
    headers: {
      origin: 'https://apply.mihas.edu.zm',
      ...headers,
    },
    query: {},
    body: {},
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

/**
 * Dynamically import and test an API handler
 */
async function testHeadRequest(endpoint: ApiEndpoint): Promise<{
  status: number;
  ended: boolean;
  hasJson: boolean;
  headers: Record<string, string>;
}> {
  // Dynamic import of the handler
  const module = await import(`../../../api/${endpoint}`);
  const handler = module.default;
  
  const req = createMockRequest('HEAD');
  const res = createMockResponse();
  
  await handler(req, res);
  
  return {
    status: res._status,
    ended: res._ended,
    hasJson: res._json !== null,
    headers: res._headers,
  };
}

describe('Feature: admin-system-health-fixes, Property 1: HEAD Method Support for API Endpoints', () => {
  
  // Mock Supabase to avoid actual database calls
  beforeEach(() => {
    vi.mock('../../../api/_lib/supabaseClient', () => ({
      supabaseAdmin: {
        from: () => ({
          select: () => ({ data: [], error: null }),
        }),
        auth: {
          getUser: () => ({ data: { user: null }, error: { message: 'No token' } }),
        },
      },
      getUserFromRequest: () => Promise.resolve({ error: 'Unauthorized' }),
    }));
  });

  describe('Property: HEAD requests return 200 without authentication (Requirements 1.1, 1.2, 1.3)', () => {
    
    it('should return 200 for HEAD request to any API endpoint', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          async (endpoint) => {
            const result = await testHeadRequest(endpoint);
            
            // HEAD request should return 200
            expect(result.status).toBe(200);
            
            // HEAD request should end without body
            expect(result.ended).toBe(true);
            
            // HEAD request should not return JSON body
            expect(result.hasJson).toBe(false);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return 200 for HEAD request to /api/applications (Requirement 1.1)', async () => {
      const result = await testHeadRequest('applications');
      
      expect(result.status).toBe(200);
      expect(result.ended).toBe(true);
      expect(result.hasJson).toBe(false);
    });

    it('should return 200 for HEAD request to /api/notifications (Requirement 1.2)', async () => {
      const result = await testHeadRequest('notifications');
      
      expect(result.status).toBe(200);
      expect(result.ended).toBe(true);
      expect(result.hasJson).toBe(false);
    });

    it('should set CORS headers for HEAD requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          async (endpoint) => {
            const result = await testHeadRequest(endpoint);
            
            // CORS headers should be set
            expect(result.headers).toHaveProperty('Access-Control-Allow-Origin');
            expect(result.headers).toHaveProperty('Access-Control-Allow-Methods');
            expect(result.headers).toHaveProperty('Access-Control-Allow-Headers');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: HEAD requests do not require authentication (Requirement 1.3)', () => {
    
    it('should not require Authorization header for HEAD requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          async (endpoint) => {
            // Import handler dynamically
            const module = await import(`../../../api/${endpoint}`);
            const handler = module.default;
            
            // Create request without Authorization header
            const req = createMockRequest('HEAD', {});
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should still return 200 (not 401 Unauthorized)
            expect(res._status).toBe(200);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should bypass authentication check for HEAD requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          fc.option(fc.string(), { nil: undefined }),
          async (endpoint, authHeader) => {
            const module = await import(`../../../api/${endpoint}`);
            const handler = module.default;
            
            // Create request with or without auth header
            const headers: Record<string, string> = {};
            if (authHeader !== undefined) {
              headers['Authorization'] = authHeader;
            }
            
            const req = createMockRequest('HEAD', headers);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // HEAD should always return 200 regardless of auth
            expect(res._status).toBe(200);
            expect(res._ended).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: HEAD requests are handled before other logic', () => {
    
    it('should handle HEAD before checking query parameters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          fc.dictionary(fc.string(), fc.string()),
          async (endpoint, queryParams) => {
            const module = await import(`../../../api/${endpoint}`);
            const handler = module.default;
            
            const req = {
              method: 'HEAD',
              headers: { origin: 'https://apply.mihas.edu.zm' },
              query: queryParams,
              body: {},
            } as unknown as VercelRequest;
            
            const res = createMockResponse();
            
            await handler(req, res);
            
            // HEAD should return 200 regardless of query params
            expect(res._status).toBe(200);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle HEAD before checking request body', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          fc.dictionary(fc.string(), fc.jsonValue()),
          async (endpoint, body) => {
            const module = await import(`../../../api/${endpoint}`);
            const handler = module.default;
            
            const req = {
              method: 'HEAD',
              headers: { origin: 'https://apply.mihas.edu.zm' },
              query: {},
              body,
            } as unknown as VercelRequest;
            
            const res = createMockResponse();
            
            await handler(req, res);
            
            // HEAD should return 200 regardless of body
            expect(res._status).toBe(200);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: HEAD response has no body', () => {
    
    it('should return empty body for all HEAD requests', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...API_ENDPOINTS),
          async (endpoint) => {
            const result = await testHeadRequest(endpoint);
            
            // Response should have no JSON body
            expect(result.hasJson).toBe(false);
            
            // Response should be ended (not streaming)
            expect(result.ended).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
