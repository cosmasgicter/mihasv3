import { supabaseAdminClient } from './_lib/supabaseClient.js'
import { logAuditEvent } from './_lib/auditLogger.js'

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

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const body = await request.json().catch(() => ({}))
  const { email, password, fullName } = body

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), { status: 400, headers })
  }

  if (!fullName) {
    return new Response(JSON.stringify({ error: 'Full name is required for registration' }), { status: 400, headers })
  }

  try {
    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: fullName },
      email_confirm: true
    })

    if (error) {
      let errorMessage = 'Registration failed'
      if (error.message?.includes('duplicate key')) errorMessage = 'User already exists'
      else if (error.message?.includes('invalid email')) errorMessage = 'Invalid email format'
      else if (error.message?.includes('password')) errorMessage = 'Password does not meet requirements'
      
      return new Response(JSON.stringify({ error: errorMessage }), { status: 400, headers })
    }

    return new Response(JSON.stringify({ user: data.user, session: data.session }), { status: 201, headers })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Database error creating new user' }), { status: 500, headers })
  }
}