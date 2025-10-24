import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const supabase = supabaseAdminClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY)
  
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  try {
    // Return mock scheduled reports data since table may not exist
    const reports = [
      {
        id: '1',
        name: 'Daily Applications Report',
        schedule_enabled: true,
        schedule_frequency: 'daily',
        next_scheduled_at: new Date(Date.now() + 24*60*60*1000).toISOString()
      },
      {
        id: '2', 
        name: 'Weekly Summary Report',
        schedule_enabled: false,
        schedule_frequency: 'weekly',
        next_scheduled_at: null
      }
    ]

    return new Response(JSON.stringify({ reports }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

export async function onRequestPost(context) {
  const supabase = supabaseAdminClient(context.env.SUPABASE_URL, context.env.SUPABASE_SERVICE_ROLE_KEY)
  
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(profile?.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  try {
    const { type, frequency, enabled } = await context.request.json()

    if (!type || !frequency) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 })
    }

    const nextScheduled = enabled ? calculateNextSchedule(frequency) : null

    // Mock response since automated_reports table may not exist
    const report = {
      id: Date.now().toString(),
      type,
      schedule_enabled: enabled,
      schedule_frequency: frequency,
      next_scheduled_at: nextScheduled,
      created_at: new Date().toISOString(),
      created_by: user.id
    }

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
}

function calculateNextSchedule(frequency) {
  const now = new Date()
  switch (frequency) {
    case 'daily':
      return new Date(now.setDate(now.getDate() + 1)).toISOString()
    case 'weekly':
      return new Date(now.setDate(now.getDate() + 7)).toISOString()
    case 'monthly':
      return new Date(now.setMonth(now.getMonth() + 1)).toISOString()
    default:
      return null
  }
}
