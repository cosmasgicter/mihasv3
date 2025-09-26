import { supabaseAdminClient, getUserFromRequest, useMockSupabase } from './_lib/supabaseClient.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await getUserFromRequest(
    { headers: Object.fromEntries(request.headers) },
    { requireAdmin: false }
  )
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return new Response(JSON.stringify({ error: authContext.error }), { status, headers })
  }

  const body = req.body
  const recipient = body.to || body.recipient || authContext.user.email
  const message = (body.message || body.body || '').trim()
  const subjectInput = (body.subject || (body.type === 'test' ? 'Test Notification' : 'Notification from MIHAS')).trim()
  const subject = subjectInput.length ? subjectInput : 'Notification from MIHAS'

  if (!recipient || !message) {
    return res.status(400).json({ error: 'recipient and message are required' })
  }

  const enforceAdmin = !useMockSupabase
  if (enforceAdmin && !authContext.isAdmin) {
    const isSelfNotification = recipient.toLowerCase() === (authContext.user.email ?? '').toLowerCase()
    const isTestMessage = (body.type ?? 'notification') === 'test'

    if (!isSelfNotification || !isTestMessage) {
      return res.status(403).json({ error: 'Access denied' })
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
      return res.status(400).json({ error: error.message })
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
    return res.status(500).json({ error: 'Failed to send notification' })
  }
}


const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler