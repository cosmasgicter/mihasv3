import { supabaseAdminClient } from './_lib/supabaseClient.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    const { data, error } = await supabaseAdminClient
      .from('programs')
      .select('*, institutions (id, name, full_name, slug)')
      .eq('is_active', true)
      .order('name')

    if (error) throw error

    return new Response(JSON.stringify({ programs: data || [] }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to load programs' }), { status: 500, headers })
  }
}