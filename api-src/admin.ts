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
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { withArcjetProtection } from '../lib/arcjet';
import { requireRole, AuthenticationError, AuthorizationError, type AuthContext } from '../lib/auth/middleware';
import { hashPassword } from '../lib/auth/password';
import { logAuditEvent } from '../lib/auditLogger';

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

      case 'set-password':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleSetPassword(req, res, auth);
        return;

      case 'import-settings':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleImportSettings(req, res, auth);
        return;

      case 'reset-settings':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleResetSettings(res, auth);
        return;

      case 'eligibility-rules':
        await handleEligibilityRules(req, res, auth);
        return;

      case 'update-role':
        if (req.method !== 'PUT' && req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUpdateRole(req, res, auth);
        return;

      case 'eligibility-assessments':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleEligibilityAssessments(req, res);
        return;

      default:
        sendError(res, 'Invalid action. Valid actions: dashboard, users, settings, register, migrate, stats, errors, set-password, import-settings, reset-settings, eligibility-rules, eligibility-assessments', HttpStatus.BAD_REQUEST);
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
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 */
async function handleGetSettings(res: VercelResponse): Promise<void> {
  try {
    const result = await query<SystemSetting>(
      'SELECT * FROM system_settings ORDER BY setting_key ASC'
    );
    sendSuccess(res, { settings: result.rows || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * POST - Create a new system setting
 * MIGRATED: Using direct SQL instead of supabaseAdmin
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

  try {
    const result = await query<SystemSetting>(
      `INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        body.setting_key.trim(),
        String(body.setting_value),
        body.setting_type || 'string',
        body.description || null,
        body.is_public ?? false,
        auth.userId,
      ]
    );

    if (result.rows.length === 0) {
      sendError(res, 'Failed to create setting', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    sendSuccess(res, { setting: result.rows[0] }, HttpStatus.CREATED);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('duplicate key') || message.includes('23505')) {
      sendError(res, `Setting with key '${body.setting_key}' already exists`, HttpStatus.CONFLICT);
      return;
    }
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * PUT - Update an existing system setting
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 */
async function handleUpdateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const body = req.body as Partial<SystemSetting> & { id?: string };

  if (!body.id && !body.setting_key) {
    sendError(res, 'Either id or setting_key is required to update a setting', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    // Build dynamic update query
    const updates: string[] = ['updated_by = $1', 'updated_at = NOW()'];
    const values: (string | boolean | null)[] = [auth.userId];
    let paramIndex = 2;

    if (body.setting_value !== undefined) {
      updates.push(`setting_value = $${paramIndex}`);
      values.push(String(body.setting_value));
      paramIndex++;
    }
    if (body.setting_type !== undefined) {
      updates.push(`setting_type = $${paramIndex}`);
      values.push(body.setting_type);
      paramIndex++;
    }
    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(body.description);
      paramIndex++;
    }
    if (body.is_public !== undefined) {
      updates.push(`is_public = $${paramIndex}`);
      values.push(body.is_public);
      paramIndex++;
    }

    // Add WHERE clause
    let whereClause: string;
    if (body.id) {
      whereClause = `id = $${paramIndex}`;
      values.push(body.id);
    } else {
      whereClause = `setting_key = $${paramIndex}`;
      values.push(body.setting_key!);
    }

    const result = await query<SystemSetting>(
      `UPDATE system_settings SET ${updates.join(', ')} WHERE ${whereClause} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      sendError(res, 'Setting not found', HttpStatus.NOT_FOUND);
      return;
    }

    sendSuccess(res, { setting: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * DELETE - Delete a system setting
 * MIGRATED: Using direct SQL instead of supabaseAdmin
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

  try {
    let result;
    if (id) {
      result = await query('DELETE FROM system_settings WHERE id = $1', [id]);
    } else {
      result = await query('DELETE FROM system_settings WHERE setting_key = $1', [settingKey]);
    }

    if (result.rowCount === 0) {
      sendError(res, 'Setting not found', HttpStatus.NOT_FOUND);
      return;
    }

    sendSuccess(res, { deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * Dashboard stats handler
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 */
async function handleDashboard(res: VercelResponse): Promise<void> {
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split('T')[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      recentAppsResult,
      countsResult,
      todayResult,
      weekResult,
      monthResult,
    ] = await Promise.all([
      query<{ id: string; application_number: string; full_name: string; status: string; program: string; created_at: string }>(
        `SELECT id, application_number, full_name, status, program, created_at 
         FROM applications 
         ORDER BY created_at DESC 
         LIMIT 5`
      ),
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM applications GROUP BY status`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM applications WHERE created_at >= $1 AND created_at < $2`,
        [today, tomorrow]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM applications WHERE created_at >= $1`,
        [weekAgo]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM applications WHERE created_at >= $1`,
        [monthAgo]
      ),
    ]);

    // Build status counts from grouped results
    const statusCounts: Record<string, number> = {};
    let totalCount = 0;
    for (const row of countsResult.rows) {
      const count = parseInt(row.count, 10);
      statusCounts[row.status] = count;
      totalCount += count;
    }

    const draftCount = statusCounts['draft'] || 0;
    const submittedCount = statusCounts['submitted'] || 0;
    const underReviewCount = statusCounts['under_review'] || 0;
    const approvedCount = statusCounts['approved'] || 0;
    const rejectedCount = statusCounts['rejected'] || 0;
    const todayCount = parseInt(todayResult.rows[0]?.count || '0', 10);
    const weekCount = parseInt(weekResult.rows[0]?.count || '0', 10);
    const monthCount = parseInt(monthResult.rows[0]?.count || '0', 10);
    const pendingCount = submittedCount + underReviewCount;

    const recentActivity = recentAppsResult.rows.map((app) => ({
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
  } catch (error) {
    console.error('[ADMIN] Dashboard error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Failed to fetch dashboard data', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Users list handler
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 */
async function handleUsers(req: VercelRequest, res: VercelResponse): Promise<void> {
  let page = parseInt(req.query.page as string || '1', 10);
  let limit = parseInt(req.query.limit as string || '50', 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;

  try {
    const [dataResult, countResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT * FROM profiles ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query<{ count: string }>('SELECT COUNT(*) as count FROM profiles'),
    ]);

    const users = dataResult.rows.map((user) => ({ ...user, user_id: user.id }));
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    sendSuccess(res, {
      data: users,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * Register new user (admin only)
 * MIGRATED: Using direct SQL instead of supabaseAdmin
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
    const existingResult = await query<{ id: string }>(
      'SELECT id FROM profiles WHERE email = $1 LIMIT 1',
      [email.toLowerCase()]
    );

    if (existingResult.rows.length > 0) {
      sendError(res, 'Email already registered', HttpStatus.CONFLICT);
      return;
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user profile
    const result = await query<{ id: string; email: string; first_name: string; last_name: string; role: string; created_at: string }>(
      `INSERT INTO profiles (email, password_hash, first_name, last_name, role, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email.toLowerCase(), passwordHash, firstName, lastName, userRole]
    );

    if (result.rows.length === 0) {
      sendError(res, 'Failed to create user', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    const newUser = result.rows[0];

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
 * Set password for existing user (admin only)
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 * Used to migrate legacy Supabase Auth users to custom auth
 * 
 * POST /api/admin?action=set-password
 * Body: { email: string, password: string }
 * 
 * Requirement: Only super_admin can set passwords for other users
 */
async function handleSetPassword(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  // Only super_admin can set passwords for other users
  if (auth.role !== 'super_admin') {
    sendError(res, 'Only super_admin can set passwords for other users', HttpStatus.FORBIDDEN);
    return;
  }

  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    sendError(res, 'Email and password are required', HttpStatus.BAD_REQUEST);
    return;
  }

  // Validate password strength
  if (password.length < 8) {
    sendError(res, 'Password must be at least 8 characters', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    // Find user by email
    const findResult = await query<{ id: string; email: string; first_name: string; last_name: string; role: string }>(
      'SELECT id, email, first_name, last_name, role FROM profiles WHERE email = $1 LIMIT 1',
      [email.toLowerCase()]
    );

    if (findResult.rows.length === 0) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    const user = findResult.rows[0];

    // Hash the new password
    const passwordHash = await hashPassword(password);

    // Update user's password
    const updateResult = await query(
      'UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, user.id]
    );

    if (updateResult.rowCount === 0) {
      sendError(res, 'Failed to update password', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    // Log the event (no PII in logs)
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'password_set_by_admin',
      entity_type: 'user',
      entity_id: user.id,
      changes: {
        password_updated: true,
        updated_by_admin: true,
      },
    });

    sendSuccess(res, {
      message: 'Password set successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
    });

  } catch (error) {
    console.error('[ADMIN] Set password error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Failed to set password', HttpStatus.INTERNAL_SERVER_ERROR);
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


/**
 * Import settings from JSON
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 * 
 * POST /api/admin?action=import-settings
 * Body: { settings: SystemSetting[] }
 * 
 * Upserts settings by setting_key (creates or updates)
 */
async function handleImportSettings(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const { settings } = req.body as { settings?: Partial<SystemSetting>[] };

  if (!settings || !Array.isArray(settings)) {
    sendError(res, 'settings array is required', HttpStatus.BAD_REQUEST);
    return;
  }

  if (settings.length === 0) {
    sendError(res, 'settings array cannot be empty', HttpStatus.BAD_REQUEST);
    return;
  }

  const imported: string[] = [];
  const errors: string[] = [];

  for (const setting of settings) {
    if (!setting.setting_key || setting.setting_value === undefined) {
      errors.push(`Invalid setting: missing key or value`);
      continue;
    }

    try {
      // Upsert: insert or update on conflict
      await query(
        `INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (setting_key) 
         DO UPDATE SET 
           setting_value = EXCLUDED.setting_value,
           setting_type = EXCLUDED.setting_type,
           description = EXCLUDED.description,
           is_public = EXCLUDED.is_public,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [
          setting.setting_key,
          String(setting.setting_value),
          setting.setting_type || 'string',
          setting.description || null,
          setting.is_public ?? false,
          auth.userId,
        ]
      );
      imported.push(setting.setting_key);
    } catch (e) {
      errors.push(`${setting.setting_key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Log the import event
  await logAuditEvent({
    actor_id: auth.userId,
    action: 'settings_imported',
    entity_type: 'system_settings',
    entity_id: 'bulk',
    changes: {
      imported_count: imported.length,
      error_count: errors.length,
    },
  });

  sendSuccess(res, {
    imported,
    errors: errors.length > 0 ? errors : undefined,
    message: `Successfully imported ${imported.length} settings${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
  });
}

/**
 * Reset settings to defaults
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 * 
 * POST /api/admin?action=reset-settings
 * 
 * Deletes all existing settings and inserts default values
 */
async function handleResetSettings(res: VercelResponse, auth: AuthContext): Promise<void> {
  try {
    // Delete all existing settings
    await query('DELETE FROM system_settings WHERE 1=1');

    // Insert default settings
    const defaultSettings = [
      {
        setting_key: 'site_name',
        setting_value: 'MIHAS-KATC Application System',
        setting_type: 'string',
        description: 'Name of the application system',
        is_public: true,
      },
      {
        setting_key: 'contact_email',
        setting_value: 'admissions@mihas-katc.ac.zm',
        setting_type: 'string',
        description: 'Main contact email for admissions',
        is_public: true,
      },
      {
        setting_key: 'contact_phone',
        setting_value: '+260-123-456-789',
        setting_type: 'string',
        description: 'Main contact phone number',
        is_public: true,
      },
      {
        setting_key: 'application_fee',
        setting_value: '50.00',
        setting_type: 'decimal',
        description: 'Application processing fee in USD',
        is_public: true,
      },
      {
        setting_key: 'max_applications_per_user',
        setting_value: '3',
        setting_type: 'integer',
        description: 'Maximum number of applications a user can submit',
        is_public: false,
      },
      {
        setting_key: 'enable_online_applications',
        setting_value: 'true',
        setting_type: 'boolean',
        description: 'Enable or disable online application submissions',
        is_public: true,
      },
    ];

    for (const setting of defaultSettings) {
      await query(
        `INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_public, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [
          setting.setting_key,
          setting.setting_value,
          setting.setting_type,
          setting.description,
          setting.is_public,
          auth.userId,
        ]
      );
    }

    // Log the reset event
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'settings_reset_to_defaults',
      entity_type: 'system_settings',
      entity_id: 'all',
      changes: {
        reset_count: defaultSettings.length,
      },
    });

    sendSuccess(res, {
      message: 'Settings reset to defaults successfully',
      count: defaultSettings.length,
    });
  } catch (error) {
    console.error('[ADMIN] Reset settings error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Failed to reset settings', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}


/**
 * Eligibility rules interface
 */
interface EligibilityRule {
  id?: string;
  program_id: string;
  rule_name: string;
  rule_type: string;
  condition_json: Record<string, unknown>;
  weight: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Handle eligibility rules CRUD operations
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 * 
 * GET /api/admin?action=eligibility-rules - List all rules
 * POST /api/admin?action=eligibility-rules - Create new rule
 * PUT /api/admin?action=eligibility-rules - Update existing rule
 * DELETE /api/admin?action=eligibility-rules - Delete rule
 */
async function handleEligibilityRules(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const method = req.method;

  switch (method) {
    case 'GET':
      await handleGetEligibilityRules(res);
      return;
    case 'POST':
      await handleCreateEligibilityRule(req, res, auth);
      return;
    case 'PUT':
      await handleUpdateEligibilityRule(req, res, auth);
      return;
    case 'DELETE':
      await handleDeleteEligibilityRule(req, res);
      return;
    default:
      sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
      return;
  }
}

/**
 * GET - List all eligibility rules with program names
 */
async function handleGetEligibilityRules(res: VercelResponse): Promise<void> {
  try {
    const result = await query<EligibilityRule & { program_name?: string }>(
      `SELECT er.*, p.name as program_name 
       FROM eligibility_rules er 
       LEFT JOIN programs p ON er.program_id = p.id 
       ORDER BY er.created_at DESC`
    );
    
    // Transform to match expected format with nested programs object
    const rules = result.rows.map(row => ({
      ...row,
      programs: row.program_name ? { name: row.program_name } : null
    }));
    
    sendSuccess(res, { rules });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * POST - Create a new eligibility rule
 */
async function handleCreateEligibilityRule(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const body = req.body as Partial<EligibilityRule>;

  if (!body.program_id || !body.rule_name || !body.rule_type) {
    sendError(res, 'program_id, rule_name, and rule_type are required', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    const result = await query<EligibilityRule>(
      `INSERT INTO eligibility_rules (program_id, rule_name, rule_type, condition_json, weight, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        body.program_id,
        body.rule_name,
        body.rule_type,
        JSON.stringify(body.condition_json || {}),
        body.weight ?? 1.0,
        body.is_active ?? true,
      ]
    );

    if (result.rows.length === 0) {
      sendError(res, 'Failed to create rule', HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }

    // Log the event
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'eligibility_rule_created',
      entity_type: 'eligibility_rule',
      entity_id: result.rows[0].id || 'unknown',
      changes: { rule_name: body.rule_name },
    });

    sendSuccess(res, { rule: result.rows[0] }, HttpStatus.CREATED);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * PUT - Update an existing eligibility rule
 */
async function handleUpdateEligibilityRule(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const body = req.body as Partial<EligibilityRule> & { id: string };

  if (!body.id) {
    sendError(res, 'id is required to update a rule', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    const updates: string[] = ['updated_at = NOW()'];
    const values: (string | number | boolean | null)[] = [];
    let paramIndex = 1;

    if (body.program_id !== undefined) {
      updates.push(`program_id = $${paramIndex}`);
      values.push(body.program_id);
      paramIndex++;
    }
    if (body.rule_name !== undefined) {
      updates.push(`rule_name = $${paramIndex}`);
      values.push(body.rule_name);
      paramIndex++;
    }
    if (body.rule_type !== undefined) {
      updates.push(`rule_type = $${paramIndex}`);
      values.push(body.rule_type);
      paramIndex++;
    }
    if (body.condition_json !== undefined) {
      updates.push(`condition_json = $${paramIndex}`);
      values.push(JSON.stringify(body.condition_json));
      paramIndex++;
    }
    if (body.weight !== undefined) {
      updates.push(`weight = $${paramIndex}`);
      values.push(body.weight);
      paramIndex++;
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      values.push(body.is_active);
      paramIndex++;
    }

    values.push(body.id);

    const result = await query<EligibilityRule>(
      `UPDATE eligibility_rules SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      sendError(res, 'Rule not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Log the event
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'eligibility_rule_updated',
      entity_type: 'eligibility_rule',
      entity_id: body.id,
      changes: { updated_fields: Object.keys(body).filter(k => k !== 'id') },
    });

    sendSuccess(res, { rule: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}

/**
 * DELETE - Delete an eligibility rule
 */
async function handleDeleteEligibilityRule(req: VercelRequest, res: VercelResponse): Promise<void> {
  const body = req.body as { id?: string };
  const queryId = req.query.id as string;
  const id = body.id || queryId;

  if (!id) {
    sendError(res, 'id is required to delete a rule', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    const result = await query('DELETE FROM eligibility_rules WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      sendError(res, 'Rule not found', HttpStatus.NOT_FOUND);
      return;
    }

    sendSuccess(res, { deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}


/**
 * Update user role
 * MIGRATED: Using direct SQL instead of supabaseAdmin
 * 
 * PUT/POST /api/admin?action=update-role
 * Body: { userId: string, role: string }
 * 
 * Only super_admin can change roles to admin/super_admin
 */
async function handleUpdateRole(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<void> {
  const { userId, role } = req.body as { userId?: string; role?: string };

  if (!userId || !role) {
    sendError(res, 'userId and role are required', HttpStatus.BAD_REQUEST);
    return;
  }

  // Validate role
  const validRoles = ['student', 'reviewer', 'admin', 'super_admin'];
  if (!validRoles.includes(role)) {
    sendError(res, `Invalid role. Valid roles: ${validRoles.join(', ')}`, HttpStatus.BAD_REQUEST);
    return;
  }

  // Only super_admin can assign admin or super_admin roles
  if ((role === 'admin' || role === 'super_admin') && auth.role !== 'super_admin') {
    sendError(res, 'Only super_admin can assign admin or super_admin roles', HttpStatus.FORBIDDEN);
    return;
  }

  // Prevent users from changing their own role
  if (userId === auth.userId) {
    sendError(res, 'Cannot change your own role', HttpStatus.FORBIDDEN);
    return;
  }

  try {
    // Update profiles table
    const result = await query<{ id: string; email: string; first_name: string; last_name: string; role: string }>(
      'UPDATE profiles SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, first_name, last_name, role',
      [role, userId]
    );

    if (result.rows.length === 0) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    // Also update user_roles table if it exists (for backward compatibility)
    try {
      await query(
        `INSERT INTO user_roles (user_id, role, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET role = EXCLUDED.role, is_active = true, updated_at = NOW()`,
        [userId, role]
      );
    } catch {
      // user_roles table might not exist, ignore error
    }

    // Log the event
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'user_role_updated',
      entity_type: 'user',
      entity_id: userId,
      changes: { new_role: role },
    });

    sendSuccess(res, { user: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}


/**
 * Get eligibility assessments with program data
 * Used by EligibilityDashboard component
 * 
 * GET /api/admin?action=eligibility-assessments
 * Query params:
 *   - program_id: Filter by program (optional)
 */
async function handleEligibilityAssessments(req: VercelRequest, res: VercelResponse): Promise<void> {
  const programId = req.query.program_id as string;

  try {
    let sql = `
      SELECT ea.*, p.name as program_name, p.code as program_code
      FROM eligibility_assessments ea
      LEFT JOIN programs p ON ea.program_id = p.id
    `;
    const params: string[] = [];

    if (programId && programId !== 'all') {
      sql += ' WHERE ea.program_id = $1';
      params.push(programId);
    }

    sql += ' ORDER BY ea.created_at DESC';

    const result = await query<{
      id: string;
      application_id: string;
      program_id: string;
      overall_score: number;
      eligibility_status: string;
      missing_requirements: string | unknown[];
      program_name?: string;
      program_code?: string;
      created_at: string;
    }>(sql, params);

    // Transform to match expected format with nested programs object
    const assessments = result.rows.map(row => ({
      id: row.id,
      application_id: row.application_id,
      program_id: row.program_id,
      overall_score: row.overall_score,
      eligibility_status: row.eligibility_status,
      missing_requirements: row.missing_requirements,
      created_at: row.created_at,
      programs: row.program_name ? { name: row.program_name, code: row.program_code } : null
    }));

    res.setHeader('Cache-Control', 'public, max-age=60');
    sendSuccess(res, { assessments });
  } catch (error) {
    console.error('[ADMIN] Eligibility assessments error:', error instanceof Error ? error.message : 'Unknown error');
    sendError(res, 'Failed to fetch eligibility assessments', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
