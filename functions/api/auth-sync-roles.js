const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    const { userId, role } = JSON.parse(event.body || '{}');

    if (!userId || !role) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'userId and role are required' })
      };
    }

    // Check existing role
    const { data: existingRole } = await supabase
      .from('user_roles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (existingRole) {
      await supabase
        .from('user_roles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId);
    } else {
      await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role,
          is_active: true
        });
    }

    // Sync to profiles table
    await supabase
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Error in auth-sync-roles:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
