// Scheduled function to send interview reminders
import { supabaseAdminClient } from '../_lib/supabaseClient.js'
import { logger } from '../_lib/logger.js'

const supabase = supabaseAdminClient

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
  
  try {
    // Get query params
    const queryStringParameters = Object.fromEntries(url.searchParams);
    
    // Get body for POST/PUT
    let body = null;
    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        body = await request.text();
      }
    }
    
    // Get headers
    const headers = Object.fromEntries(request.headers);
    
    // Create event-like object for compatibility
    const event = {
      httpMethod: request.method,
      body: typeof body === 'string' ? body : JSON.stringify(body),
      headers,
      queryStringParameters
    };

  try {
    const now = new Date()
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const in1Hour = new Date(now.getTime() + 60 * 60 * 1000)

    // Find interviews needing reminders
    const { data: interviews, error } = await supabase
      .from('application_interviews')
      .select(`
        id,
        application_id,
        scheduled_at,
        mode,
        location,
        applications!inner(
          application_number,
          full_name,
          email,
          user_id
        )
      `)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now.toISOString())
      .lte('scheduled_at', in24Hours.toISOString())

    if (error) throw error

    for (const interview of interviews || []) {
      const scheduledTime = new Date(interview.scheduled_at)
      const hoursUntil = (scheduledTime - now) / (1000 * 60 * 60)

      let reminderType = null
      if (hoursUntil <= 1 && hoursUntil > 0) {
        reminderType = '1h'
      } else if (hoursUntil <= 24 && hoursUntil > 23) {
        reminderType = '24h'
      }

      if (!reminderType) continue

      // Check if reminder already sent
      const { data: existing } = await supabase
        .from('interview_reminders')
        .select('id')
        .eq('interview_id', interview.id)
        .eq('reminder_type', reminderType)
        .eq('status', 'sent')
        .maybeSingle()

      if (existing) continue

      // Send reminder
      const app = interview.applications
      await supabase.from('email_notifications').insert({
        recipient: app.email,
        subject: `Interview Reminder - ${app.application_number}`,
        body: `Your interview is scheduled in ${reminderType === '24h' ? '24 hours' : '1 hour'}. Mode: ${interview.mode}. ${interview.location ? 'Location: ' + interview.location : ''}`,
        type: 'interview_reminder',
        status: 'pending'
      })

      // Log reminder
      await supabase.from('interview_reminders').insert({
        interview_id: interview.id,
        reminder_type: reminderType,
        sent_at: now.toISOString(),
        status: 'sent'
      })
    }

    return new Response(JSON.stringify({ success: true, processed: interviews?.length || 0 }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (error) {
    logger.error('Reminder error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  } catch (error) {
    logger.error('Function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
