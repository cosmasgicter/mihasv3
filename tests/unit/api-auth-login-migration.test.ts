import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const queryMock = vi.fn();
const verifyPasswordMock = vi.fn();
const hashPasswordMock = vi.fn();
const upgradePasswordHashMock = vi.fn();
const generateAccessTokenMock = vi.fn();
const generateRefreshTokenMock = vi.fn();
const setAuthCookiesMock = vi.fn();

vi.mock('../../lib/cors', () => ({
  handleCors: vi.fn(() => false),
}));

vi.mock('../../lib/db', () => ({
  query: queryMock,
}));

vi.mock('../../lib/auth/password', () => ({
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
  needsPasswordUpgrade: (user: { password_hash: string | null }) => {
    if (!user.password_hash) return true;
    return !/^\$2[aby]\$\d{1,2}\$/.test(user.password_hash);
  },
  upgradePasswordHash: upgradePasswordHashMock,
}));

vi.mock('../../lib/auth/jwt', () => ({
  generateAccessToken: generateAccessTokenMock,
  generateRefreshToken: generateRefreshTokenMock,
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock('../../lib/auth/permissions', () => ({
  getPermissionsForRole: vi.fn(() => ['applications:read']),
}));

vi.mock('../../lib/auth/cookies', () => ({
  setAuthCookies: setAuthCookiesMock,
  clearAuthCookies: vi.fn(),
  extractAccessTokenFromCookie: vi.fn(),
  extractRefreshTokenFromCookie: vi.fn(),
}));

vi.mock('../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
}));

import handler from '../../api-src/auth';

function createMockRequest(body: unknown): VercelRequest {
  return {
    method: 'POST',
    query: { action: 'login' },
    body,
    headers: {},
  } as unknown as VercelRequest;
}

function createMockResponse(): VercelResponse & {
  statusCode?: number;
  jsonBody?: unknown;
  headers: Record<string, string | string[]>;
} {
  const response = {
    headers: {},
    setHeader: vi.fn((key: string, value: string | string[]) => {
      response.headers[key] = value;
      return response;
    }),
    status: vi.fn((code: number) => {
      response.statusCode = code;
      return response;
    }),
    json: vi.fn((payload: unknown) => {
      response.jsonBody = payload;
      return response;
    }),
  };

  return response as unknown as VercelResponse & {
    statusCode?: number;
    jsonBody?: unknown;
    headers: Record<string, string | string[]>;
  };
}

describe('api-src/auth handleLogin migration hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAccessTokenMock.mockResolvedValue('access-token');
    generateRefreshTokenMock.mockResolvedValue('refresh-token');
    hashPasswordMock.mockResolvedValue('$2b$12$upgradedHash0000000000000000000000000000000000000000000');
    upgradePasswordHashMock.mockResolvedValue(true);
  });

  it('supports bcrypt user login success', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        email: 'bcrypt@example.com',
        password_hash: '$2b$12$abcdefghijklmnopqrstuv12345678901234567890123456789',
        role: 'student',
        first_name: 'Bcrypt',
        last_name: 'User',
        is_active: true,
      }],
    });
    verifyPasswordMock.mockResolvedValueOnce(true);

    const req = createMockRequest({ email: 'bcrypt@example.com', password: 'Password123!' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(verifyPasswordMock).toHaveBeenCalledWith('Password123!', expect.stringContaining('$2b$12$'));
    expect(upgradePasswordHashMock).not.toHaveBeenCalled();
    expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
  });

  it('migrates legacy null/non-bcrypt user login when verification succeeds', async () => {
    const legacySha256 = '4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd'; // sha256('s3cr3t')

    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'legacy-1',
        email: 'legacy@example.com',
        password_hash: legacySha256,
        role: 'student',
        first_name: 'Legacy',
        last_name: 'User',
        is_active: true,
      }],
    });

    const req = createMockRequest({ email: 'legacy@example.com', password: 's3cr3t' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(upgradePasswordHashMock).toHaveBeenCalledWith('legacy-1', 's3cr3t');
    expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
  });


  it('returns targeted migration error when legacy account has null password hash', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'legacy-2',
        email: 'legacy-null@example.com',
        password_hash: null,
        role: 'student',
        first_name: 'Legacy',
        last_name: 'Null',
        is_active: true,
      }],
    });

    const req = createMockRequest({ email: 'legacy-null@example.com', password: 'Password123!' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({
      success: false,
      code: 'PASSWORD_MIGRATION_REQUIRED',
    });
    expect(upgradePasswordHashMock).not.toHaveBeenCalled();
  });

  it('keeps invalid password rejection unchanged for bcrypt users', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-2',
        email: 'bcrypt@example.com',
        password_hash: '$2b$12$abcdefghijklmnopqrstuv12345678901234567890123456789',
        role: 'student',
        first_name: 'Bcrypt',
        last_name: 'User',
        is_active: true,
      }],
    });
    verifyPasswordMock.mockResolvedValueOnce(false);

    const req = createMockRequest({ email: 'bcrypt@example.com', password: 'wrong-password' });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({
      success: false,
      error: 'Invalid credentials',
      code: 'VALIDATION_ERROR',
    });
  });
});
