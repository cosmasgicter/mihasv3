import { supabaseAdminClient, getUserFromRequest, useMockSupabase } from './_lib/supabaseClient.js'

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

  const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) }, { requireAdmin: !useMockSupabase })
  if (authContext.error) {
    return new Response(JSON.stringify({ error: authContext.error }), { status: 403, headers })
  }

  const body = await request.json().catch(() => ({}))
  const recipient = body.to || body.recipient || authContext.user.email
  const message = body.message || body.body || ''
  const subject = body.subject || (body.type === 'test' ? 'Test Notification' : 'Notification from MIHAS')

  if (!recipient || !message) {
    return new Response(JSON.stringify({ error: 'recipient and message are required' }), { status: 400, headers })
  }

  try {
    const { data: notification, error } = await supabaseAdminClient
      .from('email_notifications')
      .insert({
        recipient_email: recipient,
        subject,
        body: message,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers })
    }

    return new Response(JSON.stringify(notification), { status: 201, headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to send notification' }), { status: 500, headers })
  }
}
