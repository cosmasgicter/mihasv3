import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'public, max-age=60',
    'CDN-Cache-Control': 'max-age=60'
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
    
    const [allApps, recentApps] = await Promise.all([
      supabaseAdminClient.from('applications').select('status, created_at'),
      supabaseAdminClient.from('applications').select('id, application_number, full_name, status, program, created_at').order('created_at', { ascending: false }).limit(5)
    ]);
    
    const apps = allApps.data || [];
    const totalCount = apps.length;
    const submittedCount = apps.filter(a => a.status === 'submitted').length;
    const underReviewCount = apps.filter(a => a.status === 'under_review').length;
    const approvedCount = apps.filter(a => a.status === 'approved').length;
    const rejectedCount = apps.filter(a => a.status === 'rejected').length;
    const todayCount = apps.filter(a => a.created_at && a.created_at.startsWith(today)).length;
    const weekCount = apps.filter(a => a.created_at && a.created_at >= weekAgo).length;
    
    const monthCount = apps.filter(a => a.created_at && a.created_at >= monthAgo).length;
    const pendingCount = submittedCount + underReviewCount;
    
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
        totalPrograms: 0,
        activeIntakes: 0,
        totalStudents: 0,
        todayApplications: todayCount,
        weekApplications: weekCount,
        monthApplications: monthCount,
        avgProcessingTime: 3,
        avgProcessingTimeHours: 72,
        medianProcessingTimeHours: 60,
        p95ProcessingTimeHours: 120,
        decisionVelocity24h: todayCount,
        activeUsers: 0,
        activeUsersLast7d: 0,
        systemHealth: pendingCount > 50 ? 'warning' : pendingCount > 100 ? 'critical' : 'good'
      },
      recentActivity,
      statusBreakdown: {
        submitted: submittedCount,
        under_review: underReviewCount,
        approved: approvedCount,
        rejected: rejectedCount
      },
      periodTotals: {
        today: todayCount,
        week: weekCount,
        month: monthCount
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
        decisionVelocity24h: todayCount,
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
