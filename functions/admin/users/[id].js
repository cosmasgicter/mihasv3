import { supabaseAdminClient, getUserFromRequest } from '../../_lib/supabaseClient.js';
import { AuditLogger } from '../../_lib/auditLogger.js';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const id = url.pathname.split('/').pop();
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest(request, { requireAdmin: true });
    if (authContext.error) {
      return new Response(JSON.stringify({ success: false, error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const supabase = supabaseAdminClient;
    const auditLogger = new AuditLogger(supabase);
    
    if (request.method === 'GET') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'PUT') {
      const body = await request.json();
      
      // Fetch current profile for audit trail (exclude PII from changes)
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role, status, email_verified')
        .eq('id', id)
        .single();
      
      const { data, error } = await supabase
        .from('profiles')
        .update(body)
        .eq('id', id)
        .select()
        .single();
      
      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Audit log for user profile update (only log non-PII changes)
      try {
        const auditableFields = ['role', 'status', 'email_verified'];
        const changes = {};
        for (const field of auditableFields) {
          if (body[field] !== undefined && currentProfile && body[field] !== currentProfile[field]) {
            changes[field] = { old: currentProfile[field], new: body[field] };
          }
        }
        
        await auditLogger.logUserAction(
          authContext.user.id,
          'admin_update_user',
          id,
          changes,
          request
        );
      } catch (auditError) {
        console.error('Audit log error:', auditError.message);
      }
      
      return new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Admin user API error:', error.message);
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
