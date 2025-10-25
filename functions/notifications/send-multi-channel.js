import { supabaseAdminClient } from '../_lib/supabaseClient.js'
import { sendEmail } from '../_lib/emailService.js'
import { sendSMS, sendWhatsApp } from '../_lib/twilioService.js'

export async function onRequest(context) {
  const { request } = context
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  }
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders
    })
  }

  try {
    const { userId, title, message, channels } = await request.json()

    if (!userId || !title || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: corsHeaders
      })
    }

    // Get user preferences
    const { data: prefs } = await supabaseAdminClient
      .from('user_notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()

    // Get user contact info
    const { data: profile } = await supabaseAdminClient
      .from('profiles')
      .select('email, phone')
      .eq('id', userId)
      .single()

    const results = {}

    // In-app notification (always send)
    if (!channels || channels.includes('in-app')) {
      const { error } = await supabaseAdminClient
        .from('in_app_notifications')
        .insert({
          user_id: userId,
          title,
          content: message,
          type: 'info',
          read: false
        })
      results.inApp = error ? { success: false, error: error.message } : { success: true }
    }

    // Email
    if ((!channels || channels.includes('email')) && prefs?.email_enabled && profile?.email) {
      results.email = await sendEmail({
        to: profile.email,
        subject: title,
        html: `<div style="font-family: Arial, sans-serif;"><h2>${title}</h2><p>${message}</p></div>`,
        env: context.env
      })
    }

    // SMS
    if ((!channels || channels.includes('sms')) && prefs?.sms_enabled && profile?.phone) {
      results.sms = await sendSMS({
        to: profile.phone,
        message: `${title}\n\n${message}`
      })
    }

    // WhatsApp
    if ((!channels || channels.includes('whatsapp')) && prefs?.whatsapp_enabled && profile?.phone) {
      results.whatsapp = await sendWhatsApp({
        to: profile.phone,
        message: `${title}\n\n${message}`
      })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: corsHeaders
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: corsHeaders
    })
  }
}
