/**
 * Property-Based Tests: Authentication Status Codes
 * Feature: bun-vercel-runtime-forensics
 * Task: 10.3 Write property test for auth status codes
 * 
 * **Property 5: Authentication Endpoints Return Correct Status Codes**
 * 
 * *For any* authentication request, the response status code SHALL be:
 * - 200 for success
 * - 401 for invalid credentials/unauthorized
 * - 403 for forbidden access
 * - 400 for validation errors
 * - 405 for method not allowed
 * 
 * **Validates: Requirements 9.2, 9.4, 9.5**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock the supabaseClient module
vi.mock('../../api/_lib/supabaseClient', () => ({
  getUserFromRequest: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

// Import after mocking
import authRolesHandler from '../../api/auth-roles';
import sessionsHandler from '../../api/sessions';
import { getUserFromRequest } from '../../api/_lib/supabaseClient';

const mockGetUserFromRequest = vi.mocked(getUserFromRequest);

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: {
      origin: '***REMOVED***',
      authorization: 'Bearer test-token',
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

// Arbitraries for generating test data
const userIdArbitrary = fc.uuid();
const emailArbitrary = fc.emailAddress();
const roleArbitrary = fc.constantFrom('student', 'admin', 'super_admin', 'reviewer');

const validUserArbitrary = fc.record({
  id: userIdArbitrary,
  email: emailArbitrary,
  role: roleArbitrary,
  user_metadata: fc.constant({}),
});

const authErrorArbitrary = fc.constantFrom(
  'No authorization header',
  'Invalid token',
  'Token expired',
  'User not found',
  'Unauthorized'
);

const httpMethodArbitrary = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH');

describe('Property 5: Authentication Endpoints Return Correct Status Codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('auth-roles endpoint', () => {
    it('PROPERTY: Successful authentication always returns 200', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserArbitrary,
          roleArbitrary,
          async (user, role) => {
            mockGetUserFromRequest.mockResolvedValue({
              user: { ...user, role },
              roles: [role],
              isAdmin: role === 'admin' || role === 'super_admin',
            });
            
            const req = createMockRequest({ method: 'GET' });
            const res = createMockResponse();

            await authRolesHandler(req, res);

            expect(res._status).toBe(200);
            const response = res._json as { success: boolean };
            expect(response.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Authentication errors always return 401', async () => {
      await fc.assert(
        fc.asyncProperty(
          authErrorArbitrary,
          async (errorMessage) => {
            mockGetUserFromRequest.mockResolvedValue({ error: errorMessage });
            
            const req = createMockRequest({ method: 'GET' });
            const res = createMockResponse();

            await authRolesHandler(req, res);

            expect(res._status).toBe(401);
            const response = res._json as { success: boolean };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Non-GET methods always return 405', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('POST', 'PUT', 'DELETE', 'PATCH'),
          async (method) => {
            const req = createMockRequest({ method });
            const res = createMockResponse();

            await authRolesHandler(req, res);

            expect(res._status).toBe(405);
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
            expect(response.error).toBe('Method not allowed');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Response always has valid JSON structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            // Success case
            fc.record({
              type: fc.constant('success'),
              user: validUserArbitrary,
              role: roleArbitrary,
            }),
            // Error case
            fc.record({
              type: fc.constant('error'),
              error: authErrorArbitrary,
            })
          ),
          async (scenario) => {
            if (scenario.type === 'success') {
              const { user, role } = scenario as { type: string; user: any; role: string };
              mockGetUserFromRequest.mockResolvedValue({
                user: { ...user, role },
                roles: [role],
                isAdmin: role === 'admin' || role === 'super_admin',
              });
            } else {
              const { error } = scenario as { type: string; error: string };
              mockGetUserFromRequest.mockResolvedValue({ error });
            }
            
            const req = createMockRequest({ method: 'GET' });
            const res = createMockResponse();

            await authRolesHandler(req, res);

            // Response must be valid JSON with success field
            expect(res._json).toBeDefined();
            expect(typeof (res._json as any).success).toBe('boolean');
            
            // Success responses must have data
            if ((res._json as any).success) {
              expect((res._json as any).data).toBeDefined();
            }
            // Error responses must have error message
            else {
              expect((res._json as any).error).toBeDefined();
              expect(typeof (res._json as any).error).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Status code is always in valid HTTP range', async () => {
      await fc.assert(
        fc.asyncProperty(
          httpMethodArbitrary,
          fc.boolean(), // authenticated or not
          async (method, isAuthenticated) => {
            if (isAuthenticated) {
              mockGetUserFromRequest.mockResolvedValue({
                user: { id: 'test-id', email: 'test@example.com', role: 'student', user_metadata: {} },
                roles: ['student'],
                isAdmin: false,
              });
            } else {
              mockGetUserFromRequest.mockResolvedValue({ error: 'Unauthorized' });
            }
            
            const req = createMockRequest({ method });
            const res = createMockResponse();

            await authRolesHandler(req, res);

            // Status code must be valid HTTP status
            expect(res._status).toBeGreaterThanOrEqual(100);
            expect(res._status).toBeLessThan(600);
            
            // Must be one of expected status codes
            expect([200, 204, 400, 401, 403, 404, 405, 500]).toContain(res._status);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('sessions endpoint', () => {
    it('PROPERTY: Successful session tracking always returns 200', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }), // device_id
          async (user, deviceId) => {
            mockGetUserFromRequest.mockResolvedValue({
              user,
              roles: ['student'],
              isAdmin: false,
            });
            
            const req = createMockRequest({
              method: 'POST',
              query: { action: 'track' },
              body: { device_id: deviceId, device_info: 'Test Device' },
            });
            const res = createMockResponse();

            await sessionsHandler(req, res);

            expect(res._status).toBe(200);
            const response = res._json as { success: boolean };
            expect(response.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Authentication errors always return 401', async () => {
      await fc.assert(
        fc.asyncProperty(
          authErrorArbitrary,
          async (errorMessage) => {
            mockGetUserFromRequest.mockResolvedValue({ error: errorMessage });
            
            const req = createMockRequest({
              method: 'POST',
              query: { action: 'track' },
              body: { device_id: 'test-device' },
            });
            const res = createMockResponse();

            await sessionsHandler(req, res);

            expect(res._status).toBe(401);
            const response = res._json as { success: boolean };
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Missing device_id always returns 400', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserArbitrary,
          async (user) => {
            mockGetUserFromRequest.mockResolvedValue({
              user,
              roles: ['student'],
              isAdmin: false,
            });
            
            const req = createMockRequest({
              method: 'POST',
              query: { action: 'track' },
              body: {}, // Missing device_id
            });
            const res = createMockResponse();

            await sessionsHandler(req, res);

            expect(res._status).toBe(400);
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
            expect(response.error).toBe('device_id required');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Non-POST methods always return 405', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('GET', 'PUT', 'DELETE', 'PATCH'),
          async (method) => {
            const req = createMockRequest({ method });
            const res = createMockResponse();

            await sessionsHandler(req, res);

            expect(res._status).toBe(405);
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
            expect(response.error).toBe('Method not allowed');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: Invalid action always returns 400', async () => {
      await fc.assert(
        fc.asyncProperty(
          validUserArbitrary,
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'track'),
          async (user, invalidAction) => {
            mockGetUserFromRequest.mockResolvedValue({
              user,
              roles: ['student'],
              isAdmin: false,
            });
            
            const req = createMockRequest({
              method: 'POST',
              query: { action: invalidAction },
              body: { device_id: 'test-device' },
            });
            const res = createMockResponse();

            await sessionsHandler(req, res);

            expect(res._status).toBe(400);
            const response = res._json as { success: boolean; error: string };
            expect(response.success).toBe(false);
            expect(response.error).toBe('Invalid action');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cross-endpoint properties', () => {
    it('PROPERTY: All endpoints return Content-Type application/json', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('auth-roles', 'sessions'),
          fc.boolean(), // authenticated
          async (endpoint, isAuthenticated) => {
            if (isAuthenticated) {
              mockGetUserFromRequest.mockResolvedValue({
                user: { id: 'test-id', email: 'test@example.com', role: 'student', user_metadata: {} },
                roles: ['student'],
                isAdmin: false,
              });
            } else {
              mockGetUserFromRequest.mockResolvedValue({ error: 'Unauthorized' });
            }
            
            const res = createMockResponse();
            
            if (endpoint === 'auth-roles') {
              const req = createMockRequest({ method: 'GET' });
              await authRolesHandler(req, res);
            } else {
              const req = createMockRequest({
                method: 'POST',
                query: { action: 'track' },
                body: { device_id: 'test-device' },
              });
              await sessionsHandler(req, res);
            }

            // All responses must have JSON Content-Type
            expect(res._headers['Content-Type']).toBe('application/json');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: HEAD requests always return 200 without body', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('auth-roles', 'sessions'),
          async (endpoint) => {
            const req = createMockRequest({ method: 'HEAD' });
            const res = createMockResponse();
            
            if (endpoint === 'auth-roles') {
              await authRolesHandler(req, res);
            } else {
              await sessionsHandler(req, res);
            }

            expect(res._status).toBe(200);
            expect(res._ended).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('PROPERTY: OPTIONS requests always return 204 for CORS preflight', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('auth-roles', 'sessions'),
          async (endpoint) => {
            const req = createMockRequest({ method: 'OPTIONS' });
            const res = createMockResponse();
            
            if (endpoint === 'auth-roles') {
              await authRolesHandler(req, res);
            } else {
              await sessionsHandler(req, res);
            }

            expect(res._status).toBe(204);
            expect(res._ended).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
