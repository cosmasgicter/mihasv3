import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

// Auto-cleanup sessions older than 30 days
async function cleanupOldSessions(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  await supabaseAdminClient
    .from('device_sessions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .lt('last_activity', thirtyDaysAgo.toISOString());
}

export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const headers = {};
    for (const [key, value] of request.headers.entries()) {
      headers[key.toLowerCase()] = value;
    }
    
    const authContext = await getUserFromRequest({ headers });
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Cleanup old sessions before fetching
    await cleanupOldSessions(authContext.user.id);
    
    const { data, error } = await supabaseAdminClient
      .from('device_sessions')
      .select('*')
      .eq('user_id', authContext.user.id)
      .eq('is_active', true)
      .order('last_activity', { ascending: false })
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ data }), {
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

export async function onRequestDelete(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  try {
    const headers = {};
    for (const [key, value] of request.headers.entries()) {
      headers[key.toLowerCase()] = value;
    }
    
    const authContext = await getUserFromRequest({ headers });
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const url = new URL(request.url);
    const deviceId = url.searchParams.get('device_id');
    
    if (!deviceId) {
      return new Response(JSON.stringify({ error: 'device_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get session token before deactivating
    const { data: sessionData } = await supabaseAdminClient
      .from('device_sessions')
      .select('session_token')
      .eq('user_id', authContext.user.id)
      .eq('device_id', deviceId)
      .single();
    
    // Deactivate device session
    const { error } = await supabaseAdminClient
      .from('device_sessions')
      .update({ is_active: false })
      .eq('user_id', authContext.user.id)
      .eq('device_id', deviceId);
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Revoke the actual auth session
    if (sessionData?.session_token) {
      try {
        await supabaseAdminClient.auth.admin.signOut(sessionData.session_token);
      } catch (e) {
        console.error('Failed to revoke session:', e);
      }
    }
    
    return new Response(JSON.stringify({ success: true }), {
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
