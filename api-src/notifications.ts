import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { getAuthUser } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
import { USER_ROLES } from '../lib/queries';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';

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

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  const action = req.query.action as string || 'preferences';

  try {
    if (action === 'preferences') {
      return await handlePreferences(req, res);
    }
    if (action === 'list') {
      return await handleList(req, res);
    }
    if (action === 'mark-read') {
      return await handleMarkRead(req, res);
    }
    if (action === 'mark-all-read') {
      return await handleMarkAllRead(req, res);
    }
    if (action === 'delete') {
      return await handleDelete(req, res);
    }
    if (action === 'send') {
      return await handleSend(req, res);
    }
    if (action === 'push-subscribe') {
      return await handlePushSubscribe(req, res);
    }
    if (action === 'push-send') {
      return await handlePushSend(req, res);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'notifications');
  }
}

async function handlePreferences(req: VercelRequest, res: VercelResponse) {
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  if (req.method === 'GET') {
    const q = {
      text: `SELECT * FROM user_notification_preferences WHERE user_id = $1 LIMIT 1`,
      values: [user.userId],
    };
    const result = await query<Record<string, unknown>>(q.text, q.values);

    const preferences = result.rows[0] || {
      user_id: user.userId,
      email_enabled: true,
      push_enabled: true,
      sms_enabled: false,
      application_updates: true,
      payment_reminders: true,
      interview_reminders: true,
      marketing_emails: false,
      quiet_hours_start: null,
      quiet_hours_end: null,
    };

    return sendSuccess(res, { preferences });
  }

  if (req.method === 'POST') {
    const { email_enabled, push_enabled, sms_enabled, application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end } = req.body;

    const upsertQ = {
      text: `
        INSERT INTO user_notification_preferences (
          user_id, email_enabled, push_enabled, sms_enabled,
          application_updates, payment_reminders, interview_reminders, marketing_emails,
          quiet_hours_start, quiet_hours_end, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          email_enabled = COALESCE($2, user_notification_preferences.email_enabled),
          push_enabled = COALESCE($3, user_notification_preferences.push_enabled),
          sms_enabled = COALESCE($4, user_notification_preferences.sms_enabled),
          application_updates = COALESCE($5, user_notification_preferences.application_updates),
          payment_reminders = COALESCE($6, user_notification_preferences.payment_reminders),
          interview_reminders = COALESCE($7, user_notification_preferences.interview_reminders),
          marketing_emails = COALESCE($8, user_notification_preferences.marketing_emails),
          quiet_hours_start = COALESCE($9, user_notification_preferences.quiet_hours_start),
          quiet_hours_end = COALESCE($10, user_notification_preferences.quiet_hours_end),
          updated_at = NOW()
        RETURNING *
      `,
      values: [
        user.userId,
        email_enabled ?? true,
        push_enabled ?? true,
        sms_enabled ?? false,
        application_updates ?? true,
        payment_reminders ?? true,
        interview_reminders ?? true,
        marketing_emails ?? false,
        quiet_hours_start ?? null,
        quiet_hours_end ?? null,
      ],
    };
    const result = await query<Record<string, unknown>>(upsertQ.text, upsertQ.values);

    console.log('[notifications/preferences] Updated for user:', user.userId.substring(0, 8) + '...');
    return sendSuccess(res, { preferences: result.rows[0] });
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

/**
 * List notifications for the authenticated user
 * GET /api/notifications?action=list
 */
async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

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
}

/**
 * Mark a single notification as read
 * PUT /api/notifications?action=mark-read
 * Body: { notificationId }
 */
async function handleMarkRead(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const { notificationId } = req.body || {};
  if (!notificationId) {
    return sendError(res, 'notificationId is required', HttpStatus.BAD_REQUEST);
  }

  await query(
    `UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`,
    [notificationId, user.userId]
  );

  return sendSuccess(res, { marked: true });
}

/**
 * Mark all notifications as read for the authenticated user
 * PUT /api/notifications?action=mark-all-read
 */
async function handleMarkAllRead(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  await query(
    `UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`,
    [user.userId]
  );

  return sendSuccess(res, { marked: true });
}

/**
 * Delete a notification
 * DELETE /api/notifications?action=delete
 * Body: { notificationId }
 */
async function handleDelete(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const { notificationId } = req.body || {};
  if (!notificationId) {
    return sendError(res, 'notificationId is required', HttpStatus.BAD_REQUEST);
  }

  await query(
    `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
    [notificationId, user.userId]
  );

  return sendSuccess(res, { deleted: true });
}

async function handleSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  // Check admin role
  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  const { user_id, title, message, type, action_url } = req.body;

  if (!user_id || !title || !message) {
    return sendError(res, 'user_id, title, and message are required', HttpStatus.BAD_REQUEST);
  }

  // Insert notification
  const insertQ = {
    text: `
      INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW())
      RETURNING *
    `,
    values: [user_id, title, message, type || 'info', action_url || null],
  };
  const result = await query<Record<string, unknown>>(insertQ.text, insertQ.values);

  let emailSent = false;
  try {
    // Get user profile for email
    const profileQ = {
      text: `SELECT email, first_name, last_name FROM profiles WHERE id = $1 LIMIT 1`,
      values: [user_id],
    };
    const profileResult = await query<{ email: string; first_name: string; last_name: string }>(profileQ.text, profileQ.values);
    const profile = profileResult.rows[0];

    if (profile?.email && process.env.RESEND_API_KEY) {
      const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Student';
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">${title}</h2>
          <p style="font-size: 16px; line-height: 1.6; color: #374151;">${message}</p>
          ${action_url ? `<p style="margin-top: 20px;"><a href="${action_url}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Details</a></p>` : ''}
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 14px; color: #6b7280;">MIHAS - Mukuba Institute of Health and Allied Sciences</p>
        </div>
      `;

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@mihas.edu.zm',
          to: profile.email,
          subject: title,
          html: emailHtml,
        }),
      });

      emailSent = emailResponse.ok;
    }
  } catch {
    console.log('[notifications/send] Email send failed');
  }

  console.log('[notifications/send] Notification created for user:', user_id.substring(0, 8) + '...');
  return sendSuccess(res, { notification: result.rows[0], email_sent: emailSent });
}

async function handlePushSubscribe(req: VercelRequest, res: VercelResponse) {
  // Allow both authenticated and unauthenticated subscriptions
  const user = await getAuthUser(req);
  const userId = user?.userId || null;

  if (req.method === 'POST') {
    const { subscription, userAgent } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return sendError(res, 'Invalid subscription data', HttpStatus.BAD_REQUEST);
    }

    const { endpoint, keys } = subscription;
    const { p256dh, auth: authKey } = keys;

    if (!p256dh || !authKey) {
      return sendError(res, 'Missing subscription keys', HttpStatus.BAD_REQUEST);
    }

    // Upsert subscription
    const upsertQ = {
      text: `
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        ON CONFLICT (endpoint) DO UPDATE SET
          user_id = COALESCE($1, push_subscriptions.user_id),
          p256dh = $3,
          auth = $4,
          user_agent = $5,
          is_active = true,
          updated_at = NOW()
        RETURNING id
      `,
      values: [userId, endpoint, p256dh, authKey, userAgent || null],
    };
    const result = await query<{ id: string }>(upsertQ.text, upsertQ.values);

    console.log('[notifications/push-subscribe] Subscription saved for user:', userId?.substring(0, 8) || 'anonymous');
    return sendSuccess(res, { subscribed: true, id: result.rows[0]?.id });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body;

    if (!endpoint) {
      return sendError(res, 'Endpoint required', HttpStatus.BAD_REQUEST);
    }

    const updateQ = {
      text: `UPDATE push_subscriptions SET is_active = false, updated_at = NOW() WHERE endpoint = $1`,
      values: [endpoint],
    };
    await query(updateQ.text, updateQ.values);

    console.log('[notifications/push-subscribe] Unsubscribed endpoint');
    return sendSuccess(res, { unsubscribed: true });
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

async function handlePushSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  // Check admin role
  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  const { user_id, title, body, icon, badge, url, tag } = req.body;

  if (!title || !body) {
    return sendError(res, 'title and body are required', HttpStatus.BAD_REQUEST);
  }

  // Get active subscriptions
  let selectQ;
  if (user_id) {
    selectQ = {
      text: `SELECT * FROM push_subscriptions WHERE is_active = true AND user_id = $1`,
      values: [user_id],
    };
  } else {
    selectQ = {
      text: `SELECT * FROM push_subscriptions WHERE is_active = true`,
      values: [],
    };
  }
  const subsResult = await query<{
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(selectQ.text, selectQ.values);

  const subscriptions = subsResult.rows;

  if (!subscriptions || subscriptions.length === 0) {
    return sendSuccess(res, { sent: 0, message: 'No active subscriptions found' });
  }

  // Web Push requires VAPID keys
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admissions@mihas.edu.zm';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log('[notifications/push-send] VAPID keys not configured');
    return sendError(res, 'Push notifications not configured (missing VAPID keys)', HttpStatus.SERVICE_UNAVAILABLE);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const payload = JSON.stringify({
    title,
    body,
    icon: icon || '/images/logo-192.png',
    badge: badge || '/images/badge-72.png',
    data: { url: url || '/' },
    tag: tag || 'mihas-notification',
  });

  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints: string[] = [];

  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      await webpush.sendNotification(pushSubscription, payload, { TTL: 86400 });
      sentCount++;
    } catch (err: unknown) {
      const pushError = err as { statusCode?: number };
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        // Mark expired subscription as inactive
        const deactivateQ = {
          text: `UPDATE push_subscriptions SET is_active = false WHERE id = $1`,
          values: [sub.id],
        };
        await query(deactivateQ.text, deactivateQ.values);
        expiredEndpoints.push(sub.endpoint);
      }
      console.error('[notifications/push-send] Error sending to endpoint:', pushError.statusCode || err);
      failedCount++;
    }
  }

  console.log(`[notifications/push-send] Sent: ${sentCount}, Failed: ${failedCount}`);
  return sendSuccess(res, {
    sent: sentCount,
    failed: failedCount,
    total: subscriptions.length,
    expired_removed: expiredEndpoints.length,
  });
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
