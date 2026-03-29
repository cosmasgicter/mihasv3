import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const queryMock = vi.fn();
const verifyPasswordMock = vi.fn();
const hashPasswordMock = vi.fn();
const isSha256HashMock = vi.fn();
const verifySha256PasswordMock = vi.fn();
const migrateSha256ToBcryptMock = vi.fn();
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
  isSha256Hash: isSha256HashMock,
  verifySha256Password: verifySha256PasswordMock,
  migrateSha256ToBcrypt: migrateSha256ToBcryptMock,
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
  extractBearerToken: vi.fn(),
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

function createMockRequest(body: unknown): VercelRequest {
  return {
    method: 'POST',
    query: { action: 'login' },
    body,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as VercelRequest;
}

interface MockResponse {
  statusCode?: number;
  jsonBody?: unknown;
  headers: Record<string, string | string[]>;
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function createMockResponse(): MockResponse {
  const response: MockResponse = {
    statusCode: undefined,
    jsonBody: undefined,
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
  return response;
}

describe('api-src/auth handleLogin migration hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateAccessTokenMock.mockResolvedValue('access-token');
    generateRefreshTokenMock.mockResolvedValue('refresh-token');
    hashPasswordMock.mockResolvedValue('$2b$12$upgradedHash0000000000000000000000000000000000000000000');
    migrateSha256ToBcryptMock.mockResolvedValue('$2b$12$newHash');
    // By default: not SHA-256 hash (bcrypt path)
    isSha256HashMock.mockReturnValue(false);
    verifySha256PasswordMock.mockReturnValue(false);
    // Stub out login_attempts queries
    queryMock.mockResolvedValue({ rows: [] });
  });

  it('supports bcrypt user login success', async () => {
    // First query: fetch user; subsequent: login_attempts checks
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'bcrypt@example.com',
          password_hash: '$2b$12$abcdefghijklmnopqrstuv12345678901234567890123456789',
          role: 'student',
          first_name: 'Bcrypt',
          last_name: 'User',
          is_active: true,
        }],
      })
      .mockResolvedValue({ rows: [] }); // login_attempts, lockout checks, etc.

    isSha256HashMock.mockReturnValue(false);
    verifyPasswordMock.mockResolvedValueOnce(true);

    const req = createMockRequest({ email: 'bcrypt@example.com', password: 'Password123!' });
    const res = createMockResponse();

    await handler(req, res as unknown as VercelResponse);

    expect(res.statusCode).toBe(200);
    expect(verifyPasswordMock).toHaveBeenCalledWith('Password123!', expect.stringContaining('$2b$12'));
    expect(migrateSha256ToBcryptMock).not.toHaveBeenCalled();
    expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
  });

  it('migrates SHA-256 hash to bcrypt on successful login', async () => {
    const legacySha256 = '4e738ca5563c06cfd0018299933d58db1dd8bf97f6973dc99bf6cdc64b5550bd';

    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'legacy-1',
          email: 'legacy@example.com',
          password_hash: legacySha256,
          role: 'student',
          first_name: 'Legacy',
          last_name: 'User',
          is_active: true,
        }],
      })
      .mockResolvedValue({ rows: [] });

    isSha256HashMock.mockReturnValue(true);
    verifySha256PasswordMock.mockReturnValue(true);
    migrateSha256ToBcryptMock.mockResolvedValue('$2b$12$newHash');

    const req = createMockRequest({ email: 'legacy@example.com', password: 's3cr3t' });
    const res = createMockResponse();

    await handler(req, res as unknown as VercelResponse);

    expect(res.statusCode).toBe(200);
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(migrateSha256ToBcryptMock).toHaveBeenCalledWith('legacy-1', 's3cr3t');
    expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
  });

  it('rejects login when password_hash is null', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'legacy-2',
          email: 'legacy-null@example.com',
          password_hash: null,
          role: 'student',
          first_name: 'Legacy',
          last_name: 'Null',
          is_active: true,
        }],
      })
      .mockResolvedValue({ rows: [] });

    isSha256HashMock.mockReturnValue(false);
    verifyPasswordMock.mockResolvedValueOnce(false);

    const req = createMockRequest({ email: 'legacy-null@example.com', password: 'Password123!' });
    const res = createMockResponse();

    await handler(req, res as unknown as VercelResponse);

    expect(res.statusCode).toBe(401);
    expect(migrateSha256ToBcryptMock).not.toHaveBeenCalled();
  });

  it('rejects login with wrong password for bcrypt users', async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{
          id: 'user-2',
          email: 'bcrypt@example.com',
          password_hash: '$2b$12$abcdefghijklmnopqrstuv12345678901234567890123456789',
          role: 'student',
          first_name: 'Bcrypt',
          last_name: 'User',
          is_active: true,
        }],
      })
      .mockResolvedValue({ rows: [] });

    isSha256HashMock.mockReturnValue(false);
    verifyPasswordMock.mockResolvedValueOnce(false);

    const req = createMockRequest({ email: 'bcrypt@example.com', password: 'wrong-password' });
    const res = createMockResponse();

    await handler(req, res as unknown as VercelResponse);

    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({
      success: false,
      error: 'Invalid credentials',
    });
  });
});
