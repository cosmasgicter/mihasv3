import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * POST /api/auth/signup
 * Create a new user account with profile
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const { email, password, ...userData } = req.body;

    if (!email || !password) {
      return sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      console.log('[signup] Duplicate email attempt');
      return sendError(
        res,
        'This email is already registered. Please sign in instead.',
        HttpStatus.BAD_REQUEST
      );
    }

    // Create auth user using admin API (bypasses email confirmation)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: userData.full_name,
        phone: userData.phone,
        date_of_birth: userData.date_of_birth,
        sex: userData.sex,
        residence_town: userData.residence_town,
        nationality: userData.nationality,
        next_of_kin_name: userData.next_of_kin_name,
        next_of_kin_phone: userData.next_of_kin_phone,
      },
    });

    if (authError) {
      console.log('[signup] Auth error occurred');

      if (
        authError.message?.includes('already registered') ||
        authError.message?.includes('already exists')
      ) {
        return sendError(
          res,
          'This email is already registered. Please sign in instead.',
          HttpStatus.BAD_REQUEST
        );
      }

      return sendError(res, 'Failed to create account. Please try again.', HttpStatus.BAD_REQUEST);
    }

    if (!authData.user) {
      return sendError(res, 'User creation failed', HttpStatus.BAD_REQUEST);
    }

    console.log('[signup] User created:', authData.user.id);

    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .single();

    if (existingProfile) {
      console.log('[signup] Profile already exists');
      return sendSuccess(res, {
        user: authData.user,
        message: 'Account created successfully',
      });
    }

    // Create profile manually
    const nameParts = (userData.full_name || '').split(' ');
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authData.user.id,
      email: authData.user.email,
      full_name: userData.full_name || '',
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      phone: userData.phone || '',
      date_of_birth: userData.date_of_birth || null,
      sex: userData.sex || '',
      residence_town: userData.residence_town || '',
      nationality: userData.nationality || '',
      next_of_kin_name: userData.next_of_kin_name || '',
      next_of_kin_phone: userData.next_of_kin_phone || '',
      role: 'student',
      is_active: true,
    });

    if (profileError) {
      console.log('[signup] Profile creation failed, rolling back');
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return sendError(res, 'Failed to create profile. Please try again.', HttpStatus.BAD_REQUEST);
    }

    console.log('[signup] Profile created for user:', authData.user.id);

    return sendSuccess(res, {
      user: authData.user,
      message: 'Account created successfully',
      autoLogin: true,
    });
  } catch (error) {
    return handleError(res, error, 'signup');
  }
}
