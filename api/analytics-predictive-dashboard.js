import { handlePredictiveDashboardRequest } from './_lib/analytics/predictiveDashboard.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    // Convert request to Express-like format for compatibility
    const req = {
      method: request.method,
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
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500, headers })
  }
}