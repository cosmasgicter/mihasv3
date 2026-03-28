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
import { query, transaction } from '../lib/db';
import { handleError, sendSuccess, sendError, HttpStatus, logErrorAuditEvent } from '../lib/errorHandler';
import { withArcjetProtection } from '../lib/arcjet';
import { requireRole, AuthenticationError, AuthorizationError, type AuthContext } from '../lib/auth/middleware';
import { hashPassword } from '../lib/auth/password';
import { logAuditEvent } from '../lib/auditLogger';
import { requireCsrf } from '../lib/csrf';
import { setSecurityHeaders } from '../lib/securityHeaders';
import { validateBody } from '../lib/validation/middleware';
import { validateServerEnv } from '../lib/envValidator';
import {
  adminRegisterBodySchema,
  adminSetPasswordBodySchema,
  bulkEmailBodySchema,
  bulkStatusBodySchema,
  updateRoleBodySchema,
  updateUserBodySchema,
  userPermissionsBodySchema,
  createSettingBodySchema,
  updateSettingBodySchema,
  deleteSettingQuerySchema,
  importSettingsBodySchema
} from '../lib/validation/admin';
import { uuidParamSchema } from '../lib/validation/common';
import { getPermissionsForRole } from '../lib/auth/permissions';
import {
  getEffectivePermissionsForUser,
  isPermissionOverrideTableMissing,
  validatePermissionList,
} from '../lib/auth/userPermissionOverrides';

/**
 * Allowlist of valid admin actions derived from the switch statement in handler().
 * Requirement 1.4, 7.1, 7.2: Validate action query parameter against explicit allowlist.
 */
const VALID_ACTIONS = [
  'dashboard',
  'users',
  'user-permissions',
  'settings',
  'register',
  'stats',
  'errors',
  'bulk-email',
  'bulk-status',
  'export-users',
  'migrate',
  'set-password',
  'import-settings',
  'reset-settings',
  'eligibility-rules',
  'update-role',
  'eligibility-assessments',
  'audit-log',
  'appeals',
  'schema',
] as const;

/**
 * Allowlist of safe profile columns for user queries (R13/S-2).
 * Only these columns may appear in SELECT statements for user data.
 */
const SAFE_USER_COLUMNS = [
  'id', 'email', 'full_name', 'first_name', 'last_name', 'phone', 'nationality',
  'role', 'is_active', 'created_at', 'updated_at', 'avatar_url', 'date_of_birth',
  'sex', 'address', 'nrc_number', 'residence_town', 'next_of_kin_name',
  'next_of_kin_phone', 'email_verified', 'last_login_at',
] as const;

const SAFE_USER_COLUMNS_SQL = SAFE_USER_COLUMNS.join(', ');

/**
 * System setting interface matching database schema
 */
interface SystemSetting {
  id?: string;
  key: string;
  value: unknown;
  description?: string;
  category?: string;
  is_public?: boolean;
  updated_by?: string;
  created_at?: string;
  updated_at?: string;
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const normalized = fullName.trim().replace(/\s+/g, ' ');
  const [firstName, ...rest] = normalized.split(' ');

  return {
    firstName,
    lastName: rest.join(' ') || firstName,
  };
}

async function revokeUserSessions(userId: string): Promise<number> {
  await query(
    `UPDATE profiles
     SET refresh_token_hash = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );

  const sessionResult = await query(
    `UPDATE device_sessions
     SET is_active = false
     WHERE user_id = $1 AND is_active = true`,
    [userId]
  );

  return sessionResult.rowCount ?? 0;
}

function samePermissions(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((permission, index) => permission === right[index]);
}

/**
 * Main handler - wrapped with Arcjet protection
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Security headers (Req 8.1, 8.2, 8.3, 8.4)
  setSecurityHeaders(res);

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
    return;
  }

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // CSRF validation for state-changing requests
  if (await requireCsrf(req, res)) return;

  const action = req.query.action as string || 'dashboard';

  // Action allowlist validation (Req 1.4, 7.1, 7.2)
  if (!VALID_ACTIONS.includes(action as typeof VALID_ACTIONS[number])) {
    sendError(
      res,
      `Invalid action '${action}'. Valid actions: ${VALID_ACTIONS.join(', ')}`,
      HttpStatus.BAD_REQUEST,
    );
    return;
  }

  try {
    // Special case for migration: allow if secret matches even if DB is broken
    if (action === 'migrate') {
      const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
      const { secret } = req.body || {};
      if (MIGRATE_SECRET && secret === MIGRATE_SECRET) {
        await handleMigrate(req, res);
        return;
      }
    }

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
        await handleUsers(req, res, auth);
        return;

      case 'user-permissions':
        if (req.method !== 'GET' && req.method !== 'PUT') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUserPermissions(req, res, auth);
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

      case 'bulk-email':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleBulkEmail(req, res, auth);
        return;

      case 'bulk-status':
        if (req.method !== 'POST') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleBulkStatus(req, res, auth);
        return;

      case 'export-users':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleExportUsers(res, auth);
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

      case 'audit-log':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleAuditLog(req, res);
        return;

      case 'appeals':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleAppeals(req, res);
        return;

      case 'schema':
        if (req.method !== 'GET') {
          sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleGetSchema(req, res);
        return;

      default:
        // This should never be reached due to allowlist validation above
        sendError(res, `Invalid action '${action}'.`, HttpStatus.BAD_REQUEST);
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
async function handleSettings(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
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
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 */
async function handleGetSettings(res: VercelResponse): Promise<VercelResponse | void> {
  try {
    const result = await query<SystemSetting>(
      'SELECT * FROM settings ORDER BY key ASC'
    );
    sendSuccess(res, { settings: result.rows || [] });
  } catch (error) {
    handleError(res, error, 'admin/get-settings');
  }
}

/**
 * POST - Create a new system setting
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 */
async function handleCreateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(createSettingBodySchema, req, res);
  if (!parsed) return;

  const body = parsed;

  try {
    const result = await query<SystemSetting>(
      `INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [
        body.key.trim(),
        JSON.stringify(body.value),
        body.description || null,
        body.category || null,
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
    const message = error instanceof Error ? error.message : '';
    if (message.includes('duplicate key') || message.includes('23505')) {
      sendError(res, `Setting with key '${body.key}' already exists`, HttpStatus.CONFLICT);
      return;
    }
    handleError(res, error, 'admin/create-setting');
  }
}

/**
 * PUT - Update an existing system setting
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 */
async function handleUpdateSetting(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(updateSettingBodySchema, req, res);
  if (!parsed) return;

  const body = parsed;

  if (!body.id && !body.key) {
    sendError(res, 'Either id or key is required to update a setting', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    // Build dynamic update query
    const updates: string[] = ['updated_by = $1', 'updated_at = NOW()'];
    const values: (string | boolean | null)[] = [auth.userId];
    let paramIndex = 2;

    if (body.value !== undefined) {
      updates.push(`value = $${paramIndex}`);
      values.push(JSON.stringify(body.value));
      paramIndex++;
    }
    if (body.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      values.push(body.category);
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
      whereClause = `key = $${paramIndex}`;
      values.push(body.key!);
    }

    const result = await query<SystemSetting>(
      `UPDATE settings SET ${updates.join(', ')} WHERE ${whereClause} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      sendError(res, 'Setting not found', HttpStatus.NOT_FOUND);
      return;
    }

    sendSuccess(res, { setting: result.rows[0] });
  } catch (error) {
    handleError(res, error, 'admin/update-setting');
  }
}

/**
 * DELETE - Delete a system setting
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 */
async function handleDeleteSetting(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  // Merge body and query params for validation (DELETE can use either)
  const merged = {
    ...(req.body || {}),
    id: (req.body as Record<string, unknown>)?.id || req.query.id,
    key: (req.body as Record<string, unknown>)?.key || req.query.key,
  };
  const result = deleteSettingQuerySchema.safeParse(merged);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_root';
      fieldErrors[path] = issue.message;
    }
    sendError(res, result.error.issues[0]?.message || 'Either key or id must be provided', HttpStatus.BAD_REQUEST);
    return;
  }

  const { id, key: settingKey } = result.data;

  try {
    let result;
    if (id) {
      result = await query('DELETE FROM settings WHERE id = $1', [id]);
    } else {
      result = await query('DELETE FROM settings WHERE key = $1', [settingKey]);
    }

    if (result.rowCount === 0) {
      sendError(res, 'Setting not found', HttpStatus.NOT_FOUND);
      return;
    }

    sendSuccess(res, { deleted: true });
  } catch (error) {
    handleError(res, error, 'admin/delete-setting');
  }
}

/**
 * Dashboard stats handler
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 */
async function handleDashboard(res: VercelResponse): Promise<VercelResponse | void> {
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
    handleError(res, error, 'admin/dashboard');
  }
}

/**
 * Users list handler
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 * 
 * Supports optional query params:
 *   - page (default 1)
 *   - limit (default 50, max 100)
 *   - role (filter by role)
 *   - search (filter by name or email, case-insensitive)
 */
async function handleUsers(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  if (req.method === 'PUT' || req.method === 'POST') {
    await handleUpdateUser(req, res, auth);
    return;
  }

  if (req.method === 'DELETE') {
    await handleDeactivateUser(req, res, auth);
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
    return;
  }

  let page = parseInt(req.query.page as string || '1', 10);
  let limit = parseInt(req.query.limit as string || '50', 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 50;
  if (limit > 100) limit = 100;

  const offset = (page - 1) * limit;
  const role = req.query.role as string | undefined;
  const search = req.query.search as string | undefined;
  const includeInactive = (req.query.includeInactive as string | undefined) === 'true';

  // Build WHERE clauses for optional filters
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (!includeInactive) {
    conditions.push('is_active = true');
  }

  if (role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }

  if (search) {
    conditions.push(`(LOWER(full_name) LIKE $${paramIndex} OR LOWER(first_name) LIKE $${paramIndex} OR LOWER(last_name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex})`);
    params.push(`%${search.toLowerCase()}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    // Using module-level SAFE_USER_COLUMNS_SQL constant (R13/S-2)
    const [dataResult, countResult] = await Promise.all([
      query<Record<string, unknown>>(
        `SELECT ${SAFE_USER_COLUMNS_SQL} FROM profiles ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM profiles ${whereClause}`,
        params
      ),
    ]);

    const users = dataResult.rows.map((user) => ({ ...user, user_id: user.id }));
    const total = parseInt(countResult.rows[0]?.count || '0', 10);

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    sendSuccess(res, {
      users,
      totalCount: total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    handleError(res, error, 'admin/users');
  }
}

async function handleBulkEmail(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(bulkEmailBodySchema, req, res);
  if (!parsed) return;

  const { subject, message, userIds } = parsed;
  const dedupedUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));

  if (dedupedUserIds.length === 0) {
    sendError(res, 'At least one target user is required', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    const recipients = await query<{ id: string; full_name: string | null; email: string | null }>(
      `SELECT id, full_name, email
       FROM profiles
       WHERE id::text = ANY($1::text[])
         AND is_active = true`,
      [dedupedUserIds]
    );

    const recipientById = new Map(recipients.rows.map((row) => [row.id, row]));
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const targetId of dedupedUserIds) {
      const recipient = recipientById.get(targetId);
      if (!recipient) {
        failed++;
        errors.push(`User not found or inactive: ${targetId}`);
        continue;
      }

      if (!recipient.email) {
        failed++;
        errors.push(`User email missing: ${targetId}`);
        continue;
      }

      try {
        await transaction([
          {
            text: `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                   VALUES ($1, $2, $3, 'info', false, NOW())`,
            values: [targetId, subject, message],
          },
          {
            text: `INSERT INTO email_queue (
                     recipient_email,
                     recipient_name,
                     subject,
                     body,
                     html_body,
                     template_name,
                     template_data,
                     status,
                     priority
                   )
                   VALUES ($1, $2, $3, $4, $5, 'generic', $6, 'pending', 5)`,
            values: [
              recipient.email,
              recipient.full_name,
              subject,
              message,
              `<p>${message}</p>`,
              JSON.stringify({ actorId: auth.userId, targetUserId: targetId }),
            ],
          },
        ]);
        success++;
      } catch {
        failed++;
        errors.push(`Failed to queue notification for user: ${targetId}`);
      }
    }

    await logAuditEvent({
      actor_id: auth.userId,
      action: 'bulk_notification_sent',
      entity_type: 'notification',
      entity_id: 'bulk',
      changes: {
        target_count: dedupedUserIds.length,
        success,
        failed,
      },
    });

    sendSuccess(res, { success, failed, errors });
  } catch (error) {
    handleError(res, error, 'admin/bulk-email');
  }
}

async function handleBulkStatus(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(bulkStatusBodySchema, req, res);
  if (!parsed) return;

  const { status, applicationIds } = parsed;
  const dedupedApplicationIds = Array.from(new Set(applicationIds.map((id) => id.trim()).filter(Boolean)));

  if (dedupedApplicationIds.length === 0) {
    sendError(res, 'At least one application is required', HttpStatus.BAD_REQUEST);
    return;
  }

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const applicationId of dedupedApplicationIds) {
    try {
      const appResult = await query<{ id: string; payment_status: string | null }>(
        `SELECT id, payment_status
         FROM applications
         WHERE id = $1
         LIMIT 1`,
        [applicationId]
      );

      if (appResult.rowCount === 0) {
        failed++;
        errors.push(`Application not found: ${applicationId}`);
        continue;
      }

      const app = appResult.rows[0];
      if (status === 'approved' && app.payment_status !== 'verified') {
        failed++;
        errors.push(`Payment not verified: ${applicationId}`);
        continue;
      }

      await transaction([
        {
          text: `UPDATE applications
                 SET status = $2,
                     reviewed_by = $3,
                     review_started_at = COALESCE(review_started_at, NOW()),
                     updated_at = NOW()
                 WHERE id = $1`,
          values: [applicationId, status, auth.userId],
        },
        {
          text: `INSERT INTO application_status_history (id, application_id, status, new_status, changed_by, notes, created_at)
                 VALUES (gen_random_uuid(), $1, $2, $2, $3, $4, NOW())`,
          values: [applicationId, status, auth.userId, 'Bulk status update'],
        },
      ]);

      success++;
    } catch {
      failed++;
      errors.push(`Failed status update: ${applicationId}`);
    }
  }

  try {
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'bulk_status_updated',
      entity_type: 'application',
      entity_id: 'bulk',
      changes: {
        status,
        target_count: dedupedApplicationIds.length,
        success,
        failed,
      },
    });
  } catch {
    // Non-blocking audit failure for response path consistency
  }

  sendSuccess(res, { success, failed, errors });
}

async function handleExportUsers(res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  try {
    const result = await query<{
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      role: string | null;
      is_active: boolean | null;
      created_at: string | null;
    }>(
      `SELECT id, full_name, email, phone, role, is_active, created_at
       FROM profiles
       ORDER BY created_at DESC`
    );

    const csvRows = [
      'id,full_name,email,phone,role,is_active,created_at',
      ...result.rows.map((row) => {
        const values = [
          row.id,
          row.full_name || '',
          row.email || '',
          row.phone || '',
          row.role || '',
          row.is_active ? 'true' : 'false',
          row.created_at || '',
        ];
        return values
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',');
      }),
    ].join('\n');

    await logAuditEvent({
      actor_id: auth.userId,
      action: 'users_exported',
      entity_type: 'user',
      entity_id: 'bulk',
      changes: {
        exported_count: result.rows.length,
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="users-export-${Date.now()}.csv"`);
    res.status(HttpStatus.OK).send(csvRows);
  } catch (error) {
    handleError(res, error, 'admin/export-users');
  }
}

async function handleDeactivateUser(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const userId = (req.query.userId as string | undefined)?.trim();

  if (!userId) {
    sendError(res, 'userId is required', HttpStatus.BAD_REQUEST);
    return;
  }

  // Validate userId as UUID format (Req 7.5)
  const uuidResult = uuidParamSchema.safeParse(userId);
  if (!uuidResult.success) {
    sendError(res, 'userId must be a valid UUID', HttpStatus.BAD_REQUEST);
    return;
  }

  if (userId === auth.userId) {
    sendError(res, 'Cannot deactivate your own account', HttpStatus.FORBIDDEN);
    return;
  }

  try {
    const targetResult = await query<{
      id: string;
      role: string;
      is_active: boolean;
      email: string | null;
    }>(
      'SELECT id, role, is_active, email FROM profiles WHERE id = $1 LIMIT 1',
      [userId]
    );

    if (targetResult.rows.length === 0) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    const targetUser = targetResult.rows[0];

    if (!targetUser.is_active) {
      sendSuccess(res, {
        userId,
        alreadyDeactivated: true,
        message: 'User account is already inactive',
      });
      return;
    }

    if (targetUser.role === 'super_admin') {
      sendError(res, 'Super admin accounts cannot be deactivated', HttpStatus.FORBIDDEN);
      return;
    }

    if (targetUser.role === 'admin' && auth.role !== 'super_admin') {
      sendError(res, 'Only super_admin can deactivate admin accounts', HttpStatus.FORBIDDEN);
      return;
    }

    const result = await query<{
      id: string;
      email: string;
      role: string;
      is_active: boolean;
      updated_at: string;
    }>(
      `UPDATE profiles
       SET is_active = false,
           refresh_token_hash = NULL,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id, email, role, is_active, updated_at`,
      [userId]
    );

    if (result.rows.length === 0) {
      sendSuccess(res, {
        userId,
        alreadyDeactivated: true,
        message: 'User account is already inactive',
      });
      return;
    }

    const sessionResult = await query(
      `UPDATE device_sessions
       SET is_active = false
       WHERE user_id = $1 AND is_active = true`,
      [userId]
    );

    // user_roles table does not exist — removed legacy backward-compat code

    await logAuditEvent({
      actor_id: auth.userId,
      action: 'user_deactivated',
      entity_type: 'user',
      entity_id: userId,
      changes: {
        role: targetUser.role,
        deactivated: true,
        sessions_revoked: sessionResult.rowCount ?? 0,
      },
    });

    sendSuccess(res, {
      user: {
        ...result.rows[0],
        user_id: result.rows[0].id,
      },
      revokedSessions: sessionResult.rowCount ?? 0,
      message: 'User deactivated successfully',
    });
  } catch (error) {
    handleError(res, error, 'admin/deactivate-user');
  }
}

async function handleUserPermissions(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  if (req.method === 'PUT') {
    const parsed = validateBody(userPermissionsBodySchema, req, res);
    if (!parsed || !Array.isArray(parsed.permissions)) {
      sendError(res, 'permissions array is required', HttpStatus.BAD_REQUEST);
      return;
    }

    const { userId, permissions: requestedPermissions } = parsed;

    if (userId === auth.userId) {
      sendError(res, 'Cannot change your own permissions', HttpStatus.FORBIDDEN);
      return;
    }

    const { normalized, invalid } = validatePermissionList(requestedPermissions);
    if (invalid.length > 0) {
      sendError(res, `Invalid permissions: ${invalid.join(', ')}`, HttpStatus.BAD_REQUEST);
      return;
    }

    try {
      const targetResult = await query<{ id: string; role: Parameters<typeof getPermissionsForRole>[0] }>(
        'SELECT id, role FROM profiles WHERE id = $1 LIMIT 1',
        [userId]
      );

      if (targetResult.rows.length === 0) {
        sendError(res, 'User not found', HttpStatus.NOT_FOUND);
        return;
      }

      const user = targetResult.rows[0];
      if ((user.role === 'admin' || user.role === 'super_admin') && auth.role !== 'super_admin') {
        sendError(res, 'Only super_admin can change permissions for admin accounts', HttpStatus.FORBIDDEN);
        return;
      }

      const defaultPermissions = [...getPermissionsForRole(user.role)].sort();
      const source = samePermissions(normalized, defaultPermissions) ? 'role' : 'override';

      try {
        if (source === 'role') {
          await query('DELETE FROM user_permission_overrides WHERE user_id = $1', [userId]);
        } else {
          await query(
            `INSERT INTO user_permission_overrides (user_id, permissions, updated_by, created_at, updated_at)
             VALUES ($1, $2::text[], $3, NOW(), NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET
               permissions = EXCLUDED.permissions,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`,
            [userId, normalized, auth.userId]
          );
        }
      } catch (error) {
        if (isPermissionOverrideTableMissing(error)) {
          sendError(
            res,
            'Permission overrides require migration 010_user_permission_overrides.sql to be applied first',
            HttpStatus.SERVICE_UNAVAILABLE,
            'SERVICE_UNAVAILABLE'
          );
          return;
        }

        throw error;
      }

      const revokedSessions = await revokeUserSessions(userId);

      await logAuditEvent({
        actor_id: auth.userId,
        action: 'user.permissions_updated',
        entity_type: 'user',
        entity_id: userId,
        changes: {
          role: user.role,
          permission_source: source,
          permissions: normalized,
          revoked_sessions: revokedSessions,
        },
      });

      sendSuccess(res, {
        userId: user.id,
        role: user.role,
        permissions: source === 'override' ? normalized : defaultPermissions,
        defaultPermissions,
        source,
        revokedSessions,
      });
    } catch (error) {
      handleError(res, error, 'admin/update-user-permissions');
    }
    return;
  }

  const userId = (req.query.userId as string | undefined)?.trim();

  if (!userId) {
    sendError(res, 'userId is required', HttpStatus.BAD_REQUEST);
    return;
  }

  try {
    const result = await query<{ id: string; role: Parameters<typeof getPermissionsForRole>[0] }>(
      'SELECT id, role FROM profiles WHERE id = $1 LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    const user = result.rows[0];
    const { permissions, source } = await getEffectivePermissionsForUser(user.id, user.role);
    sendSuccess(res, {
      userId: user.id,
      role: user.role,
      permissions,
      defaultPermissions: getPermissionsForRole(user.role),
      source,
    });
  } catch (error) {
    handleError(res, error, 'admin/user-permissions');
  }
}

async function handleUpdateUser(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(updateUserBodySchema, req, res);
  if (!parsed) return;

  const { userId, email, full_name, phone, role } = parsed;
  const { firstName, lastName } = splitFullName(full_name);

  if ((role === 'admin' || role === 'super_admin') && auth.role !== 'super_admin') {
    sendError(res, 'Only super_admin can assign admin or super_admin roles', HttpStatus.FORBIDDEN);
    return;
  }

  if (userId === auth.userId && role !== auth.role) {
    sendError(res, 'Cannot change your own role', HttpStatus.FORBIDDEN);
    return;
  }

  try {
    const currentUserResult = await query<{ id: string; role: string }>(
      'SELECT id, role FROM profiles WHERE id = $1 LIMIT 1',
      [userId]
    );

    if (currentUserResult.rows.length === 0) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    const currentUser = currentUserResult.rows[0];
    const existing = await query<{ id: string }>(
      'SELECT id FROM profiles WHERE email = $1 AND id <> $2 LIMIT 1',
      [email.toLowerCase(), userId]
    );

    if (existing.rows.length > 0) {
      sendError(res, 'Email already registered to another user', HttpStatus.CONFLICT);
      return;
    }

    const result = await query<{
      id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      full_name: string | null;
      phone: string | null;
      role: string;
      updated_at: string;
    }>(
      `UPDATE profiles
       SET email = $1,
           first_name = $2,
           last_name = $3,
           full_name = $4,
           phone = $5,
           role = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, first_name, last_name, full_name, phone, role, updated_at`,
      [email.toLowerCase(), firstName, lastName, full_name.trim(), phone || null, role, userId]
    );

    if (result.rows.length === 0) {
      sendError(res, 'User not found', HttpStatus.NOT_FOUND);
      return;
    }

    // user_roles table does not exist — removed legacy backward-compat code

    const roleChanged = currentUser.role !== role;
    const revokedSessions = roleChanged ? await revokeUserSessions(userId) : 0;

    await logAuditEvent({
      actor_id: auth.userId,
      action: 'user_updated',
      entity_type: 'user',
      entity_id: userId,
      changes: {
        email: email.toLowerCase(),
        full_name: full_name.trim(),
        phone: phone || null,
        role,
        role_changed: roleChanged,
        revoked_sessions: revokedSessions,
      },
    });

    sendSuccess(res, {
      user: {
        ...result.rows[0],
        user_id: result.rows[0].id,
      },
      revokedSessions,
    });
  } catch (error) {
    handleError(res, error, 'admin/update-user');
  }
}

/**
 * Register new user (admin only)
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 * Requirement: 8.6 - Admin can register new users
 */
async function handleRegisterUser(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(adminRegisterBodySchema, req, res);
  if (!parsed) return;

  const { email, password, firstName, lastName, phone, role } = parsed;

  // Validate role
  const validRoles = [
    'student',
    'reviewer',
    'admissions_officer',
    'registrar',
    'finance_officer',
    'academic_head',
    'admin',
    'super_admin',
  ];
  const userRole = role && validRoles.includes(role) ? role : 'student';

  // Only super_admin can assign admin or super_admin roles (Requirement 14.3, 14.4)
  if ((userRole === 'admin' || userRole === 'super_admin') && auth.role !== 'super_admin') {
    sendError(res, 'Only super_admin can assign admin or super_admin roles', HttpStatus.FORBIDDEN);
    return;
  }

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
    const fullName = `${firstName} ${lastName}`.trim();

    const result = await query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      full_name: string;
      phone: string | null;
      role: string;
      created_at: string;
    }>(
      `INSERT INTO profiles (email, password_hash, first_name, last_name, full_name, phone, role, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
       RETURNING id, email, first_name, last_name, full_name, phone, role, created_at`,
      [email.toLowerCase(), passwordHash, firstName, lastName, fullName, phone || null, userRole]
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
    handleError(res, error, 'admin/register');
  }
}

/**
 * Get admin dashboard stats (RPC function replacement)
 * Replaces: get_admin_dashboard_stats() Supabase RPC
 * 
 * GET /api/admin?action=stats
 */
async function handleDashboardStats(res: VercelResponse): Promise<VercelResponse | void> {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get counts using direct SQL queries (Neon-compatible)
    const [
      totalAppsResult,
      statusCountsResult,
      programCountsResult,
      recentAppsResult,
      userCountsResult,
      todayResult,
      weekResult,
      monthResult,
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
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM applications WHERE created_at >= $1 AND created_at < $2`,
        [todayStart.toISOString(), tomorrowStart.toISOString()]
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
    const todayApplications = parseInt(todayResult.rows[0]?.count || '0', 10);
    const weekApplications = parseInt(weekResult.rows[0]?.count || '0', 10);
    const monthApplications = parseInt(monthResult.rows[0]?.count || '0', 10);

    res.setHeader('Cache-Control', 'public, max-age=60');

    sendSuccess(res, {
      totalApplications,
      pendingApplications: pendingCount,
      approvedApplications: statusBreakdown['approved'] || 0,
      rejectedApplications: statusBreakdown['rejected'] || 0,
      todayApplications,
      weekApplications,
      monthApplications,
      statusBreakdown,
      programBreakdown,
      userBreakdown,
      recentApplications: recentAppsResult.rows,
      systemHealth: pendingCount > 100 ? 'critical' : pendingCount > 50 ? 'warning' : 'good',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleError(res, error, 'admin/stats');
  }
}

/**
 * Get error statistics (RPC function replacement)
 * Replaces: get_error_statistics() Supabase RPC
 * 
 * GET /api/admin?action=errors
 */
async function handleErrorStatistics(res: VercelResponse): Promise<VercelResponse | void> {
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
    handleError(res, error, 'admin/errors');
  }
}

/**
 * Set password for existing user (admin only)
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 * Used to migrate legacy Supabase Auth users to custom auth
 * 
 * POST /api/admin?action=set-password
 * Body: { email: string, password: string }
 * 
 * Requirement: Only super_admin can set passwords for other users
 */
async function handleSetPassword(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  // Only super_admin can set passwords for other users
  if (auth.role !== 'super_admin') {
    sendError(res, 'Only super_admin can set passwords for other users', HttpStatus.FORBIDDEN);
    return;
  }

  const parsed = validateBody(adminSetPasswordBodySchema, req, res);
  if (!parsed) return;

  const { email, password } = parsed;

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
    handleError(res, error, 'admin/set-password');
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
async function handleMigrate(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
  const { secret } = req.body || {};

  // Allow migration if secret matches OR if user is super_admin (already verified by requireRole)
  if (MIGRATE_SECRET && secret !== MIGRATE_SECRET) {
    sendError(res, 'Invalid migration secret', HttpStatus.UNAUTHORIZED);
    return;
  }

  const migrationQueries = [
    // 1. Core History Table
    { id: 'V2_001_MIGRATION_HISTORY', sql: `CREATE TABLE IF NOT EXISTS migration_history (id SERIAL PRIMARY KEY, migration_name TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())` },

    // 2. Auth Related Tables
    { id: 'V2_002_CSRF_TOKENS', sql: `CREATE TABLE IF NOT EXISTS csrf_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES profiles(id), token_hash VARCHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id))` },
    { id: 'V2_003_PWD_RESET_TOKENS', sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES profiles(id), token_hash VARCHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: 'V2_004_LOGIN_ATTEMPTS', sql: `CREATE TABLE IF NOT EXISTS login_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email_hash VARCHAR(64) NOT NULL, ip_hash VARCHAR(64) NOT NULL, attempted_at TIMESTAMPTZ DEFAULT NOW(), success BOOLEAN NOT NULL)` },

    // 3. New Feature Tables
    { id: 'V2_005_NOTIF_PREFS', sql: `CREATE TABLE IF NOT EXISTS user_notification_preferences (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID UNIQUE NOT NULL REFERENCES profiles(id), email_enabled BOOLEAN DEFAULT TRUE, push_enabled BOOLEAN DEFAULT TRUE, sms_enabled BOOLEAN DEFAULT TRUE, application_updates BOOLEAN DEFAULT TRUE, payment_reminders BOOLEAN DEFAULT TRUE, interview_reminders BOOLEAN DEFAULT TRUE, marketing_emails BOOLEAN DEFAULT FALSE, quiet_hours_start TIME, quiet_hours_end TIME, timezone VARCHAR(50) DEFAULT 'Africa/Lusaka', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: 'V2_006_SUBJECTS', sql: `CREATE TABLE IF NOT EXISTS subjects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) UNIQUE NOT NULL, code VARCHAR(50), category VARCHAR(100), is_core BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: 'V2_007_IDEMPOTENCY', sql: `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, endpoint TEXT NOT NULL, response_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())` },

    // 4. Profiles Hardening
    { id: 'V2_008_PROF_PWD_HASH', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT` },
    { id: 'V2_009_PROF_REFRESH', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT` },
    { id: 'V2_010_PROF_ROLE', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'` },
    { id: 'V2_010b_PROF_FNAME', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT` },
    { id: 'V2_010c_PROF_LNAME', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT` },
    { id: 'V2_011_PROF_FULL_NAME', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT` },
    { id: 'V2_012_PROF_PHONE', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT` },
    { id: 'V2_013_PROF_COUNTRY', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT` },
    { id: 'V2_014_PROF_DOB', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE` },
    { id: 'V2_015_PROF_SEX', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sex TEXT` },
    { id: 'V2_016_PROF_TOWN', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS residence_town TEXT` },
    { id: 'V2_017_PROF_NAT', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nationality TEXT` },
    { id: 'V2_018_PROF_NRC', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nrc_number TEXT` },
    { id: 'V2_019_PROF_ADDR', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT` },
    { id: 'V2_020_PROF_AVATAR', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT` },
    { id: 'V2_021_PROF_NOK_NAME', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_of_kin_name TEXT` },
    { id: 'V2_022_PROF_NOK_PHONE', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_of_kin_phone TEXT` },
    { id: 'V2_023_PROF_VERIFIED', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE` },
    { id: 'V2_024_PROF_FAILED_ATT', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0` },
    { id: 'V2_025_PROF_LOCKED', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ` },
    { id: 'V2_026_PROF_PWD_CHG', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ` },
    { id: 'V2_026b_PROF_LAST_LOGIN', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ` },
    { id: 'V2_026c_PROF_CREATED', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()` },
    { id: 'V2_026d_PROF_UPDATED', sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()` },

    // 5. Applications Hardening
    { id: 'V2_027_APP_NRC', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS nrc_number VARCHAR(20)` },
    { id: 'V2_027b_APP_DOB', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS date_of_birth DATE` },
    { id: 'V2_027c_APP_SEX', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS sex VARCHAR(20)` },
    { id: 'V2_027d_APP_PHONE', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS phone VARCHAR(20)` },
    { id: 'V2_027e_APP_EMAIL', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS email VARCHAR(255)` },
    { id: 'V2_027f_APP_TOWN', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS residence_town TEXT` },
    { id: 'V2_027g_APP_FNAME', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS full_name TEXT` },
    { id: 'V2_028_APP_PASSPORT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS passport_number VARCHAR(50)` },
    { id: 'V2_029_APP_NAT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS nationality VARCHAR(100)` },
    { id: 'V2_030_APP_ADDR1', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS address_line_1 TEXT` },
    { id: 'V2_031_APP_ADDR2', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS address_line_2 TEXT` },
    { id: 'V2_032_APP_POSTAL', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)` },
    { id: 'V2_033_APP_NOK_NAME', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS next_of_kin_name VARCHAR(255)` },
    { id: 'V2_034_APP_NOK_PHONE', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(20)` },
    { id: 'V2_035_APP_RESULT_URL', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS result_slip_url TEXT` },
    { id: 'V2_036_APP_KYC_URL', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS extra_kyc_url TEXT` },
    { id: 'V2_037_APP_FEE', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_fee NUMERIC(10,2) DEFAULT 153.00` },
    { id: 'V2_038_APP_PAY_STAT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending_review'` },
    { id: 'V2_039_APP_PAY_VER_AT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ` },
    { id: 'V2_040_APP_PAY_VER_BY', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES profiles(id)` },
    { id: 'V2_041_APP_REV_BY', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id)` },
    { id: 'V2_042_APP_REV_START', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ` },
    { id: 'V2_043_APP_FEEDBACK', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_feedback TEXT` },
    { id: 'V2_044_APP_FEEDBACK_DT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_feedback_date TIMESTAMPTZ` },
    { id: 'V2_045_APP_FEEDBACK_BY', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_feedback_by UUID REFERENCES profiles(id)` },
    { id: 'V2_046_APP_DECISION_DT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ` },
    { id: 'V2_047_APP_VERSION', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1` },
    { id: 'V2_048_APP_AMOUNT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2)` },
    { id: 'V2_049_APP_PAY_METHOD', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_method TEXT` },
    { id: 'V2_050_APP_PAYER_NAME', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payer_name TEXT` },
    { id: 'V2_051_APP_PAYER_PHONE', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payer_phone TEXT` },
    { id: 'V2_052_APP_PAID_AT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ` },
    { id: 'V2_053_APP_MOMO_REF', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS momo_ref TEXT` },
    { id: 'V2_054_APP_POP_URL', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS pop_url TEXT` },
    { id: 'V2_055_APP_RECEIPT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS receipt_number TEXT` },
    { id: 'V2_056_APP_TRACK_CODE', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS public_tracking_code VARCHAR(20)` },
    { id: 'V2_057_APP_SUB_AT', sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ` },

    // 6. Notification/Audit/Interview Hardening
    { id: 'V2_058_NOTIF_ACTION_URL', sql: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT` },
    { id: 'V2_059_NOTIF_UP_AT', sql: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()` },
    { id: 'V2_060_AUDIT_RET_CAT', sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS retention_category TEXT DEFAULT 'standard'` },
    { id: 'V2_061_INTV_BY_CREATED', sql: `ALTER TABLE application_interviews ADD COLUMN IF NOT EXISTS created_by UUID` },
    { id: 'V2_062_INTV_BY_UPDATED', sql: `ALTER TABLE application_interviews ADD COLUMN IF NOT EXISTS updated_by UUID` },

    // 7. Indexes
    { id: 'V2_063_IDX_PROF_EMAIL', sql: `CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)` },
    { id: 'V2_064_IDX_PROF_ROLE', sql: `CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role)` },
    { id: 'V2_065_IDX_APP_USER', sql: `CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id)` },
    { id: 'V2_066_IDX_AUDIT_CR_AT', sql: `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)` }
  ];

  const migrations: string[] = [];
  const errors: string[] = [];

  for (const m of migrationQueries) {
    try {
      // Special check for migration_history table creation
      if (m.id === 'V2_001_MIGRATION_HISTORY') {
        await query(m.sql);
        continue;
      }

      const check = await query('SELECT 1 FROM migration_history WHERE migration_name = $1', [m.id]);
      if (check.rowCount > 0) continue;

      await query(m.sql);
      await query('INSERT INTO migration_history (migration_name) VALUES ($1)', [m.id]);
      migrations.push(m.id);
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      // If column/table already exists, we can consider it "migrated"
      if (errMessage.includes('already exists')) {
        await query('INSERT INTO migration_history (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING', [m.id]);
        continue;
      }
      errors.push(`${m.id}: ${errMessage}`);
    }
  }

  sendSuccess(res, { migrations, errors: errors.length > 0 ? errors : undefined });
}


/**
 * Import settings from JSON
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 * 
 * POST /api/admin?action=import-settings
 * Body: { settings: SystemSetting[] }
 * 
 * Upserts settings by setting_key (creates or updates)
 */
async function handleImportSettings(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(importSettingsBodySchema, req, res);
  if (!parsed) return;

  const { settings } = parsed;

  if (settings.length === 0) {
    sendError(res, 'settings array cannot be empty', HttpStatus.BAD_REQUEST);
    return;
  }

  const imported: string[] = [];
  const errors: string[] = [];

  // Batch upsert all settings in a single multi-row query (eliminates N+1 pattern)
  try {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    settings.forEach((setting: { key: string; value: unknown; description?: string; category?: string; is_public?: boolean }, i: number) => {
      const offset = i * 6;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, NOW(), NOW())`);
      values.push(
        setting.key,
        JSON.stringify(setting.value),
        setting.description || null,
        setting.category || null,
        setting.is_public ?? false,
        auth.userId,
      );
    });
    await query(
      `INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (key)
       DO UPDATE SET
         value = EXCLUDED.value,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         is_public = EXCLUDED.is_public,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      values
    );
    for (const setting of settings) {
      imported.push(setting.key);
    }
  } catch (e) {
    for (const setting of settings) {
      errors.push(`${setting.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Log the import event
  await logAuditEvent({
    actor_id: auth.userId,
    action: 'settings_imported',
    entity_type: 'setting',
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
 * MIGRATED: Using direct SQL instead of legacy admin SDK
 * 
 * POST /api/admin?action=reset-settings
 * 
 * Deletes all existing settings and inserts default values
 */
async function handleResetSettings(res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  try {
    // Default settings to insert after clearing
    const defaultSettings = [
      {
        key: 'site_name',
        value: 'MIHAS-KATC Application System',
        description: 'Name of the application system',
        category: 'general',
        is_public: true,
      },
      {
        key: 'contact_email',
        value: 'admissions@mihas-katc.ac.zm',
        description: 'Main contact email for admissions',
        category: 'contact',
        is_public: true,
      },
      {
        key: 'contact_phone',
        value: '+260-123-456-789',
        description: 'Main contact phone number',
        category: 'contact',
        is_public: true,
      },
      {
        key: 'application_fee',
        value: '50.00',
        description: 'Application processing fee in USD',
        category: 'finance',
        is_public: true,
      },
      {
        key: 'max_applications_per_user',
        value: '3',
        description: 'Maximum number of applications a user can submit',
        category: 'limits',
        is_public: false,
      },
      {
        key: 'enable_online_applications',
        value: 'true',
        description: 'Enable or disable online application submissions',
        category: 'general',
        is_public: true,
      },
    ];

    // Wrap delete + batch insert in a transaction for atomicity (Req 30.3)
    const ops = [{ text: 'DELETE FROM settings WHERE 1=1', values: [] as unknown[] }];

    if (defaultSettings.length > 0) {
      const values: unknown[] = [];
      const placeholders: string[] = [];
      defaultSettings.forEach((setting, i) => {
        const offset = i * 6;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, NOW(), NOW())`);
        values.push(
          setting.key,
          JSON.stringify(setting.value),
          setting.description,
          setting.category,
          setting.is_public,
          auth.userId,
        );
      });
      ops.push({
        text: `INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
         VALUES ${placeholders.join(', ')}`,
        values,
      });
    }

    await transaction(ops);

    // Log the reset event
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'settings_reset_to_defaults',
      entity_type: 'setting',
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
    handleError(res, error, 'admin/reset-settings');
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
 * NOTE: eligibility_rules table does not exist in DB â€” returns graceful responses
 */
async function handleEligibilityRules(req: VercelRequest, res: VercelResponse, _auth: AuthContext): Promise<VercelResponse | void> {
  if (req.method === 'GET') {
    sendSuccess(res, { rules: [], message: 'Eligibility rules feature not yet configured' });
    return;
  }
  sendError(res, 'Eligibility rules feature not yet configured', HttpStatus.SERVICE_UNAVAILABLE);
}

/**
 * Handle role update
 * 
 * Only super_admin can change roles to admin/super_admin
 */
async function handleUpdateRole(req: VercelRequest, res: VercelResponse, auth: AuthContext): Promise<VercelResponse | void> {
  const parsed = validateBody(updateRoleBodySchema, req, res);
  if (!parsed) return;

  const { userId, role } = parsed;

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

    // user_roles table does not exist — removed legacy backward-compat code

    const revokedSessions = await revokeUserSessions(userId);

    // Log the event
    await logAuditEvent({
      actor_id: auth.userId,
      action: 'user_role_updated',
      entity_type: 'user',
      entity_id: userId,
      changes: { new_role: role, revoked_sessions: revokedSessions },
    });

    sendSuccess(res, { user: result.rows[0], revokedSessions });
  } catch (error) {
    handleError(res, error, 'admin/update-role');
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
async function handleEligibilityAssessments(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  // eligibility_assessments table does not exist â€” return empty array gracefully
  res.setHeader('Cache-Control', 'public, max-age=60');
  sendSuccess(res, { assessments: [], message: 'Eligibility assessments feature not yet configured' });
}

/**
 * Get admin audit log entries
 *
 * GET /api/admin?action=audit-log
 */
async function handleAuditLog(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  let page = parseInt(req.query.page as string || '1', 10);
  let pageSize = parseInt(req.query.pageSize as string || '50', 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(pageSize) || pageSize < 1) pageSize = 50;
  if (pageSize > 200) pageSize = 200;

  const filterAction = (req.query.filter_action as string | undefined)?.trim();
  const filterActorEmail = (req.query.filter_actor_email as string | undefined)?.trim();
  const filterUserId = (req.query.filter_user_id as string | undefined)?.trim();
  const filterEntityType = (req.query.filter_entity_type as string | undefined)?.trim();
  const filterCategory = (req.query.filter_category as string | undefined)?.trim();
  const filterFrom = req.query.filter_from as string | undefined;
  const filterTo = req.query.filter_to as string | undefined;
  const offset = (page - 1) * pageSize;
  const categorySql = `
    CASE
      WHEN LOWER(al.action) ~ '(login|signin|logout|signout|register|signup|auth|password|session|refresh)' THEN 'Authentication'
      WHEN LOWER(al.action) ~ '(create|insert|add|update|modify|edit|delete|remove|archive|restore)' THEN 'Data'
      WHEN LOWER(al.action) ~ '(view|read|get|download|export)' THEN 'Access'
      WHEN LOWER(al.action) ~ '(settings|config|permission|role|admin|security|maintenance)' THEN 'System'
      WHEN LOWER(al.action) ~ '(email|notification|message|sms|communication)' THEN 'Communication'
      WHEN LOWER(al.action) ~ '(analytics|report|dashboard|metric)' THEN 'Analytics'
      ELSE 'General'
    END
  `;
  const fromSql = `
    FROM audit_logs al
    LEFT JOIN profiles actor ON actor.id = al.actor_id
  `;

  try {
    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filterAction) {
      params.push(`%${filterAction}%`);
      whereClauses.push(`al.action ILIKE $${params.length}`);
    }

    if (filterActorEmail) {
      params.push(`%${filterActorEmail}%`);
      whereClauses.push(`COALESCE(actor.email, '') ILIKE $${params.length}`);
    }

    if (filterUserId) {
      params.push(filterUserId);
      whereClauses.push(`(al.actor_id = $${params.length}::uuid OR al.entity_id = $${params.length}::uuid)`);
    }

    if (filterEntityType) {
      params.push(filterEntityType);
      whereClauses.push(`al.entity_type = $${params.length}`);
    }

    if (filterCategory) {
      params.push(filterCategory);
      whereClauses.push(`(${categorySql}) = $${params.length}`);
    }

    if (filterFrom) {
      params.push(filterFrom);
      whereClauses.push(`al.created_at >= $${params.length}::timestamptz`);
    }

    if (filterTo) {
      params.push(filterTo);
      whereClauses.push(`al.created_at <= $${params.length}::timestamptz`);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `SELECT COUNT(*) as count ${fromSql} ${whereSql}`;
    const entriesQuery = `
      SELECT
        al.id,
        al.actor_id,
        actor.email AS actor_email,
        COALESCE(
          NULLIF(actor.full_name, ''),
          NULLIF(TRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), ''),
          actor.email
        ) AS actor_name,
        actor.role AS actor_role,
        al.action,
        ${categorySql} AS category,
        al.entity_type,
        al.entity_id,
        al.changes,
        al.ip_address,
        al.user_agent,
        al.created_at
      ${fromSql}
      ${whereSql}
      ORDER BY al.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const uniqueActorsQuery = `
      SELECT COUNT(DISTINCT al.actor_id) as count
      ${fromSql}
      ${whereSql}
    `;
    const categoryBreakdownQuery = `
      SELECT ${categorySql} AS label, COUNT(*) as count
      ${fromSql}
      ${whereSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `;
    const entityBreakdownQuery = `
      SELECT al.entity_type AS label, COUNT(*) as count
      ${fromSql}
      ${whereSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 8
    `;
    const actionBreakdownQuery = `
      SELECT al.action AS label, COUNT(*) as count
      ${fromSql}
      ${whereSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 8
    `;

    const [countResult, entriesResult, uniqueActorsResult, categoryBreakdownResult, entityBreakdownResult, actionBreakdownResult] = await Promise.all([
      query<{ count: string }>(countQuery, params),
      query<Record<string, unknown>>(entriesQuery, [...params, pageSize, offset]),
      query<{ count: string }>(uniqueActorsQuery, params),
      query<{ label: string; count: string }>(categoryBreakdownQuery, params),
      query<{ label: string; count: string }>(entityBreakdownQuery, params),
      query<{ label: string; count: string }>(actionBreakdownQuery, params),
    ]);

    const totalCount = parseInt(countResult.rows[0]?.count || '0', 10);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const uniqueActors = parseInt(uniqueActorsResult.rows[0]?.count || '0', 10);

    sendSuccess(res, {
      entries: entriesResult.rows,
      totalCount,
      page,
      pageSize,
      totalPages,
      summary: {
        uniqueActors,
        categoryBreakdown: categoryBreakdownResult.rows,
        entityBreakdown: entityBreakdownResult.rows,
        actionBreakdown: actionBreakdownResult.rows,
      },
    });
  } catch (error) {
    handleError(res, error, 'admin/audit-log');
  }
}

/**
 * Get eligibility appeals for admin dashboard.
 *
 * GET /api/admin?action=appeals
 */
/**
 * Handle appeals listing
 * GET /api/admin?action=appeals
 * NOTE: eligibility_appeals table does not exist in DB — returns empty results gracefully
 */
async function handleAppeals(_req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  // eligibility_appeals table does not exist — return empty results
  sendSuccess(res, {
    appeals: [],
    totalCount: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
  });
}

async function handleGetSchema(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  const table = req.query.table as string;
  if (!table) return sendError(res, 'Table name required', 400);
  try {
    const result = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    sendSuccess(res, { table, columns: result.rows });
  } catch (error) {
    handleError(res, error, 'admin/schema');
  }
}
