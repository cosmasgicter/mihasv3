import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * POST /api/auth/register
 * Register a new user account
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const { email, password, firstName, lastName, ...userData } = req.body;

    if (!email || !password) {
      return sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
    }

    const { data, error } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName || '',
          last_name: lastName || '',
          ...userData,
        },
      },
    });

    if (error) {
      console.log('[register] Signup failed');
      return sendError(res, error.message, HttpStatus.BAD_REQUEST);
    }

    // Create profile if user was created successfully
    if (data.user) {
      try {
        await supabaseAdmin.from('profiles').insert({
          id: data.user.id,
          email,
          first_name: firstName || '',
          last_name: lastName || '',
          full_name: `${firstName || ''} ${lastName || ''}`.trim(),
          role: 'student',
          is_active: true,
        });
        console.log('[register] Profile created for user:', data.user.id);
      } catch (profileError) {
        // Don't fail registration if profile creation fails
        console.log('[register] Profile creation failed, continuing');
      }
    }

    return sendSuccess(res, data);
  } catch (error) {
    return handleError(res, error, 'register');
  }
}
