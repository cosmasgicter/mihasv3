import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const supabase = supabaseAdminClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: {
          first_name: body.firstName || '',
          last_name: body.lastName || '',
          ...body.user_metadata
        }
      }
    });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create profile if user was created successfully
    if (data.user) {
      try {
        await supabase.from('profiles').insert({
          id: data.user.id,
          email: body.email,
          first_name: body.firstName || '',
          last_name: body.lastName || '',
          full_name: `${body.firstName || ''} ${body.lastName || ''}`.trim(),
          role: 'student',
          is_active: true
        });
      } catch (profileError) {
        console.error('Profile creation error:', profileError);
        // Don't fail the registration if profile creation fails
      }
    }
    
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}