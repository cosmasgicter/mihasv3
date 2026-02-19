/**
 * Auth API Endpoint
 * 
 * GET/POST/PATCH /api/auth?action=login|logout|register|session|refresh|roles|profile
 * 
 * Custom Bun-Native Authentication System
 * REPLACES: Supabase Auth entirely
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "../lib/cors";
import { query } from "../lib/db";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { needsPasswordUpgrade, upgradePasswordHash } from "../lib/auth/legacy";
import type { UserRecord } from "../lib/queries";
import { 
  generateAccessToken, 
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type UserRole 
} from "../lib/auth/jwt";
import { getPermissionsForRole } from "../lib/auth/permissions";
import { setAuthCookies, clearAuthCookies, extractAccessTokenFromCookie, extractRefreshTokenFromCookie, extractBearerToken } from "../lib/auth/cookies";
import { withArcjetProtection } from "../lib/arcjet";
import { handleError, sendSuccess, sendError, HttpStatus } from "../lib/errorHandler";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";

/**
 * Auth API Handler
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleCors(req, res)) return;

  const action = req.query.action as string;

  try {
    switch (action) {
      case 'login':
        return await handleLogin(req, res);
      case 'logout':
        return await handleLogout(req, res);
      case 'register':
        return await handleRegister(req, res);
      case 'session':
        return await handleSession(req, res);
      case 'refresh':
        return await handleRefresh(req, res);
      case 'bootstrap':
        return await handleBootstrap(req, res);
      case 'check-email':
        return await handleCheckEmail(req, res);
      case 'roles':
        return await handleRoles(req, res);
      case 'profile':
        return await handleProfile(req, res);
      case 'forgot-password':
        return await handleForgotPassword(req, res);
      case 'reset-password':
        return await handleResetPassword(req, res);
      default:
        return sendError(res, 'Invalid action. Use: login, logout, register, session, refresh, bootstrap, check-email, roles, profile, forgot-password, reset-password', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error);
  }
}

const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 60;

async function ensurePasswordResetTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function buildResetPasswordLink(token: string): string {
  const origin = process.env.APP_URL || process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:5173';
  return `${origin.replace(/\/$/, '')}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

async function sendPasswordResetEmail(email: string, fullName: string, resetLink: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    return false;
  }

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Reset your MIHAS account password</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #374151;">
        Hello ${fullName || 'Student'}, we received a request to reset your account password.
      </p>
      <p style="font-size: 16px; line-height: 1.6; color: #374151;">
        Click the button below to continue. This link will expire in ${PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes.
      </p>
      <p style="margin-top: 20px;">
        <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'noreply@mihas.edu.zm',
      to: email,
      subject: 'Reset your MIHAS password',
      html: emailHtml,
    }),
  });

  return emailResponse.ok;
}

async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return sendError(res, 'Email is required', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }

  const normalizedEmail = email.toLowerCase().trim();
  await ensurePasswordResetTable();
  await query(`DELETE FROM password_reset_tokens WHERE expires_at <= NOW() OR used_at IS NOT NULL`);

  const userResult = await query<{ id: string; email: string; first_name: string | null; last_name: string | null }>(
    `SELECT id, email, first_name, last_name FROM profiles WHERE email = $1 AND is_active = true LIMIT 1`,
    [normalizedEmail]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(rawToken);

    await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [user.id]);
    await query(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '${PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes')`,
      [randomUUID(), user.id, tokenHash]
    );

    const resetLink = buildResetPasswordLink(rawToken);
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();

    try {
      await sendPasswordResetEmail(user.email, fullName, resetLink);
    } catch {
      console.warn('[AUTH] Password reset email send failed');
    }
  }

  return sendSuccess(res, {
    message: 'If the email exists, a reset link has been sent',
  });
}

async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { token, password } = req.body || {};
  if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
    return sendError(res, 'token and password are required', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }

  if (password.length < 8) {
    return sendError(res, 'Password must be at least 8 characters', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }

  await ensurePasswordResetTable();
  await query(`DELETE FROM password_reset_tokens WHERE expires_at <= NOW() OR used_at IS NOT NULL`);

  const tokenHash = hashResetToken(token);

  const tokenResult = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id
     FROM password_reset_tokens
     WHERE token_hash = $1
       AND used_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  if (tokenResult.rows.length === 0) {
    return sendError(res, 'Invalid or expired reset token', HttpStatus.BAD_REQUEST, 'INVALID_TOKEN');
  }

  const resetToken = tokenResult.rows[0];
  const hashedPassword = await hashPassword(password);

  await query(`UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hashedPassword, resetToken.user_id]);
  await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [resetToken.id]);
  await query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [resetToken.user_id]);

  return sendSuccess(res, {
    message: 'Password reset successfully',
  });
}

/**
 * Handle login
 * POST /api/auth?action=login
 * Body: { email, password }
 */
async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return sendError(res, 'Email and password required', HttpStatus.BAD_REQUEST);
  }

  // Find user by email
  const result = await query<{
    id: string;
    email: string;
    password_hash: string | null;
    role: UserRole;
    first_name: string;
    last_name: string;
    is_active: boolean;
  }>(
    `SELECT id, email, password_hash, role, first_name, last_name, is_active 
     FROM profiles WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return sendError(res, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  const user = result.rows[0];

  if (!user.is_active) {
    return sendError(res, 'Account is disabled', HttpStatus.FORBIDDEN);
  }

  // Branch for migrated/legacy accounts that don't have bcrypt hashes yet
  if (needsPasswordUpgrade(toLegacyCompatibleUserRecord(user))) {
    const legacyAuthResult = verifyLegacyPassword(password, user.password_hash);

    if (!legacyAuthResult.isValid) {
      if (legacyAuthResult.requiresMigration) {
        return sendError(
          res,
          'Password migration required. Use account recovery or bootstrap migration to reset your password.',
          HttpStatus.UNAUTHORIZED,
          'PASSWORD_MIGRATION_REQUIRED'
        );
      }

      return sendError(res, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
    }

    const upgraded = await upgradePasswordHash(user.id, password);
    if (!upgraded) {
      return sendError(
        res,
        'Password migration required. Use account recovery or bootstrap migration to reset your password.',
        HttpStatus.UNAUTHORIZED,
        'PASSWORD_MIGRATION_REQUIRED'
      );
    }

  } else {
    // Standard bcrypt verification path
    const isValid = await verifyPassword(password, user.password_hash as string);

    if (!isValid) {
      return sendError(res, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
    }
  }

  // Generate tokens
  const permissions = getPermissionsForRole(user.role);
  const accessToken = await generateAccessToken(user.id, user.email, user.role, permissions);
  const refreshToken = await generateRefreshToken(user.id);

  // Set cookies
  setAuthCookies(res, accessToken, refreshToken);

  return sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
    },
  });
}


function toLegacyCompatibleUserRecord(user: {
  id: string;
  email: string;
  password_hash: string | null;
  role: UserRole;
  is_active: boolean;
}): UserRecord {
  const now = new Date();

  return {
    id: user.id,
    email: user.email,
    password_hash: user.password_hash,
    refresh_token_hash: null,
    role: user.role,
    first_name: null,
    last_name: null,
    full_name: null,
    phone: null,
    is_active: user.is_active,
    failed_login_attempts: 0,
    locked_until: null,
    password_changed_at: null,
    created_at: now,
    updated_at: now,
  };
}

function verifyLegacyPassword(password: string, storedHash: string | null): { isValid: boolean; requiresMigration: boolean } {
  if (!storedHash) {
    return { isValid: false, requiresMigration: true };
  }

  // Legacy plaintext format stored as plain:<password>
  if (storedHash.startsWith('plain:')) {
    const legacyPassword = storedHash.slice('plain:'.length);
    const passwordBuffer = Buffer.from(password);
    const legacyBuffer = Buffer.from(legacyPassword);

    if (passwordBuffer.length !== legacyBuffer.length) {
      return { isValid: false, requiresMigration: false };
    }

    return {
      isValid: timingSafeEqual(passwordBuffer, legacyBuffer),
      requiresMigration: false,
    };
  }

  // Legacy SHA-256 format
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const passwordHash = createHash('sha256').update(password).digest('hex');
    const passwordBuffer = Buffer.from(passwordHash, 'hex');
    const legacyBuffer = Buffer.from(storedHash, 'hex');

    return {
      isValid: timingSafeEqual(passwordBuffer, legacyBuffer),
      requiresMigration: false,
    };
  }

  return { isValid: false, requiresMigration: true };
}

/**
 * Handle logout
 * POST /api/auth?action=logout
 */
async function handleLogout(_req: VercelRequest, res: VercelResponse) {
  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Logged out successfully' });
}

/**
 * Handle registration
 * POST /api/auth?action=register
 * Body: { email, password, firstName, lastName }
 */
async function handleRegister(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { email, password, firstName, lastName } = req.body || {};

  if (!email || !password || !firstName || !lastName) {
    return sendError(res, 'All fields required: email, password, firstName, lastName', HttpStatus.BAD_REQUEST);
  }

  // Check if email exists
  const existing = await query(
    'SELECT id FROM profiles WHERE email = $1',
    [email.toLowerCase()]
  );

  if (existing.rows.length > 0) {
    return sendError(res, 'Email already registered', HttpStatus.CONFLICT);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user with student role
  const result = await query<{ id: string }>(
    `INSERT INTO profiles (email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1, $2, 'student', $3, $4, true, NOW(), NOW())
     RETURNING id`,
    [email.toLowerCase(), passwordHash, firstName, lastName]
  );

  const userId = result.rows[0].id;

  // Generate tokens
  const permissions = getPermissionsForRole('student');
  const accessToken = await generateAccessToken(userId, email.toLowerCase(), 'student', permissions);
  const refreshToken = await generateRefreshToken(userId);

  // Set cookies
  setAuthCookies(res, accessToken, refreshToken);

  return sendSuccess(res, {
    user: {
      id: userId,
      email: email.toLowerCase(),
      role: 'student',
      firstName,
      lastName,
    },
  }, HttpStatus.CREATED);
}

/**
 * Handle session check
 * GET /api/auth?action=session
 */
async function handleSession(req: VercelRequest, res: VercelResponse) {
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);

  if (!token) {
    return sendSuccess(res, { user: null });
  }

  try {
    const payload = await verifyAccessToken(token);
    
    // Get fresh user data
    const result = await query<{
      id: string;
      email: string;
      role: UserRole;
      first_name: string;
      last_name: string;
    }>(
      'SELECT id, email, role, first_name, last_name FROM profiles WHERE id = $1',
      [payload.sub]
    );

    if (result.rows.length === 0) {
      clearAuthCookies(res);
      return sendSuccess(res, { user: null });
    }

    const user = result.rows[0];
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        permissions: payload.permissions,
      },
    });
  } catch {
    // Token invalid or expired
    return sendSuccess(res, { user: null });
  }
}

/**
 * Handle token refresh
 * POST /api/auth?action=refresh
 */
async function handleRefresh(req: VercelRequest, res: VercelResponse) {
  const refreshTokenValue = extractRefreshTokenFromCookie(req);

  if (!refreshTokenValue) {
    return sendError(res, 'No refresh token', HttpStatus.UNAUTHORIZED);
  }

  try {
    const { sub: userId } = await verifyRefreshToken(refreshTokenValue);

    // Get user data
    const result = await query<{
      id: string;
      email: string;
      role: UserRole;
      first_name: string;
      last_name: string;
      is_active: boolean;
    }>(
      'SELECT id, email, role, first_name, last_name, is_active FROM profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      clearAuthCookies(res);
      return sendError(res, 'User not found or inactive', HttpStatus.UNAUTHORIZED);
    }

    const user = result.rows[0];

    // Generate new tokens
    const permissions = getPermissionsForRole(user.role);
    const newAccessToken = await generateAccessToken(user.id, user.email, user.role, permissions);
    const newRefreshToken = await generateRefreshToken(user.id);

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
      },
    });
  } catch {
    clearAuthCookies(res);
    return sendError(res, 'Invalid refresh token', HttpStatus.UNAUTHORIZED);
  }
}


/**
 * Handle role check for current authenticated user
 * GET /api/auth?action=roles
 */
async function handleRoles(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Try cookie first, then Bearer token
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);

  if (!token) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  try {
    const payload = await verifyAccessToken(token);

    const result = await query<{
      id: string;
      role: UserRole;
      is_active: boolean;
    }>(
      'SELECT id, role, is_active FROM profiles WHERE id = $1 LIMIT 1',
      [payload.sub]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      clearAuthCookies(res);
      return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
    }

    const user = result.rows[0];
    const permissions = getPermissionsForRole(user.role);

    return sendSuccess(res, {
      id: user.id,
      user_id: user.id,
      role: user.role,
      permissions,
      department: null,
      is_active: user.is_active,
    });
  } catch {
    clearAuthCookies(res);
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }
}


/**
 * Handle current user profile
 * GET /api/auth?action=profile
 * PATCH /api/auth?action=profile
 */
async function handleProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (!token) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED');
  }

  try {
    const payload = await verifyAccessToken(token);

    if (req.method === 'GET') {
      const result = await query<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        role: UserRole;
        date_of_birth: string | null;
        nationality: string | null;
        nrc_number: string | null;
        address: string | null;
        avatar_url: string | null;
      }>(
        `SELECT id, first_name, last_name, email, phone, role, date_of_birth, nationality, nrc_number, address, avatar_url
         FROM profiles WHERE id = $1 LIMIT 1`,
        [payload.sub]
      );

      if (result.rows.length === 0) {
        clearAuthCookies(res);
        return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }

      return sendSuccess(res, result.rows[0]);
    }

    const allowedFields = [
      'first_name',
      'last_name',
      'phone',
      'date_of_birth',
      'nationality',
      'nrc_number',
      'address',
      'avatar_url',
    ] as const;

    type AllowedField = typeof allowedFields[number];
    const isAllowedField = (key: string): key is AllowedField =>
      (allowedFields as readonly string[]).includes(key);

    const updates = req.body || {};
    const providedFields = Object.keys(updates).filter(isAllowedField);

    if (providedFields.length === 0) {
      return sendError(res, 'No valid fields to update', HttpStatus.BAD_REQUEST);
    }

    const values: unknown[] = [];
    const setClauses = providedFields.map((field, index) => {
      values.push(updates[field] ?? null);
      return `${field} = $${index + 1}`;
    });

    values.push(payload.sub);

    const result = await query<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      role: UserRole;
      date_of_birth: string | null;
      nationality: string | null;
      nrc_number: string | null;
      address: string | null;
      avatar_url: string | null;
    }>(
      `UPDATE profiles
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${providedFields.length + 1}
       RETURNING id, first_name, last_name, email, phone, role, date_of_birth, nationality, nrc_number, address, avatar_url`,
      values
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Profile not found', HttpStatus.NOT_FOUND);
    }

    return sendSuccess(res, result.rows[0]);
  } catch (error) {
    // Only clear cookies and return 401 for actual auth errors
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('expired') || msg.includes('signature') || msg.includes('invalid')) {
      clearAuthCookies(res);
      return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED, 'AUTHENTICATION_REQUIRED');
    }
    // For other errors (e.g., database), return 500
    console.error('[AUTH] Profile error:', msg);
    return sendError(res, 'Internal error', HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR');
  }
}

// Export with Arcjet protection (auth rate limit: 5 requests per 5 minutes)
export default withArcjetProtection(handler, 'auth');

/**
 * Handle email availability check
 * GET /api/auth?action=check-email&email=xxx
 * 
 * Requirements: 5.2, 10.2, 10.4 - Check email availability without exposing user data
 */
async function handleCheckEmail(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const email = req.query.email as string;

  if (!email) {
    return sendError(res, 'Email is required', HttpStatus.BAD_REQUEST);
  }

  // Check if email exists in profiles table
  const existing = await query<{ id: string }>(
    'SELECT id FROM profiles WHERE email = $1 LIMIT 1',
    [email.toLowerCase()]
  );

  // Return only availability status, no user data
  return sendSuccess(res, { available: existing.rows.length === 0 });
}

/**
 * Handle bootstrap - set password for legacy users
 * POST /api/auth?action=bootstrap
 * Body: { email, password, secret }
 * 
 * This is a one-time operation to migrate legacy Supabase Auth users
 * to the new custom auth system. Requires BOOTSTRAP_SECRET env var.
 */
async function handleBootstrap(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { email, password, secret } = req.body || {};
  const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_SECRET || process.env.MIGRATE_SECRET || process.env.JWT_SECRET;

  if (!BOOTSTRAP_SECRET) {
    return sendError(res, 'Bootstrap not configured', HttpStatus.SERVICE_UNAVAILABLE);
  }

  if (!secret || secret !== BOOTSTRAP_SECRET) {
    return sendError(res, 'Invalid bootstrap secret', HttpStatus.UNAUTHORIZED);
  }

  if (!email || !password) {
    return sendError(res, 'Email and password required', HttpStatus.BAD_REQUEST);
  }

  if (password.length < 8) {
    return sendError(res, 'Password must be at least 8 characters', HttpStatus.BAD_REQUEST);
  }

  // Find user by email
  const result = await query<{
    id: string;
    email: string;
    role: UserRole;
    first_name: string;
    last_name: string;
    password_hash: string | null;
  }>(
    `SELECT id, email, role, first_name, last_name, password_hash 
     FROM profiles WHERE email = $1 LIMIT 1`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0) {
    return sendError(res, 'User not found', HttpStatus.NOT_FOUND);
  }

  const user = result.rows[0];

  // Hash the new password
  const passwordHash = await hashPassword(password);

  // Update user's password
  await query(
    `UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, user.id]
  );

  return sendSuccess(res, {
    message: 'Password set successfully',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      hadPassword: !!user.password_hash,
    },
  });
}
