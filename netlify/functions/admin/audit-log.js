const { logAuditEvent } = require('../_lib/auditLogger')
const { supabaseAdminClient, getUserFromRequest } = require('../_lib/supabaseClient')
const {
  buildAuditLogFilters,
  normalizeRecord,
  applyAuditLogFilters
} = require('./audit-log/utils')

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

  const {
    page = '1',
    pageSize = '25'
  } = req.query || {}

  const filters = buildAuditLogFilters(req.query)

  const normalizedPage = Number.parseInt(Array.isArray(page) ? page[0] : page, 10)
  const normalizedPageSize = Number.parseInt(Array.isArray(pageSize) ? pageSize[0] : pageSize, 10)

  const limit = Number.isNaN(normalizedPageSize) ? 25 : Math.min(Math.max(normalizedPageSize, 5), 100)
  const currentPage = Number.isNaN(normalizedPage) ? 1 : Math.max(normalizedPage, 1)
  const offset = (currentPage - 1) * limit

  let query = supabaseAdminClient
    .from('system_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  query = applyAuditLogFilters(query, filters)

  const { data, count, error } = await query
  if (error) {
    console.error('Audit log query failed', error)
    return res.status(500).json({ error: 'Failed to load audit log entries' })
  }

  const records = (data || []).map(normalizeRecord)
  const totalCount = typeof count === 'number' ? count : records.length
  const totalPages = limit > 0 ? Math.max(Math.ceil(totalCount / limit), 1) : 1

  await logAuditEvent({
    req,
    action: 'audit.log.view',
    actorId: authContext.user.id,
    actorEmail: authContext.user.email || null,
    actorRoles: authContext.roles,
    targetTable: 'system_audit_log',
    metadata: {
      filters: {
        action: filters.action || null,
        actorId: filters.actorId || null,
        targetTable: filters.targetTable || null,
        targetId: filters.targetId || null
      },
      page: currentPage,
      pageSize: limit
    }
  })

  return res.status(200).json({
    data: records,
    page: currentPage,
    pageSize: limit,
    totalPages,
    totalCount
  })
}
