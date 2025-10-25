import { supabaseAdminClient } from '../_lib/supabaseClient.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function onRequestPost(context) {
  const { request } = context;
  
  try {
    const { email } = await request.json();
    
    if (!email) {
      return new Response(JSON.stringify({ 
        available: false,
        error: 'Email is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { data: existingUser, error } = await supabaseAdminClient
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();
    
    if (error) {
      console.error('[CHECK_EMAIL] Error:', error);
      return new Response(JSON.stringify({ 
        available: true
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const emailExists = !!existingUser;
    
    return new Response(JSON.stringify({ 
      available: !emailExists,
      message: emailExists ? 'This email is already registered' : 'Email is available'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[CHECK_EMAIL] Catch error:', error);
    return new Response(JSON.stringify({ 
      available: true,
      error: 'Unable to check email availability'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
