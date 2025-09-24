import { supabaseAdminClient, getUserFromRequest } from './_lib/supabaseClient.js'

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, authorization',
    'Content-Type': 'application/json'
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers })
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  try {
    const { data, error } = await supabaseAdminClient
      .from('applications_new')
      .select('status')

    if (error) throw error

    const statusCounts = data.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1
      return acc
    }, {})

    const stats = {
      totalApplications: data.length,
      pendingApplications: (statusCounts.submitted || 0) + (statusCounts.under_review || 0),
      approvedApplications: statusCounts.approved || 0,
      rejectedApplications: statusCounts.rejected || 0,
      statusBreakdown: statusCounts
    }

    return new Response(JSON.stringify({ stats, recentActivity: [] }), { headers })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to load dashboard' }), { status: 500, headers })
  }
}