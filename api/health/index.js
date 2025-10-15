import { testSupabaseConnection } from '../_lib/networkTest.js'
import { withNetlifyHandler } from '../_lib/netlifyHandler.js'

async function handler(req, res) {
  console.log('[health] Method:', req.method, 'Path:', req.path)
  
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    console.log('[health] Rejecting method:', req.method)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!supabaseUrl) {
    return res.status(500).json({
      status: 'error',
      mode: 'live',
      message: 'Supabase URL not configured'
    })
  }

  const connectionTest = await testSupabaseConnection(supabaseUrl)

  return res.status(connectionTest.success ? 200 : 503).json({
    status: connectionTest.success ? 'healthy' : 'unhealthy',
    supabase: connectionTest,
    mode: 'live',
    timestamp: new Date().toISOString()
  })
}

const netlifyHandler = withNetlifyHandler(handler)

export { handler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler
