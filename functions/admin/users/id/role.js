import { supabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const usersIndex = parts.indexOf('users');
    const id = usersIndex >= 0 ? parts[usersIndex + 1] : context.params?.id;

    if (!id) {
      return new Response(JSON.stringify({ error: 'User ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authContext = await getUserFromRequest(request);
    if (authContext.error || !authContext.user) {
      return new Response(JSON.stringify({ error: authContext.error || 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Allow admins or the user themselves to fetch role
    if (!authContext.isAdmin && authContext.user.id !== id) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = supabaseAdminClient;

    // First try the profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', id)
      .maybeSingle();

    if (profileError) {
      console.error('profiles lookup error:', profileError.message);
    }

    if (profile && profile.role) {
      return new Response(JSON.stringify({ role: profile.role }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fallback to user_roles table
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', id)
      .eq('is_active', true)
      .limit(1);

    if (rolesError) {
      console.error('user_roles lookup error:', rolesError.message);
    }

    const role = Array.isArray(rolesData) && rolesData.length > 0 ? rolesData[0].role : null;

    return new Response(JSON.stringify({ role }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('role endpoint error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}