/**
 * Auth API Endpoint
 * 
 * GET/POST /api/auth?action=login|logout|register|session|refresh|roles
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
import { setAuthCookies, clearAuthCookies, extractAccessTokenFromCookie, extractRefreshTokenFromCookie } from "../lib/auth/cookies";
import { withArcjetProtection } from "../lib/arcjet";
import { handleError, sendSuccess, sendError, HttpStatus } from "../lib/errorHandler";
import { createHash, timingSafeEqual } from "crypto";

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
        return handleLogin(req, res);
      case 'logout':
        return handleLogout(req, res);
      case 'register':
        return handleRegister(req, res);
      case 'session':
        return handleSession(req, res);
      case 'refresh':
        return handleRefresh(req, res);
      case 'bootstrap':
        return handleBootstrap(req, res);
      case 'check-email':
        return handleCheckEmail(req, res);
      case 'roles':
        return handleRoles(req, res);
      default:
        return sendError(res, 'Invalid action. Use: login, logout, register, session, refresh, bootstrap, check-email, roles', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error);
  }
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
  const token = extractAccessTokenFromCookie(req);

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

  const token = extractAccessTokenFromCookie(req);

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
