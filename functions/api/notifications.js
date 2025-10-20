import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }

    if (request.method === 'GET') {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { status: 200, headers });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { notificationId, markAll } = body;
      const timestamp = new Date().toISOString();

      if (markAll) {
        const { error } = await supabase
          .from('in_app_notifications')
          .update({ read: true, read_at: timestamp })
          .eq('id', user.id)
          .eq('read', false);

        if (error) throw error;
      } else if (notificationId) {
        const { error } = await supabase
          .from('in_app_notifications')
          .update({ read: true, read_at: timestamp })
          .eq('id', notificationId)
          .eq('id', user.id);

        if (error) throw error;
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    if (request.method === 'DELETE') {
      const body = await request.json();
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', body.notificationId)
        .eq('id', user.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  } catch (error) {
    console.error('Error in notifications:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }
}
