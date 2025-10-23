import { supabaseAdminClient, getUserFromRequest } from '../../../_lib/supabaseClient.js';

export async function onRequestPost(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest(request, { requireAdmin: true });
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json();
    const { applicationIds, status, notes } = body;
    
    if (!applicationIds || !Array.isArray(applicationIds) || applicationIds.length === 0) {
      return new Response(JSON.stringify({ error: 'applicationIds array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!status) {
      return new Response(JSON.stringify({ error: 'status is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const { data, error } = await supabaseAdminClient
      .from('applications')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', applicationIds)
      .select();
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Log status changes
    const historyEntries = applicationIds.map(id => ({
      application_id: id,
      status,
      changed_by: authContext.user.id,
      notes,
      created_at: new Date().toISOString()
    }));
    
    await supabaseAdminClient.from('application_status_history').insert(historyEntries);
    
    return new Response(JSON.stringify({ success: true, updated: data.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
