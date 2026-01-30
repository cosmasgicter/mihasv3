import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Consolidated Admin API
 * GET /api/admin?action=dashboard - Get dashboard stats
 * GET /api/admin?action=users - List users with pagination
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin access
  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  const action = req.query.action as string || 'dashboard';

  try {
    if (action === 'dashboard') {
      return handleDashboard(res);
    }

    if (action === 'users') {
      return handleUsers(req, res);
    }

    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'admin');
  }
}

async function handleDashboard(res: VercelResponse) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = tomorrowDate.toISOString().split('T')[0];
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    recentApps,
    totalResult,
    draftResult,
    submittedResult,
    underReviewResult,
    approvedResult,
    rejectedResult,
    todayResult,
    weekResult,
    monthResult,
  ] = await Promise.all([
    supabaseAdmin.from('applications').select('id, application_number, full_name, status, program, created_at').order('created_at', { ascending: false }).limit(5),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'under_review'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', today).lt('created_at', tomorrow),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', weekAgo),
    supabaseAdmin.from('applications').select('*', { count: 'exact', head: true }).gte('created_at', monthAgo),
  ]);

  const totalCount = totalResult.count || 0;
  const draftCount = draftResult.count || 0;
  const submittedCount = submittedResult.count || 0;
  const underReviewCount = underReviewResult.count || 0;
  const approvedCount = approvedResult.count || 0;
  const rejectedCount = rejectedResult.count || 0;
  const todayCount = todayResult.count || 0;
  const weekCount = weekResult.count || 0;
  const monthCount = monthResult.count || 0;
  const pendingCount = submittedCount + underReviewCount;

  const recentActivity = (recentApps.data || []).map((app) => ({
    id: app.id,
    type: 'application',
    message: `New application from ${app.full_name} for ${app.program}`,
    timestamp: app.created_at,
    user: app.full_name,
    status: app.status,
  }));

  res.setHeader('Cache-Control', 'public, max-age=30');

  return sendSuccess(res, {
    stats: {
      totalApplications: totalCount,
      pendingApplications: pendingCount,
      approvedApplications: approvedCount,
      rejectedApplications: rejectedCount,
      todayApplications: todayCount,
      weekApplications: weekCount,
      monthApplications: monthCount,
      systemHealth: pendingCount > 100 ? 'critical' : pendingCount > 50 ? 'warning' : 'good',
    },
    recentActivity,
    statusBreakdown: { draft: draftCount, submitted: submittedCount, under_review: underReviewCount, approved: approvedCount, rejected: rejectedCount },
    periodTotals: { today: todayCount, week: weekCount, month: monthCount },
    generatedAt: now.toISOString(),
  });
}

async function handleUsers(req: VercelRequest, res: VercelResponse) {
  let page = parseInt(req.query.page as string || '1', 10);
  let limit = parseInt(req.query.limit as string || '50', 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  const { data, count, error } = await supabaseAdmin
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return sendError(res, error.message, HttpStatus.BAD_REQUEST);
  }

  const users = (data || []).map((user) => ({ ...user, user_id: user.id }));

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  return sendSuccess(res, {
    data: users,
    meta: { page, limit, total: count || 0, total_pages: Math.ceil((count || 0) / limit) },
  });
}
