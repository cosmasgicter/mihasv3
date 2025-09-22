const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const {
  fetchUserNotificationPreferences,
  normalizePreferencesRecord,
  updateChannelEnabledState
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
    const rateKey = buildRateLimitKey(req, { prefix: 'notifications-update-consent' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('notifications_update_consent', { maxAttempts: 25, windowMs: 120_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many notification requests. Please wait before retrying.' })
    }
  } catch (rateError) {
    console.error('Notifications update-consent rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  const authContext = await getUserFromRequest(req)
  if (authContext.error) {
    return res.status(403).json({ error: authContext.error })
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

  const { channel, action, source, reason } = body || {}
  const normalizedChannel = typeof channel === 'string' ? channel.toLowerCase() : ''

  if (!['sms', 'whatsapp'].includes(normalizedChannel)) {
    return res.status(400).json({ error: 'Unsupported channel. Allowed values: sms, whatsapp' })
  }

  if (!['opt_in', 'opt_out'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Use opt_in or opt_out' })
  }

  try {
    const existing = await fetchUserNotificationPreferences(authContext.user.id)
    const nextEnabled = action === 'opt_in'
    const nowIso = new Date().toISOString()
    const consentSource = typeof source === 'string' && source.trim() ? source.trim() : 'student_settings_page'
    const channelKey = normalizedChannel === 'sms' ? 'sms' : 'whatsapp'

    const updatedChannels = updateChannelEnabledState(existing.channels, normalizedChannel, nextEnabled)

    const payload = {
      ...existing,
      user_id: authContext.user.id,
      channels: updatedChannels,
      [`${channelKey}_opt_in_actor`]: action === 'opt_in' ? authContext.user.id : existing[`${channelKey}_opt_in_actor`] ?? null,
      [`${channelKey}_opt_in_source`]: action === 'opt_in' ? consentSource : existing[`${channelKey}_opt_in_source`] ?? null,
      [`${channelKey}_opt_in_at`]: action === 'opt_in' ? nowIso : existing[`${channelKey}_opt_in_at`] ?? null,
      [`${channelKey}_opt_out_at`]: action === 'opt_out' ? nowIso : null,
      [`${channelKey}_opt_out_source`]: action === 'opt_out' ? consentSource : null,
      [`${channelKey}_opt_out_actor`]: action === 'opt_out' ? authContext.user.id : null,
      [`${channelKey}_opt_out_reason`]: action === 'opt_out' ? (typeof reason === 'string' ? reason : null) : null
    }

    const { data, error } = await supabaseAdminClient
      .from('user_notification_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select('*')
      .single()

    if (error) {
      throw new Error(error.message)
    }

    const normalized = normalizePreferencesRecord(data)

    return res.status(200).json(normalized)
  } catch (error) {
    console.error('Failed to update notification consent:', error)
    return res.status(500).json({ error: 'Failed to update notification consent' })
  }
}
