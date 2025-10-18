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
    // Get all applications with created_at for time-based filtering
    const { data: applications, error: appsError } = await supabaseAdminClient
      .from('applications')
      .select('status, created_at, updated_at, student_id')

    if (appsError) throw appsError

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Count by status
    const statusCounts = applications.reduce((acc, app) => {
      acc[app.status] = (acc[app.status] || 0) + 1
      return acc
    }, {})

    // Count by time period
    const todayApplications = applications.filter(app => 
      new Date(app.created_at) >= today
    ).length

    const weekApplications = applications.filter(app => 
      new Date(app.created_at) >= weekAgo
    ).length

    const monthApplications = applications.filter(app => 
      new Date(app.created_at) >= monthAgo
    ).length

    // Get programs and intakes count
    const { count: programsCount } = await supabaseAdminClient
      .from('programs')
      .select('*', { count: 'exact', head: true })

    const { count: intakesCount } = await supabaseAdminClient
      .from('intakes')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    // Get active users (logged in last 24 hours)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const { count: activeUsersCount } = await supabaseAdminClient
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('last_sign_in_at', oneDayAgo.toISOString())

    // Calculate average processing time (for approved/rejected applications)
    const processedApps = applications.filter(app => 
      (app.status === 'approved' || app.status === 'rejected') && app.created_at && app.updated_at
    )
    
    let avgProcessingTime = 0
    if (processedApps.length > 0) {
      const totalDays = processedApps.reduce((sum, app) => {
        const created = new Date(app.created_at)
        const updated = new Date(app.updated_at)
        const days = (updated - created) / (1000 * 60 * 60 * 24)
        return sum + days
      }, 0)
      avgProcessingTime = Math.round(totalDays / processedApps.length)
    }

    // Get recent activity
    const { data: recentApps } = await supabaseAdminClient
      .from('applications')
      .select('id, status, created_at, updated_at, student_id')
      .order('updated_at', { ascending: false })
      .limit(10)

    const recentActivity = (recentApps || []).map(app => ({
      id: app.id,
      type: 'application',
      message: `${app.status === 'draft' ? 'Application draft' : 'Application submitted'}`,
      timestamp: app.updated_at || app.created_at,
      status: app.status
    }))

    const stats = {
      totalApplications: applications.length,
      pendingApplications: (statusCounts.submitted || 0) + (statusCounts.under_review || 0),
      approvedApplications: statusCounts.approved || 0,
      rejectedApplications: statusCounts.rejected || 0,
      totalPrograms: programsCount || 0,
      activeIntakes: intakesCount || 0,
      totalStudents: applications.length,
      todayApplications,
      weekApplications,
      monthApplications,
      avgProcessingTime,
      activeUsers: activeUsersCount || 0,
      systemHealth: 'good',
      statusBreakdown: statusCounts
    }

    return new Response(JSON.stringify({ stats, recentActivity }), { headers })
  } catch (error) {
    console.error('Dashboard error:', error)
    return new Response(JSON.stringify({ error: 'Failed to load dashboard' }), { status: 500, headers })
  }
}