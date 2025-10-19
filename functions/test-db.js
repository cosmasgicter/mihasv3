import { supabaseAdminClient } from './_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  try {
    const { data, error } = await supabaseAdminClient
      .from('profiles')
      .select('id, email, role')
      .eq('id', 'fc6a1536-2e5c-4099-9b9e-a38653408f95')
      .maybeSingle();
    
    return new Response(JSON.stringify({
      success: !error,
      data,
      error: error ? error.message : null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
