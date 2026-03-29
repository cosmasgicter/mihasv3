/**
 * Unit tests for api-src/auth.ts
 *
 * Covers: login, logout, register, refresh, password-reset-request, password-reset
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Mock setup ──────────────────────────────────────────────────────────────
// Use vi.hoisted so these are available inside vi.mock() factories (which are hoisted)

const {
  queryMock,
  verifyPasswordMock,
  hashPasswordMock,
  isSha256HashMock,
  verifySha256PasswordMock,
  migrateSha256ToBcryptMock,
  generateAccessTokenMock,
  generateRefreshTokenMock,
  verifyAccessTokenMock,
  verifyRefreshTokenMock,
  setAuthCookiesMock,
  clearAuthCookiesMock,
  extractAccessTokenFromCookieMock,
  extractRefreshTokenFromCookieMock,
  extractBearerTokenMock,
  generateCsrfTokenMock,
  rotateCsrfTokenMock,
  arcjetProtectMock,
} = vi.hoisted(() => ({
  queryMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  isSha256HashMock: vi.fn(),
  verifySha256PasswordMock: vi.fn(),
  migrateSha256ToBcryptMock: vi.fn(),
  generateAccessTokenMock: vi.fn(),
  generateRefreshTokenMock: vi.fn(),
  verifyAccessTokenMock: vi.fn(),
  verifyRefreshTokenMock: vi.fn(),
  setAuthCookiesMock: vi.fn(),
  clearAuthCookiesMock: vi.fn(),
  extractAccessTokenFromCookieMock: vi.fn(),
  extractRefreshTokenFromCookieMock: vi.fn(),
  extractBearerTokenMock: vi.fn(),
  generateCsrfTokenMock: vi.fn(),
  rotateCsrfTokenMock: vi.fn(),
  arcjetProtectMock: vi.fn(),
}));

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
  verifyAccessToken: verifyAccessTokenMock,
  verifyRefreshToken: verifyRefreshTokenMock,
}));

vi.mock('../../lib/auth/permissions', () => ({
  getPermissionsForRole: vi.fn(() => ['applications:read']),
}));

vi.mock('../../lib/auth/cookies', () => ({
  setAuthCookies: setAuthCookiesMock,
  clearAuthCookies: clearAuthCookiesMock,
  extractAccessTokenFromCookie: extractAccessTokenFromCookieMock,
  extractRefreshTokenFromCookie: extractRefreshTokenFromCookieMock,
  extractBearerToken: extractBearerTokenMock,
}));

vi.mock('../../lib/arcjet', () => ({
  withArcjetProtection: (handler: unknown) => handler,
  arcjetProtect: arcjetProtectMock,
}));

vi.mock('../../lib/errorHandler', () => ({
  handleError: vi.fn(),
  sendSuccess: vi.fn((res: VercelResponse, data: unknown, status?: number) =>
    res.status(status ?? 200).json({ success: true, data })
  ),
  sendError: vi.fn((res: VercelResponse, msg: string, status: number, code?: string) =>
    res.status(status).json({ success: false, error: msg, code: code ?? 'ERROR' })
  ),
  HttpStatus: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
  },
  logErrorAuditEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../lib/auditLogger', () => ({
  logAuditEvent: vi.fn(),
  logAuthEvent: vi.fn(),
}));

vi.mock('../../lib/csrf', () => ({
  generateToken: generateCsrfTokenMock,
  rotateToken: rotateCsrfTokenMock,
  requireCsrf: vi.fn(() => Promise.resolve(false)),
}));

vi.mock('../../lib/validation/middleware', () => ({
  validateBody: vi.fn((_schema: unknown, req: VercelRequest, _res: VercelResponse) => req.body),
  validateQuery: vi.fn((_schema: unknown, req: VercelRequest, _res: VercelResponse) => req.query),
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(action: string, method: string, body?: unknown, headers: Record<string, string> = {}): VercelRequest {
  return {
    method,
    query: { action },
    body,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as VercelRequest;
}

interface MockRes {
  statusCode?: number;
  jsonBody?: unknown;
  headers: Record<string, string | string[]>;
  setHeader: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
}

function makeRes(): MockRes {
  const res: MockRes = {
    statusCode: undefined,
    jsonBody: undefined,
    headers: {},
    setHeader: vi.fn((key: string, value: string | string[]) => {
      res.headers[key] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.jsonBody = payload;
      return res;
    }),
  };
  return res;
}

/** A standard active user row returned from the DB */
const activeUser = {
  id: 'user-abc',
  email: 'student@example.com',
  password_hash: '$2b$12$hashedpassword',
  role: 'student' as const,
  first_name: 'Jane',
  last_name: 'Doe',
  is_active: true,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Sensible defaults
    generateAccessTokenMock.mockResolvedValue('access-token');
    generateRefreshTokenMock.mockResolvedValue('refresh-token');
    generateCsrfTokenMock.mockResolvedValue('csrf-token');
    rotateCsrfTokenMock.mockResolvedValue('new-csrf-token');
    hashPasswordMock.mockResolvedValue('$2b$12$newhash');
    isSha256HashMock.mockReturnValue(false);
    verifySha256PasswordMock.mockReturnValue(false);
    arcjetProtectMock.mockResolvedValue({ allowed: true });
    // Default: no login attempts, no lockout
    queryMock.mockResolvedValue({ rows: [] });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns 200 with user and sets cookies on valid credentials', async () => {
      // Query order in handleLogin:
      // 1. checkAccountLockout  → SELECT last 10 attempts (< 10 rows = not locked)
      // 2. checkLoginCooldown   → SELECT COUNT(*) fail_count (0 = not blocked)
      // 3. fetch user           → SELECT from profiles
      // 4. recordLoginAttempt   → INSERT into login_attempts (success)
      // 5. generateCsrfToken    → (mocked, no query)
      queryMock
        .mockResolvedValueOnce({ rows: [] })           // checkAccountLockout: < 10 rows
        .mockResolvedValueOnce({ rows: [{ fail_count: '0', oldest_failure: null }] }) // checkLoginCooldown
        .mockResolvedValueOnce({ rows: [activeUser] }) // fetch user
        .mockResolvedValue({ rows: [] });              // recordLoginAttempt + any others

      verifyPasswordMock.mockResolvedValueOnce(true);

      const req = makeReq('login', 'POST', { email: 'student@example.com', password: 'Password1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { user: { id: 'user-abc', email: 'student@example.com', role: 'student' } },
      });
      expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
      expect(res.headers['X-CSRF-Token']).toBe('csrf-token');
    });

    it('returns 401 on wrong password', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })           // checkAccountLockout
        .mockResolvedValueOnce({ rows: [{ fail_count: '0', oldest_failure: null }] }) // checkLoginCooldown
        .mockResolvedValueOnce({ rows: [activeUser] }) // fetch user
        .mockResolvedValue({ rows: [] });              // recordLoginAttempt + checkAccountLockout post-fail

      verifyPasswordMock.mockResolvedValueOnce(false);

      const req = makeReq('login', 'POST', { email: 'student@example.com', password: 'WrongPass1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'Invalid credentials' });
      expect(setAuthCookiesMock).not.toHaveBeenCalled();
    });

    it('returns 401 for non-existent user', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })           // checkAccountLockout
        .mockResolvedValueOnce({ rows: [{ fail_count: '0', oldest_failure: null }] }) // checkLoginCooldown
        .mockResolvedValueOnce({ rows: [] })           // user not found
        .mockResolvedValue({ rows: [] });              // recordLoginAttempt

      const req = makeReq('login', 'POST', { email: 'nobody@example.com', password: 'Password1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'Invalid credentials' });
    });

    it('returns 403 for inactive account', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })           // checkAccountLockout
        .mockResolvedValueOnce({ rows: [{ fail_count: '0', oldest_failure: null }] }) // checkLoginCooldown
        .mockResolvedValueOnce({ rows: [{ ...activeUser, is_active: false }] }) // fetch user
        .mockResolvedValue({ rows: [] });

      const req = makeReq('login', 'POST', { email: 'student@example.com', password: 'Password1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(403);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'Account is disabled' });
    });

    it('returns 429 with Retry-After when account is locked out', async () => {
      // checkAccountLockout: 10 rows all failed
      const failedAttempts = Array.from({ length: 10 }, (_, i) => ({
        success: false,
        attempted_at: new Date(Date.now() - i * 60_000).toISOString(),
      }));
      queryMock
        .mockResolvedValueOnce({ rows: failedAttempts }) // checkAccountLockout
        .mockResolvedValue({ rows: [] });

      const req = makeReq('login', 'POST', { email: 'locked@example.com', password: 'Password1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBeDefined();
      expect(res.jsonBody).toMatchObject({ success: false });
    });

    it('returns 429 with Retry-After when in cooldown (5+ failures in 15 min)', async () => {
      // checkAccountLockout: fewer than 10 rows → not locked
      queryMock
        .mockResolvedValueOnce({ rows: [] }) // checkAccountLockout (< 10 rows)
        .mockResolvedValueOnce({             // checkLoginCooldown
          rows: [{ fail_count: '6', oldest_failure: new Date(Date.now() - 5 * 60_000).toISOString() }],
        })
        .mockResolvedValue({ rows: [] });

      const req = makeReq('login', 'POST', { email: 'cooldown@example.com', password: 'Password1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBeDefined();
    });

    it('returns 405 for non-POST requests', async () => {
      const req = makeReq('login', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });

    it('includes full_name derived from first_name + last_name', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })           // checkAccountLockout
        .mockResolvedValueOnce({ rows: [{ fail_count: '0', oldest_failure: null }] }) // checkLoginCooldown
        .mockResolvedValueOnce({ rows: [activeUser] }) // fetch user
        .mockResolvedValue({ rows: [] });

      verifyPasswordMock.mockResolvedValueOnce(true);

      const req = makeReq('login', 'POST', { email: 'student@example.com', password: 'Password1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.jsonBody).toMatchObject({
        data: { user: { full_name: 'Jane Doe', firstName: 'Jane', lastName: 'Doe' } },
      });
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('returns 200 and clears cookies on authenticated logout', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc' });
      queryMock.mockResolvedValue({ rows: [] }); // deactivate sessions + audit

      const req = makeReq('logout', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
      expect(res.jsonBody).toMatchObject({ success: true, data: { message: 'Logged out successfully' } });
    });

    it('still clears cookies when no token is present (unauthenticated logout)', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue(null);
      extractBearerTokenMock.mockReturnValue(null);

      const req = makeReq('logout', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('still clears cookies when token is expired/invalid', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('expired-token');
      verifyAccessTokenMock.mockRejectedValue(new Error('Token expired'));

      const req = makeReq('logout', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register', () => {
    it('returns 201 with user and sets cookies on successful registration', async () => {
      arcjetProtectMock.mockResolvedValue({ allowed: true });
      queryMock
        .mockResolvedValueOnce({ rows: [] })                    // checkRegistrationRateLimit
        .mockResolvedValueOnce({ rows: [] })                    // check duplicate email
        .mockResolvedValueOnce({ rows: [{ id: 'new-user-1' }] }) // INSERT profile
        .mockResolvedValue({ rows: [] });                       // recordRegistrationAttempt + audit

      const req = makeReq('register', 'POST', {
        email: 'newuser@example.com',
        password: 'Password1!',
        firstName: 'New',
        lastName: 'User',
      });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(201);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { user: { email: 'newuser@example.com', role: 'student' } },
      });
      expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
    });

    it('returns 409 when email is already registered', async () => {
      arcjetProtectMock.mockResolvedValue({ allowed: true });
      queryMock
        .mockResolvedValueOnce({ rows: [] })                    // checkRegistrationRateLimit
        .mockResolvedValueOnce({ rows: [{ id: 'existing-1' }] }); // duplicate email check

      const req = makeReq('register', 'POST', {
        email: 'existing@example.com',
        password: 'Password1!',
        firstName: 'Existing',
        lastName: 'User',
      });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(409);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'Email already registered' });
    });

    it('returns 429 when Arcjet blocks registration', async () => {
      arcjetProtectMock.mockResolvedValue({ allowed: false });

      const req = makeReq('register', 'POST', {
        email: 'spam@example.com',
        password: 'Password1!',
        firstName: 'Spam',
        lastName: 'Bot',
      });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBe('600');
    });

    it('returns 429 when DB-based registration rate limit is exceeded', async () => {
      arcjetProtectMock.mockResolvedValue({ allowed: true });
      queryMock.mockResolvedValueOnce({
        rows: [{ reg_count: '3', oldest_reg: new Date(Date.now() - 2 * 60_000).toISOString() }],
      });

      const req = makeReq('register', 'POST', {
        email: 'ratelimited@example.com',
        password: 'Password1!',
        firstName: 'Rate',
        lastName: 'Limited',
      });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBeDefined();
    });

    it('returns 405 for non-POST requests', async () => {
      const req = makeReq('register', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('returns 200 with new tokens and rotated CSRF token on valid refresh token', async () => {
      extractRefreshTokenFromCookieMock.mockReturnValue('valid-refresh-token');
      verifyRefreshTokenMock.mockResolvedValue({ sub: 'user-abc' });
      queryMock.mockResolvedValueOnce({ rows: [{ ...activeUser }] });

      const req = makeReq('refresh', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(setAuthCookiesMock).toHaveBeenCalledWith(res, 'access-token', 'refresh-token');
      expect(res.headers['X-CSRF-Token']).toBe('new-csrf-token');
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { user: { id: 'user-abc', role: 'student' } },
      });
    });

    it('returns 401 when no refresh token cookie is present', async () => {
      extractRefreshTokenFromCookieMock.mockReturnValue(null);

      const req = makeReq('refresh', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'No refresh token' });
    });

    it('returns 401 and clears cookies when refresh token is invalid/expired', async () => {
      extractRefreshTokenFromCookieMock.mockReturnValue('bad-token');
      verifyRefreshTokenMock.mockRejectedValue(new Error('jwt expired'));

      const req = makeReq('refresh', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'Invalid refresh token' });
    });

    it('returns 401 when user no longer exists', async () => {
      extractRefreshTokenFromCookieMock.mockReturnValue('valid-refresh-token');
      verifyRefreshTokenMock.mockResolvedValue({ sub: 'deleted-user' });
      queryMock.mockResolvedValueOnce({ rows: [] }); // user not found

      const req = makeReq('refresh', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('returns 401 when user is inactive', async () => {
      extractRefreshTokenFromCookieMock.mockReturnValue('valid-refresh-token');
      verifyRefreshTokenMock.mockResolvedValue({ sub: 'user-abc' });
      queryMock.mockResolvedValueOnce({ rows: [{ ...activeUser, is_active: false }] });

      const req = makeReq('refresh', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });
  });

  // ── password-reset-request ─────────────────────────────────────────────────

  describe('password-reset-request', () => {
    it('returns 200 with generic message when email exists', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'user-abc', email: 'student@example.com', first_name: 'Jane', last_name: 'Doe' }] }) // user lookup
        .mockResolvedValueOnce({ rows: [{ request_count: '0' }] }) // rate limit check
        .mockResolvedValue({ rows: [] }); // INSERT token + email send

      const req = makeReq('password-reset-request', 'POST', { email: 'student@example.com' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { message: expect.stringContaining('password reset link') },
      });
    });

    it('returns 200 with same generic message when email does NOT exist (prevents enumeration)', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // user not found

      const req = makeReq('password-reset-request', 'POST', { email: 'ghost@example.com' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { message: expect.stringContaining('password reset link') },
      });
    });

    it('returns 429 with Retry-After when rate limit (3 per 15 min) is exceeded', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'user-abc', email: 'student@example.com', first_name: 'Jane', last_name: 'Doe' }] })
        .mockResolvedValueOnce({ rows: [{ request_count: '3' }] }) // rate limit hit
        .mockResolvedValueOnce({ rows: [{ oldest: new Date(Date.now() - 5 * 60_000).toISOString() }] }); // oldest token

      const req = makeReq('password-reset-request', 'POST', { email: 'student@example.com' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBeDefined();
      expect(res.jsonBody).toMatchObject({ success: false });
    });

    it('returns 405 for non-POST requests', async () => {
      const req = makeReq('password-reset-request', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });

    it('also works via the forgot-password alias', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // user not found — still 200

      const req = makeReq('forgot-password', 'POST', { email: 'ghost@example.com' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
    });
  });

  // ── password-reset (password change via token) ─────────────────────────────

  describe('password-reset', () => {
    it('returns 200 and updates password on valid token', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'token-1', user_id: 'user-abc' }] }) // valid token
        .mockResolvedValue({ rows: [] }); // UPDATE password + mark token used + invalidate others

      const req = makeReq('password-reset', 'POST', { token: 'valid-raw-token', newPassword: 'NewPass1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { message: expect.stringContaining('reset successfully') },
      });
      expect(hashPasswordMock).toHaveBeenCalledWith('NewPass1!');
    });

    it('returns 400 on invalid or expired token', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }); // token not found

      const req = makeReq('password-reset', 'POST', { token: 'bad-token', newPassword: 'NewPass1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'Invalid or expired reset token' });
    });

    it('invalidates all outstanding tokens for the user after successful reset', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'token-1', user_id: 'user-abc' }] }) // valid token
        .mockResolvedValue({ rows: [] });

      const req = makeReq('password-reset', 'POST', { token: 'valid-raw-token', newPassword: 'NewPass1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      // Should have called query at least 3 times: find token, update password, mark used, invalidate all
      expect(queryMock).toHaveBeenCalledTimes(4);
      // The last call should invalidate all unused tokens for the user
      const lastCall = queryMock.mock.calls[queryMock.mock.calls.length - 1];
      expect(lastCall[0]).toContain('used_at IS NULL');
    });

    it('returns 405 for non-POST requests', async () => {
      const req = makeReq('password-reset', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });

    it('also works via the reset-password alias', async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [{ id: 'token-2', user_id: 'user-abc' }] })
        .mockResolvedValue({ rows: [] });

      const req = makeReq('reset-password', 'POST', { token: 'valid-raw-token', newPassword: 'NewPass1!' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
    });
  });

  // ── session ──────────────────────────────────────────────────────────────

  describe('session', () => {
    it('returns user data when valid access token is present', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: ['applications:read'] });
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'user-abc', email: 'student@example.com', role: 'student', first_name: 'Jane', last_name: 'Doe' }],
      });

      const req = makeReq('session', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { user: { id: 'user-abc', email: 'student@example.com', role: 'student' } },
      });
    });

    it('returns user: null when no token is present', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue(null);
      extractBearerTokenMock.mockReturnValue(null);

      const req = makeReq('session', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({ success: true, data: { user: null } });
    });

    it('returns user: null and clears cookies when user not found in DB', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'deleted-user', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [] });

      const req = makeReq('session', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({ success: true, data: { user: null } });
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('returns user: null when token is invalid/expired', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('bad-token');
      verifyAccessTokenMock.mockRejectedValue(new Error('Token expired'));

      const req = makeReq('session', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({ success: true, data: { user: null } });
    });
  });

  // ── roles ──────────────────────────────────────────────────────────────────

  describe('roles', () => {
    it('returns role and permissions for authenticated user', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: ['applications:read'] });
      queryMock.mockResolvedValueOnce({
        rows: [{ id: 'user-abc', role: 'student', is_active: true }],
      });

      const req = makeReq('roles', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { id: 'user-abc', role: 'student', is_active: true },
      });
    });

    it('returns 401 when no token is present', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue(null);
      extractBearerTokenMock.mockReturnValue(null);

      const req = makeReq('roles', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
    });

    it('returns 401 when user not found or inactive', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [] });

      const req = makeReq('roles', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('returns 401 when token verification fails', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('bad-token');
      verifyAccessTokenMock.mockRejectedValue(new Error('invalid'));

      const req = makeReq('roles', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('returns 405 for non-GET requests', async () => {
      const req = makeReq('roles', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });
  });

  // ── profile ────────────────────────────────────────────────────────────────

  describe('profile', () => {
    const profileRow = {
      id: 'user-abc',
      full_name: null,
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'student@example.com',
      phone: '+260971234567',
      role: 'student' as const,
      date_of_birth: '2000-01-01',
      sex: 'female',
      residence_town: 'Kitwe',
      nationality: 'Zambian',
      nrc_number: '123456/78/9',
      address: '123 Main St',
      avatar_url: null,
      next_of_kin_name: 'John Doe',
      next_of_kin_phone: '+260971234568',
    };

    it('GET returns profile data for authenticated user', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [profileRow] });

      const req = makeReq('profile', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { id: 'user-abc', email: 'student@example.com' },
      });
    });

    it('GET returns 401 when no token is present', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue(null);
      extractBearerTokenMock.mockReturnValue(null);

      const req = makeReq('profile', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
    });

    it('GET returns 401 when user not found', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'deleted-user', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [] });

      const req = makeReq('profile', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('PATCH updates profile fields', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [{ ...profileRow, phone: '+260979999999' }] });

      const req = makeReq('profile', 'PATCH', { phone: '+260979999999' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({
        success: true,
        data: { phone: '+260979999999' },
      });
    });

    it('PATCH returns 400 when no valid fields provided', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });

      const req = makeReq('profile', 'PATCH', { invalid_field: 'value' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(400);
      expect(res.jsonBody).toMatchObject({ success: false, error: 'No valid fields to update' });
    });

    it('PATCH splits full_name into first_name and last_name', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [{ ...profileRow, full_name: 'Alice Smith', first_name: 'Alice', last_name: 'Smith' }] });

      const req = makeReq('profile', 'PATCH', { full_name: 'Alice Smith' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
    });

    it('PATCH returns 404 when profile not found after update', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });
      queryMock.mockResolvedValueOnce({ rows: [] }); // UPDATE returns no rows

      const req = makeReq('profile', 'PATCH', { phone: '+260979999999' });
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(404);
    });

    it('returns 401 when token is expired', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('expired-token');
      verifyAccessTokenMock.mockRejectedValue(new Error('Token expired'));

      const req = makeReq('profile', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(401);
      expect(clearAuthCookiesMock).toHaveBeenCalledWith(res);
    });

    it('returns 500 for non-auth errors (e.g. database)', async () => {
      extractAccessTokenFromCookieMock.mockReturnValue('valid-token');
      verifyAccessTokenMock.mockResolvedValue({ sub: 'user-abc', permissions: [] });
      queryMock.mockRejectedValueOnce(new Error('Connection refused'));

      const req = makeReq('profile', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(500);
    });

    it('returns 405 for unsupported methods', async () => {
      const req = makeReq('profile', 'DELETE');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });
  });

  // ── check-email ────────────────────────────────────────────────────────────

  describe('check-email', () => {
    it('returns available: true when email is not registered', async () => {
      queryMock.mockResolvedValueOnce({ rows: [] });

      const req = {
        method: 'GET',
        query: { action: 'check-email', email: 'new@example.com' },
        body: undefined,
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as VercelRequest;
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({ success: true, data: { available: true } });
    });

    it('returns available: false when email is already registered', async () => {
      queryMock.mockResolvedValueOnce({ rows: [{ id: 'existing-1' }] });

      const req = {
        method: 'GET',
        query: { action: 'check-email', email: 'existing@example.com' },
        body: undefined,
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as VercelRequest;
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(200);
      expect(res.jsonBody).toMatchObject({ success: true, data: { available: false } });
    });

    it('returns 405 for non-GET requests', async () => {
      const req = makeReq('check-email', 'POST');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(405);
    });
  });

  // ── unknown action ─────────────────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns 400 for unrecognised action', async () => {
      const req = makeReq('does-not-exist', 'GET');
      const res = makeRes();

      await handler(req, res as unknown as VercelResponse);

      expect(res.statusCode).toBe(400);
    });
  });
});
