import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Log without PII
      console.log('[login] Authentication failed');
      return sendError(res, 'Invalid email or password', HttpStatus.UNAUTHORIZED);
    }

    // Log success with user ID only (no PII)
    console.log('[login] User authenticated:', data.user?.id);

    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error, 'login');
  }
}
