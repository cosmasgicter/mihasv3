import { handlePredictiveDashboardRequest } from './_lib/analytics/predictiveDashboard.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Convert request to Express-like format for compatibility
    const req = {
      method: req.method,
      headers: Object.fromEntries(request.headers),
      query: Object.fromEntries(new URL(request.url).searchParams)
    }
    
    const res = {
      json: (data) => ({ data, status: 200 }),
      status: (code) => ({ status: code, json: (data) => ({ data, status: code }) })
    }

    const result = await handlePredictiveDashboardRequest(req, res)
    return new Response(JSON.stringify(result.data || result), { 
      status: result.status || 200, 
      headers 
    })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler