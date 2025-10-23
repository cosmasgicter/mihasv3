import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    
    if (request.method === 'GET') {
      // Get applications pending review
      const { data, error } = await supabaseAdminClient
        .from('applications')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify(data || []), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (request.method === 'POST') {
      const body = await request.json();
      const { application_id, status, notes } = body;
      
      if (!application_id || !status) {
        return new Response(JSON.stringify({ error: 'application_id and status are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const { data, error } = await supabaseAdminClient
        .from('applications')
        .update({
          status,
          reviewed_by: authContext.user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes
        })
        .eq('id', application_id)
        .select()
        .single();
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Log status change
      await supabaseAdminClient.from('application_status_history').insert({
        application_id,
        status,
        changed_by: authContext.user.id,
        notes
      });
      
      return new Response(JSON.stringify({ success: true, application: data }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
