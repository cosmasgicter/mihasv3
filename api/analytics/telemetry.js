import { withNetlifyHandler } from '../_lib/netlifyHandler.js'
import {
  handleTelemetryFetch,
  handleTelemetryIngest
} from '../_lib/analytics/telemetry.js'
import { validateCsrfToken } from '../_lib/security.js'

function shouldEnforceCsrf(req) {
  const origin = req.headers?.origin
  const referer = req.headers?.referer
  const sessionToken = req.headers?.['x-session-token'] ?? req.body?.sessionToken

  const hasBrowserContext = Boolean(origin || referer)
  return hasBrowserContext && Boolean(sessionToken)
}

async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, authorization, x-csrf-token, x-session-token')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method === 'POST') {
    try {
      if (shouldEnforceCsrf(req)) {
        const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken
        const sessionToken = req.headers['x-session-token'] || req.body?.sessionToken

        if (!validateCsrfToken(csrfToken, sessionToken)) {
          return res.status(403).json({ error: 'Invalid CSRF token' })
        }
      }

      return handleTelemetryIngest(req, res)
    } catch (error) {
      console.error('Telemetry error:', error)
      return res.status(200).json({ success: true })
    }
  }

  if (req.method === 'GET') {
    return handleTelemetryFetch(req, res)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
