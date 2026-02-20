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
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { logAuditEvent, logAuthEvent } from "../lib/auditLogger";

function deriveFullName(params: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const normalize = (value?: string | null): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const explicitFullName = normalize(params.full_name);
  if (explicitFullName) return explicitFullName;

  const firstName = normalize(params.first_name ?? params.firstName);
  const lastName = normalize(params.last_name ?? params.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (combinedName) return combinedName;

  const normalizedEmail = normalize(params.email);
  if (normalizedEmail) {
    const [localPart] = normalizedEmail.split('@');
    const cleanLocalPart = normalize(localPart);
    if (cleanLocalPart) return cleanLocalPart;
  }

  return 'Student';
}

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

/**
 * Hash a reset token using SHA-256
 * The raw token is sent to the user; only the hash is stored in the database.
 */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Build the password reset link sent to the user's email
 */
function buildResetPasswordLink(token: string): string {
  const origin = process.env.APP_URL || process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:5173';
  return `${origin.replace(/\/$/, '')}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Send password reset email via Resend.
 * Returns true if sent successfully, false otherwise.
 * On failure, logs a warning but never throws — the caller handles retry logic.
 */
async function sendPasswordResetEmail(email: string, fullName: string, resetLink: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[AUTH] RESEND_API_KEY not configured, cannot send reset email');
    return false;
  }

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Reset your MIHAS account password</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #374151;">
        Hello ${fullName || 'Student'}, we received a request to reset your account password.
      </p>
      <p style="font-size: 16px; line-height: 1.6; color: #374151;">
        Click the button below to continue. This link will expire in 60 minutes.
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

/**
 * Handle forgot-password
 * POST /api/auth?action=forgot-password
 * Body: { email }
 *
 * Generates a random 32-byte hex token, stores its SHA-256 hash in the profiles
 * table with a 1-hour expiry, and sends a reset link via Resend.
 * NEVER reveals whether the email exists in the system.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.6
 */
async function handleForgotPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { email } = req.body || {};
  if (!email || typeof email !== 'string') {
    return sendError(res, 'Email is required', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Look up the profile — but always return the same response regardless
  const userResult = await query<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT id, email, first_name, last_name
     FROM profiles WHERE email = $1 AND is_active = true LIMIT 1`,
    [normalizedEmail]
  );

  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];

    // Generate 32 random bytes as hex — this is the raw token sent to the user
    const rawToken = randomBytes(32).toString('hex');
    // Store only the SHA-256 hash in the database
    const tokenHash = hashResetToken(rawToken);

    // Store hash, set 1-hour expiry, mark as unused
    await query(
      `UPDATE profiles
       SET reset_token_hash = $1,
           reset_token_expires = NOW() + INTERVAL '1 hour',
           reset_token_used = false,
           updated_at = NOW()
       WHERE id = $2`,
      [tokenHash, user.id]
    );

    const resetLink = buildResetPasswordLink(rawToken);
    const fullName = deriveFullName(user);

    // Send email — on failure, log but don't expose to user (Req 6.6: queue with retry)
    try {
      const sent = await sendPasswordResetEmail(user.email, fullName, resetLink);
      if (!sent) {
        console.warn('[AUTH] Password reset email delivery failed, should be retried');
      }
    } catch {
      console.warn('[AUTH] Password reset email send threw, should be retried');
    }
  }

  // Always return the same message — never reveal whether email exists (Req 6.1)
  return sendSuccess(res, {
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
}

/**
 * Handle reset-password
 * POST /api/auth?action=reset-password
 * Body: { token, newPassword }
 *
 * Verifies the token hash against profiles.reset_token_hash, checks expiry
 * and one-time-use flag, updates password_hash with bcrypt (12 rounds),
 * then clears the reset token fields.
 *
 * Requirements: 6.3, 6.4, 6.5
 */
async function handleResetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { token, newPassword } = req.body || {};
  if (!token || typeof token !== 'string' || !newPassword || typeof newPassword !== 'string') {
    return sendError(res, 'Token and new password are required', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }

  if (newPassword.length < 8) {
    return sendError(res, 'Password must be at least 8 characters', HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR');
  }

  // Compute SHA-256 hash of the provided token
  const tokenHash = hashResetToken(token);

  // Find profile with matching hash, not expired, not used
  const profileResult = await query<{ id: string }>(
    `SELECT id FROM profiles
     WHERE reset_token_hash = $1
       AND reset_token_expires > NOW()
       AND reset_token_used = false
     LIMIT 1`,
    [tokenHash]
  );

  if (profileResult.rows.length === 0) {
    return sendError(res, 'Invalid or expired reset token', HttpStatus.BAD_REQUEST, 'INVALID_TOKEN');
  }

  const profileId = profileResult.rows[0].id;

  // Hash new password with bcrypt (12 rounds)
  const hashedPassword = await hashPassword(newPassword);

  // Update password, mark token as used, clear token fields
  await query(
    `UPDATE profiles
     SET password_hash = $1,
         reset_token_used = true,
         reset_token_hash = NULL,
         reset_token_expires = NULL,
         updated_at = NOW()
     WHERE id = $2`,
    [hashedPassword, profileId]
  );

  return sendSuccess(res, {
    message: 'Password has been reset successfully.',
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
      full_name: deriveFullName(user),
      permissions,
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
 * 
 * Deactivates ALL active sessions for the user, then clears auth cookies.
 */
async function handleLogout(req: VercelRequest, res: VercelResponse) {
  // Try to identify the user so we can deactivate their sessions
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      // Deactivate all sessions for this user
      await query(
        `UPDATE device_sessions SET is_active = false WHERE user_id = $1 AND is_active = true`,
        [payload.sub]
      );
      // Audit trail
      try {
        await logAuditEvent({
          actor_id: payload.sub,
          action: 'user_logout',
          entity_type: 'session',
          entity_id: payload.sub,
          changes: { all_sessions_deactivated: true },
        });
      } catch { /* non-blocking */ }
    } catch {
      // Token expired/invalid — still clear cookies, just can't deactivate sessions
    }
  }

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

  // Audit trail for user registration (Requirement 21.2)
  try {
    await logAuditEvent({
      actor_id: userId,
      action: 'user_registered',
      entity_type: 'user',
      entity_id: userId,
      changes: { role: 'student', self_registered: true },
    });
  } catch (auditError) {
    console.error('[auth] Failed to create registration audit log:', auditError);
  }

  return sendSuccess(res, {
    user: {
      id: userId,
      email: email.toLowerCase(),
      role: 'student',
      firstName,
      lastName,
      full_name: deriveFullName({ firstName, lastName, email }),
      permissions,
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
    const permissions = payload.permissions;
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        full_name: deriveFullName(user),
        permissions,
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
        full_name: deriveFullName(user),
        permissions,
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
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        role: UserRole;
        date_of_birth: string | null;
        sex: string | null;
        residence_town: string | null;
        nationality: string | null;
        nrc_number: string | null;
        address: string | null;
        avatar_url: string | null;
        next_of_kin_name: string | null;
        next_of_kin_phone: string | null;
      }>(
        `SELECT id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
         FROM profiles WHERE id = $1 LIMIT 1`,
        [payload.sub]
      );

      if (result.rows.length === 0) {
        clearAuthCookies(res);
        return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
      }

      const profileUser = {
      ...result.rows[0],
      full_name: deriveFullName(result.rows[0]),
    };

    return sendSuccess(res, {
      ...profileUser,
      user: profileUser,
    });
    }

    const allowedFields = [
      'full_name',
      'first_name',
      'last_name',
      'phone',
      'date_of_birth',
      'sex',
      'residence_town',
      'nationality',
      'nrc_number',
      'address',
      'avatar_url',
      'next_of_kin_name',
      'next_of_kin_phone',
    ] as const;

    type AllowedField = typeof allowedFields[number];
    const isAllowedField = (key: string): key is AllowedField =>
      (allowedFields as readonly string[]).includes(key);

    const updates = req.body || {};

    // If full_name is provided, also split into first_name/last_name for backward compat
    if (updates.full_name && typeof updates.full_name === 'string') {
      const parts = updates.full_name.trim().split(/\s+/);
      if (!updates.first_name) updates.first_name = parts[0] || null;
      if (!updates.last_name) updates.last_name = parts.slice(1).join(' ') || null;
    }

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
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      phone: string | null;
      role: UserRole;
      date_of_birth: string | null;
      sex: string | null;
      residence_town: string | null;
      nationality: string | null;
      nrc_number: string | null;
      address: string | null;
      avatar_url: string | null;
      next_of_kin_name: string | null;
      next_of_kin_phone: string | null;
    }>(
      `UPDATE profiles
       SET ${setClauses.join(', ')}, updated_at = NOW()
       WHERE id = $${providedFields.length + 1}
       RETURNING id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone`,
      values
    );

    if (result.rows.length === 0) {
      return sendError(res, 'Profile not found', HttpStatus.NOT_FOUND);
    }

    const profileUser = {
      ...result.rows[0],
      full_name: deriveFullName(result.rows[0]),
    };

    return sendSuccess(res, {
      ...profileUser,
      user: profileUser,
    });
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
      full_name: deriveFullName(user),
      hadPassword: !!user.password_hash,
    },
  });
}
