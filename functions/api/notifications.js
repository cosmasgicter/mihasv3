const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // GET - List notifications
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('in_app_notifications')
        .select('*')
        .eq('id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ data }) };
    }

    // PUT - Mark as read
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
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

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // DELETE - Delete notification
    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', body.notificationId)
        .eq('id', user.id);

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error in notifications:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
