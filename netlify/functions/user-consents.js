import { getUserFromRequest } from './_lib/supabaseClient.js'
import { listConsents, grantConsent, revokeConsent, hasActiveConsent } from './_lib/userConsent.js'

export const handler = async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  try {
    const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) })
    if (authContext?.error || !authContext?.user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers })
    }

    const { user, isAdmin = false } = authContext
    const url = new URL(request.url)
    const requestedUserId = url.searchParams.get('userId')
    const targetUserId = isAdmin && requestedUserId ? requestedUserId : user.id

    if (request.method === 'GET') {
      const records = await listConsents(targetUserId)
      const normalized = records.map(r => r ? {
        id: r.id,
        userId: r.user_id,
        consentType: r.consent_type,
        grantedAt: r.granted_at,
        active: !r.revoked_at
      } : null).filter(Boolean)
      
      return new Response(JSON.stringify({ consents: normalized }), { headers })
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { consentType, action } = body

      if (!consentType || !['grant', 'revoke'].includes(action)) {
        return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers })
      }

      const record = action === 'grant' 
        ? await grantConsent({ userId: targetUserId, consentType, actorId: user.id })
        : await revokeConsent({ userId: targetUserId, consentType, actorId: user.id })

      return new Response(JSON.stringify({ consent: record }), { headers })
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers })
  }
}

export { handler as default }
