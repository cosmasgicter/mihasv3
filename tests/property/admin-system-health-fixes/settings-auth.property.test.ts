/**
 * Property Test: Settings Authentication Requirement
 * Feature: admin-system-health-fixes
 * Property 3: Settings Authentication Requirement
 * 
 * **Validates: Requirements 2.6**
 * - 2.6: WHEN any settings action is performed, THE API_Endpoint SHALL require admin authentication
 * 
 * For any settings action (GET, POST, PUT, DELETE) on /api/admin?action=settings, 
 * requests without valid admin authentication SHALL be rejected with 401 status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * HTTP methods that the settings action supports
 */
const SETTINGS_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;
type SettingsMethod = typeof SETTINGS_METHODS[number];

/**
 * Generate a valid setting key
 */
const settingKeyArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,50}$/).filter(key => 
  key.length >= 3 && key.length <= 50 && !key.includes('__')
);

/**
 * Generate a valid setting value
 */
const settingValueArb = fc.string({ minLength: 1, maxLength: 500 }).filter(v => v.trim().length > 0);

/**
 * Generate a valid request body for each method
 */
function generateBodyForMethod(method: SettingsMethod): fc.Arbitrary<unknown> {
  switch (method) {
    case 'GET':
      return fc.constant({});
    case 'POST':
      return fc.record({
        setting_key: settingKeyArb,
        setting_value: settingValueArb,
      });
    case 'PUT':
      return fc.record({
        setting_key: settingKeyArb,
        setting_value: settingValueArb,
      });
    case 'DELETE':
      return fc.oneof(
        fc.record({ id: fc.uuid() }),
        fc.record({ setting_key: settingKeyArb })
      );
  }
}

/**
 * Generate invalid/missing authorization headers
 */
const invalidAuthHeaderArb = fc.oneof(
  // No authorization header at all
  fc.constant(undefined),
  // Empty authorization header
  fc.constant(''),
  // Bearer with no token
  fc.constant('Bearer '),
  // Bearer with whitespace only
  fc.constant('Bearer   '),
  // Invalid token format (not a JWT)
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `Bearer ${s}`),
  // Malformed JWT (wrong number of parts)
  fc.string({ minLength: 10, maxLength: 30 }).map(s => `Bearer ${s}.${s}`),
  // Basic auth instead of Bearer
  fc.string({ minLength: 5, maxLength: 20 }).map(s => `Basic ${Buffer.from(s).toString('base64')}`),
);

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(
  method: string,
  authHeader: string | undefined,
  body: unknown = {}
): VercelRequest {
  const headers: Record<string, string> = {
    origin: '***REMOVED***',
  };
  
  if (authHeader !== undefined) {
    headers.authorization = authHeader;
  }
  
  return {
    method,
    headers,
    query: { action: 'settings' },
    body,
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

describe('Feature: admin-system-health-fixes, Property 3: Settings Authentication Requirement', () => {
  
  beforeEach(() => {
    // Mock Supabase client to return auth errors for invalid tokens
    vi.mock('../../../api/_lib/supabaseClient', () => ({
      supabaseAdmin: {
        from: () => ({
          select: () => ({
            order: () => ({ data: [], error: null }),
            single: () => ({ data: null, error: { code: 'PGRST116', message: 'Not found' } }),
            eq: () => ({
              single: () => ({ data: null, error: { code: 'PGRST116', message: 'Not found' } }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: () => ({ data: null, error: { message: 'Unauthorized' } }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () => ({ data: null, error: { message: 'Unauthorized' } }),
              }),
            }),
          }),
          delete: () => ({
            eq: () => ({ error: null }),
          }),
        }),
      },
      getUserFromRequest: vi.fn().mockImplementation(async (req: VercelRequest, options?: { requireAdmin?: boolean }) => {
        const authHeader = req.headers.authorization || req.headers.Authorization as string;
        
        // No auth header
        if (!authHeader) {
          return { error: 'No authorization header provided' };
        }
        
        // Empty or whitespace-only token
        const token = authHeader.replace(/^Bearer\s*/i, '').trim();
        if (!token) {
          return { error: 'Invalid authorization header' };
        }
        
        // Check for valid JWT format (3 parts separated by dots)
        const parts = token.split('.');
        if (parts.length !== 3) {
          return { error: 'Invalid token format' };
        }
        
        // Check if it's a valid base64 encoded JWT payload
        try {
          const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const decoded = Buffer.from(base64, 'base64').toString('utf-8');
          const payload = JSON.parse(decoded);
          
          // Check for required fields
          if (!payload.sub) {
            return { error: 'Invalid token payload' };
          }
          
          // Check expiration
          if (payload.exp && payload.exp < Date.now() / 1000) {
            return { error: 'Token expired' };
          }
          
          // For this test, we simulate non-admin users
          if (options?.requireAdmin) {
            // Check if user has admin role
            const role = payload.role || payload.user_metadata?.role;
            if (role !== 'admin' && role !== 'super_admin') {
              return { error: 'Access denied. You do not have permission for this action.' };
            }
          }
          
          return {
            user: { id: payload.sub, email: 'test@test.com', role: 'student' },
            roles: ['student'],
            isAdmin: false,
          };
        } catch {
          return { error: 'Invalid token format' };
        }
      }),
      AuthContext: {},
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Property: Requests without valid auth are rejected with 401 (Requirement 2.6)', () => {
    
    it('should reject GET requests without valid authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidAuthHeaderArb,
          async (authHeader) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            const req = createMockRequest('GET', authHeader);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 401 Unauthorized
            expect(res._status).toBe(401);
            
            // Response should indicate authentication failure
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject POST requests without valid authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidAuthHeaderArb,
          generateBodyForMethod('POST'),
          async (authHeader, body) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            const req = createMockRequest('POST', authHeader, body);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 401 Unauthorized
            expect(res._status).toBe(401);
            
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject PUT requests without valid authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidAuthHeaderArb,
          generateBodyForMethod('PUT'),
          async (authHeader, body) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            const req = createMockRequest('PUT', authHeader, body);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 401 Unauthorized
            expect(res._status).toBe(401);
            
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject DELETE requests without valid authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidAuthHeaderArb,
          generateBodyForMethod('DELETE'),
          async (authHeader, body) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            const req = createMockRequest('DELETE', authHeader, body);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 401 Unauthorized
            expect(res._status).toBe(401);
            
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: All HTTP methods require authentication (Requirement 2.6)', () => {
    
    it('should reject any settings method without authentication', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SETTINGS_METHODS),
          invalidAuthHeaderArb,
          async (method, authHeader) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            // Generate appropriate body for the method
            let body = {};
            if (method === 'POST' || method === 'PUT') {
              body = { setting_key: 'test_key', setting_value: 'test_value' };
            } else if (method === 'DELETE') {
              body = { setting_key: 'test_key' };
            }
            
            const req = createMockRequest(method, authHeader, body);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 401 Unauthorized
            expect(res._status).toBe(401);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Non-admin users are rejected (Requirement 2.6)', () => {
    
    it('should reject requests from non-admin users', async () => {
      // Create a valid JWT token for a non-admin user
      const createNonAdminToken = () => {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
          sub: 'user-123',
          email: 'student@test.com',
          role: 'student',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
        })).toString('base64url');
        const signature = 'fake-signature';
        return `Bearer ${header}.${payload}.${signature}`;
      };
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SETTINGS_METHODS),
          async (method) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            let body = {};
            if (method === 'POST' || method === 'PUT') {
              body = { setting_key: 'test_key', setting_value: 'test_value' };
            } else if (method === 'DELETE') {
              body = { setting_key: 'test_key' };
            }
            
            const req = createMockRequest(method, createNonAdminToken(), body);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Should return 401 (access denied for non-admin)
            expect(res._status).toBe(401);
            
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Error responses have consistent format', () => {
    
    it('should return consistent error format for all auth failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...SETTINGS_METHODS),
          invalidAuthHeaderArb,
          async (method, authHeader) => {
            const module = await import('../../../api/admin');
            const handler = module.default;
            
            let body = {};
            if (method === 'POST' || method === 'PUT') {
              body = { setting_key: 'test_key', setting_value: 'test_value' };
            } else if (method === 'DELETE') {
              body = { setting_key: 'test_key' };
            }
            
            const req = createMockRequest(method, authHeader, body);
            const res = createMockResponse();
            
            await handler(req, res);
            
            // Response should have consistent error format
            const response = res._json as { success: boolean; error: string; code?: string };
            
            expect(response).toHaveProperty('success');
            expect(response.success).toBe(false);
            expect(response).toHaveProperty('error');
            expect(typeof response.error).toBe('string');
            expect(response.error.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
