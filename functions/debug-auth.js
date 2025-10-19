import { supabaseAdminClient } from './_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  try {
    const headers = {};
    for (const [key, value] of request.headers.entries()) {
      headers[key.toLowerCase()] = value;
    }
    
    const authHeader = headers.authorization;
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const parts = token.split('.');
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    const payload = JSON.parse(decoded);
    const userId = payload.sub;
    
    const { data: profile, error: userError } = await supabaseAdminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    return new Response(JSON.stringify({
      userId,
      profileFound: !!profile,
      profile: profile ? { id: profile.id, email: profile.email, role: profile.role } : null,
      error: userError ? { message: userError.message, details: userError.details, hint: userError.hint, code: userError.code } : null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
