import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { checkRateLimit } from '../_lib/rateLimiter.js';
import { AuditLogger } from '../_lib/auditLogger.js';

// Rate limit: 5 login attempts per minute per IP
const LOGIN_RATE_LIMIT = { maxAttempts: 5, windowMs: 60000 };

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
    const rateLimitKey = `auth:login:${clientIp}`;
    const rateLimit = await checkRateLimit(rateLimitKey, LOGIN_RATE_LIMIT);
    
    if (rateLimit.isLimited) {
      const retryAfter = Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000);
      
      // Audit log rate limit hit (no PII)
      try {
        await auditLogger.log({
          actorId: null,
          action: 'login_rate_limited',
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
        error: 'Too many login attempts. Please try again later.' 
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': rateLimit.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.floor(rateLimit.resetAt.getTime() / 1000).toString()
        }
      });
    }
    
    const body = await request.json();
    const { data, error } = await supabaseAdminClient.auth.signInWithPassword({
      email: body.email,
      password: body.password
    });
    
    if (error) {
      // Audit log failed login (no PII - don't log email)
      try {
        await auditLogger.log({
          actorId: null,
          action: 'login_failed',
          entityType: 'auth',
          entityId: null,
          changes: { reason: 'invalid_credentials' },
          ipAddress: clientIp,
          userAgent
        });
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ success: false, error: 'Invalid email or password' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Audit log successful login (use user ID, not email)
    try {
      await auditLogger.log({
        actorId: data.user?.id,
        action: 'login_success',
        entityType: 'auth',
        entityId: data.user?.id,
        changes: { method: 'password' },
        ipAddress: clientIp,
        userAgent
      });
    } catch (auditError) {
      console.error('Audit log error:', auditError.message);
    }
    
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return new Response(JSON.stringify({ success: false, error: 'Authentication failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}