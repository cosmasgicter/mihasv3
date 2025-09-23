import { handlePredictiveDashboardRequest } from '../_lib/analytics/predictiveDashboard.js'
import { withNetlifyHandler } from '../../../api/_lib/netlifyHandler.js'

async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }


  const method = (req.method || 'GET').toUpperCase()
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: `Method ${method} not allowed` })
  }

  return handlePredictiveDashboardRequest(req, res)
}

const netlifyHandler = withNetlifyHandler(handler)

export { netlifyHandler as handler }
export default netlifyHandler
