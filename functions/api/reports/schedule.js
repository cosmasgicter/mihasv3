import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestPut(context) {
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
  if (profile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  try {
    const { reportId, scheduleEnabled, scheduleFrequency } = await context.request.json()

    if (!reportId) {
      return new Response(JSON.stringify({ error: 'Missing report ID' }), { status: 400 })
    }

    const nextScheduled = scheduleEnabled ? calculateNextSchedule(scheduleFrequency) : null

    const { data, error } = await supabase
      .from('automated_reports')
      .update({
        schedule_enabled: scheduleEnabled,
        schedule_frequency: scheduleFrequency,
        next_scheduled_at: nextScheduled,
        updated_at: new Date().toISOString()
      })
      .eq('id', reportId)
      .select()
      .single()

    if (error) throw error

    return new Response(JSON.stringify({ report: data }), {
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
