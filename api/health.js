import { testSupabaseConnection } from './_lib/networkTest.js'
import { useMockSupabase } from './_lib/supabaseClient.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'GET') {
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
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Supabase URL not configured'
    }), { status: 500, headers })
  }

  const connectionTest = await testSupabaseConnection(supabaseUrl)

  return new Response(JSON.stringify({
    status: connectionTest.success ? 'healthy' : 'unhealthy',
    supabase: connectionTest,
    mode: useMockSupabase ? 'mock' : 'live',
    timestamp: new Date().toISOString()
  }), {
    status: connectionTest.success ? 200 : 503,
    headers
  })
}