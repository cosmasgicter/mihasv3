/**
 * Bootstrap API Endpoint
 * 
 * POST /api/bootstrap
 * 
 * One-time endpoint to set passwords for legacy Supabase Auth users.
 * This endpoint is NOT protected by Arcjet to allow initial setup.
 * 
 * SECURITY: Requires BOOTSTRAP_SECRET or JWT_SECRET to authenticate.
 * Should be disabled after migration is complete.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "../lib/cors";
import { query } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { handleError, sendSuccess, sendError, HttpStatus } from "../lib/errorHandler";
import { validateServerEnv } from "../lib/envValidator";

/**
 * Bootstrap Handler - NOT protected by Arcjet
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    return;
  }

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
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
      role: string;
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
  } catch (error) {
    return handleError(res, error);
  }
}
