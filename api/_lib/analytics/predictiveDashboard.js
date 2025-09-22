const { supabaseAdminClient, getUserFromRequest } = require('../supabaseClient')
const { logAuditEvent } = require('../auditLogger')
const { listActiveConsentUserIds } = require('../userConsent')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../rateLimiter')

const DEFAULT_PREDICTIVE_SUMMARY = {
  avgAdmissionProbability: 0,
  totalApplications: 0,
  avgProcessingTime: 0,
  efficiency: 0,
  applicationTrend: 'stable',
  peakTimes: [],
  bottlenecks: [],
  generatedAt: null
}

const DEFAULT_WORKFLOW_SUMMARY = {
  totalExecutions: 0,
  successfulExecutions: 0,
  failedExecutions: 0,
  ruleStats: {},
  generatedAt: null
}

function parseArrayField(value) {
  if (!value) return []

  if (Array.isArray(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []

    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch (error) {
      // Fall back to comma-separated parsing below
    }

    return trimmed
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
  }

  return []
}

function coerceNumber(value, fallback = 0) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function mapTrendDirection(value) {
  if (!value) return 'stable'

  const normalized = String(value).toLowerCase()
  if (['increasing', 'up', 'positive'].includes(normalized)) return 'increasing'
  if (['decreasing', 'down', 'negative'].includes(normalized)) return 'decreasing'
  return 'stable'
}

function isViewMissing(error) {
  const message = error?.message || ''
  return /does not exist|missing|not found/i.test(message)
}

async function fetchPredictiveSummary() {
  try {
    const { data, error } = await supabaseAdminClient
      .from('analytics_predictive_summary')
      .select(`
        avg_admission_probability,
        total_applications,
        avg_processing_time,
        processing_efficiency,
        application_trend,
        peak_application_times,
        processing_bottlenecks,
        generated_at,
        last_computed_at
      `)
      .limit(1)
      .maybeSingle()

    if (error) {
      if (isViewMissing(error)) {
        return { summary: null, source: 'missing_view' }
      }
      throw error
    }

    if (!data) {
      return { summary: null, source: 'empty_view' }
    }

    return {
      summary: {
        avgAdmissionProbability: coerceNumber(data.avg_admission_probability),
        totalApplications: coerceNumber(data.total_applications),
        avgProcessingTime: coerceNumber(data.avg_processing_time),
        efficiency: coerceNumber(data.processing_efficiency, 0),
        applicationTrend: mapTrendDirection(data.application_trend),
        peakTimes: parseArrayField(data.peak_application_times),
        bottlenecks: parseArrayField(data.processing_bottlenecks),
        generatedAt: data.last_computed_at || data.generated_at || null
      },
      source: 'view'
    }
  } catch (error) {
    console.error('Predictive summary view failed:', error)
    return { summary: null, source: 'error' }
  }
}

async function fetchWorkflowSummary() {
  try {
    const { data, error } = await supabaseAdminClient
      .from('workflow_metrics_summary')
      .select(`
        total_executions,
        successful_executions,
        failed_executions,
        rule_stats,
        generated_at,
        last_computed_at
      `)
      .limit(1)
      .maybeSingle()

    if (error) {
      if (isViewMissing(error)) {
        return { summary: null, source: 'missing_view' }
      }
      throw error
    }

    if (!data) {
      return { summary: null, source: 'empty_view' }
    }

    return {
      summary: {
        totalExecutions: coerceNumber(data.total_executions),
        successfulExecutions: coerceNumber(data.successful_executions),
        failedExecutions: coerceNumber(data.failed_executions),
        ruleStats: typeof data.rule_stats === 'object' && data.rule_stats !== null
          ? data.rule_stats
          : {},
        generatedAt: data.last_computed_at || data.generated_at || null
      },
      source: 'view'
    }
  } catch (error) {
    console.error('Workflow summary view failed:', error)
    return { summary: null, source: 'error' }
  }
}

async function fallbackPredictiveSummary() {
  const { data, error } = await supabaseAdminClient
    .from('applications_new')
    .select('created_at, status, program, updated_at')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('Predictive summary fallback error:', error)
    return DEFAULT_PREDICTIVE_SUMMARY
  }

  const applications = data || []
  const totalApplications = applications.length
  const processed = applications.filter(app => ['approved', 'rejected'].includes(app.status)).length
  const efficiency = totalApplications > 0 ? (processed / totalApplications) * 100 : 100

  const avgProcessingTime = (() => {
    const processedApps = applications.filter(app =>
      ['approved', 'rejected'].includes(app.status) && app.updated_at
    )

    if (processedApps.length === 0) return 0

    const totalTime = processedApps.reduce((sum, app) => {
      const created = new Date(app.created_at)
      const updated = new Date(app.updated_at)
      return sum + (updated.getTime() - created.getTime())
    }, 0)

    return Math.round(totalTime / processedApps.length / (1000 * 60 * 60 * 24))
  })()

  const peakTimes = (() => {
    const hourCounts = new Array(24).fill(0)
    applications.forEach(app => {
      const hour = new Date(app.created_at).getHours()
      hourCounts[hour] += 1
    })

    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)

    return peakHours.map(({ hour }) => `${hour}:00`)
  })()

  const bottlenecks = (() => {
    const pending = applications.filter(app => app.status === 'submitted').length
    const underReview = applications.filter(app => app.status === 'under_review').length
    const bottleneckMessages = []

    if (pending > 20) {
      bottleneckMessages.push(`High volume of pending applications (${pending})`)
    }

    if (underReview > 15) {
      bottleneckMessages.push(`Many applications under review (${underReview})`)
    }

    if (totalApplications > 0) {
      const pendingRatio = (pending + underReview) / totalApplications
      if (pendingRatio > 0.7) {
        bottleneckMessages.push('Processing capacity may be exceeded')
      }
    }

    return bottleneckMessages
  })()

  const trendDirection = (() => {
    const firstHalf = applications.filter(app =>
      new Date(app.created_at).getTime() < Date.now() - 15 * 24 * 60 * 60 * 1000
    ).length
    const secondHalf = totalApplications - firstHalf

    if (secondHalf > firstHalf * 1.1) return 'increasing'
    if (secondHalf < firstHalf * 0.9) return 'decreasing'
    return 'stable'
  })()

  return {
    avgAdmissionProbability: 0,
    totalApplications,
    avgProcessingTime,
    efficiency,
    applicationTrend: trendDirection,
    peakTimes,
    bottlenecks,
    generatedAt: new Date().toISOString()
  }
}

async function fallbackWorkflowSummary() {
  const { data, error } = await supabaseAdminClient
    .from('workflow_execution_logs')
    .select('rule_id, status, executed_at')
    .gte('executed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

  if (error) {
    console.error('Workflow summary fallback error:', error)
    return DEFAULT_WORKFLOW_SUMMARY
  }

  const logs = data || []
  const summary = {
    totalExecutions: logs.length,
    successfulExecutions: logs.filter(log => log.status === 'executed').length,
    failedExecutions: logs.filter(log => log.status === 'failed').length,
    ruleStats: {},
    generatedAt: new Date().toISOString()
  }

  logs.forEach(log => {
    const ruleId = log.rule_id || 'unknown'
    summary.ruleStats[ruleId] = (summary.ruleStats[ruleId] || 0) + 1
  })

  return summary
}

async function handlePredictiveDashboardRequest(req, res) {
  try {
    const rateKey = buildRateLimitKey(req, { prefix: 'analytics-predictive' })
    const rateResult = await checkRateLimit(
      rateKey,
      getLimiterConfig('analytics_predictive', { maxAttempts: 20, windowMs: 120_000 })
    )

    if (rateResult.isLimited) {
      attachRateLimitHeaders(res, rateResult)
      return res.status(429).json({ error: 'Too many analytics requests. Please slow down.' })
    }
  } catch (rateError) {
    console.error('Predictive analytics rate limiter error:', rateError)
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
    console.error('Failed to resolve analytics consent roster for predictive dashboard', consentError)
    return res.status(500).json({ error: 'Failed to resolve analytics consent roster' })
  }

  if (!consentingUserIds.length) {
    await logAuditEvent({
      req,
      action: 'analytics.predictive.blocked',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'user_consents',
      metadata: { reason: 'missing_analytics_consent' }
    })

    return res.status(412).json({ error: 'Analytics reporting requires active analytics consent' })
  }

  try {
    const [predictiveResult, workflowResult] = await Promise.all([
      fetchPredictiveSummary(),
      fetchWorkflowSummary()
    ])

    const predictive = predictiveResult.summary
      ? predictiveResult.summary
      : await fallbackPredictiveSummary()

    const workflow = workflowResult.summary
      ? workflowResult.summary
      : await fallbackWorkflowSummary()

    const generatedAt = predictive.generatedAt || workflow.generatedAt || new Date().toISOString()

    const responseBody = {
      predictive,
      workflow,
      generatedAt,
      source: {
        predictive: predictiveResult.source,
        workflow: workflowResult.source
      }
    }

    await logAuditEvent({
      req,
      action: 'analytics.predictive.view',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'analytics_predictive_summary',
      metadata: {
        consentingUsers: consentingUserIds.length,
        sourcePredictive: predictiveResult.source,
        sourceWorkflow: workflowResult.source
      }
    })

    return res.status(200).json(responseBody)
  } catch (error) {
    console.error('Predictive dashboard aggregation error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

module.exports = {
  handlePredictiveDashboardRequest
}
