import { supabaseAdminClient } from './_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  
  try {
    const userId = 'fc6a1536-2e5c-4099-9b9e-a38653408f95';
    
    const { data, error } = await supabaseAdminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    return new Response(JSON.stringify({
      success: !error,
      data,
      error: error ? {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      } : null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
