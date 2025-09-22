const { testSupabaseConnection } = require('../_lib/networkTest')

async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  
  if (!supabaseUrl) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: 'Supabase URL not configured'
      })
    }
  }

  const connectionTest = await testSupabaseConnection(supabaseUrl)
  
  return {
    statusCode: connectionTest.success ? 200 : 503,
    headers,
    body: JSON.stringify({
      status: connectionTest.success ? 'healthy' : 'unhealthy',
      supabase: connectionTest,
      timestamp: new Date().toISOString()
    })
  }
}

module.exports = handler