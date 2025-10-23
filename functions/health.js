import { supabaseAdminClient } from './_lib/supabaseClient.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestGet() {
  let dbTest = 'not-tested';
  try {
    const { data, error } = await supabaseAdminClient
      .from('profiles')
      .select('count')
      .limit(1);
    dbTest = error ? `error: ${error.message}` : 'ok';
  } catch (e) {
    dbTest = `exception: ${e.message}`;
  }
  
  return new Response(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: 'cloudflare-pages',
    database: dbTest
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}