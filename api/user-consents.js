const { requireUser } = require('./_lib/supabaseClient')
const { logAuditEvent } = require('./_lib/auditLogger')
const {
  listConsents,
  grantConsent,
  revokeConsent,
  hasActiveConsent
} = require('./_lib/userConsent')

function normalizeConsent(record) {
  if (!record) {
    return null
  }

  return {
    id: record.id,
    userId: record.user_id,
    consentType: record.consent_type,
    grantedAt: record.granted_at,
    grantedBy: record.granted_by,
    revokedAt: record.revoked_at,
    revokedBy: record.revoked_by,
    source: record.source,
    metadata: record.metadata || {},
    notes: record.notes || null,
    active: !record.revoked_at
  }
}

module.exports = async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  try {
    const authContext = await requireUser(req)
    if (authContext.error) {
      return res.status(401).json({ error: authContext.error })
    }
    const { user, roles, isAdmin } = authContext

    const requestedUserId = typeof req.query?.userId === 'string' ? req.query.userId : null
    const targetUserId = isAdmin && requestedUserId ? requestedUserId : user.id

    if (req.method === 'GET') {
      const records = await listConsents(targetUserId)
      const normalized = records.map(normalizeConsent)
      const active = normalized.filter(item => item?.active)

      await logAuditEvent({
        req,
        action: 'consents.fetch',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_consents',
        targetId: targetUserId,
        metadata: {
          recordCount: normalized.length,
          activeCount: active.length,
          asAdmin: isAdmin && targetUserId !== user.id
        }
      })

      return res.status(200).json({ consents: normalized, active })
    }

    if (req.method === 'POST') {
      const { consentType, action, source, notes } =
        typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}

      if (!consentType || typeof consentType !== 'string') {
        return res.status(400).json({ error: 'consentType is required' })
      }

      if (!['grant', 'revoke'].includes(action)) {
        return res.status(400).json({ error: 'action must be grant or revoke' })
      }

      let record
      if (action === 'grant') {
        record = await grantConsent({
          userId: targetUserId,
          consentType,
          actorId: user.id,
          source,
          metadata: {},
          notes
        })
      } else {
        record = await revokeConsent({
          userId: targetUserId,
          consentType,
          actorId: user.id,
          notes
        })
      }

      const normalized = normalizeConsent(record)

      await logAuditEvent({
        req,
        action: action === 'grant' ? 'consents.grant' : 'consents.revoke',
        actorId: user.id,
        actorEmail: user.email || null,
        actorRoles: roles,
        targetTable: 'user_consents',
        targetId: targetUserId,
        metadata: {
          consentType,
          source: source || null,
          notes: notes || null,
          asAdmin: isAdmin && targetUserId !== user.id
        }
      })

      return res.status(200).json({ consent: normalized })
    }

    if (req.method === 'HEAD') {
      if (!req.query?.consentType) {
        return res.status(400).json({ error: 'consentType is required' })
      }

      const { active } = await hasActiveConsent(targetUserId, req.query.consentType)
      return res.status(active ? 204 : 404).end()
    }

    res.setHeader('Allow', 'GET,POST,HEAD')
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('User consent handler error:', {
      message: error.message,
      stack: error.stack,
      method: req.method,
      body: req.body
    })
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    })
  }
}
