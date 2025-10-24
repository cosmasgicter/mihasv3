import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token)
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data: profile } = await supabaseAdminClient.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Return predefined report templates
    const templates = [
      {
        id: '1',
        name: 'Applications Summary',
        type: 'applications',
        description: 'Summary of all applications by status',
        fields: ['application_number', 'full_name', 'program', 'status', 'created_at']
      },
      {
        id: '2',
        name: 'Payment Report',
        type: 'payments',
        description: 'Payment status and verification report',
        fields: ['application_number', 'amount', 'payment_status', 'payment_method']
      },
      {
        id: '3',
        name: 'User Activity',
        type: 'users',
        description: 'User registration and activity report',
        fields: ['email', 'full_name', 'role', 'created_at', 'last_login']
      }
    ]

    return new Response(JSON.stringify({ templates }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export async function onRequestPost(context) {
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabaseAdminClient.auth.getUser(token)
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data: profile } = await supabaseAdminClient.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const { name, type, fields } = await context.request.json()

    if (!name || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    // Create mock template response
    const template = {
      id: Date.now().toString(),
      name,
      type,
      fields: fields || [],
      created_by: user.id,
      created_at: new Date().toISOString()
    }

    return new Response(JSON.stringify({ success: true, template }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}
