/**
 * Unit Tests: Sessions Endpoint
 * Feature: bun-vercel-runtime-forensics
 * Task: 10.2 Test sessions endpoint
 * 
 * Tests the sessions endpoint for session tracking functionality.
 * 
 * **Validates: Requirements 9.3**
 * - Session tracking works
 * - Returns 401 on missing/invalid token
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock the supabaseClient module before importing handler
vi.mock('../../../api/_lib/supabaseClient', () => ({
  getUserFromRequest: vi.fn(),
  supabaseAdmin: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
  },
}));

// Import after mocking
import handler from '../../../api/sessions';
import { getUserFromRequest, supabaseAdmin } from '../../../api/_lib/supabaseClient';

const mockGetUserFromRequest = vi.mocked(getUserFromRequest);
const mockSupabaseAdmin = vi.mocked(supabaseAdmin);

/**
 * Create a mock VercelRequest object
 */
function createMockRequest(overrides: Partial<VercelRequest> = {}): VercelRequest {
  return {
    method: 'POST',
    headers: {
      origin: 'https://apply.mihas.edu.zm',
      authorization: 'Bearer test-token',
    },
    query: { action: 'track' },
    body: {
      device_id: 'test-device-123',
      device_info: 'Chrome on Windows',
    },
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

describe('Feature: bun-vercel-runtime-forensics, Sessions Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock for supabaseAdmin.from().upsert()
    mockSupabaseAdmin.from.mockReturnValue({
      upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    } as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Authentication (Requirement 9.3)', () => {
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
  });

  describe('Session Tracking (Requirement 9.3)', () => {
    const mockUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'student@example.com',
    };

    it('should successfully track a session', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: mockUser,
        roles: ['student'],
        isAdmin: false,
      });
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      const response = res._json as { success: boolean; data: { tracked: boolean } };
      expect(response.success).toBe(true);
      expect(response.data.tracked).toBe(true);
    });

    it('should return 400 when device_id is missing', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: mockUser,
        roles: ['student'],
        isAdmin: false,
      });
      
      const req = createMockRequest({
        body: { device_info: 'Chrome on Windows' }, // Missing device_id
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(400);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('device_id required');
    });

    it('should handle database errors gracefully', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: mockUser,
        roles: ['student'],
        isAdmin: false,
      });
      
      mockSupabaseAdmin.from.mockReturnValue({
        upsert: vi.fn(() => Promise.resolve({ 
          data: null, 
          error: { message: 'Database connection failed' } 
        })),
      } as any);
      
      const req = createMockRequest();
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(500);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('Failed to track session');
    });

    it('should use default device_info when not provided', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: mockUser,
        roles: ['student'],
        isAdmin: false,
      });
      
      const upsertMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
      mockSupabaseAdmin.from.mockReturnValue({
        upsert: upsertMock,
      } as any);
      
      const req = createMockRequest({
        body: { device_id: 'test-device-123' }, // No device_info
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(200);
      // Verify upsert was called with 'Unknown' as device_info
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          device_info: 'Unknown',
        }),
        expect.any(Object)
      );
    });
  });

  describe('HTTP Methods', () => {
    it('should return 405 for GET requests', async () => {
      const req = createMockRequest({ method: 'GET' });
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

  describe('Invalid Actions', () => {
    it('should return 400 for invalid action', async () => {
      mockGetUserFromRequest.mockResolvedValue({
        user: { id: '123', email: 'test@example.com' },
        roles: ['student'],
        isAdmin: false,
      });
      
      const req = createMockRequest({
        query: { action: 'invalid-action' },
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._status).toBe(400);
      const response = res._json as { success: boolean; error: string };
      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid action');
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
        user: { id: '123', email: 'test@example.com' },
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
