import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { checkRateLimit } from '../_lib/rateLimiter.js';
import { AuditLogger } from '../_lib/auditLogger.js';

// Rate limit: 3 signup attempts per minute per IP
const SIGNUP_RATE_LIMIT = { maxAttempts: 3, windowMs: 60000 };

export async function onRequestPost(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  const clientIp = request.headers.get('cf-connecting-ip') || 
                   request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   'unknown';
  const userAgent = request.headers.get('user-agent');
  const auditLogger = new AuditLogger(supabaseAdminClient);
  
  try {
    // Rate limiting by IP
    const rateLimitKey = `auth:signup:${clientIp}`;
    const rateLimit = await checkRateLimit(rateLimitKey, SIGNUP_RATE_LIMIT);
    
    if (rateLimit.isLimited) {
      const retryAfter = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000);
      
      // Audit log rate limit hit (no PII)
      try {
        await auditLogger.log({
          actorId: null,
          action: 'signup_rate_limited',
          entityType: 'auth',
          entityId: null,
          changes: { reason: 'rate_limit_exceeded' },
          ipAddress: clientIp,
          userAgent
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Too many signup attempts. Please try again later.' 
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString()
        }
      });
    }
    
    const body = await request.json();
    const { email, password, ...userData } = body;
    
    // Check if email already exists
    const { data: existingUser } = await supabaseAdminClient
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
    if (existingUser) {
      // Audit log duplicate signup attempt (no PII)
      try {
        await auditLogger.log({
          actorId: null,
          action: 'signup_duplicate_email',
          entityType: 'auth',
          entityId: null,
          changes: { reason: 'email_already_registered' },
          ipAddress: clientIp,
          userAgent
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ 
        success: false,
        error: 'This email is already registered. Please sign in instead.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create auth user using admin API (bypasses email confirmation)
    const { data: authData, error: authError } = await supabaseAdminClient.auth.admin.createUser({
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
        next_of_kin_phone: userData.next_of_kin_phone
      }
    });
    
    if (authError) {
      console.error('[SIGNUP] Auth error:', authError.message);
      
      // Audit log signup failure (no PII)
      try {
        await auditLogger.log({
          actorId: null,
          action: 'signup_failed',
          entityType: 'auth',
          entityId: null,
          changes: { reason: 'auth_error' },
          ipAddress: clientIp,
          userAgent
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      // Check for duplicate email
      if (authError.message?.includes('already registered') || authError.message?.includes('already exists')) {
        return new Response(JSON.stringify({ 
          success: false,
          error: 'This email is already registered. Please sign in instead.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to create account. Please try again.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    console.log('[SIGNUP] User created:', authData.user?.id);
    
    if (!authData.user) {
      return new Response(JSON.stringify({ success: false, error: 'User creation failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Check if profile already exists
    const { data: existingProfile } = await supabaseAdminClient
      .from('profiles')
      .select('id')
      .eq('id', authData.user.id)
      .single();
    
    if (existingProfile) {
      console.log('[SIGNUP] Profile already exists, skipping insert');
      
      // Audit log successful signup (use user ID only)
      try {
        await auditLogger.log({
          actorId: authData.user.id,
          action: 'signup_success',
          entityType: 'auth',
          entityId: authData.user.id,
          changes: { profile_existed: true },
          ipAddress: clientIp,
          userAgent
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ 
        success: true,
        user: authData.user,
        message: 'Account created successfully'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Create profile manually
    const nameParts = (userData.full_name || '').split(' ');
    const { error: profileError } = await supabaseAdminClient
      .from('profiles')
      .insert({
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
        is_active: true
      });
    
    if (profileError) {
      console.error('[SIGNUP] Profile error:', profileError.message);
      await supabaseAdminClient.auth.admin.deleteUser(authData.user.id);
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Failed to create profile. Please try again.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Audit log successful signup (use user ID only)
    try {
      await auditLogger.log({
        actorId: authData.user.id,
        action: 'signup_success',
        entityType: 'auth',
        entityId: authData.user.id,
        changes: { profile_created: true },
        ipAddress: clientIp,
        userAgent
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError.message);
    }
    
    // Return success - frontend will auto-login with credentials
    return new Response(JSON.stringify({ 
      success: true,
      user: authData.user,
      message: 'Account created successfully',
      autoLogin: true
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[SIGNUP] Error:', error.message);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'An error occurred during registration. Please try again.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
