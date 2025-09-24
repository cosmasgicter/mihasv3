import { supabaseClient } from './_lib/supabaseClient.js'
import { logAuditEvent } from './_lib/auditLogger.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const body = await request.json().catch(() => ({}))
  const { email, password } = body

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers })
  }

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 401, headers })
  }

  return new Response(JSON.stringify({ user: data.user, session: data.session }), { status: 200, headers })
}