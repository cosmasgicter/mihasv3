import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { logAuditEvent } from './_lib/auditLogger.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js'
import { createDurationTimer, reportFunctionExecution, reportQueueMetrics } from './_lib/scalingMetrics.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    return res.status(403).json({ error: authContext.error })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' })
    }
  }

  const { to, subject, message } = body || {}

  if (!to || !subject || !message) {
    return res.status(400).json({ error: 'to, subject and message are required' })
  }

  const measureDuration = createDurationTimer()

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
      await reportFunctionExecution('notifications-send', {
        durationMs: measureDuration(),
        status: 'error',
        errorMessage: error.message,
        attributes: { stage: 'insert' }
      })
      return res.status(400).json({ error: error.message })
    }

    const { count: pendingCount, error: countError } = await supabaseAdminClient
      .from('email_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')

    if (countError) {
      console.error('Failed to fetch notification queue depth', countError)
    }

    const queueDepth = countError ? null : pendingCount ?? null

    if (queueDepth !== null) {
      await reportQueueMetrics('notifications-send', {
        depth: queueDepth,
        attributes: { action: 'enqueue' }
      })
    }

    await logAuditEvent({
      req,
      action: 'notifications.send',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'email_notifications',
      targetId: notification?.id || null,
      metadata: { to, subject }
    })

    await reportFunctionExecution('notifications-send', {
      durationMs: measureDuration(),
      status: 'success',
      queueDepth,
      attributes: { action: 'enqueue' }
    })

    return res.status(201).json(notification)
  } catch (error) {
    console.error('Notifications send error:', error)
    await reportFunctionExecution('notifications-send', {
      durationMs: measureDuration(),
      status: 'error',
      errorMessage: error?.message,
      attributes: { stage: 'handler' }
    })
    return res.status(500).json({ error: 'Failed to send notification' })
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
