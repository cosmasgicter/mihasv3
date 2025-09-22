const BATCH_SIZE = 1000

function parseAction(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  if (typeof value === 'string') {
    return value
  }
  return null
}

function getQueryValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  if (typeof value === 'string') {
    return value
  }
  return null
}

function parseDateValue(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

function normalizeRecord(record) {
  if (!record) {
    return null
  }

  return {
    id: record.id,
    action: record.action,
    actorId: record.actor_id,
    actorEmail: record.actor_email,
    actorRoles: record.actor_roles || [],
    targetTable: record.target_table,
    targetId: record.target_id,
    targetLabel: record.target_label,
    requestId: record.request_id,
    requestIp: record.request_ip,
    userAgent: record.user_agent,
    metadata: record.metadata || {},
    createdAt: record.created_at
  }
}

function buildAuditLogFilters(query = {}) {
  const actionFilter = parseAction(query.logAction)
    || parseAction(query.eventAction)
    || parseAction(query.auditAction)

  const filters = {
    action: actionFilter || null,
    actorId: getQueryValue(query.actorId),
    targetTable: getQueryValue(query.targetTable),
    targetId: getQueryValue(query.targetId),
    from: parseDateValue(getQueryValue(query.from)),
    to: parseDateValue(getQueryValue(query.to))
  }

  return filters
}

function applyAuditLogFilters(query, filters = {}) {
  if (!query) {
    return query
  }

  let nextQuery = query

  if (filters.action) {
    nextQuery = nextQuery.ilike('action', `${filters.action}%`)
  }
  if (filters.actorId) {
    nextQuery = nextQuery.eq('actor_id', filters.actorId)
  }
  if (filters.targetTable) {
    nextQuery = nextQuery.eq('target_table', filters.targetTable)
  }
  if (filters.targetId) {
    nextQuery = nextQuery.eq('target_id', filters.targetId)
  }
  if (filters.from) {
    nextQuery = nextQuery.gte('created_at', filters.from)
  }
  if (filters.to) {
    nextQuery = nextQuery.lte('created_at', filters.to)
  }

  return nextQuery
}

async function fetchAllAuditRecords({
  client,
  filters = {},
  columns = '*',
  order = { column: 'created_at', ascending: false },
  batchSize = BATCH_SIZE
}) {
  if (!client) {
    throw new Error('Supabase client is required to fetch audit records')
  }

  const results = []
  let offset = 0

  while (true) {
    let query = client
      .from('system_audit_log')
      .select(columns)

    if (order?.column) {
      query = query.order(order.column, { ascending: Boolean(order?.ascending) })
    }

    query = applyAuditLogFilters(query, filters)
    query = query.range(offset, offset + batchSize - 1)

    const { data, error } = await query
    if (error) {
      throw error
    }

    if (!data || data.length === 0) {
      break
    }

    results.push(...data)
    offset += batchSize

    if (data.length < batchSize) {
      break
    }
  }

  return results
}

module.exports = {
  BATCH_SIZE,
  parseAction,
  normalizeRecord,
  buildAuditLogFilters,
  applyAuditLogFilters,
  fetchAllAuditRecords
}
