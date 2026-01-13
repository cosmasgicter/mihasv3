import { supabaseAdminClient } from '../../_lib/supabaseClient.js'

export async function onRequestPost(context) {
  try {
    const metric = await context.request.json()
    
    // Track the metric in audit logs
    await trackMetric(metric)
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('Track metric error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

async function trackMetric(metric) {
  try {
    // Store metric in audit logs for tracking
    const auditEntry = {
      action: `metric.${metric.type}`,
      actor_id: 'system',
      entity_type: 'metric',
      entity_id: metric.endpoint || 'system',
      metadata: {
        metric_type: metric.type,
        endpoint: metric.endpoint,
        value: metric.value,
        response_time: metric.value,
        status_code: metric.statusCode,
        error: metric.error,
        timestamp: metric.timestamp
      },
      ip_address: '127.0.0.1',
      user_agent: 'System Monitor'
    }
    
    const { error } = await supabaseAdminClient
      .from('audit_logs')
      .insert([auditEntry])
    
    if (error) {
      console.error('Error storing metric:', error)
    }
  } catch (error) {
    console.error('Error tracking metric:', error)
  }
}