/**
 * CSRF Protection Module
 *
 * Generates, validates, and rotates CSRF tokens for state-changing requests.
 * Tokens are 32-byte random values; only their SHA-256 hashes are stored in the DB.
 *
 * Integration:
 *  - On login: generateToken(userId) → raw token returned in X-CSRF-Token header
 *  - On POST/PATCH/DELETE: validateToken(userId, rawToken) → boolean
 *  - On refresh: rotateToken(userId) → new raw token
 *
 * SECURITY NOTES:
 *  - Raw tokens are never persisted — only SHA-256 hashes
 *  - Tokens expire after 24 hours
 *  - Old tokens are cleaned up on generation/rotation
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes, createHash } from 'crypto';
import { query } from './db';
import { getAuthUser } from './auth/middleware';
import { sendError } from './errorHandler';

/** Token lifetime: 24 hours */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Hash a raw token with SHA-256 for storage.
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Generate a new CSRF token for a user.
 *
 * 1. Deletes any existing tokens for the user (one active token per user).
 * 2. Creates a 32-byte random token.
 * 3. Stores the SHA-256 hash in csrf_tokens.
 * 4. Returns the raw token (caller sends it to the client).
 */
export async function generateToken(userId: string): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Remove old tokens for this user
  await query('DELETE FROM csrf_tokens WHERE user_id = $1', [userId]);

  // Insert new token
  await query(
    `INSERT INTO csrf_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );

  return raw;
}

/**
 * Validate a CSRF token from the X-CSRF-Token header.
 *
 * Returns true only if a non-expired row exists for the user with a matching hash.
 */
export async function validateToken(userId: string, raw: string): Promise<boolean> {
  if (!raw || !userId) return false;

  const hash = hashToken(raw);

  const result = await query<{ id: string }>(
    `SELECT id FROM csrf_tokens
     WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()
     LIMIT 1`,
    [userId, hash],
  );

  return result.rows.length > 0;
}

/**
 * Rotate the CSRF token (called during session refresh).
 *
 * Deletes the old token and generates a fresh one.
 * Returns the new raw token.
 */
export async function rotateToken(userId: string): Promise<string> {
  return generateToken(userId);
}

/**
 * Ensure a CSRF token exists for a user, creating one if needed.
 *
 * Unlike generateToken(), this does NOT delete existing valid tokens.
 * Used by the session endpoint so that:
 *  - If the frontend still has a valid token in memory, it keeps working.
 *  - If the frontend lost its token (page refresh), the new one is returned.
 *
 * Cleans up only expired tokens to prevent unbounded growth.
 */
export async function ensureToken(userId: string): Promise<string> {
  // Clean up expired tokens only (not valid ones)
  await query('DELETE FROM csrf_tokens WHERE user_id = $1 AND expires_at <= NOW()', [userId]);

  // Generate a new token (additive — existing valid tokens remain)
  const raw = randomBytes(32).toString('hex');
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await query(
    `INSERT INTO csrf_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hash, expiresAt],
  );

  return raw;
}


/**
 * CSRF validation middleware for state-changing requests.
 *
 * Call at the top of POST/PATCH/DELETE handlers (after CORS, before business logic).
 * Skips validation for login, register, and other unauthenticated actions.
 *
 * Returns true if the request should be blocked (response already sent).
 * Returns false if validation passed or was skipped (continue processing).
 */
export async function requireCsrf(
  req: VercelRequest,
  res: VercelResponse,
): Promise<boolean> {
  const method = (req.method || '').toUpperCase();

  // Only validate state-changing methods
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
    return false;
  }

  // Get authenticated user — if not authenticated, skip CSRF
  // (auth middleware will reject unauthenticated requests separately)
  const user = await getAuthUser(req);
  if (!user) {
    return false;
  }

  const token = req.headers['x-csrf-token'] as string | undefined;

  if (!token) {
    sendError(res, 'CSRF token required', 403, 'CSRF_VALIDATION_FAILED');
    return true;
  }

  const valid = await validateToken(user.userId, token);
  if (!valid) {
    sendError(res, 'Invalid CSRF token', 403, 'CSRF_VALIDATION_FAILED');
    return true;
  }

  return false;
}
