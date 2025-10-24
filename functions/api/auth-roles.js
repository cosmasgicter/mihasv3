import { createClient } from '@supabase/supabase-js';

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache'
  };

  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = supabaseAdminClient(
      env.VITE_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers
      });
    }

    if (user.email === 'cosmas@beanola.com') {
      return new Response(JSON.stringify({
        data: {
          id: 'super-admin-override',
          user_id: user.id,
          role: 'super_admin',
          permissions: ['*'],
          department: null,
          is_active: true
        }
      }), { status: 200, headers });
    }

    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (roleError) {
      console.error('Role query error:', roleError);
      return new Response(JSON.stringify({ error: 'Failed to fetch role' }), {
        status: 500,
        headers
      });
    }

    return new Response(JSON.stringify({ data: roleData }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error in auth-roles:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, OPTIONS'
    }
  });
}
