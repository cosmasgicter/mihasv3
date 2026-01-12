import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

/**
 * Real-time Metrics API Endpoint
 * Provides current system metrics for dashboard display
 * Validates Requirements 5.1
 */
export async function onRequestGet(context) {
  const { request } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  
  try {
    // Authenticate user
    const authContext = await getUserFromRequest(request);
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Get active applications (draft or submitted)
    const { data: activeApplications, error: activeError } = await supabaseAdminClient
      .from('applications')
      .select('id')
      .in('status', ['draft', 'submitted', 'under_review']);

    if (activeError) {
      throw new Error(`Failed to fetch active applications: ${activeError.message}`);
    }

    // Get today's submissions
    const { data: todaySubmissions, error: todayError } = await supabaseAdminClient
      .from('applications')
      .select('id')
      .not('submitted_at', 'is', null)
      .gte('submitted_at', todayStart.toISOString())
      .lt('submitted_at', todayEnd.toISOString());

    if (todayError) {
      throw new Error(`Failed to fetch today's submissions: ${todayError.message}`);
    }

    // Get pending reviews
    const { data: pendingReviews, error: pendingError } = await supabaseAdminClient
      .from('applications')
      .select('id')
      .eq('status', 'submitted')
      .is('reviewed_at', null);

    if (pendingError) {
      throw new Error(`Failed to fetch pending reviews: ${pendingError.message}`);
    }

    // Calculate average processing time for last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const { data: recentDecisions, error: decisionsError } = await supabaseAdminClient
      .from('applications')
      .select('submitted_at, decision_date')
      .not('submitted_at', 'is', null)
      .not('decision_date', 'is', null)
      .gte('decision_date', thirtyDaysAgo.toISOString());

    if (decisionsError) {
      throw new Error(`Failed to fetch recent decisions: ${decisionsError.message}`);
    }

    let averageProcessingTime = 0;
    if (recentDecisions && recentDecisions.length > 0) {
      const totalProcessingTime = recentDecisions.reduce((sum, app) => {
        const submitted = new Date(app.submitted_at);
        const decided = new Date(app.decision_date);
        return sum + (decided.getTime() - submitted.getTime()) / (1000 * 60 * 60 * 24); // days
      }, 0);
      
      averageProcessingTime = totalProcessingTime / recentDecisions.length;
    }

    // Calculate system load (simplified metric based on recent activity)
    const { data: recentActivity, error: activityError } = await supabaseAdminClient
      .from('applications')
      .select('id, created_at, updated_at')
      .gte('updated_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString()); // last hour

    if (activityError) {
      throw new Error(`Failed to fetch recent activity: ${activityError.message}`);
    }

    // System load as percentage (0-100) based on recent activity
    const recentActivityCount = recentActivity?.length || 0;
    const systemLoad = Math.min(100, (recentActivityCount / 10) * 100); // Normalize to 0-100

    const realTimeMetrics = {
      activeApplications: activeApplications?.length || 0,
      todaySubmissions: todaySubmissions?.length || 0,
      pendingReviews: pendingReviews?.length || 0,
      averageProcessingTime: Math.round(averageProcessingTime * 10) / 10, // Round to 1 decimal
      systemLoad: Math.round(systemLoad),
      lastUpdated: now.toISOString()
    };

    return new Response(JSON.stringify(realTimeMetrics), {
      status: 200,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

  } catch (error) {
    console.error('Real-time metrics error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch real-time metrics',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}