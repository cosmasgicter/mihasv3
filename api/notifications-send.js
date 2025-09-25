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

  const authContext = await getUserFromRequest(
    { headers: Object.fromEntries(request.headers) },
    { requireAdmin: false }
  )
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return new Response(JSON.stringify({ error: authContext.error }), { status, headers })
  }

  const body = await request.json().catch(() => ({}))
  const recipient = body.to || body.recipient || authContext.user.email
  const message = (body.message || body.body || '').trim()
  const subjectInput = (body.subject || (body.type === 'test' ? 'Test Notification' : 'Notification from MIHAS')).trim()
  const subject = subjectInput.length ? subjectInput : 'Notification from MIHAS'

  if (!recipient || !message) {
    return new Response(JSON.stringify({ error: 'recipient and message are required' }), { status: 400, headers })
  }

  const enforceAdmin = !useMockSupabase
  if (enforceAdmin && !authContext.isAdmin) {
    const isSelfNotification = recipient.toLowerCase() === (authContext.user.email ?? '').toLowerCase()
    const isTestMessage = (body.type ?? 'notification') === 'test'

    if (!isSelfNotification || !isTestMessage) {
      return new Response(JSON.stringify({ error: 'Access denied' }), { status: 403, headers })
    }
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

    return new Response(
      JSON.stringify({
        success: true,
        notification,
        deliveredTo: recipient
      }),
      { status: 201, headers }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to send notification' }), { status: 500, headers })
  }
}
