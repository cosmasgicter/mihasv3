const { logAuditEvent } = require('../../_lib/auditLogger')
const { supabaseAdminClient, getUserFromRequest } = require('../../_lib/supabaseClient')
const { buildAuditLogFilters, normalizeRecord, fetchAllAuditRecords } = require('./utils')

function resolveSingleValue(value) {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function formatCsvValue(value) {
  if (value === null || value === undefined) {
    return '""'
  }

  const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
  const sanitized = stringValue.replace(/"/g, '""')
  return `"${sanitized}"`
}

function recordsToCsv(records) {
  const headers = [
    'ID',
    'Action',
    'Actor ID',
    'Actor Email',
    'Actor Roles',
    'Target Table',
    'Target ID',
    'Target Label',
    'Request ID',
    'Request IP',
    'User Agent',
    'Metadata',
    'Created At'
  ]

  const lines = [headers.map(formatCsvValue).join(',')]

  for (const record of records) {
    const row = [
      record.id || '',
      record.action || '',
      record.actorId || '',
      record.actorEmail || '',
      Array.isArray(record.actorRoles) ? record.actorRoles.join('; ') : '',
      record.targetTable || '',
      record.targetId || '',
      record.targetLabel || '',
      record.requestId || '',
      record.requestIp || '',
      record.userAgent || '',
      record.metadata && Object.keys(record.metadata).length > 0 ? JSON.stringify(record.metadata) : '',
      record.createdAt || ''
    ]

    lines.push(row.map(formatCsvValue).join(','))
  }

  return lines.join('\n')
}

function buildFilename(extension) {
  const timestamp = new Date().toISOString().replace(/[:]/g, '-')
  return `mihas-audit-log-${timestamp}.${extension}`
}

module.exports = async function handler(req, res) {
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

  const filters = buildAuditLogFilters(req.query)
  const formatParam = (resolveSingleValue(req.query?.format) || '').toString().toLowerCase()
  const exportFormat = formatParam === 'json' ? 'json' : 'csv'

  try {
    const rawRecords = await fetchAllAuditRecords({
      client: supabaseAdminClient,
      filters,
      columns: '*',
      order: { column: 'created_at', ascending: false }
    })

    const normalizedRecords = rawRecords.map(normalizeRecord).filter(Boolean)

    const payload = exportFormat === 'json'
      ? JSON.stringify(normalizedRecords, null, 2)
      : recordsToCsv(normalizedRecords)

    const contentType = exportFormat === 'json'
      ? 'application/json; charset=utf-8'
      : 'text/csv; charset=utf-8'

    const filename = buildFilename(exportFormat)

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')

    await logAuditEvent({
      req,
      action: 'audit.log.export',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'system_audit_log',
      metadata: {
        format: exportFormat,
        recordCount: normalizedRecords.length,
        filters: {
          action: filters.action || null,
          actorId: filters.actorId || null,
          targetTable: filters.targetTable || null,
          targetId: filters.targetId || null,
          from: filters.from || null,
          to: filters.to || null
        }
      }
    })

    return res.status(200).end(payload)
  } catch (error) {
    console.error('Audit log export error:', error)
    return res.status(500).json({ error: 'Failed to export audit log entries' })
  }
}
