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
  needsPasswordUpgrade: vi.fn(() => false),
  upgradePasswordHash: vi.fn(),
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
}));

import handler from '../../api-src/auth';

function createMockRequest(action: string, method: string, body?: unknown): VercelRequest {
  return {
    method,
    query: { action },
    body,
    headers: {},
  } as unknown as VercelRequest;
}

function createMockResponse(): VercelResponse & { statusCode?: number; jsonBody?: unknown } {
  const response = {
    setHeader: vi.fn(() => response),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((payload: unknown) => {
      response.jsonBody = payload;
      return response;
    }),
  };

  return response as unknown as VercelResponse & { statusCode?: number; jsonBody?: unknown };
}

describe('api-src/auth profile name fallback without profiles.full_name', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAccessTokenMock.mockResolvedValue('access-token');
    generateRefreshTokenMock.mockResolvedValue('refresh-token');
  });

  it('login derives full_name from first_name + last_name while query avoids full_name column', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        email: 'first.last@example.com',
        password_hash: '$2b$12$abcdefghijklmnopqrstuv12345678901234567890123456789',
        role: 'student',
        first_name: 'First',
        last_name: 'Last',
        is_active: true,
      }],
    });
    verifyPasswordMock.mockResolvedValueOnce(true);

    const req = createMockRequest('login', 'POST', { email: 'first.last@example.com', password: 'Password123!' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining('full_name'), ['first.last@example.com']);
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

  it('session derives full_name from first_name + last_name while query avoids full_name column', async () => {
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

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining('full_name'), ['user-2']);
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
