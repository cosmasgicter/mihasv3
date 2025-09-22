const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const { logAuditEvent } = require('../_lib/auditLogger')
const { hasActiveConsent } = require('../_lib/userConsent')
const {
  fetchUserNotificationPreferences,
  hasExplicitOptIn,
  ensureTwilioConfiguration,
  formatPhoneForChannel,
  sendTwilioMessage,
  logChannelDelivery
} = require('./_shared')
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

  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'notifications-dispatch-channel' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('notifications_dispatch_channel', { maxAttempts: 25, windowMs: 120_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many notification requests. Please wait before retrying.' })
    }
  } catch (rateError) {
    console.error('Notifications dispatch-channel rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    return res.status(403).json({ error: authContext.error })
  }

  const { userId, channel, content, type, metadata } = req.body || {}
  const normalizedChannel = typeof channel === 'string' ? channel.toLowerCase() : ''

  if (!userId || !content || !type || !normalizedChannel) {
    return res.status(400).json({ error: 'userId, type, channel and content are required' })
  }

  if (!['sms', 'whatsapp'].includes(normalizedChannel)) {
    return res.status(400).json({ error: 'Unsupported channel. Allowed values: sms, whatsapp' })
  }

  try {
    ensureTwilioConfiguration(normalizedChannel)
  } catch (configError) {
    console.error('Twilio configuration error:', configError)
    return res.status(503).json({ error: configError.message })
  }

  try {
    const { active: hasConsent } = await hasActiveConsent(userId, 'outreach')
    if (!hasConsent) {
      await logAuditEvent({
        req,
        action: 'notifications.channel.blocked',
        actorId: authContext.user.id,
        actorEmail: authContext.user.email || null,
        actorRoles: authContext.roles,
        targetTable: 'user_consents',
        targetId: userId,
        metadata: { channel: normalizedChannel, reason: 'missing_outreach_consent' }
      })

      await logChannelDelivery({
        userId,
        type,
        channel: normalizedChannel,
        success: false,
        status: 'blocked'
      })

      return res.status(412).json({ error: 'Active outreach consent required before dispatching' })
    }

    const preferences = await fetchUserNotificationPreferences(userId)

    if (!hasExplicitOptIn(preferences, normalizedChannel)) {
      await logChannelDelivery({
        userId,
        type,
        channel: normalizedChannel,
        success: false,
        status: 'blocked'
      })

      await logAuditEvent({
        req,
        action: 'notifications.channel.blocked',
        actorId: authContext.user.id,
        actorEmail: authContext.user.email || null,
        actorRoles: authContext.roles,
        targetTable: 'user_notification_preferences',
        targetId: userId,
        metadata: { channel: normalizedChannel, reason: 'missing_channel_opt_in' }
      })

      return res.status(412).json({ error: 'Channel disabled or missing opt-in consent' })
    }

    const { data: profile, error: profileError } = await supabaseAdminClient
      .from('user_profiles')
      .select('phone')
      .eq('user_id', userId)
      .maybeSingle()

    if (profileError) {
      throw new Error(profileError.message)
    }

    const formattedRecipient = formatPhoneForChannel(profile?.phone ?? '', normalizedChannel)

    if (!formattedRecipient) {
      await logChannelDelivery({
        userId,
        type,
        channel: normalizedChannel,
        success: false,
        status: 'invalid_destination'
      })

      return res.status(400).json({ error: 'Valid international phone number is required for this channel' })
    }

    const twilioResult = await sendTwilioMessage({
      channel: normalizedChannel,
      to: formattedRecipient,
      body: content
    })

    const messageId = twilioResult.data?.sid || null
    const providerStatus = twilioResult.data?.status || (twilioResult.ok ? 'sent' : 'failed')

    await logChannelDelivery({
      userId,
      type,
      channel: normalizedChannel,
      success: twilioResult.ok,
      status: providerStatus,
      messageId,
      metadata
    })

    if (!twilioResult.ok) {
      const providerMessage = twilioResult.data?.message || 'Failed to dispatch channel notification'
      return res.status(502).json({
        error: providerMessage,
        status: providerStatus,
        messageId
      })
    }

    await logAuditEvent({
      req,
      action: 'notifications.channel.dispatch',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'notification_logs',
      targetId: userId,
      metadata: {
        channel: normalizedChannel,
        status: providerStatus,
        messageId,
        type
      }
    })

    return res.status(200).json({
      success: true,
      status: providerStatus,
      messageId,
      channel: normalizedChannel
    })
  } catch (error) {
    console.error('Channel dispatch error:', error)

    try {
      await logChannelDelivery({
        userId,
        type,
        channel: normalizedChannel,
        success: false,
        status: 'error'
      })
    } catch (logError) {
      console.error('Failed to log channel dispatch error:', logError)
    }

    return res.status(500).json({ error: 'Failed to dispatch channel notification' })
  }
}
