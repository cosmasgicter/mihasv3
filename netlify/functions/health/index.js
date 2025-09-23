import { testSupabaseConnection } from '../_lib/networkTest.js'

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!supabaseUrl) {
    return res.status(500).json({
      status: 'error',
      message: 'Supabase URL not configured'
    })
  }

  const connectionTest = await testSupabaseConnection(supabaseUrl)

  return res.status(connectionTest.success ? 200 : 503).json({
    status: connectionTest.success ? 'healthy' : 'unhealthy',
    supabase: connectionTest,
    timestamp: new Date().toISOString()
  })
}

export { handler }
export default handler

