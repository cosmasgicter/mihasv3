const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../_lib/rateLimiter')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Parse request body
  let body
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON in request body' })
  }

  const { applicationId, userId } = body

  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'notifications-application-submitted' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('notifications_application_submitted', { maxAttempts: 25, windowMs: 120_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many notification requests. Please wait before retrying.' })
    }
  } catch (rateError) {
    console.error('Notifications application-submitted rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  const authContext = await getUserFromRequest(req)
  if (authContext.error) {
    return res.status(403).json({ error: authContext.error })
  }

  if (!applicationId || !userId) {
    return res.status(400).json({ error: 'applicationId and userId are required' })
  }

  try {
    const { data: application, error: appError } = await supabaseAdminClient
      .from('applications_new')
      .select('*')
      .eq('id', applicationId)
      .eq('user_id', userId)
      .single()

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found or access denied' })
    }

    const { data: notification, error: notifError } = await supabaseAdminClient
      .from('in_app_notifications')
      .insert({
        user_id: userId,
        title: '✅ Application Submitted Successfully',
        content: `Your application #${application.application_number} for ${application.program} has been submitted and is under review.`,
        type: 'success',
        action_url: `/student/dashboard`,
        read: false
      })
      .select()
      .single()

    if (notifError) {
      console.error('Failed to create notification:', notifError)
      return res.status(500).json({ error: 'Failed to create notification' })
    }

    await supabaseAdminClient
      .from('notification_logs')
      .insert({
        user_id: userId,
        type: 'application_submitted',
        channels: ['in_app'],
        success_count: 1,
        total_count: 1,
        sent_at: new Date().toISOString()
      })

    return res.status(201).json({
      success: true,
      notification,
      application: {
        number: application.application_number,
        trackingCode: application.public_tracking_code,
        program: application.program,
        institution: application.institution
      }
    })
  } catch (error) {
    console.error('Application submitted notification error:', error)
    return res.status(500).json({ error: 'Failed to create notification' })
  }
}
