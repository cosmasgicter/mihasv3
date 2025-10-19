import { supabaseAdminClient } from '../_lib/supabaseClient.js';

export async function onRequestGet() {
  try {
    const { data, error } = await supabaseAdminClient
      .from('intakes')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}