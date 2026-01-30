/**
 * Unit Tests: Auth Roles Endpoint
 * Feature: bun-vercel-runtime-forensics
 * Task: 10.1 Test auth-roles endpoint
 * 
 * Tests the auth-roles endpoint response structure, authentication, and role permissions.
 * 
 * **Validates: Requirements 9.4**
 * - Returns correct role data structure
 * - Returns 401 on missing/invalid token
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock the supabaseClient module before importing handler
vi.mock('../../../api/_lib/supabaseClient', () => ({
  getUserFromRequest: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

// Import after mocking
import handler from '../../../api/auth-roles';
import { getUserFromRequest } from '../../../api/_lib/supabaseClient';

const mockGetUserFromRequest = vi.mocked(getUserFromRequest);

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'GET',
    headers: {
      origin: 'https://apply.mihas.edu.zm',
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

describe('Feature: bun-vercel-runtime-forensics, Auth Roles Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Authentication (Requirement 9.4)', () => {
    it('should return 401 when no authorization header is provided', async () => {
      mockGetUserFromRequest.mockResolvedValue({ error: 'No authorization header' });
      
      const req = createMockRequest({
        headers: { origin: 'https://apply.mihas.edu.zm' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('No authorization header');
    });

    it('should return 401 when token is invalid', async () => {
      mockGetUserFromRequest.mockResolvedValue({ error: 'Invalid token' });
      
      const req = createMockRequest({
        headers: { 
          origin: 'https://apply.mihas.edu.zm',
          authorization: 'Bearer invalid-token',
        },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
    });

    it('should return 401 when token is expired', async () => {
      mockGetUserFromRequest.mockResolvedValue({ error: 'Token expired' });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(401);
    });
  });

  describe('Response Structure (Requirement 9.4)', () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'student@example.com',
      role: 'student',
      user_metadata: { role: 'student' },
    };

    it('should return correct role data structure for authenticated user', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: mockUser,
        roles: ['student'],
        isAdmin: false,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      const response = res._json as { 
        success: boolean; 
        data: { 
          user_id: string;
          email: string;
          role: string;
          roles: string[];
          permissions: string[];
          is_admin: boolean;
        } 
      };
      
      expect(response.success).toBe(true);
      expect(response.data).toHaveProperty('user_id');
      expect(response.data).toHaveProperty('email');
      expect(response.data).toHaveProperty('role');
      expect(response.data).toHaveProperty('roles');
      expect(response.data).toHaveProperty('permissions');
      expect(response.data).toHaveProperty('is_admin');
    });

    it('should return student permissions for student role', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: { ...mockUser, role: 'student' },
        roles: ['student'],
        isAdmin: false,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { permissions: string[] } };
      expect(response.data.permissions).toContain('applications:create');
      expect(response.data.permissions).toContain('applications:read_own');
      expect(response.data.permissions).toContain('profile:read_own');
    });

    it('should return admin permissions for admin role', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: { ...mockUser, role: 'admin' },
        roles: ['admin'],
        isAdmin: true,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { permissions: string[]; is_admin: boolean } };
      expect(response.data.is_admin).toBe(true);
      expect(response.data.permissions).toContain('applications:read');
      expect(response.data.permissions).toContain('applications:review');
      expect(response.data.permissions).toContain('analytics:read');
    });

    it('should return super_admin permissions for super_admin role', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: { ...mockUser, role: 'super_admin' },
        roles: ['super_admin'],
        isAdmin: true,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { permissions: string[] } };
      expect(response.data.permissions).toContain('users:write');
      expect(response.data.permissions).toContain('users:delete');
      expect(response.data.permissions).toContain('settings:write');
    });

    it('should return reviewer permissions for reviewer role', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: { ...mockUser, role: 'reviewer' },
        roles: ['reviewer'],
        isAdmin: false,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      const response = res._json as { success: boolean; data: { permissions: string[] } };
      expect(response.data.permissions).toContain('applications:read');
      expect(response.data.permissions).toContain('applications:review');
      expect(response.data.permissions).toContain('documents:read');
      // Reviewer should NOT have write permissions
      expect(response.data.permissions).not.toContain('applications:write');
    });
  });

  describe('HTTP Methods', () => {
    it('should return 405 for POST requests', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('Method not allowed');
    });

    it('should return 405 for PUT requests', async () => {
      const req = createMockRequest({ method: 'PUT' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
    });

    it('should return 405 for DELETE requests', async () => {
      const req = createMockRequest({ method: 'DELETE' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(405);
    });

    it('should return 200 for HEAD requests (health check)', async () => {
      const req = createMockRequest({ method: 'HEAD' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      expect(res._ended).toBe(true);
    });
  });

  describe('CORS Headers', () => {
    it('should handle OPTIONS preflight request', async () => {
      const req = createMockRequest({ method: 'OPTIONS' });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(204);
      expect(res._ended).toBe(true);
    });
  });

  describe('Content-Type Header', () => {
    it('should set Content-Type to application/json for success response', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'test@example.com',
          role: 'student',
          user_metadata: {},
        },
        roles: ['student'],
        isAdmin: false,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Content-Type']).toBe('application/json');
    });

    it('should set Content-Type to application/json for error response', async () => {
      mockGetUserFromRequest.mockResolvedValue({ error: 'Unauthorized' });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._headers['Content-Type']).toBe('application/json');
    });
  });
});
