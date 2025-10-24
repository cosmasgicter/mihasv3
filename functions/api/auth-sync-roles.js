import { createClient } from '@supabase/supabase-js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
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
    const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers
      });
    }

    const { userId, role } = await request.json();

    if (!userId || !role) {
      return new Response(JSON.stringify({ error: 'userId and role are required' }), {
        status: 400,
        headers
      });
    }

    const { data: existingRole } = await supabaseAdminClient
      .from('user_roles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existingRole) {
      await supabaseAdminClient
        .from('user_roles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId);
    } else {
      await supabaseAdminClient
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          is_active: true
        });
    }

    await supabaseAdminClient
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Error in auth-sync-roles:', error);
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    }
  });
}
