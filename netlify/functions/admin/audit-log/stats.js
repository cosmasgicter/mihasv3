const { logAuditEvent } = require('../../_lib/auditLogger')
const { supabaseAdminClient, getUserFromRequest } = require('../../_lib/supabaseClient')
const { normalizeRecord, fetchAllAuditRecords } = require('./utils')

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

  try {
    const startOfToday = new Date()
    startOfToday.setUTCHours(0, 0, 0, 0)

    const [{ count: totalEntries, error: totalError }, { count: todayEntries, error: todayError }] = await Promise.all([
      supabaseAdminClient
        .from('system_audit_log')
        .select('id', { count: 'exact', head: true }),
      supabaseAdminClient
        .from('system_audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', startOfToday.toISOString())
    ])

    if (totalError) throw totalError
    if (todayError) throw todayError

    const { data: recentData, error: recentError } = await supabaseAdminClient
      .from('system_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (recentError) throw recentError

    const recentActivity = (recentData || []).map(normalizeRecord).filter(Boolean)

    let uniqueActors = 0
    let topActions = []

    if ((totalEntries || 0) > 0) {
      const rows = await fetchAllAuditRecords({
        client: supabaseAdminClient,
        columns: 'action, actor_id',
        order: { column: 'created_at', ascending: false }
      })

      const actorSet = new Set()
      const actionCounts = new Map()

      for (const row of rows) {
        if (row.actor_id) {
          actorSet.add(row.actor_id)
        }

        const actionKey = row.action || 'unknown'
        actionCounts.set(actionKey, (actionCounts.get(actionKey) || 0) + 1)
      }

      uniqueActors = actorSet.size
      topActions = Array.from(actionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([action, count]) => ({ action, count }))
    }

    const payload = {
      totalEntries: Number(totalEntries || 0),
      todayEntries: Number(todayEntries || 0),
      uniqueActors,
      topActions,
      recentActivity
    }

    await logAuditEvent({
      req,
      action: 'audit.log.stats.view',
      actorId: authContext.user.id,
      actorEmail: authContext.user.email || null,
      actorRoles: authContext.roles,
      targetTable: 'system_audit_log',
      metadata: {
        totalEntries: payload.totalEntries,
        todayEntries: payload.todayEntries,
        uniqueActors: payload.uniqueActors,
        topActions: payload.topActions.map(item => item.action)
      }
    })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json(payload)
  } catch (error) {
    console.error('Audit log stats error:', error)
    return res.status(500).json({ error: 'Failed to generate audit statistics' })
  }
}
