import { getUserFromRequest } from './_lib/supabaseClient.js'
import {
  listConsents,
  grantConsent,
  revokeConsent,
  hasActiveConsent
} from './_lib/userConsent.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js'

const dependencies = {
  getUserFromRequest,
  listConsents,
  grantConsent,
  revokeConsent,
  hasActiveConsent
}

function parseBody(body) {
  if (!body) {
    return {}
  }

  if (typeof body !== 'string') {
    return body
  }

  try {
    return JSON.parse(body)
  } catch (error) {
    return {}
  }
}

function resolveTargetUserId(req, authContext) {
  const requestedUserId = req.query?.userId ?? req.params?.userId ?? null
  if (authContext.isAdmin && requestedUserId) {
    return requestedUserId
  }
  return authContext.user.id
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const authContext = await dependencies.getUserFromRequest(req)
  if (authContext.error) {
    const status = authContext.error === 'Access denied' ? 403 : 401
    return res.status(status).json({ error: authContext.error })
  }

  try {
    const targetUserId = resolveTargetUserId(req, authContext)

    if (req.method === 'GET') {
      const records = await dependencies.listConsents(targetUserId)
      const consents = (records ?? [])
        .map(record =>
          record
            ? {
                id: record.id,
                userId: record.user_id,
                consentType: record.consent_type,
                grantedAt: record.granted_at,
                active: !record.revoked_at
              }
            : null
        )
        .filter(Boolean)

      return res.status(200).json({ consents })
    }

    if (req.method === 'POST') {
      const body = parseBody(req.body)
      const { consentType, action } = body

      if (!consentType || !['grant', 'revoke'].includes(action)) {
        return res.status(400).json({ error: 'Invalid request' })
      }

      const mutation =
        action === 'grant'
          ? dependencies.grantConsent({ userId: targetUserId, consentType, actorId: authContext.user.id })
          : dependencies.revokeConsent({ userId: targetUserId, consentType, actorId: authContext.user.id })

      const record = await mutation

      return res.status(200).json({ consent: record })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    console.error('User consent handler error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

handler.__testables__ = {
  setDependencies(overrides = {}) {
    Object.assign(dependencies, overrides)
  }
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
