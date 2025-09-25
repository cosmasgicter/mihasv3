import { mockApplications, mockPrograms } from './_lib/mockData.js'
import { useMockSupabase } from './_lib/supabaseClient.js'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
  'Content-Type': 'application/json'
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method === 'GET' && useMockSupabase) {
    const totalApplications = mockApplications.length
    const statusBreakdown = mockApplications.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] ?? 0) + 1
      return acc
    }, {})

    const programInterest = mockPrograms.map(program => ({
      id: program.id,
      name: program.name,
      applicants: mockApplications.filter(app => app.program_id === program.id).length
    }))

    return new Response(JSON.stringify({
      success: true,
      mode: 'mock',
      metrics: {
        totalApplications,
        statusBreakdown,
        programInterest,
        generatedAt: new Date().toISOString()
      }
    }), { status: 200, headers })
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  // Basic telemetry endpoint - just acknowledge receipt
  return new Response(JSON.stringify({ success: true }), { headers })
}