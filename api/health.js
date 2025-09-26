import { testSupabaseConnection } from './_lib/networkTest.js'
import { withNetlifyHandler } from './_lib/netlifyHandler.js';
import { useMockSupabase } from './_lib/supabaseClient.js'

async function baseHandler(req, res) {
  

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { 
      status: 405, headers 
    })
  }

  if (useMockSupabase) {
    return new Response(JSON.stringify({
      status: 'healthy',
      mode: 'mock',
      timestamp: new Date().toISOString()
    }), { status: 200, headers })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!supabaseUrl) {
    return res.status(500).json({
      status: 'error',
      message: 'Supabase URL not configured'
    })
  }

  const connectionTest = await testSupabaseConnection(supabaseUrl)

  const healthStatus = connectionTest.success
    ? connectionTest.degraded ? 'degraded' : 'healthy'
    : 'unhealthy'

  return new Response(
    JSON.stringify({
      status: healthStatus,
      supabase: connectionTest,
      mode: useMockSupabase ? 'mock' : 'live',
      timestamp: new Date().toISOString()
    }),
    {
      status: connectionTest.success ? 200 : 503,
      headers
    }
  )
}

const netlifyHandler = withNetlifyHandler(baseHandler)

export { baseHandler as expressHandler }
export { netlifyHandler as handler }
export default netlifyHandler