import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * POST /api/auth/signin
 * Sign in user with email and password (alias for login)
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
      console.log('[signin] Authentication failed');
      return sendError(res, error.message, HttpStatus.BAD_REQUEST);
    }

    console.log('[signin] User authenticated:', data.user?.id);
    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error, 'signin');
  }
}
