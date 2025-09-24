import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) }, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return new Response(JSON.stringify({ error: authContext.error }), { status, headers })
  }

  const body = await request.json().catch(() => ({}))
  const sql = (body.sql || body.query || '').trim()

  if (!sql) {
    return new Response(JSON.stringify({ error: 'SQL query is required' }), { status: 400, headers })
  }

  try {
    const { data, error } = await supabaseAdminClient.rpc('execute_sql', { query: sql })
    if (error) throw error
    return new Response(JSON.stringify({ data }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to execute query' }), { status: 500, headers })
  }
}
