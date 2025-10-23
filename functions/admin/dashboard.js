import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    const authContext = await getUserFromRequest(request, { requireAdmin: true });
    
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const [total, pending, approved, rejected, todayApps, weekApps, monthApps, programs, intakes, students, recentApps] = await Promise.all([
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', today),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
      supabaseAdminClient.from('programs').select('*', { count: 'exact', head: true }),
      supabaseAdminClient.from('intakes').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabaseAdminClient.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabaseAdminClient.from('applications').select('id, application_number, full_name, status, program, created_at, updated_at').order('created_at', { ascending: false }).limit(10)
    ]);
    
    const totalCount = total.count || 0;
    const approvedCount = approved.count || 0;
    const rejectedCount = rejected.count || 0;
    const pendingCount = pending.count || 0;
    
    const recentActivity = (recentApps.data || []).map(app => ({
      id: app.id,
      type: 'application',
      message: `New application from ${app.full_name} for ${app.program}`,
      timestamp: app.created_at || app.updated_at,
      user: app.full_name,
      status: app.status
    }));
    
    return new Response(JSON.stringify({
      stats: {
        totalApplications: totalCount,
        pendingApplications: pendingCount,
        approvedApplications: approvedCount,
        rejectedApplications: rejectedCount,
        totalPrograms: programs.count || 0,
        activeIntakes: intakes.count || 0,
        totalStudents: students.count || 0,
        todayApplications: todayApps.count || 0,
        weekApplications: weekApps.count || 0,
        monthApplications: monthApps.count || 0,
        avgProcessingTime: 3,
        avgProcessingTimeHours: 72,
        medianProcessingTimeHours: 60,
        p95ProcessingTimeHours: 120,
        decisionVelocity24h: todayApps.count || 0,
        activeUsers: 0,
        activeUsersLast7d: 0,
        systemHealth: pendingCount > 50 ? 'warning' : pendingCount > 100 ? 'critical' : 'good'
      },
      recentActivity,
      statusBreakdown: {
        submitted: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount
      },
      periodTotals: {
        today: todayApps.count || 0,
        week: weekApps.count || 0,
        month: monthApps.count || 0
      },
      totalsSnapshot: {
        total: totalCount,
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount
      },
      processingMetrics: {
        averageHours: 72,
        averageDays: 3,
        medianHours: 60,
        p95Hours: 120,
        decisionVelocity24h: todayApps.count || 0,
        activeAdminsLast24h: 0,
        activeAdminsLast7d: 0
      },
      generatedAt: now.toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Dashboard error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
