import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequest(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabaseAdminClient
      .from('device_sessions')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('last_activity', thirtyDaysAgo.toISOString())
      .select('id');

    if (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        cleaned: 0
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      cleaned: data?.length || 0,
      message: `Cleaned up ${data?.length || 0} inactive sessions`
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      cleaned: 0
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
