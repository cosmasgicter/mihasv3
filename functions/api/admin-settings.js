const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
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

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = user.email === 'cosmas@beanola.com' || 
                    ['super_admin', 'admin'].includes(roleData?.role);

    if (!isAdmin) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    // GET - List all settings
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .order('setting_key');

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ data }) };
    }

    // POST - Create new setting
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { error } = await supabase
        .from('system_settings')
        .insert([body]);

      if (error) throw error;
      return { statusCode: 201, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT - Update setting
    if (event.httpMethod === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id, ...updates } = body;
      
      const { error } = await supabase
        .from('system_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // DELETE - Delete setting
    if (event.httpMethod === 'DELETE') {
      const body = JSON.parse(event.body || '{}');
      const { error } = await supabase
        .from('system_settings')
        .delete()
        .eq('id', body.id);

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (error) {
    console.error('Error in admin-settings:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
