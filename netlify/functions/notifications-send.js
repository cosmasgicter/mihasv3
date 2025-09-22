import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'
import { logAuditEvent } from './_lib/auditLogger.js'

export default async function handler(req, res) {
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
      return res.status(400).json({ error: error.message })
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

    return res.status(201).json(notification)
  } catch (error) {
    console.error('Notifications send error:', error)
    return res.status(500).json({ error: 'Failed to send notification' })
  }
}