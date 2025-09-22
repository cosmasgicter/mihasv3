const { z } = require('zod')
const {
  supabaseAdminClient,
  getUserFromRequest
} = require('../supabaseClient')
const { logAuditEvent } = require('../auditLogger')
const { listActiveConsentUserIds } = require('../userConsent')
const {
  checkRateLimit,
  buildRateLimitKey,
  getLimiterConfig,
  attachRateLimitHeaders
} = require('../rateLimiter')

const telemetryEventSchema = z.object({
  type: z.enum(['api_call', 'custom_metric', 'error', 'alert']),
  service: z.string().min(1),
  endpoint: z.string().optional(),
  success: z.boolean().optional(),
  duration_ms: z.number().nonnegative().optional(),
  status_code: z.number().optional(),
  metric_name: z.string().optional(),
  metric_value: z.number().optional(),
  level: z.enum(['info', 'warning', 'error']).optional(),
  message: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  occurred_at: z.string().datetime().optional()
})

const ingestPayloadSchema = z.object({
  events: z.array(telemetryEventSchema).min(1)
})

function calculatePercentile(samples, percentile) {
  if (!samples.length) return 0
  const sorted = [...samples].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]

  const rank = (percentile / 100) * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) {
    return sorted[lower]
  }
  const weight = rank - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

async function handleTelemetryIngest(req, res) {
  // Rate limiting temporarily disabled for testing

  let payload
  try {
    payload = ingestPayloadSchema.parse(typeof req.body === 'string' ? JSON.parse(req.body) : req.body)
  } catch (error) {
    console.error('Invalid telemetry payload', error)
    return res.status(400).json({ error: 'Invalid telemetry payload' })
  }

  const records = payload.events.map(event => ({
    type: event.type,
    service: event.service,
    endpoint: event.endpoint ?? null,
    success: event.success ?? null,
    duration_ms: event.duration_ms ?? null,
    status_code: event.status_code ?? null,
    metric_name: event.metric_name ?? null,
    metric_value: event.metric_value ?? null,
    level: event.level ?? null,
    message: event.message ?? null,
    metadata: event.metadata ?? null,
    occurred_at: event.occurred_at ?? new Date().toISOString()
  }))

  const { error } = await supabaseAdminClient.from('api_telemetry').insert(records)
  if (error) {
    console.error('Failed to persist telemetry batch', error)
    return res.status(500).json({ error: 'Failed to persist telemetry' })
  }

  return res.status(202).json({ stored: records.length })
}

async function handleTelemetryFetch(req, res) {
  // Rate limiting temporarily disabled for testing

  const authContext = await getUserFromRequest(req, { requireAdmin: true })
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  let consentingUserIds = []
  try {
    consentingUserIds = await listActiveConsentUserIds('analytics')
  } catch (consentError) {
    console.error('Failed to resolve analytics consent roster for telemetry fetch', consentError)
    return res.status(500).json({ error: 'Failed to resolve analytics consent roster' })
  }

  if (!consentingUserIds.length) {
    await logAuditEvent({
      req,
      action: 'analytics.telemetry.blocked',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'user_consents',
      metadata: { reason: 'missing_analytics_consent' }
    })

    return res.status(412).json({ error: 'Analytics reporting requires active analytics consent' })
  }

  const { service, endpoint, type, level, limit, since, windowMinutes } = req.query

  let query = supabaseAdminClient
    .from('api_telemetry')
    .select(
      'id, type, service, endpoint, success, duration_ms, status_code, metric_name, metric_value, level, message, metadata, occurred_at'
    )
    .order('occurred_at', { ascending: false })

  if (service) {
    query = query.eq('service', service)
  }
  if (endpoint) {
    query = query.eq('endpoint', endpoint)
  }
  if (type) {
    query = query.eq('type', type)
  }
  if (level) {
    query = query.eq('level', level)
  }

  const limitNumber = Number.parseInt(limit, 10)
  if (!Number.isNaN(limitNumber) && limitNumber > 0) {
    query = query.limit(Math.min(limitNumber, 1000))
  } else {
    query = query.limit(500)
  }

  const now = Date.now()
  if (since) {
    query = query.gte('occurred_at', new Date(since).toISOString())
  } else if (windowMinutes) {
    const minutes = Number.parseInt(windowMinutes, 10)
    if (!Number.isNaN(minutes) && minutes > 0) {
      const start = new Date(now - minutes * 60_000).toISOString()
      query = query.gte('occurred_at', start)
    }
  }

  const { data, error } = await query
  if (error) {
    console.error('Failed to fetch telemetry', error)
    return res.status(500).json({ error: 'Failed to fetch telemetry' })
  }

  const summaryMap = new Map()
  ;(data || [])
    .filter(event => event.type === 'api_call')
    .forEach(event => {
      const key = `${event.service}:${event.endpoint ?? 'unknown'}`
      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          service: event.service,
          endpoint: event.endpoint ?? 'unknown',
          totalCalls: 0,
          errorCount: 0,
          samples: [],
          firstSeen: event.occurred_at,
          lastSeen: event.occurred_at
        })
      }

      const entry = summaryMap.get(key)
      entry.totalCalls += 1
      if (event.success === false) {
        entry.errorCount += 1
      }
      if (typeof event.duration_ms === 'number') {
        entry.samples.push(event.duration_ms)
      }

      const occurred = Date.parse(event.occurred_at)
      if (!entry.firstSeen || occurred < Date.parse(entry.firstSeen)) {
        entry.firstSeen = event.occurred_at
      }
      if (!entry.lastSeen || occurred > Date.parse(entry.lastSeen)) {
        entry.lastSeen = event.occurred_at
      }
    })

  const summary = Array.from(summaryMap.values()).map(entry => ({
    service: entry.service,
    endpoint: entry.endpoint,
    totalCalls: entry.totalCalls,
    errorCount: entry.errorCount,
    errorRate: entry.totalCalls > 0 ? entry.errorCount / entry.totalCalls : 0,
    avgDuration: entry.samples.length
      ? entry.samples.reduce((sum, value) => sum + value, 0) / entry.samples.length
      : 0,
    p95Duration: calculatePercentile(entry.samples, 95),
    firstSeen: entry.firstSeen,
    lastSeen: entry.lastSeen
  }))

  const response = {
    events: data ?? [],
    summary
  }

  await logAuditEvent({
    req,
    action: 'analytics.telemetry.view',
    actorId: authContext.user.id,
    actorEmail: authContext.user.email || null,
    actorRoles: authContext.roles,
    targetTable: 'api_telemetry',
    metadata: {
      consentingUsers: consentingUserIds.length,
      filters: { service, endpoint, type, level }
    }
  })

  return res.status(200).json(response)
}

module.exports = {
  handleTelemetryFetch,
  handleTelemetryIngest
}
