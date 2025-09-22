const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../_lib/rateLimiter')
const { logAuditEvent } = require('../_lib/auditLogger')
const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'admin-dashboard' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('admin_dashboard', { maxAttempts: 30, windowMs: 60_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many dashboard requests. Please wait before retrying.' })
    }
  } catch (rateError) {
    console.error('Admin dashboard rate limiter error:', rateError)
    return res.status(503).json({ error: 'Rate limiter unavailable' })
  }

  try {
    const queryBuilder = supabaseAdminClient.from('admin_dashboard_metrics_cache').select('metrics, generated_at')
    const { data, error } = await queryBuilder.eq('id', 'overview').maybeSingle()

    if (error) {
      throw new Error(error.message || 'Failed to load admin dashboard overview')
    }

    const overview = (data?.metrics && typeof data.metrics === 'object' ? data.metrics : {}) || {}
    const generatedAtSource = data?.generated_at || data?.generatedAt || null
    let generatedAt = null
    if (generatedAtSource) {
      const generatedAtDate = new Date(generatedAtSource)
      if (!Number.isNaN(generatedAtDate.getTime())) {
        generatedAt = generatedAtDate.toISOString()
      }
    }
    const statusCounts = overview.status_counts || {}
    const totals = overview.totals || {}
    const applicationCounts = overview.application_counts || {}
    const processingMetrics = overview.processing_metrics || {}
    const recentItems = Array.isArray(overview.recent_activity) ? overview.recent_activity : []

    const pendingApplications = (statusCounts.submitted || 0) + (statusCounts.under_review || 0)
    const avgProcessingHours = processingMetrics.average_hours || 0
    const avgProcessingTimeDays = Number(((avgProcessingHours || 0) / 24).toFixed(1))

    const stats = {
      totalApplications: statusCounts.total || 0,
      pendingApplications,
      approvedApplications: statusCounts.approved || 0,
      rejectedApplications: statusCounts.rejected || 0,
      totalPrograms: totals.active_programs || 0,
      activeIntakes: totals.active_intakes || 0,
      totalStudents: totals.students || 0,
      todayApplications: applicationCounts.today || 0,
      weekApplications: applicationCounts.this_week || 0,
      monthApplications: applicationCounts.this_month || 0,
      avgProcessingTime: avgProcessingTimeDays,
      avgProcessingTimeHours: avgProcessingHours,
      medianProcessingTimeHours: processingMetrics.median_hours || 0,
      p95ProcessingTimeHours: processingMetrics.p95_hours || 0,
      decisionVelocity24h: processingMetrics.decision_velocity_24h || 0,
      activeUsers: processingMetrics.active_admins_last_24h || 0,
      activeUsersLast7d: processingMetrics.active_admins_last_7d || 0,
      systemHealth: pendingApplications > 50 || (processingMetrics.p95_hours || 0) > 96 ? 'warning' : 'good',
      statusBreakdown: statusCounts,
      applicationTrends: applicationCounts,
      totalsSnapshot: totals,
      processingMetrics
    }

    const activities = recentItems.map(item => ({
      id: item.id,
      type:
        item.status === 'approved'
          ? 'approval'
          : item.status === 'rejected'
            ? 'rejection'
            : item.status === 'under_review'
              ? 'review'
              : 'application',
      message: `${item.full_name} - Application ${item.status}`,
      timestamp: item.updated_at || item.submitted_at || item.created_at,
      user: item.full_name,
      status: item.status,
      paymentStatus: item.payment_status,
      submittedAt: item.submitted_at,
      updatedAt: item.updated_at,
      createdAt: item.created_at,
      program: item.program,
      intake: item.intake
    }))

    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=60')
    res.setHeader('Vary', 'Authorization')
    if (generatedAt) {
      res.setHeader('X-Generated-At', new Date(generatedAt).toUTCString())
    }

    await logAuditEvent({
      req,
      action: 'admin.dashboard.view',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'admin_dashboard_metrics_cache',
      targetId: 'overview',
      metadata: {
        generatedAt,
        statusBreakdownKeys: Object.keys(statusCounts || {}),
        totalsSnapshotKeys: Object.keys(totals || {})
      }
    })

    return res.status(200).json({
      stats,
      recentActivity: activities,
      statusBreakdown: statusCounts,
      applicationTrends: applicationCounts,
      totalsSnapshot: totals,
      processingMetrics,
      recentActivityRaw: recentItems,
      generatedAt
    })
  } catch (error) {
    console.error('Dashboard API error:', error)
    return res.status(500).json({ error: 'Failed to load admin dashboard overview' })
  }
}
