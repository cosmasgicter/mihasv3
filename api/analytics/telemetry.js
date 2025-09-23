import { withNetlifyHandler } from '../_lib/netlifyHandler.js'
import {
  handleTelemetryFetch,
  handleTelemetryIngest
} from '../_lib/analytics/telemetry.js'

async function handler(req, res) {
  if (req.method === 'POST') {
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
