import { supabaseAdminClient } from './_lib/supabaseClient.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const { data, error } = await supabaseAdminClient
    .from('grade12_subjects')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers })
  }

  return new Response(JSON.stringify({ subjects: data || [] }), { headers })
}