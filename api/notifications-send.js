import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) }, { requireAdmin: true })
  if (authContext.error) {
    return new Response(JSON.stringify({ error: authContext.error }), { status: 403, headers })
  }

  const body = await request.json().catch(() => ({}))
  const { to, subject, message } = body

  if (!to || !subject || !message) {
    return new Response(JSON.stringify({ error: 'to, subject and message are required' }), { status: 400, headers })
  }

  try {
    const { data: notification, error } = await supabaseAdminClient
      .from('email_notifications')
      .insert({
        recipient_email: to,
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
