import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { requireAuth, AuthenticationError, AuthorizationError, type AuthContext } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
import { USER_ROLES } from '../lib/queries';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { MANDATORY_EMAIL_TYPES, isMandatoryEmailType, getEmailMapping } from '../lib/notificationPolicy';
import { renderEmailTemplate } from '../lib/emailTemplates';
import { requireCsrf } from '../lib/csrf';
import { validateBody } from '../lib/validation/middleware';
import { markReadBodySchema, deleteNotificationBodySchema, createNotificationBodySchema, sendNotificationBodySchema } from '../lib/validation/notifications';
import { logAuditEvent } from '../lib/auditLogger';
import { validateServerEnv } from '../lib/envValidator';
import { isSafeActionUrl } from '../src/lib/urlSafety';

// Re-export for backward compatibility and testing convenience
export { MANDATORY_EMAIL_TYPES, isMandatoryEmailType } from '../lib/notificationPolicy';

/**
 * Generate a standardized idempotency key for notification deduplication.
 *
 * All notification creation paths MUST use this function so that dedup
 * keys follow a single consistent format: `userId:type:entityType:entityId`.
 *
 * Requirements: 17.1, 17.2, 17.3
 */
export function generateIdempotencyKey(
  userId: string,
  type: string,
  entityType: string,
  entityId: string
): string {
  return `${userId}:${type}:${entityType}:${entityId}`;
}

/**
 * Consolidated Notifications API
 * 
 * MIGRATED: Uses custom auth middleware and database abstraction
 * PROTECTED: Arcjet rate limiting (50 requests per 10 minutes)
 * 
 * GET /api/notifications?action=preferences - Get user preferences
 * POST /api/notifications?action=preferences - Update preferences
 * POST /api/notifications?action=send - Send notification (admin only)
 * POST /api/notifications?action=push-subscribe - Subscribe to push notifications
 * DELETE /api/notifications?action=push-subscribe - Unsubscribe from push notifications
 * POST /api/notifications?action=push-send - Send push notification to user (admin only)
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // CSRF validation for state-changing requests
  if (await requireCsrf(req, res)) return;

  // Require authentication for all notification actions (Req 9.1)
  let user: AuthContext;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    throw error;
  }

  const action = req.query.action as string || 'preferences';

  try {
    if (action === 'preferences') {
      return await handlePreferences(req, res, user);
    }
    if (action === 'history') {
      return await handleHistory(req, res, user);
    }
    if (action === 'list') {
      return await handleList(req, res, user);
    }
    if (action === 'mark-read') {
      return await handleMarkRead(req, res, user);
    }
    if (action === 'mark-all-read') {
      return await handleMarkAllRead(req, res, user);
    }
    if (action === 'delete') {
      return await handleDelete(req, res, user);
    }
    if (action === 'check-duplicate') {
      return await handleCheckDuplicate(req, res, user);
    }
    if (action === 'create') {
      return await handleCreate(req, res, user);
    }
    if (action === 'send') {
      return await handleSend(req, res, user);
    }
    if (action === 'push-subscribe') {
      return await handlePushSubscribe(req, res, user);
    }
    if (action === 'push-send') {
      return await handlePushSend(req, res, user);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    return handleError(res, error, 'notifications');
  }
}

async function handlePreferences(req: VercelRequest, res: VercelResponse, user: AuthContext) {

  try {
    if (req.method === 'GET') {
      const preferences = await getCanonicalPreferences(user.userId);

      return sendSuccess(res, { preferences });
    }

    if (req.method === 'POST') {
      const { sms_enabled, application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end } = req.body;

      const upsertQ = {
        text: `
          INSERT INTO user_notification_preferences (
            user_id, email_enabled, push_enabled, sms_enabled,
            application_updates, payment_reminders, interview_reminders, marketing_emails,
            quiet_hours_start, quiet_hours_end, updated_at, created_at
          )
          VALUES ($1, true, true, COALESCE($2, true), $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            email_enabled = true,
            push_enabled = true,
            sms_enabled = COALESCE($2, user_notification_preferences.sms_enabled, true),
            application_updates = COALESCE($3, user_notification_preferences.application_updates, true),
            payment_reminders = COALESCE($4, user_notification_preferences.payment_reminders, true),
            interview_reminders = COALESCE($5, user_notification_preferences.interview_reminders, true),
            marketing_emails = COALESCE($6, user_notification_preferences.marketing_emails, false),
            quiet_hours_start = COALESCE($7, user_notification_preferences.quiet_hours_start),
            quiet_hours_end = COALESCE($8, user_notification_preferences.quiet_hours_end),
            updated_at = NOW()
          RETURNING *
        `,
        values: [
          user.userId,
          sms_enabled ?? true,
          application_updates ?? true,
          payment_reminders ?? true,
          interview_reminders ?? true,
          marketing_emails ?? false,
          quiet_hours_start ?? null,
          quiet_hours_end ?? null,
        ],
      };
      await query<Record<string, unknown>>(upsertQ.text, upsertQ.values);
      const preferences = await getCanonicalPreferences(user.userId);

      console.log('[notifications/preferences] Updated for user:', user.userId.substring(0, 8) + '...');
      return sendSuccess(res, { preferences });
    }

    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, 'notifications/preferences');
  }
}

async function handleHistory(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMISSIONS_OFFICER].includes(user.role);
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  const applicationId = typeof req.query.applicationId === 'string' ? req.query.applicationId.trim() : '';
  if (!applicationId) {
    return sendError(res, 'applicationId is required', HttpStatus.BAD_REQUEST);
  }

  try {
    const applicationResult = await query<{ user_id: string; application_number: string | null }>(
      `SELECT user_id, application_number
       FROM applications
       WHERE id = $1
       LIMIT 1`,
      [applicationId]
    );

    if (applicationResult.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    const application = applicationResult.rows[0];
    const actionPath = `/student/application/${applicationId}`;
    const legacyActionPath = `/application/${applicationId}`;
    const values: Array<string> = [application.user_id, actionPath, legacyActionPath];
    const filters = ['n.action_url = $2', 'n.action_url = $3'];

    if (application.application_number) {
      const searchPattern = `%${application.application_number.replace(/[%_]/g, '\\$&')}%`;
      values.push(searchPattern);
      filters.push(`n.message ILIKE $4 ESCAPE '\\'`, `n.title ILIKE $4 ESCAPE '\\'`);
    }

    const historyResult = await query<{
      id: string;
      title: string;
      message: string;
      type: string | null;
      is_read: boolean;
      action_url: string | null;
      created_at: string;
      read_at: string | null;
      actor_id: string | null;
      actor_name: string | null;
    }>(
      `SELECT
         n.id,
         n.title,
         n.message,
         n.type,
         n.is_read,
         n.action_url,
         n.created_at,
         n.read_at,
         al.actor_id,
         NULLIF(TRIM(CONCAT(COALESCE(actor.first_name, ''), ' ', COALESCE(actor.last_name, ''))), '') AS actor_name
       FROM notifications n
       LEFT JOIN audit_logs al
         ON al.entity_type = 'notification'
        AND al.entity_id = n.id
        AND al.action IN ('admin_notification_send', 'application_notification_sent')
       LEFT JOIN profiles actor ON actor.id = al.actor_id
       WHERE n.user_id = $1
         AND (${filters.join(' OR ')})
       ORDER BY n.created_at DESC
       LIMIT 100`,
      values
    );

    const communications = historyResult.rows.map((item) => ({
      id: item.id,
      applicant_id: applicationId,
      channel: 'in-app',
      subject: item.title,
      message: item.message,
      template: null,
      status: 'sent',
      sent_by: item.actor_id || 'system',
      sent_by_name: item.actor_name || 'System',
      sent_at: item.created_at,
      error_message: null,
      action_url: item.action_url,
      type: item.type || 'info',
      read_at: item.read_at,
    }));

    return sendSuccess(res, {
      communications,
      lastContactedAt: historyResult.rows[0]?.created_at ?? null,
    });
  } catch (error) {
    return handleError(res, error, 'notifications/history');
  }
}

/**
 * List notifications for the authenticated user
 * GET /api/notifications?action=list
 */
async function handleList(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const result = await query<{
      id: string;
      title: string;
      message: string;
      type: string;
      is_read: boolean;
      action_url: string | null;
      created_at: string;
      read_at: string | null;
    }>(
      `SELECT id, title, message, type, is_read, action_url, created_at, read_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [user.userId]
    );

    const notifications = result.rows.map(n => ({
      id: n.id,
      title: n.title,
      content: n.message,
      type: n.type || 'info',
      read: n.is_read,
      action_url: n.action_url,
      created_at: n.created_at,
      read_at: n.read_at,
    }));

    return sendSuccess(res, notifications);
  } catch (error) {
    return handleError(res, error, 'notifications/list');
  }
}

/**
 * Mark a single notification as read
 * PUT /api/notifications?action=mark-read
 * Body: { notificationId }
 */
async function handleMarkRead(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'PUT') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(markReadBodySchema, req, res);
  if (!parsed) return;

  const { notificationId } = parsed;

  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`,
      [notificationId, user.userId]
    );

    return sendSuccess(res, { marked: true });
  } catch (error) {
    return handleError(res, error, 'notifications/mark-read');
  }
}

/**
 * Mark all notifications as read for the authenticated user
 * PUT /api/notifications?action=mark-all-read
 */
async function handleMarkAllRead(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'PUT') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    await query(
      `UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`,
      [user.userId]
    );

    return sendSuccess(res, { marked: true });
  } catch (error) {
    return handleError(res, error, 'notifications/mark-all-read');
  }
}

/**
 * Delete a notification
 * DELETE /api/notifications?action=delete
 * Body: { notificationId }
 */
async function handleDelete(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'DELETE') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(deleteNotificationBodySchema, req, res);
  if (!parsed) return;

  const { notificationId } = parsed;

  try {
    await query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [notificationId, user.userId]
    );

    await logAuditEvent({
      actor_id: user.userId,
      action: 'notification_delete',
      entity_type: 'notification',
      entity_id: notificationId,
    });

    return sendSuccess(res, { deleted: true });
  } catch (error) {
    return handleError(res, error, 'notifications/delete');
  }
}

/**
 * Create a notification with deduplication via idempotency key.
 * 
 * Uses the shared `generateIdempotencyKey` to produce a key in the
 * standardized format `userId:type:entityType:entityId` and checks for
 * an existing notification with the same key within a 1-hour window.
 * Skips creation if a duplicate is found.
 * 
 * Requirements: 13.1, 13.2, 17.1, 17.2, 17.3
 */
async function createNotificationWithDedup(
  userId: string,
  eventType: string,
  entityId: string,
  entityType: string,
  message: string,
  channel: 'email' | 'in_app',
  extra?: { title?: string; action_url?: string | null }
): Promise<{ created: boolean; notificationId?: string; notification?: Record<string, unknown> }> {
  const idempotencyKey = generateIdempotencyKey(userId, eventType, entityType, entityId);

  // Check for existing notification with same key in last hour
  const existing = await query<{ id: string }>(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND idempotency_key = $2
     AND created_at > NOW() - INTERVAL '1 hour'
     LIMIT 1`,
    [userId, idempotencyKey]
  );

  if (existing.rows.length > 0) {
    console.log(
      '[notifications/dedup] Duplicate skipped — key:', idempotencyKey,
      'user:', userId.substring(0, 8) + '...'
    );
    return { created: false };
  }

  // Create notification with idempotency key
  // NOTE: notifications table has no 'channel' column — omit it from INSERT
  const result = await query<Record<string, unknown>>(
    `INSERT INTO notifications (id, user_id, type, title, message, idempotency_key, action_url, is_read, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, false, NOW())
     RETURNING *`,
    [
      userId,
      eventType,
      extra?.title || message,
      message,
      idempotencyKey,
      extra?.action_url || null,
    ]
  );

  return {
    created: true,
    notificationId: result.rows[0]?.id as string,
    notification: result.rows[0],
  };
}


async function handleCheckDuplicate(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const { user_id, title, message, type, entity_type, entity_id } = req.body || {};
  const targetUserId = user_id || user.userId;

  if (!targetUserId || !title || !message) {
    return sendError(res, 'user_id, title, and message are required', HttpStatus.BAD_REQUEST);
  }

  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMISSIONS_OFFICER].includes(user.role);
  if (targetUserId !== user.userId && !isAdmin) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  try {
    const normalizedType = type || 'info';
    const idempotencyKey = generateIdempotencyKey(
      targetUserId,
      normalizedType,
      entity_type || 'notification',
      entity_id || title
    );

    const existing = await query<{ id: string }>(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND idempotency_key = $2
       AND created_at > NOW() - INTERVAL '1 minute'
       LIMIT 1`,
      [targetUserId, idempotencyKey]
    );

    return sendSuccess(res, { duplicate: existing.rows.length > 0 });
  } catch (error) {
    return handleError(res, error, 'notifications/check-duplicate');
  }
}

async function handleCreate(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(createNotificationBodySchema, req, res);
  if (!parsed) return;

  const { user_id, title, message, type, action_url, entity_type, entity_id } = parsed;
  const targetUserId = user_id || user.userId;

  // Validate action_url to prevent open redirects (Req 27.3)
  if (action_url && !isSafeActionUrl(action_url)) {
    return sendError(res, 'action_url must be a relative path or an HTTPS URL on the application domain', HttpStatus.BAD_REQUEST, 'INVALID_ACTION_URL');
  }

  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (targetUserId !== user.userId && !isAdmin) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  try {
    const notificationType = type || 'info';
    const idempotencyKey = generateIdempotencyKey(
      targetUserId,
      notificationType,
      entity_type || 'notification',
      entity_id || title
    );

    const existing = await query<{ id: string }>(
      `SELECT id FROM notifications
       WHERE user_id = $1 AND idempotency_key = $2
       AND created_at > NOW() - INTERVAL '1 minute'
       LIMIT 1`,
      [targetUserId, idempotencyKey]
    );

    if (existing.rows.length > 0) {
      return sendSuccess(res, { duplicate: true });
    }

    const created = await query<Record<string, unknown>>(
      `INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, false, NOW(), $6)
       RETURNING *`,
      [targetUserId, title, message, notificationType, action_url || null, idempotencyKey]
    );

    // --- Email queuing (additive — never blocks in-app notification) ---
    try {
      await queueEmailForNotification(targetUserId, notificationType, title, message, action_url);
    } catch {
      console.log('[notifications/create] Email queuing failed — in-app notification still created');
    }

    await logAuditEvent({
      actor_id: user.userId,
      action: 'notification_create',
      entity_type: 'notification',
      entity_id: (created.rows[0]?.id as string) || null,
      changes: { type: notificationType, target_user: targetUserId !== user.userId ? targetUserId : undefined },
    });

    return sendSuccess(res, { duplicate: false, notification: created.rows[0] });
  } catch (error) {
    return handleError(res, error, 'notifications/create');
  }
}

async function handleSend(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin role for sending notifications to other users (Req 9.2)
  const isAdminUser = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdminUser) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  const parsed = validateBody(sendNotificationBodySchema, req, res);
  if (!parsed) return;

  const { user_id, title, message, type, action_url, entity_id, entity_type } = parsed;

  // Validate action_url to prevent open redirects (Req 27.3)
  if (action_url && !isSafeActionUrl(action_url)) {
    return sendError(res, 'action_url must be a relative path or an HTTPS URL on the application domain', HttpStatus.BAD_REQUEST, 'INVALID_ACTION_URL');
  }

  try {
    const notificationType = type || 'info';
    const mandatory = isMandatoryEmailType(notificationType);

    // Use deduplication when entity context is provided, otherwise fall back to direct insert
    let notificationRow: Record<string, unknown> | undefined;

    if (entity_id && entity_type) {
      const dedupResult = await createNotificationWithDedup(
        user_id,
        notificationType,
        entity_id,
        entity_type,
        message,
        'in_app',
        { title, action_url: action_url || null }
      );

      if (!dedupResult.created) {
        console.log('[notifications/send] Duplicate notification skipped for user:', user_id.substring(0, 8) + '...');
        return sendSuccess(res, { duplicate: true, message: 'Notification already sent within deduplication window' });
      }

      notificationRow = dedupResult.notification;
    } else {
      // Legacy path: no entity context, insert directly (backward compatible)
      const insertQ = {
        text: `
          INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
          VALUES ($1, $2, $3, $4, $5, false, NOW())
          RETURNING *
        `,
        values: [user_id, title, message, notificationType, action_url || null],
      };
      const result = await query<Record<string, unknown>>(insertQ.text, insertQ.values);
      notificationRow = result.rows[0];
    }

    const recipientPreferences = await getCanonicalPreferences(user_id);

    // For mandatory types, always queue email regardless of user preferences.
    // For non-mandatory types, respect the user's email_enabled preference.
    const shouldSendEmail = mandatory || Boolean(recipientPreferences.email_enabled);

    let emailQueued = false;
    try {
      if (shouldSendEmail) {
        emailQueued = await queueEmailForNotification(user_id, notificationType, title, message, action_url);
      }
    } catch {
      console.log('[notifications/send] Email queuing failed — in-app notification still created');
    }

    console.log('[notifications/send] Notification created for user:', user_id.substring(0, 8) + '...');

    await logAuditEvent({
      actor_id: user.userId,
      action: 'admin_notification_send',
      entity_type: 'notification',
      entity_id: (notificationRow?.id as string) || null,
      changes: { type: notificationType, target_user: user_id, mandatory },
    });

    return sendSuccess(res, { notification: notificationRow, email_queued: emailQueued, mandatory });
  } catch (error) {
    return handleError(res, error, 'notifications/send');
  }
}

/**
 * Queue an email for a notification if the type is email-eligible and the user
 * has not opted out. Mandatory types always queue regardless of preferences.
 *
 * Returns true if an email was queued, false otherwise.
 */
async function queueEmailForNotification(
  userId: string,
  notificationType: string,
  title: string,
  message: string,
  actionUrl?: string | null
): Promise<boolean> {
  const mapping = getEmailMapping(notificationType);
  if (!mapping) {
    // Not an email-eligible type — nothing to queue
    return false;
  }

  // Look up user email from profiles
  const profileResult = await query<{ email: string; first_name: string }>(
    `SELECT email, first_name FROM profiles WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const profile = profileResult.rows[0];

  if (!profile?.email) {
    console.log('[notifications/email-queue] No email on profile — skipping email queue');
    return false;
  }

  // Check user notification preferences for non-mandatory types
  if (mapping.preferenceKey !== null) {
    const preferences = await getCanonicalPreferences(userId);
    if (!preferences[mapping.preferenceKey]) {
      console.log('[notifications/email-queue] User opted out of category — skipping');
      return false;
    }
  }

  // Render email HTML via template module
  const htmlBody = renderEmailTemplate(mapping.templateName, {
    recipientName: profile.first_name || undefined,
    message,
    actionUrl: actionUrl || undefined,
  });

  // Insert into email_queue
  await query(
    `INSERT INTO email_queue (recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
    [
      profile.email,
      profile.first_name || null,
      title,
      message,
      htmlBody,
      mapping.templateName,
      JSON.stringify({ recipientName: profile.first_name || null, message, actionUrl: actionUrl || null }),
      mapping.preferenceKey === null ? 1 : 5, // mandatory = high priority
    ]
  );

  console.log('[notifications/email-queue] Email queued — type:', notificationType);
  return true;
}

async function getCanonicalPreferences(userId: string): Promise<Record<string, unknown>> {
  const result = await query<Record<string, unknown> & { phone?: string | null }>(
    `SELECT
       p.phone,
       np.email_enabled,
       np.push_enabled,
       np.sms_enabled,
       np.application_updates,
       np.payment_reminders,
       np.interview_reminders,
       np.marketing_emails,
       np.quiet_hours_start,
       np.quiet_hours_end,
       np.timezone,
       np.created_at,
       np.updated_at
     FROM profiles p
     LEFT JOIN user_notification_preferences np ON np.user_id = p.id
     WHERE p.id = $1
     LIMIT 1`,
    [userId]
  );

  const row = result.rows[0] ?? {};
  const smsEnabled = row.sms_enabled ?? true;
  const updatedAt = (row.updated_at as string | null | undefined) ?? (row.created_at as string | null | undefined) ?? null;

  return {
    user_id: userId,
    phone: row.phone ?? null,
    email_enabled: row.email_enabled ?? true,
    push_enabled: row.push_enabled ?? true,
    sms_enabled: smsEnabled,
    whatsapp_enabled: false,
    in_app_enabled: true,
    application_updates: row.application_updates ?? true,
    payment_reminders: row.payment_reminders ?? true,
    interview_reminders: row.interview_reminders ?? true,
    marketing_emails: row.marketing_emails ?? false,
    quiet_hours_start: row.quiet_hours_start ?? null,
    quiet_hours_end: row.quiet_hours_end ?? null,
    timezone: row.timezone ?? 'Africa/Lusaka',
    frequency: 'realtime',
    optimalTiming: true,
    channels: [
      { type: 'sms', enabled: Boolean(smsEnabled), priority: 2 },
    ],
    sms_opt_in_at: smsEnabled ? updatedAt : null,
    sms_opt_in_source: smsEnabled ? 'portal' : null,
    sms_opt_in_actor: null,
    sms_opt_out_at: smsEnabled ? null : updatedAt,
    sms_opt_out_source: smsEnabled ? null : 'portal',
    sms_opt_out_actor: null,
    sms_opt_out_reason: smsEnabled ? null : 'Preference disabled',
    whatsapp_opt_in_at: null,
    whatsapp_opt_in_source: null,
    whatsapp_opt_in_actor: null,
    whatsapp_opt_out_at: null,
    whatsapp_opt_out_source: null,
    whatsapp_opt_out_actor: null,
    whatsapp_opt_out_reason: null,
    notification_types: {
      application_update: row.application_updates ?? true,
      interview_schedule: row.interview_reminders ?? true,
      document_ready: row.application_updates ?? true,
    },
  };
}

async function handlePushSubscribe(req: VercelRequest, res: VercelResponse, _user: AuthContext) {
  // push_subscriptions table does not exist — return graceful responses
  if (req.method === 'POST') {
    return sendSuccess(res, { subscribed: false, message: 'Push notifications not yet configured' });
  }
  if (req.method === 'DELETE') {
    return sendSuccess(res, { unsubscribed: true });
  }
  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

async function handlePushSend(req: VercelRequest, res: VercelResponse, _user: AuthContext) {
  // push_subscriptions table does not exist — return graceful response
  return sendSuccess(res, { sent: 0, message: 'Push notifications not yet configured' });
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
