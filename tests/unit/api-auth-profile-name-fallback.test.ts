import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const queryMock = vi.fn();
const verifyPasswordMock = vi.fn();
const generateAccessTokenMock = vi.fn();
const generateRefreshTokenMock = vi.fn();
const verifyAccessTokenMock = vi.fn();
const extractAccessTokenFromCookieMock = vi.fn();
const extractBearerTokenMock = vi.fn();
const setAuthCookiesMock = vi.fn();

vi.mock('../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}));

vi.mock('../../lib/db', () => ({
  query: queryMock,
}));

vi.mock('../../lib/auth/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: verifyPasswordMock,
  isSha256Hash: vi.fn(() => false),
  verifySha256Password: vi.fn(() => false),
  migrateSha256ToBcrypt: vi.fn(),
}));

vi.mock('../../lib/auth/jwt', () => ({
  generateAccessToken: generateAccessTokenMock,
  generateRefreshToken: generateRefreshTokenMock,
  verifyAccessToken: verifyAccessTokenMock,
  verifyRefreshToken: vi.fn(),
}));

vi.mock('../../lib/auth/permissions', () => ({
  getPermissionsForRole: vi.fn(() => ['applications:read']),
}));

vi.mock('../../lib/auth/cookies', () => ({
  setAuthCookies: setAuthCookiesMock,
  clearAuthCookies: vi.fn(),
  extractAccessTokenFromCookie: extractAccessTokenFromCookieMock,
  extractRefreshTokenFromCookie: vi.fn(),
  extractBearerToken: extractBearerTokenMock,
}));

vi.mock('../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
  arcjetProtect: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../lib/errorHandler', () => ({
  handleError: vi.fn(),
  sendSuccess: vi.fn((res: VercelResponse, data: unknown) => res.status(200).json({ success: true, data })),
  sendError: vi.fn((res: VercelResponse, msg: string, status: number, code?: string) =>
    res.status(status).json({ success: false, error: msg, code: code ?? 'ERROR' })
  ),
  HttpStatus: { OK: 200, BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, TOO_MANY_REQUESTS: 429, INTERNAL_SERVER_ERROR: 500 },
  logErrorAuditEvent: vi.fn(),
}));

vi.mock('../../lib/auditLogger', () => ({
  logAuditEvent: vi.fn(),
  logAuthEvent: vi.fn(),
}));

vi.mock('../../lib/csrf', () => ({
  generateToken: vi.fn(() => Promise.resolve('csrf-token')),
  rotateToken: vi.fn(() => Promise.resolve('csrf-token')),
}));

vi.mock('../../lib/validation/middleware', () => ({
  validateBody: vi.fn(() => (body: unknown) => ({ success: true, data: body })),
  validateQuery: vi.fn(() => (query: unknown) => ({ success: true, data: query })),
}));

vi.mock('../../lib/validation/auth', () => ({
  loginBodySchema: {},
  registerBodySchema: {},
  passwordResetRequestBodySchema: {},
  passwordResetBodySchema: {},
  profileUpdateBodySchema: {},
  checkEmailQuerySchema: {},
}));

import handler from '../../api-src/auth';

function createMockRequest(action: string, method: string, body?: unknown): VercelRequest {
  return {
    method,
    query: { action },
    body,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as VercelRequest;
}

interface MockResponse {
  statusCode?: number;
  jsonBody?: unknown;
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: undefined,
    jsonBody: undefined,
    setHeader: vi.fn(() => response),
    status: vi.fn(function(code: number) {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn(function(payload: unknown) {
      response.jsonBody = payload;
      return response;
    }),
  };
  return response;
}

describe('api-src/auth profile name fallback without profiles.full_name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAccessTokenMock.mockResolvedValue('access-token');
    generateRefreshTokenMock.mockResolvedValue('refresh-token');
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('login derives full_name from first_name + last_name', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'first.last@example.com',
          password_hash: '$2b$12$abcdefghijklmnopqrstuv12345678901234567890123456789',
          role: 'student',
          first_name: 'First',
          last_name: 'Last',
          is_active: true,
        }],
      })
      .mockResolvedValue({ rows: [] });

    verifyPasswordMock.mockResolvedValueOnce(true);

    const req = createMockRequest('login', 'POST', { email: 'first.last@example.com', password: 'Password123!' });
    const res = createMockResponse();

    await handler(req, res as unknown as VercelResponse);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      success: true,
      data: {
        user: {
          firstName: 'First',
          lastName: 'Last',
          full_name: 'First Last',
        },
      },
    });
    expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
  });

  it('session derives full_name from first_name + last_name', async () => {
    extractAccessTokenFromCookieMock.mockReturnValue('access-token');
    extractBearerTokenMock.mockReturnValue(null);
    verifyAccessTokenMock.mockResolvedValue({
      sub: 'user-2',
      permissions: ['applications:read'],
    });

    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-2',
        email: 'session.user@example.com',
        role: 'student',
        first_name: 'Session',
        last_name: 'User',
      }],
    });

    const req = createMockRequest('session', 'GET');
    const res = createMockResponse();

    await handler(req, res as unknown as VercelResponse);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toMatchObject({
      success: true,
      data: {
        user: {
          firstName: 'Session',
          lastName: 'User',
          full_name: 'Session User',
        },
      },
    });
  });
});
