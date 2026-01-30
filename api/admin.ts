import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest, AuthContext } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * System setting interface matching database schema
 */
interface SystemSetting {
  id?: string;
  setting_key: string;
  setting_value: string;
  setting_type?: string;
  description?: string;
  is_public?: boolean;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Consolidated Admin API
 * GET /api/admin?action=dashboard - Get dashboard stats
 * GET /api/admin?action=users - List users with pagination
 * GET /api/admin?action=settings - List all system settings
 * POST /api/admin?action=settings - Create new setting
 * PUT /api/admin?action=settings - Update existing setting
 * DELETE /api/admin?action=settings - Delete setting
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const action = req.query.action as string || 'dashboard';

  // Settings action supports multiple HTTP methods
  if (action === 'settings') {
    // Require admin access for all settings operations
    const auth = await getUserFromRequest(req, { requireAdmin: true });
    if ('error' in auth) {
      return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
    }

    try {
      return handleSettings(req, res, auth);
    } catch (error) {
      return handleError(res, error, 'admin-settings');
    }
  }

  // Other actions only support GET
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin access
  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

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

/**
 * Handle settings CRUD operations
 * GET - List all settings
 * POST - Create new setting
 * PUT - Update existing setting
 * DELETE - Delete setting
 */
async function handleSettings(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const method = req.method;

  switch (method) {
    case 'GET':
      return handleGetSettings(res);
    case 'POST':
      return handleCreateSetting(req, res, auth);
    case 'PUT':
      return handleUpdateSetting(req, res, auth);
    case 'DELETE':
      return handleDeleteSetting(req, res);
    default:
      return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }
}

/**
 * GET - List all system settings
 */
async function handleGetSettings(res: VercelResponse) {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('*')
    .order('setting_key', { ascending: true });

  if (error) {
    return sendError(res, error.message, HttpStatus.BAD_REQUEST);
  }

  return sendSuccess(res, { settings: data || [] });
}

/**
 * POST - Create a new system setting
 */
async function handleCreateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const body = req.body as Partial<SystemSetting>;

  // Validate required fields
  if (!body.setting_key || typeof body.setting_key !== 'string') {
    return sendError(res, 'setting_key is required and must be a string', HttpStatus.BAD_REQUEST);
  }

  if (body.setting_value === undefined || body.setting_value === null) {
    return sendError(res, 'setting_value is required', HttpStatus.BAD_REQUEST);
  }

  // Prepare setting data
  const settingData: Partial<SystemSetting> = {
    setting_key: body.setting_key.trim(),
    setting_value: String(body.setting_value),
    setting_type: body.setting_type || 'string',
    description: body.description || null,
    is_public: body.is_public ?? false,
    updated_by: auth.user.id,
  };

  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .insert(settingData)
    .select()
    .single();

  if (error) {
    // Check for unique constraint violation
    if (error.code === '23505') {
      return sendError(res, `Setting with key '${body.setting_key}' already exists`, HttpStatus.CONFLICT);
    }
    return sendError(res, error.message, HttpStatus.BAD_REQUEST);
  }

  return sendSuccess(res, { setting: data }, HttpStatus.CREATED);
}

/**
 * PUT - Update an existing system setting
 */
async function handleUpdateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext) {
  const body = req.body as Partial<SystemSetting> & { id?: string };

  // Require either id or setting_key to identify the setting
  if (!body.id && !body.setting_key) {
    return sendError(res, 'Either id or setting_key is required to update a setting', HttpStatus.BAD_REQUEST);
  }

  // Build update data - only include fields that are provided
  const updateData: Partial<SystemSetting> = {
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  if (body.setting_value !== undefined) {
    updateData.setting_value = String(body.setting_value);
  }

  if (body.setting_type !== undefined) {
    updateData.setting_type = body.setting_type;
  }

  if (body.description !== undefined) {
    updateData.description = body.description;
  }

  if (body.is_public !== undefined) {
    updateData.is_public = body.is_public;
  }

  // Update by id or setting_key
  let query = supabaseAdmin.from('system_settings').update(updateData);

  if (body.id) {
    query = query.eq('id', body.id);
  } else {
    query = query.eq('setting_key', body.setting_key);
  }

  const { data, error } = await query.select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      return sendError(res, 'Setting not found', HttpStatus.NOT_FOUND);
    }
    return sendError(res, error.message, HttpStatus.BAD_REQUEST);
  }

  return sendSuccess(res, { setting: data });
}

/**
 * DELETE - Delete a system setting
 */
async function handleDeleteSetting(req: VercelRequest, res: VercelResponse) {
  const body = req.body as { id?: string; setting_key?: string };
  const queryId = req.query.id as string;
  const queryKey = req.query.setting_key as string;

  // Support both body and query parameters for identifying the setting
  const id = body.id || queryId;
  const settingKey = body.setting_key || queryKey;

  if (!id && !settingKey) {
    return sendError(res, 'Either id or setting_key is required to delete a setting', HttpStatus.BAD_REQUEST);
  }

  // Delete by id or setting_key
  let query = supabaseAdmin.from('system_settings').delete();

  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('setting_key', settingKey);
  }

  const { error, count } = await query;

  if (error) {
    return sendError(res, error.message, HttpStatus.BAD_REQUEST);
  }

  // Note: Supabase delete doesn't return count by default, so we just return success
  return sendSuccess(res, { deleted: true });
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
