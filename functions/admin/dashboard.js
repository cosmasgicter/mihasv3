import { supabaseAdminClient, getUserFromRequest } from '../_lib/supabaseClient.js';

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
    const authContext = await getUserFromRequest({ headers: Object.fromEntries(request.headers) }, { requireAdmin: true });
    
    if (authContext.error) {
      return new Response(JSON.stringify({ error: authContext.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const [total, pending, approved, rejected, todayApps] = await Promise.all([
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      supabaseAdminClient.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', today)
    ]);
    
    const totalCount = total.count || 0;
    const approvedCount = approved.count || 0;
    const rejectedCount = rejected.count || 0;
    const approvalRate = (approvedCount + rejectedCount) > 0 ? (approvedCount / (approvedCount + rejectedCount)) * 100 : 0;
    
    return new Response(JSON.stringify({
      stats: {
        totalApplications: totalCount,
        todayApplications: todayApps.count || 0,
        pendingReviews: pending.count || 0,
        approvalRate: Math.round(approvalRate),
        avgProcessingTime: 3,
        systemHealth: (pending.count || 0) > 50 ? 'warning' : 'good'
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
