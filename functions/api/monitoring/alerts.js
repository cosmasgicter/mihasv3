import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Get active performance alerts
    const alerts = await getActiveAlerts()
    
    return new Response(JSON.stringify(alerts), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Alerts error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
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

  try {
    const alertData = await context.request.json()
    
    // Create new alert
    const alert = await createAlert(alertData)
    
    return new Response(JSON.stringify(alert), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Create alert error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function getActiveAlerts() {
  try {
    // Get alerts from the last 24 hours that are not resolved
    const { data: alerts, error } = await supabaseAdminClient
      .from('performance_alerts')
      .select('*')
      .eq('resolved', false)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching alerts:', error)
      return []
    }
    
    return alerts || []
  } catch (error) {
    console.error('Error getting active alerts:', error)
    return []
  }
}

async function createAlert(alertData) {
  try {
    const alert = {
      id: crypto.randomUUID(),
      type: alertData.type,
      severity: alertData.severity,
      message: alertData.message,
      threshold: alertData.threshold,
      current_value: alertData.currentValue,
      metadata: alertData.metadata || {},
      resolved: false,
      created_at: new Date().toISOString()
    }
    
    // Store alert in database
    const { data, error } = await supabaseAdminClient
      .from('performance_alerts')
      .insert([alert])
      .select()
      .single()
    
    if (error) {
      console.error('Error creating alert:', error)
      throw error
    }
    
    return data
  } catch (error) {
    console.error('Error creating alert:', error)
    throw error
  }
}