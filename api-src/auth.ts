/**
 * Auth API Endpoint
 * 
 * GET/POST/PATCH /api/auth?action=login|logout|register|session|refresh|roles|profile
 * 
 * Custom Bun-Native Authentication System
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "../lib/cors";
import { query } from "../lib/db";
import { hashPassword, verifyPassword, isSha256Hash, verifySha256Password, migrateSha256ToBcrypt } from "../lib/auth/password";
import { 
  generateAccessToken, 
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  type UserRole 
} from "../lib/auth/jwt";
import { setAuthCookies, clearAuthCookies, extractAccessTokenFromCookie, extractRefreshTokenFromCookie, extractBearerToken } from "../lib/auth/cookies";
import { withArcjetProtection, arcjetProtect } from "../lib/arcjet";
import { handleError, sendSuccess, sendError, HttpStatus, logErrorAuditEvent } from "../lib/errorHandler";
import { createHash, randomBytes } from "crypto";
import { logAuditEvent, logAuthEvent } from "../lib/auditLogger";
import { generateToken as generateCsrfToken, rotateToken as rotateCsrfToken, ensureToken as ensureCsrfToken } from "../lib/csrf";
import { validateBody, validateQuery } from "../lib/validation/middleware";
import { loginBodySchema, registerBodySchema, passwordResetRequestBodySchema, passwordResetBodySchema, profileUpdateBodySchema, checkEmailQuerySchema } from "../lib/validation/auth";
import { validateServerEnv } from "../lib/envValidator";
import { createSession, deactivateAllSessions, deactivateSession, isSessionActive, parseDeviceInfo, updateActivity } from "../lib/sessions";
import { getEffectivePermissionsForUser } from "../lib/auth/userPermissionOverrides";

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

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  const action = req.query.action as string;

  // CSRF validation for state-changing actions (skip login, register, forgot-password, reset-password, password-reset-request, password-reset, logout — unauthenticated or stale-session safe)
  const csrfExemptActions = ['login', 'register', 'forgot-password', 'reset-password', 'password-reset-request', 'password-reset', 'refresh', 'logout'];
  if (!csrfExemptActions.includes(action)) {
    const { requireCsrf } = await import('../lib/csrf');
    if (await requireCsrf(req, res)) return;
  }

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
      case 'check-email':
        return await handleCheckEmail(req, res);
      case 'roles':
        return await handleRoles(req, res);
      case 'profile':
        return await handleProfile(req, res);
      case 'forgot-password':
      case 'password-reset-request':
        return await handlePasswordResetRequest(req, res);
      case 'reset-password':
      case 'password-reset':
        return await handlePasswordReset(req, res);
      default:
        return sendError(res, 'Invalid action. Use: login, logout, register, session, refresh, check-email, roles, profile, forgot-password, reset-password, password-reset-request, password-reset', HttpStatus.BAD_REQUEST);
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

// ============================================================================
// Login Attempt Tracking & Account Protection (Requirement 7)
// ============================================================================

/** Cooldown window: 15 minutes after 5 failures */
const LOGIN_COOLDOWN_THRESHOLD = 5;
const LOGIN_COOLDOWN_MINUTES = 15;

/** Account lockout: 30 minutes after 10 consecutive failures */
const LOGIN_LOCKOUT_THRESHOLD = 10;
const LOGIN_LOCKOUT_MINUTES = 30;

/** Registration rate limit: 3 per IP per 10 minutes */
const REGISTRATION_RATE_LIMIT = 3;
const REGISTRATION_RATE_WINDOW_MINUTES = 10;

/**
 * Hash a value with SHA-256 for PII-safe storage.
 * Used for email and IP addresses in login_attempts table.
 */
function hashForStorage(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Extract client IP address from request headers.
 */
function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function getRequestUserAgent(req: VercelRequest): string | null {
  const userAgent = req.headers['user-agent'];
  return typeof userAgent === 'string' ? userAgent : null;
}

async function createTrackedSession(req: VercelRequest, userId: string): Promise<string> {
  const userAgent = getRequestUserAgent(req);
  const session = await createSession({
    userId,
    deviceInfo: parseDeviceInfo(userAgent),
    ipAddress: getClientIp(req),
    userAgent,
  });

  return session.id;
}

async function ensureTrackedSession(
  req: VercelRequest,
  userId: string,
  sessionId?: string
): Promise<string> {
  if (sessionId) {
    const active = await isSessionActive(userId, sessionId);
    if (!active) {
      throw new Error('SESSION_REVOKED');
    }

    await updateActivity(sessionId).catch(() => {});
    return sessionId;
  }

  return createTrackedSession(req, userId);
}

/**
 * Record a login attempt (success or failure) in the login_attempts table.
 * Never throws — failures are logged but do not block the login flow.
 */
async function recordLoginAttempt(emailHash: string, ipHash: string, success: boolean): Promise<void> {
  try {
    await query(
      `INSERT INTO login_attempts (email_hash, ip_hash, attempted_at, success)
       VALUES ($1, $2, NOW(), $3)`,
      [emailHash, ipHash, success]
    );
  } catch (err) {
    console.error('[AUTH] Failed to record login attempt:', (err as Error).message);
    logErrorAuditEvent('auth/record-login-attempt', err).catch(() => {});
  }
}

/**
 * Check if an email is in cooldown (5+ failures in the last 15 minutes).
 * Returns { blocked: true, retryAfterSeconds } if cooldown is active.
 */
async function checkLoginCooldown(emailHash: string): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  try {
    const result = await query<{ fail_count: string; oldest_failure: string }>(
      `SELECT COUNT(*) AS fail_count, MIN(attempted_at) AS oldest_failure
       FROM login_attempts
       WHERE email_hash = $1
         AND success = FALSE
         AND attempted_at > NOW() - INTERVAL '${LOGIN_COOLDOWN_MINUTES} minutes'`,
      [emailHash]
    );

    const failCount = parseInt(result.rows[0]?.fail_count || '0', 10);

    if (failCount >= LOGIN_COOLDOWN_THRESHOLD) {
      // Calculate retry-after from the oldest failure in the window
      const oldestFailure = new Date(result.rows[0].oldest_failure);
      const cooldownEnd = new Date(oldestFailure.getTime() + LOGIN_COOLDOWN_MINUTES * 60 * 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000));
      return { blocked: true, retryAfterSeconds };
    }

    return { blocked: false, retryAfterSeconds: 0 };
  } catch (err) {
    console.error('[AUTH] Failed to check login cooldown:', (err as Error).message);
    logErrorAuditEvent('auth/check-login-cooldown', err).catch(() => {});
    // Fail open — don't block legitimate users if the check fails
    return { blocked: false, retryAfterSeconds: 0 };
  }
}

/**
 * Check if an account should be locked (10+ consecutive failures).
 * Returns { locked: true, retryAfterSeconds } if lockout is active.
 */
async function checkAccountLockout(emailHash: string): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  try {
    // Get the last 10 attempts for this email, ordered by most recent
    const result = await query<{ success: boolean; attempted_at: string }>(
      `SELECT success, attempted_at
       FROM login_attempts
       WHERE email_hash = $1
       ORDER BY attempted_at DESC
       LIMIT $2`,
      [emailHash, LOGIN_LOCKOUT_THRESHOLD]
    );

    if (result.rows.length < LOGIN_LOCKOUT_THRESHOLD) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    // Check if all of the last 10 attempts are failures
    const allFailed = result.rows.every(row => !row.success);
    if (!allFailed) {
      return { locked: false, retryAfterSeconds: 0 };
    }

    // Check if the lockout window is still active (30 min from the 10th failure)
    const tenthFailure = new Date(result.rows[result.rows.length - 1].attempted_at);
    const lockoutEnd = new Date(tenthFailure.getTime() + LOGIN_LOCKOUT_MINUTES * 60 * 1000);

    if (Date.now() < lockoutEnd.getTime()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((lockoutEnd.getTime() - Date.now()) / 1000));
      return { locked: true, retryAfterSeconds };
    }

    return { locked: false, retryAfterSeconds: 0 };
  } catch (err) {
    console.error('[AUTH] Failed to check account lockout:', (err as Error).message);
    logErrorAuditEvent('auth/check-account-lockout', err).catch(() => {});
    return { locked: false, retryAfterSeconds: 0 };
  }
}

/**
 * Send account lockout notification email via Resend.
 * Non-blocking — failures are logged but never thrown.
 */
async function sendLockoutNotificationEmail(email: string, fullName: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[AUTH] RESEND_API_KEY not configured, cannot send lockout notification');
    return;
  }

  try {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">MIHAS Account Security Alert</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          Hello ${fullName || 'Student'},
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          Your MIHAS account has been temporarily locked due to multiple failed login attempts.
          The account will be automatically unlocked after ${LOGIN_LOCKOUT_MINUTES} minutes.
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          If this was not you, we recommend resetting your password immediately after the lockout period ends.
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          This is an automated security notification from the MIHAS Application System.
        </p>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'noreply@mihas.edu.zm',
        to: email,
        subject: 'MIHAS Account Locked — Security Alert',
        html: emailHtml,
      }),
    });
  } catch (err) {
    console.error('[AUTH] Failed to send lockout notification email:', (err as Error).message);
    logErrorAuditEvent('auth/send-lockout-email', err).catch(() => {});
  }
}

/**
 * Handle password-reset-request (replaces forgot-password)
 * POST /api/auth?action=password-reset-request (or forgot-password for backward compat)
 * Body: { email }
 *
 * Rate-limited: 3 requests per email per 15-minute window.
 * Generates a 32-byte random token, stores its SHA-256 hash in password_reset_tokens,
 * and sends a reset link via Resend.
 * NEVER reveals whether the email exists in the system.
 *
 * Requirements: 3.1, 3.4, 3.5
 */
async function handlePasswordResetRequest(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(passwordResetRequestBodySchema, req, res);
  if (!parsed) return;

  const normalizedEmail = parsed.email.toLowerCase().trim();

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

    // Rate limit: 3 requests per email per 15-minute window
    const rateLimitResult = await query<{ request_count: string }>(
      `SELECT COUNT(*) AS request_count FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [user.id]
    );

    const requestCount = parseInt(rateLimitResult.rows[0]?.request_count || '0', 10);
    if (requestCount >= 3) {
      // Calculate Retry-After: seconds remaining in the 15-min window
      const oldestInWindowResult = await query<{ oldest: string }>(
        `SELECT MIN(created_at) AS oldest FROM password_reset_tokens
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
        [user.id]
      );
      const oldest = oldestInWindowResult.rows[0]?.oldest;
      let retryAfterSeconds = 900; // default 15 min
      if (oldest) {
        const windowEnd = new Date(oldest).getTime() + 15 * 60 * 1000;
        retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
      }
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return sendError(res, 'Too many password reset requests. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
    }

    // Generate 32 random bytes as hex — this is the raw token sent to the user
    const rawToken = randomBytes(32).toString('hex');
    // Store only the SHA-256 hash in the database
    const tokenHash = hashResetToken(rawToken);

    // Insert into password_reset_tokens with 1-hour expiry
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
      [user.id, tokenHash]
    );

    const resetLink = buildResetPasswordLink(rawToken);
    const fullName = deriveFullName(user);

    // Send email — on failure, log but don't expose to user
    try {
      const sent = await sendPasswordResetEmail(user.email, fullName, resetLink);
      if (!sent) {
        console.warn('[AUTH] Password reset email delivery failed, should be retried');
      }
    } catch (emailErr) {
      console.warn('[AUTH] Password reset email send threw, should be retried');
      logErrorAuditEvent('auth/password-reset-email', emailErr).catch(() => {});
    }
  }

  // Always return the same message — never reveal whether email exists
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
/**
 * Handle password-reset (replaces reset-password)
 * POST /api/auth?action=password-reset (or reset-password for backward compat)
 * Body: { token, newPassword }
 *
 * Validates the token against password_reset_tokens, changes the password,
 * marks the token as used, and invalidates ALL outstanding tokens for the user.
 *
 * Requirements: 3.2, 3.3
 */
async function handlePasswordReset(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(passwordResetBodySchema, req, res);
  if (!parsed) return;

  const { token, newPassword } = parsed;

  // Compute SHA-256 hash of the provided token
  const tokenHash = hashResetToken(token);

  // Find a valid token: matching hash, not expired, not used
  const tokenResult = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1
       AND expires_at > NOW()
       AND used_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );

  if (tokenResult.rows.length === 0) {
    return sendError(res, 'Invalid or expired reset token', HttpStatus.BAD_REQUEST, 'INVALID_TOKEN');
  }

  const { id: tokenId, user_id: userId } = tokenResult.rows[0];

  // Hash new password with bcrypt (12 rounds)
  const hashedPassword = await hashPassword(newPassword);

  // Update password on the profiles table
  await query(
    `UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [hashedPassword, userId]
  );

  // Mark this specific token as used
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
    [tokenId]
  );

  // Invalidate ALL outstanding (unused) tokens for this user
  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  return sendSuccess(res, {
    message: 'Password has been reset successfully.',
  });
}

/**
 * Handle login
 * POST /api/auth?action=login
 * Body: { email, password }
 *
 * Requirement 7: Per-email progressive backoff and account lockout.
 * - After 5 failures: 15-minute cooldown
 * - After 10 consecutive failures: 30-minute lockout + notification email
 * - All 429 responses include Retry-After header
 */
async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(loginBodySchema, req, res);
  if (!parsed) return;

  const { email, password } = parsed;
  const emailHash = hashForStorage(email);
  const ipHash = hashForStorage(getClientIp(req));

  // Check account lockout first (10 consecutive failures → 30 min lock)
  const lockout = await checkAccountLockout(emailHash);
  if (lockout.locked) {
    res.setHeader('Retry-After', String(lockout.retryAfterSeconds));
    return sendError(res, 'Account temporarily locked due to too many failed attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
  }

  // Check progressive cooldown (5 failures in 15 min window)
  const cooldown = await checkLoginCooldown(emailHash);
  if (cooldown.blocked) {
    res.setHeader('Retry-After', String(cooldown.retryAfterSeconds));
    return sendError(res, 'Too many login attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
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
    // Record failed attempt even for non-existent emails (prevents email enumeration timing)
    await recordLoginAttempt(emailHash, ipHash, false);
    return sendError(res, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  const user = result.rows[0];

  if (!user.is_active) {
    await recordLoginAttempt(emailHash, ipHash, false);
    return sendError(res, 'Account is disabled', HttpStatus.FORBIDDEN);
  }

  // Password verification (with SHA-256→bcrypt migration support)
  let passwordValid = false;

  if (user.password_hash && isSha256Hash(user.password_hash)) {
    // One-time SHA-256→bcrypt migration
    const sha256Valid = verifySha256Password(password, user.password_hash);
    if (sha256Valid) {
      const migrated = await migrateSha256ToBcrypt(user.id, password);
      passwordValid = migrated !== null;
    }
  } else {
    passwordValid = await verifyPassword(password, user.password_hash as string);
  }

  if (!passwordValid) {
    // Record failed attempt
    await recordLoginAttempt(emailHash, ipHash, false);

    // Check if this failure triggers account lockout (10 consecutive)
    const postFailLockout = await checkAccountLockout(emailHash);
    if (postFailLockout.locked) {
      // Queue lockout notification email (non-blocking)
      sendLockoutNotificationEmail(user.email, deriveFullName(user)).catch(() => {});
    }

    return sendError(res, 'Invalid credentials', HttpStatus.UNAUTHORIZED);
  }

  // Successful login — record success (resets consecutive failure count)
  await recordLoginAttempt(emailHash, ipHash, true);

  // Generate tokens
  const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);
  const sessionId = await createTrackedSession(req, user.id);
  const accessToken = await generateAccessToken(user.id, user.email, user.role, permissions, sessionId);
  const refreshToken = await generateRefreshToken(user.id, sessionId);

  // Set cookies
  setAuthCookies(res, accessToken, refreshToken);

  // Generate CSRF token and return in response header
  const csrfToken = await generateCsrfToken(user.id);
  res.setHeader('X-CSRF-Token', csrfToken);

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




/**
 * Handle logout
 * POST /api/auth?action=logout
 * 
 * Deactivates the current tracked session when available, then clears auth cookies.
 */
async function handleLogout(req: VercelRequest, res: VercelResponse) {
  // Try to identify the user so we can deactivate their sessions
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      const ipAddress = getClientIp(req);
      const userAgent = getRequestUserAgent(req);

      if (payload.sid) {
        await deactivateSession(payload.sid, payload.sub, ipAddress, userAgent);
      } else {
        await deactivateAllSessions(payload.sub, ipAddress, userAgent);
      }

      // Audit trail
      try {
        await logAuditEvent({
          actor_id: payload.sub,
          action: 'user_logout',
          entity_type: 'session',
          entity_id: payload.sid || payload.sub,
          changes: {
            current_session_deactivated: Boolean(payload.sid),
            fallback_all_sessions_deactivated: !payload.sid,
          },
        });
      } catch { /* non-blocking */ }
    } catch (logoutErr) {
      // Token expired/invalid — still clear cookies, just can't deactivate sessions
      logErrorAuditEvent('auth/logout-session-deactivation', logoutErr).catch(() => {});
    }
  }

  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Logged out successfully' });
}

/**
 * Produce a deterministic 64-char hex key for registration rate-limit tracking.
 * Re-hashes 'reg:' + ipHash through SHA-256 so the result fits VARCHAR(64)
 * while remaining distinct from login email hashes.
 */
function registrationKey(ipHash: string): string {
  return createHash('sha256').update('reg:' + ipHash).digest('hex');
}

/**
 * Check registration rate limit per IP address.
 * Returns { blocked: true, retryAfterSeconds } if limit exceeded.
 * Uses login_attempts table with a special email_hash prefix for registration tracking.
 */
async function checkRegistrationRateLimit(ipHash: string): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  try {
    const result = await query<{ reg_count: string; oldest_reg: string }>(
      `SELECT COUNT(*) AS reg_count, MIN(attempted_at) AS oldest_reg
       FROM login_attempts
       WHERE email_hash = $1
         AND attempted_at > NOW() - INTERVAL '${REGISTRATION_RATE_WINDOW_MINUTES} minutes'`,
      [registrationKey(ipHash)]
    );

    const regCount = parseInt(result.rows[0]?.reg_count || '0', 10);

    if (regCount >= REGISTRATION_RATE_LIMIT) {
      const oldestReg = new Date(result.rows[0].oldest_reg);
      const windowEnd = new Date(oldestReg.getTime() + REGISTRATION_RATE_WINDOW_MINUTES * 60 * 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd.getTime() - Date.now()) / 1000));
      return { blocked: true, retryAfterSeconds };
    }

    return { blocked: false, retryAfterSeconds: 0 };
  } catch (err) {
    console.error('[AUTH] Failed to check registration rate limit:', (err as Error).message);
    logErrorAuditEvent('auth/check-registration-rate-limit', err).catch(() => {});
    return { blocked: false, retryAfterSeconds: 0 };
  }
}

/**
 * Record a registration attempt for IP-based rate limiting.
 */
async function recordRegistrationAttempt(ipHash: string): Promise<void> {
  try {
    await query(
      `INSERT INTO login_attempts (email_hash, ip_hash, attempted_at, success)
       VALUES ($1, $2, NOW(), TRUE)`,
      [registrationKey(ipHash), ipHash]
    );
  } catch (err) {
    console.error('[AUTH] Failed to record registration attempt:', (err as Error).message);
    logErrorAuditEvent('auth/record-registration-attempt', err).catch(() => {});
  }
}

/**
 * Handle registration
 * POST /api/auth?action=register
 * Body: { email, password, firstName, lastName, phone?, date_of_birth?, sex?, residence_town?, country?, nationality?, next_of_kin_name?, next_of_kin_phone? }
 *
 * Requirement 7.5: Rate-limited to 3 registrations per IP per 10-minute window.
 */
async function handleRegister(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(registerBodySchema, req, res);
  if (!parsed) return;

  // Arcjet registration rate limit: 3 per IP per 10 minutes (Requirement 7.5)
  const arcjetResult = await arcjetProtect(req, 'registration');
  if (!arcjetResult.allowed) {
    res.setHeader('Retry-After', '600');
    return sendError(res, 'Too many registration attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
  }

  const ipHash = hashForStorage(getClientIp(req));

  // DB-based registration rate limit fallback: 3 per IP per 10 minutes (Requirement 7.5)
  const regLimit = await checkRegistrationRateLimit(ipHash);
  if (regLimit.blocked) {
    res.setHeader('Retry-After', String(regLimit.retryAfterSeconds));
    return sendError(res, 'Too many registration attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMIT_EXCEEDED');
  }

  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    date_of_birth,
    sex,
    residence_town,
    nationality,
    next_of_kin_name,
    next_of_kin_phone,
  } = parsed;

  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

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
    `INSERT INTO profiles (
       email,
       password_hash,
       role,
       first_name,
       last_name,
       full_name,
       phone,
       date_of_birth,
       sex,
       residence_town,
       nationality,
       next_of_kin_name,
       next_of_kin_phone,
       is_active,
       created_at,
       updated_at
     )
     VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())
     RETURNING id`,
    [
      email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      fullName,
      phone || null,
      date_of_birth || null,
      sex || null,
      residence_town || null,
      nationality || 'Zambian',
      next_of_kin_name || null,
      next_of_kin_phone || null,
    ]
  );

  const userId = result.rows[0].id;

  // Generate tokens
  const { permissions } = await getEffectivePermissionsForUser(userId, 'student');
  const sessionId = await createTrackedSession(req, userId);
  const accessToken = await generateAccessToken(userId, email.toLowerCase(), 'student', permissions, sessionId);
  const refreshToken = await generateRefreshToken(userId, sessionId);

  // Set cookies
  setAuthCookies(res, accessToken, refreshToken);

  // Generate CSRF token for the newly authenticated session
  const csrfToken = await generateCsrfToken(userId);
  res.setHeader('X-CSRF-Token', csrfToken);

  // Record registration attempt for IP-based rate limiting (Requirement 7.5)
  await recordRegistrationAttempt(ipHash);

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
    logErrorAuditEvent('auth/registration-audit', auditError).catch(() => {});
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
    profile: {
      id: userId,
      email: email.toLowerCase(),
      role: 'student',
      first_name: firstName,
      last_name: lastName,
      full_name: fullName || deriveFullName({ firstName, lastName, email }),
      phone: phone || null,
      date_of_birth: date_of_birth || null,
      sex: sex || null,
      residence_town: residence_town || null,
      nationality: nationality || 'Zambian',
      next_of_kin_name: next_of_kin_name || null,
      next_of_kin_phone: next_of_kin_phone || null,
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

    if (payload.sid) {
      const sessionActive = await isSessionActive(payload.sub, payload.sid);
      if (!sessionActive) {
        clearAuthCookies(res);
        return sendSuccess(res, { user: null });
      }

      await updateActivity(payload.sid).catch(() => {});
    }
    
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
    const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);

    // Restore CSRF token on session check so page refreshes don't lose it.
    // Uses ensureToken (additive) instead of generateToken (destructive) so
    // existing valid tokens from login/refresh are not invalidated.
    const csrfToken = await ensureCsrfToken(user.id);
    res.setHeader('X-CSRF-Token', csrfToken);

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
    const refreshPayload = await verifyRefreshToken(refreshTokenValue);
    const { sub: userId } = refreshPayload;

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

    const sessionId = await ensureTrackedSession(req, user.id, refreshPayload.sid);

    // Generate new tokens
    const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);
    const newAccessToken = await generateAccessToken(user.id, user.email, user.role, permissions, sessionId);
    const newRefreshToken = await generateRefreshToken(user.id, sessionId);

    // Set new cookies
    setAuthCookies(res, newAccessToken, newRefreshToken);

    // Rotate CSRF token alongside auth tokens
    const newCsrfToken = await rotateCsrfToken(user.id);
    res.setHeader('X-CSRF-Token', newCsrfToken);

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
  } catch (error) {
    clearAuthCookies(res);
    if (error instanceof Error && error.message === 'SESSION_REVOKED') {
      return sendError(res, 'Session has expired or was revoked', HttpStatus.UNAUTHORIZED);
    }
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
    const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);

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
        country: string | null;
        nationality: string | null;
        nrc_number: string | null;
        address: string | null;
        avatar_url: string | null;
        next_of_kin_name: string | null;
        next_of_kin_phone: string | null;
      }>(
        `SELECT id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, country, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
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
      'country',
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

    const updates = validateBody(profileUpdateBodySchema, req, res);
    if (!updates) return;

    // If full_name is provided, also split into first_name/last_name for backward compat
    if (updates.full_name && typeof updates.full_name === 'string') {
      const parts = updates.full_name.trim().split(/\s+/);
      if (!updates.first_name) updates.first_name = parts[0] || undefined;
      if (!updates.last_name) updates.last_name = parts.slice(1).join(' ') || undefined;
    }

    // Nationality is the canonical field — citizenship column has been removed from the DB

    const providedFields = Object.keys(updates).filter(isAllowedField);

    if (providedFields.length === 0) {
      return sendError(res, 'No valid fields to update', HttpStatus.BAD_REQUEST);
    }

    const values: unknown[] = [];
    const setClauses = providedFields.map((field, index) => {
      values.push((updates as Record<string, unknown>)[field] ?? null);
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
      country: string | null;
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
       RETURNING id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, country, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone`,
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
    logErrorAuditEvent('auth/profile', error).catch(() => {});
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

  const parsed = validateQuery(checkEmailQuerySchema, req, res);
  if (!parsed) return;

  const email = parsed.email;

  // Check if email exists in profiles table
  const existing = await query<{ id: string }>(
    'SELECT id FROM profiles WHERE email = $1 LIMIT 1',
    [email.toLowerCase()]
  );

  // Return only availability status, no user data
  return sendSuccess(res, { available: existing.rows.length === 0 });
}
