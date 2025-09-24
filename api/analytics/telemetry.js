import { withNetlifyHandler } from '../_lib/netlifyHandler.js'
import {
  handleTelemetryFetch,
  handleTelemetryIngest
} from '../_lib/analytics/telemetry.js'
import { validateCsrfToken } from '../_lib/security.js'

async function handler(req, res) {
  if (req.method === 'POST') {
    // Validate CSRF token for state-changing requests
    const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken
    const sessionToken = req.headers['x-session-token']
    
    if (!validateCsrfToken(csrfToken, sessionToken)) {
      return res.status(403).json({ error: 'Invalid CSRF token' })
    }
    
    return handleTelemetryIngest(req, res)
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
