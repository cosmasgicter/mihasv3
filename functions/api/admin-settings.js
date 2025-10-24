import { createClient } from '@supabase/supabase-js';
import { supabaseAdminClient } from '../_lib/supabaseClient.js';
import { AuditLogger } from '../_lib/auditLogger.js';

export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
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
    const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }

    const { data: roleData } = await supabaseAdminClient
      .from('user_roles')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = user.email === 'cosmas@beanola.com' || 
                    ['super_admin', 'admin'].includes(roleData?.role);

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers });
    }

    if (request.method === 'GET') {
      const { data, error } = await supabaseAdminClient
        .from('system_settings')
        .select('*')
        .order('setting_key');

      if (error) throw error;
      return new Response(JSON.stringify({ data }), { status: 200, headers });
    }

    if (request.method === 'POST') {
      const body = await request.json();
      const { error } = await supabaseAdminClient
        .from('system_settings')
        .insert([body]);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 201, headers });
    }

    if (request.method === 'PUT') {
      const body = await request.json();
      const { id, ...updates } = body;
      
      // Get old settings
      const { data: oldSettings } = await supabaseAdminClient
        .from('system_settings')
        .select('*')
        .eq('id', id)
        .single();
      
      const { error } = await supabaseAdminClient
        .from('system_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      // Audit log
      const auditLogger = new AuditLogger(supabaseAdminClient);
      await auditLogger.log({
        actorId: user.id,
        action: 'system_settings_update',
        entityType: 'system_settings',
        entityId: id,
        changes: { old: oldSettings, new: updates },
        ipAddress: request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for'),
        userAgent: request.headers.get('user-agent')
      });
      
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    if (request.method === 'DELETE') {
      const body = await request.json();
      const { error } = await supabaseAdminClient
        .from('system_settings')
        .delete()
        .eq('id', body.id);

      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  } catch (error) {
    console.error('Error in admin-settings:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  }
}
