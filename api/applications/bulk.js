const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../_lib/rateLimiter')
const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'applications-bulk' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('applications_bulk', { maxAttempts: 20, windowMs: 120_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many bulk operations. Please try again later.' })
    }
  } catch (rateError) {
    console.error('Bulk applications rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!authContext.isAdmin) {
    return res.status(403).json({ error: 'Access denied' })
  }

  // Parse body if it's a string (Netlify functions)
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON in request body' })
    }
  }

  const { action, applicationIds = [], status, paymentStatus, notification } = body || {}

  if (!action) {
    return res.status(400).json({ error: 'Action is required' })
  }

  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return res.status(400).json({ error: 'applicationIds must be a non-empty array' })
  }

  try {
    switch (action) {
      case 'update_status':
        return bulkUpdateStatus(res, authContext.user.id, applicationIds, status)
      case 'update_payment_status':
        return bulkUpdatePaymentStatus(res, applicationIds, paymentStatus)
      case 'delete':
        return bulkDeleteApplications(res, applicationIds)
      case 'send_notifications':
        return bulkSendNotifications(res, applicationIds, notification)
      default:
        return res.status(400).json({ error: 'Unsupported action' })
    }
  } catch (error) {
    console.error('Bulk action error', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

async function bulkUpdateStatus(res, userId, applicationIds, status) {
  if (!status) {
    return res.status(400).json({ error: 'Status is required' })
  }

  const now = new Date().toISOString()
  const updateData = { status, updated_at: now }
  if (status === 'under_review') {
    updateData.review_started_at = now
  }
  if (['approved', 'rejected'].includes(status)) {
    updateData.decision_date = now
  }

  const { error } = await supabaseAdminClient
    .from('applications_new')
    .update(updateData)
    .in('id', applicationIds)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  const historyRows = applicationIds.map(id => ({
    application_id: id,
    status,
    changed_by: userId
  }))

  await supabaseAdminClient
    .from('application_status_history')
    .insert(historyRows)

  return res.status(200).json({ successCount: applicationIds.length })
}

async function bulkUpdatePaymentStatus(res, applicationIds, paymentStatus) {
  if (!paymentStatus) {
    return res.status(400).json({ error: 'paymentStatus is required' })
  }

  const { error } = await supabaseAdminClient
    .from('applications_new')
    .update({ payment_status: paymentStatus, updated_at: new Date().toISOString() })
    .in('id', applicationIds)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ successCount: applicationIds.length })
}

async function bulkDeleteApplications(res, applicationIds) {
  const { error } = await supabaseAdminClient
    .from('applications_new')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .in('id', applicationIds)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ successCount: applicationIds.length })
}

async function bulkSendNotifications(res, applicationIds, notification) {
  if (!notification?.title || !notification?.message) {
    return res.status(400).json({ error: 'Notification title and message are required' })
  }

  const { data: applications, error: fetchError } = await supabaseAdminClient
    .from('applications_new')
    .select('id, user_id, full_name, email, application_number')
    .in('id', applicationIds)

  if (fetchError) {
    return res.status(400).json({ error: fetchError.message })
  }

  const notifications = applications.map(app => ({
    user_id: app.user_id,
    title: notification.title.replace('{application_number}', app.application_number),
    message: notification.message
      .replace('{full_name}', app.full_name)
      .replace('{application_number}', app.application_number),
    type: 'application_update'
  }))

  const { error } = await supabaseAdminClient
    .from('notifications')
    .insert(notifications)

  if (error) {
    return res.status(400).json({ error: error.message })
  }

  return res.status(200).json({ successCount: notifications.length })
}
