const { supabaseAdminClient, getUserFromRequest } = require('../supabaseClient')
const { logAuditEvent } = require('../auditLogger')
const { listActiveConsentUserIds } = require('../userConsent')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../rateLimiter')

async function handleMetricsRequest(req, res) {
  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'analytics-metrics' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('analytics_metrics', { maxAttempts: 30, windowMs: 60_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res
        .status(429)
        .json({ error: 'Too many analytics requests. Please try again later.' })
    }
  } catch (rateError) {
    console.error('Analytics metrics rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  let consentingUserIds = []
  try {
    consentingUserIds = await listActiveConsentUserIds('analytics')
  } catch (consentError) {
    console.error('Failed to resolve analytics consent roster', consentError)
    return res.status(500).json({ error: 'Failed to resolve analytics consent roster' })
  }

  if (!consentingUserIds.length) {
    await logAuditEvent({
      req,
      action: 'analytics.metrics.blocked',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'user_consents',
      metadata: { reason: 'missing_analytics_consent' }
    })

    return res.status(412).json({ error: 'Analytics reporting requires active analytics consent' })
  }

  try {
    const buildCountQuery = status => {
      let query = supabaseAdminClient
        .from('applications_new')
        .select('id', { count: 'exact', head: true })
        .in('user_id', consentingUserIds)

      return status ? query.eq('status', status) : query
    }

    const [totalApps, submittedApps, approvedApps, recentApps] = await Promise.all([
      buildCountQuery(null),
      buildCountQuery('submitted'),
      buildCountQuery('approved'),
      supabaseAdminClient
        .from('applications_new')
        .select('created_at, status, program')
        .in('user_id', consentingUserIds)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
    ])

    const payload = {
      totalApplications: Number(totalApps.count || 0),
      submittedApplications: Number(submittedApps.count || 0),
      approvedApplications: Number(approvedApps.count || 0),
      recentApplications: recentApps.data || []
    }

    await logAuditEvent({
      req,
      action: 'analytics.metrics.view',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'applications_new',
      metadata: {
        consentingUsers: consentingUserIds.length,
        totalApplications: payload.totalApplications
      }
    })

    return res.status(200).json(payload)
  } catch (error) {
    console.error('Analytics metrics error', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

module.exports = {
  handleMetricsRequest
}
