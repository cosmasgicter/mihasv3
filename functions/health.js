import { supabaseAdminClient } from './_lib/supabaseClient.js';

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
    headers: { 'Content-Type': 'application/json' }
  });
}