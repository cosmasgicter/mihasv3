/**
 * Consolidated Admin API
 * 
 * Protected by Arcjet security (20 requests per 10 minutes)
 * Requires admin or super_admin role for all actions
 * 
 * REQUIREMENTS:
 * - 2.3: Arcjet protection on admin routes (20/10min rate limit)
 * - 8.6: Require admin role for all actions
 * 
 * ENDPOINTS:
 * GET /api/admin?action=dashboard - Get dashboard stats
 * GET /api/admin?action=users - List users with pagination
 * GET /api/admin?action=settings - List all system settings
 * POST /api/admin?action=settings - Create new setting
 * PUT /api/admin?action=settings - Update existing setting
 * DELETE /api/admin?action=settings - Delete setting
 * POST /api/admin?action=register - Register new user (admin only)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './utils/cors';
import { supabaseAdmin } from './utils/supabaseClient';
import { query } from './utils/db';
import { handleError, sendSuccess, sendError, HttpStatus } from './utils/errorHandler';
import { withArcjetProtection } from './utils/arcjet';
import { requireRole, AuthenticationError, AuthorizationError, type AuthContext } from './utils/auth_middleware';
import { hashPassword } from './utils/auth_password';
import { logAuditEvent } from './utils/auditLogger';

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
 * Main handler - wrapped with Arcjet protection
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const action = req.query.action as string || 'dashboard';

  try {
    // Require admin or super_admin role for all actions
    // Requirement: 8.6 - Require admin role for all actions
    const auth = await requireRole(req, ['admin', 'super_admin']);

    // Route to appropriate handler based on action
    switch (action) {
      case 'dashboard':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleDashboard(res);
        return;

      case 'users':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUsers(req, res);
        return;

      case 'settings':
        await handleSettings(req, res, auth);
        return;

      case 'register':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleRegisterUser(req, res, auth);
        return;

      case 'stats':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleDashboardStats(res);
        return;

      case 'errors':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleErrorStatistics(res);
        return;

      case 'migrate':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleMigrate(req, res);
        return;

      default:
        sendError(res, 'Invalid action. Valid actions: dashboard, users, settings, register, migrate, stats, errors', HttpStatus.BAD_REQUEST);
        return;
    }
  } catch (error) {
    // Handle authentication/authorization errors
    if (error instanceof AuthenticationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    if (error instanceof AuthorizationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    handleError(res, error, 'admin');
  }
}

/**
 * Export handler with Arcjet protection
 * Requirement: 2.3 - Admin routes: 20 requests per 10 minutes
 */
export default withArcjetProtection(handler, 'admin');

/**
 * Handle settings CRUD operations
 */
async function handleSettings(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const method = req.method;

  switch (method) {
    case 'GET':
      await handleGetSettings(res);
      return;
    case 'POST':
      await handleCreateSetting(req, res, auth);
      return;
    case 'PUT':
      await handleUpdateSetting(req, res, auth);
      return;
    case 'DELETE':
      await handleDeleteSetting(req, res);
      return;
    default:
      sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
      return;
  }
}

/**
 * GET - List all system settings
 */
async function handleGetSettings(res: VercelResponse): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .select('*')
    .order('setting_key', { ascending: true });

  if (error) {
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }

  sendSuccess(res, { settings: data || [] });
}

/**
 * POST - Create a new system setting
 */
async function handleCreateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const body = req.body as Partial<SystemSetting>;

  if (!body.setting_key || typeof body.setting_key !== 'string') {
    sendError(res, 'setting_key is required and must be a string', HttpStatus.BAD_REQUEST);
    return;
  }

  if (body.setting_value === undefined || body.setting_value === null) {
    sendError(res, 'setting_value is required', HttpStatus.BAD_REQUEST);
    return;
  }

  const settingData: Partial<SystemSetting> = {
    setting_key: body.setting_key.trim(),
    setting_value: String(body.setting_value),
    setting_type: body.setting_type || 'string',
    description: body.description || null,
    is_public: body.is_public ?? false,
    updated_by: auth.userId,
  };

  const { data, error } = await supabaseAdmin
    .from('system_settings')
    .insert(settingData)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      sendError(res, `Setting with key '${body.setting_key}' already exists`, HttpStatus.CONFLICT);
      return;
    }
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }

  sendSuccess(res, { setting: data }, HttpStatus.CREATED);
}

/**
 * PUT - Update an existing system setting
 */
async function handleUpdateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const body = req.body as Partial<SystemSetting> & { id?: string };

  if (!body.id && !body.setting_key) {
    sendError(res, 'Either id or setting_key is required to update a setting', HttpStatus.BAD_REQUEST);
    return;
  }

  const updateData: Partial<SystemSetting> = {
    updated_by: auth.userId,
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

  let query = supabaseAdmin.from('system_settings').update(updateData);
  if (body.id) {
    query = query.eq('id', body.id);
  } else {
    query = query.eq('setting_key', body.setting_key);
  }

  const { data, error } = await query.select().single();

  if (error) {
    if (error.code === 'PGRST116') {
      sendError(res, 'Setting not found', HttpStatus.NOT_FOUND);
      return;
    }
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }

  sendSuccess(res, { setting: data });
}

/**
 * DELETE - Delete a system setting
 */
async function handleDeleteSetting(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = req.body as { id?: string; setting_key?: string };
  const queryId = req.query.id as string;
  const queryKey = req.query.setting_key as string;

  const id = body.id || queryId;
  const settingKey = body.setting_key || queryKey;

  if (!id && !settingKey) {
    sendError(res, 'Either id or setting_key is required to delete a setting', HttpStatus.BAD_REQUEST);
    return;
  }

  let query = supabaseAdmin.from('system_settings').delete();
  if (id) {
    query = query.eq('id', id);
  } else {
    query = query.eq('setting_key', settingKey);
  }

  const { error } = await query;

  if (error) {
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }

  sendSuccess(res, { deleted: true });
}

/**
 * Dashboard stats handler
 */
async function handleDashboard(res: VercelResponse): Promise<void> {
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

  sendSuccess(res, {
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

/**
 * Users list handler
 */
async function handleUsers(req: VercelRequest, res: VercelResponse): Promise<void> {
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
    sendError(res, error.message, HttpStatus.BAD_REQUEST);
    return;
  }

  const users = (data || []).map((user) => ({ ...user, user_id: user.id }));

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  sendSuccess(res, {
    data: users,
    meta: { page, limit, total: count || 0, total_pages: Math.ceil((count || 0) / limit) },
  });
}

/**
 * Register new user (admin only)
 * Requirement: 8.6 - Admin can register new users
 */
async function handleRegisterUser(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const { email, password, firstName, lastName, role } = req.body as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  };

  // Validate required fields
  if (!email || !password || !firstName || !lastName) {
    sendError(res, 'Email, password, firstName, and lastName are required', HttpStatus.BAD_REQUEST);
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    sendError(res, 'Invalid email format', HttpStatus.BAD_REQUEST);
    return;
  }

  // Validate password strength
  if (password.length < 8) {
    sendError(res, 'Password must be at least 8 characters', HttpStatus.BAD_REQUEST);
    return;
  }

  // Validate role (only super_admin can create admin users)
  const allowedRoles = ['student', 'reviewer'];
  if (auth.role === 'super_admin') {
    allowedRoles.push('admin');
  }
  const userRole = role && allowedRoles.includes(role) ? role : 'student';

  try {
    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      sendError(res, 'Email already registered', HttpStatus.CONFLICT);
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user profile
    const { data: newUser, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        first_name: firstName,
        last_name: lastName,
        role: userRole,
        email_verified: true, // Admin-created users are pre-verified
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, email, first_name, last_name, role, created_at')
      .single();

    if (error) {
      console.error('[ADMIN] User creation failed:', error.message);
      sendError(res, 'Failed to create user', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    // Log the event (no PII in logs)
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'user_created',
      entity_type: 'user',
      entity_id: newUser.id,
      changes: {
        role: userRole,
        created_by_admin: true,
      },
    });

    sendSuccess(res, {
      user: newUser,
      message: 'User created successfully',
    }, HttpStatus.CREATED);

  } catch (error) {
    console.error('[ADMIN] Registration error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Registration failed', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Get admin dashboard stats (RPC function replacement)
 * Replaces: get_admin_dashboard_stats() Supabase RPC
 * 
 * GET /api/admin?action=stats
 */
async function handleDashboardStats(res: VercelResponse): Promise<void> {
  try {
    // Get counts using direct SQL queries (Neon-compatible)
    const [
      totalAppsResult,
      statusCountsResult,
      programCountsResult,
      recentAppsResult,
      userCountsResult,
    ] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*) as count FROM applications'),
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM applications GROUP BY status`
      ),
      query<{ program: string; count: string }>(
        `SELECT program, COUNT(*) as count FROM applications GROUP BY program ORDER BY count DESC LIMIT 10`
      ),
      query<{ id: string; application_number: string; full_name: string; status: string; created_at: string }>(
        `SELECT id, application_number, full_name, status, created_at 
         FROM applications 
         ORDER BY created_at DESC 
         LIMIT 5`
      ),
      query<{ role: string; count: string }>(
        `SELECT role, COUNT(*) as count FROM profiles GROUP BY role`
      ),
    ]);

    const totalApplications = parseInt(totalAppsResult.rows[0]?.count || '0', 10);
    
    const statusBreakdown: Record<string, number> = {};
    for (const row of statusCountsResult.rows) {
      statusBreakdown[row.status] = parseInt(row.count, 10);
    }

    const programBreakdown: Record<string, number> = {};
    for (const row of programCountsResult.rows) {
      programBreakdown[row.program] = parseInt(row.count, 10);
    }

    const userBreakdown: Record<string, number> = {};
    for (const row of userCountsResult.rows) {
      userBreakdown[row.role] = parseInt(row.count, 10);
    }

    const pendingCount = (statusBreakdown['submitted'] || 0) + (statusBreakdown['under_review'] || 0);

    res.setHeader('Cache-Control', 'public, max-age=60');

    sendSuccess(res, {
      totalApplications,
      pendingApplications: pendingCount,
      approvedApplications: statusBreakdown['approved'] || 0,
      rejectedApplications: statusBreakdown['rejected'] || 0,
      statusBreakdown,
      programBreakdown,
      userBreakdown,
      recentApplications: recentAppsResult.rows,
      systemHealth: pendingCount > 100 ? 'critical' : pendingCount > 50 ? 'warning' : 'good',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ADMIN] Stats error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Failed to fetch dashboard stats', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Get error statistics (RPC function replacement)
 * Replaces: get_error_statistics() Supabase RPC
 * 
 * GET /api/admin?action=errors
 */
async function handleErrorStatistics(res: VercelResponse): Promise<void> {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get error-related audit logs
    const [
      errorCountsResult,
      recentErrorsResult,
      errorsByDayResult,
    ] = await Promise.all([
      query<{ action: string; count: string }>(
        `SELECT action, COUNT(*) as count 
         FROM audit_logs 
         WHERE action LIKE '%error%' OR action LIKE '%fail%'
         AND created_at > $1
         GROUP BY action`,
        [weekAgo]
      ),
      query<{ id: string; action: string; entity_type: string; created_at: string }>(
        `SELECT id, action, entity_type, created_at 
         FROM audit_logs 
         WHERE action LIKE '%error%' OR action LIKE '%fail%'
         ORDER BY created_at DESC 
         LIMIT 20`
      ),
      query<{ day: string; count: string }>(
        `SELECT DATE(created_at) as day, COUNT(*) as count 
         FROM audit_logs 
         WHERE (action LIKE '%error%' OR action LIKE '%fail%')
         AND created_at > $1
         GROUP BY DATE(created_at)
         ORDER BY day DESC`,
        [weekAgo]
      ),
    ]);

    const errorsByType: Record<string, number> = {};
    for (const row of errorCountsResult.rows) {
      errorsByType[row.action] = parseInt(row.count, 10);
    }

    const errorsByDay: Record<string, number> = {};
    for (const row of errorsByDayResult.rows) {
      errorsByDay[row.day] = parseInt(row.count, 10);
    }

    const totalErrors = Object.values(errorsByType).reduce((sum, count) => sum + count, 0);

    res.setHeader('Cache-Control', 'public, max-age=60');

    sendSuccess(res, {
      totalErrors,
      errorsByType,
      errorsByDay,
      recentErrors: recentErrorsResult.rows,
      period: '7 days',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[ADMIN] Error stats error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Failed to fetch error statistics', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Handle database migration
 * 
 * POST /api/admin?action=migrate
 * Body: { secret: string } // Must match MIGRATE_SECRET env var
 * 
 * Runs migrations to add required columns for Bun-native auth.
 * Should be called once after deployment.
 * 
 * Note: Requires MIGRATE_SECRET env var OR super_admin role
 */
async function handleMigrate(req: VercelRequest, res: VercelResponse): Promise<void> {
  const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
  const { secret } = req.body || {};

  // Allow migration if secret matches OR if user is super_admin (already verified by requireRole)
  if (MIGRATE_SECRET && secret !== MIGRATE_SECRET) {
    sendError(res, 'Invalid migration secret', HttpStatus.UNAUTHORIZED);
    return;
  }

  const migrations: string[] = [];
  const errors: string[] = [];

  // Migration 1: Add password_hash column
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    migrations.push('Added password_hash column');
  } catch (e) {
    errors.push(`password_hash: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Migration 2: Add refresh_token_hash column
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT`);
    migrations.push('Added refresh_token_hash column');
  } catch (e) {
    errors.push(`refresh_token_hash: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Migration 3: Add role column
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'`);
    migrations.push('Added role column');
  } catch (e) {
    errors.push(`role: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Migration 4: Create indexes
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)`);
    migrations.push('Created idx_profiles_email index');
  } catch (e) {
    errors.push(`idx_profiles_email: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role)`);
    migrations.push('Created idx_profiles_role index');
  } catch (e) {
    errors.push(`idx_profiles_role: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Return results
  sendSuccess(res, {
    migrations,
    errors: errors.length > 0 ? errors : undefined,
    message: errors.length > 0 
      ? 'Some migrations failed' 
      : 'All migrations completed successfully',
  });
}
