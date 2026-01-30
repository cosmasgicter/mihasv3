import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Consolidated Auth API
 * POST /api/auth?action=login - Sign in with email/password
 * POST /api/auth?action=signin - Alias for login
 * POST /api/auth?action=register - Create account (basic)
 * POST /api/auth?action=signup - Create account with profile
 * POST /api/auth?action=session - Log login/logout events
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const action = req.query.action as string || 'login';

  try {
    if (action === 'login' || action === 'signin') {
      return handleLogin(req, res);
    }
    if (action === 'register') {
      return handleRegister(req, res);
    }
    if (action === 'signup') {
      return handleSignup(req, res);
    }
    if (action === 'session') {
      return handleSession(req, res);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'auth');
  }
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  const { email, password } = req.body;
  if (!email || !password) {
    return sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
  }

  const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error) {
    console.log('[auth/login] Authentication failed');
    return sendError(res, 'Invalid email or password', HttpStatus.UNAUTHORIZED);
  }

  console.log('[auth/login] User authenticated:', data.user?.id);
  return sendSuccess(res, data);
}

async function handleRegister(req: VercelRequest, res: VercelResponse) {
  const { email, password, firstName, lastName, ...userData } = req.body;
  if (!email || !password) {
    return sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
  }

  const { data, error } = await supabaseAdmin.auth.signUp({
    email,
    password,
    options: { data: { first_name: firstName || '', last_name: lastName || '', ...userData } },
  });

  if (error) {
    console.log('[auth/register] Signup failed');
    return sendError(res, error.message, HttpStatus.BAD_REQUEST);
  }

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
      console.log('[auth/register] Profile created for user:', data.user.id);
    } catch {
      console.log('[auth/register] Profile creation failed, continuing');
    }
  }

  return sendSuccess(res, data);
}

async function handleSignup(req: VercelRequest, res: VercelResponse) {
  const { email, password, ...userData } = req.body;
  if (!email || !password) {
    return sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
  }

  const { data: existingUser } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (existingUser) {
    console.log('[auth/signup] Duplicate email attempt');
    return sendError(res, 'This email is already registered. Please sign in instead.', HttpStatus.BAD_REQUEST);
  }

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
    console.log('[auth/signup] Auth error occurred');
    if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
      return sendError(res, 'This email is already registered. Please sign in instead.', HttpStatus.BAD_REQUEST);
    }
    return sendError(res, 'Failed to create account. Please try again.', HttpStatus.BAD_REQUEST);
  }

  if (!authData.user) {
    return sendError(res, 'User creation failed', HttpStatus.BAD_REQUEST);
  }

  console.log('[auth/signup] User created:', authData.user.id);

  const { data: existingProfile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', authData.user.id)
    .single();

  if (existingProfile) {
    console.log('[auth/signup] Profile already exists');
    return sendSuccess(res, { user: authData.user, message: 'Account created successfully' });
  }

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
    console.log('[auth/signup] Profile creation failed, rolling back');
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return sendError(res, 'Failed to create profile. Please try again.', HttpStatus.BAD_REQUEST);
  }

  console.log('[auth/signup] Profile created for user:', authData.user.id);
  return sendSuccess(res, { user: authData.user, message: 'Account created successfully', autoLogin: true });
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  const { action } = req.body || {};
  if (!action || !['login', 'logout'].includes(action)) {
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  }

  const authResult = await getUserFromRequest(req);
  if ('error' in authResult) {
    return sendError(res, authResult.error, HttpStatus.UNAUTHORIZED);
  }

  const { user } = authResult;
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || (req.headers['x-real-ip'] as string) || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';

  const { error: auditError } = await supabaseAdmin.from('audit_logs').insert({
    actor_id: user.id,
    action: action === 'login' ? 'user_login' : 'user_logout',
    entity_type: 'user',
    entity_id: user.id,
    changes: { action },
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: new Date().toISOString(),
  });

  if (auditError) {
    console.error('[auth/session] Audit log error:', auditError.message);
  }

  return sendSuccess(res, { logged: true });
}
