const {
  supabaseAdminClient,
  requireUser
} = require('../../../_lib/supabaseClient')
const { logAuditEvent } = require('../../../_lib/auditLogger')
const { parseUserId, parseRequestBody } = require('../../../_lib/adminUserHelpers')

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  try {
    const { user, roles } = await requireUser(req, { requireAdmin: true })
    const userId = parseUserId(req.query?.id)

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' })
    }

    if (req.method === 'GET') {
      const { data: permissionsRecord, error: permissionsError } = await supabaseAdminClient
        .from('user_permissions')
        .select('permissions')
        .eq('user_id', userId)
        .maybeSingle()

      if (permissionsError && permissionsError.code !== 'PGRST116') {
        throw permissionsError
      }

      const permissions = Array.isArray(permissionsRecord?.permissions)
        ? permissionsRecord.permissions
        : []

      await logAuditEvent({
        req,
        action: 'admin.users.permissions.view',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_permissions',
        targetId: userId,
        metadata: { permissionsCount: permissions.length }
      })

      return res.status(200).json({ data: permissions })
    }

    if (req.method === 'PUT') {
      const payload = parseRequestBody(req.body)
      const { permissions } = payload || {}

      if (!Array.isArray(permissions)) {
        return res.status(400).json({ error: 'Permissions must be provided as an array' })
      }

      const sanitizedPermissions = Array.from(
        new Set(
          permissions
            .filter(permission => typeof permission === 'string')
            .map(permission => permission.trim())
            .filter(Boolean)
        )
      )

      const nowIso = new Date().toISOString()

      const { data: upsertedRecord, error: upsertError } = await supabaseAdminClient
        .from('user_permissions')
        .upsert(
          {
            user_id: userId,
            permissions: sanitizedPermissions,
            updated_at: nowIso
          },
          { onConflict: 'user_id' }
        )
        .select('permissions')
        .single()

      if (upsertError) {
        throw upsertError
      }

      await logAuditEvent({
        req,
        action: 'admin.users.permissions.update',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_permissions',
        targetId: userId,
        metadata: { permissionsCount: sanitizedPermissions.length }
      })

      return res.status(200).json({ data: upsertedRecord?.permissions ?? sanitizedPermissions })
    }

    res.setHeader('Allow', 'GET,PUT')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('Admin user permissions handler error:', error)
    const statusCode = error.message === 'Access denied' ? 403 : 500
    return res.status(statusCode).json({ error: error.message || 'Internal server error' })
  }
}
