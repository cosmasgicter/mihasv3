import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Consolidated Notifications API
 * GET /api/notifications?action=preferences - Get user preferences
 * POST /api/notifications?action=preferences - Update preferences
 * POST /api/notifications?action=send - Send notification (admin only)
 * POST /api/notifications?action=push-subscribe - Subscribe to push notifications
 * DELETE /api/notifications?action=push-subscribe - Unsubscribe from push notifications
 * POST /api/notifications?action=push-send - Send push notification to user (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const action = req.query.action as string || 'preferences';

  try {
    if (action === 'preferences') {
      return handlePreferences(req, res);
    }
    if (action === 'send') {
      return handleSend(req, res);
    }
    if (action === 'push-subscribe') {
      return handlePushSubscribe(req, res);
    }
    if (action === 'push-send') {
      return handlePushSend(req, res);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'notifications');
  }
}

async function handlePreferences(req: VercelRequest, res: VercelResponse) {
  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) return sendError(res, error.message, HttpStatus.BAD_REQUEST);

    const preferences = data || {
      user_id: auth.user.id,
      email_enabled: true,
      push_enabled: true,
      in_app_enabled: true,
      quiet_hours_start: null,
      quiet_hours_end: null,
    };

    return sendSuccess(res, { preferences });
  }

  if (req.method === 'POST') {
    const { email_enabled, push_enabled, in_app_enabled, quiet_hours_start, quiet_hours_end } = req.body;

    const updateData: Record<string, unknown> = {
      user_id: auth.user.id,
      updated_at: new Date().toISOString(),
    };

    if (email_enabled !== undefined) updateData.email_enabled = email_enabled;
    if (push_enabled !== undefined) updateData.push_enabled = push_enabled;
    if (in_app_enabled !== undefined) updateData.in_app_enabled = in_app_enabled;
    if (quiet_hours_start !== undefined) updateData.quiet_hours_start = quiet_hours_start;
    if (quiet_hours_end !== undefined) updateData.quiet_hours_end = quiet_hours_end;

    const { data, error } = await supabaseAdmin
      .from('notification_preferences')
      .upsert(updateData, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) return sendError(res, error.message, HttpStatus.BAD_REQUEST);

    console.log('[notifications/preferences] Updated for user:', auth.user.id);
    return sendSuccess(res, { preferences: data });
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

async function handleSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  const { user_id, title, message, type, action_url } = req.body;

  if (!user_id || !title || !message) {
    return sendError(res, 'user_id, title, and message are required', HttpStatus.BAD_REQUEST);
  }

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert({ user_id, title, message, type: type || 'info', action_url, is_read: false })
    .select()
    .single();

  if (error) return sendError(res, error.message, HttpStatus.BAD_REQUEST);

  let emailSent = false;
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('id', user_id)
      .single();

    if (profile?.email && process.env.RESEND_API_KEY) {
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

  console.log('[notifications/send] Notification created for user:', user_id);
  return sendSuccess(res, { notification: data, email_sent: emailSent });
}


async function handlePushSubscribe(req: VercelRequest, res: VercelResponse) {
  // Allow both authenticated and unauthenticated subscriptions
  // Unauthenticated users can subscribe but won't receive targeted notifications
  const auth = await getUserFromRequest(req);
  const userId = 'error' in auth ? null : auth.user.id;

  if (req.method === 'POST') {
    const { subscription, userAgent, platform } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return sendError(res, 'Invalid subscription data', HttpStatus.BAD_REQUEST);
    }

    const { endpoint, keys } = subscription;
    const { p256dh, auth: authKey } = keys;

    if (!p256dh || !authKey) {
      return sendError(res, 'Missing subscription keys', HttpStatus.BAD_REQUEST);
    }

    // Upsert subscription (update if endpoint exists, insert if new)
    const { data, error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth: authKey,
        user_agent: userAgent || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' })
      .select()
      .single();

    if (error) {
      console.error('[notifications/push-subscribe] Error:', error.message);
      return sendError(res, 'Failed to save subscription', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    console.log('[notifications/push-subscribe] Subscription saved for user:', userId || 'anonymous');
    return sendSuccess(res, { subscribed: true, id: data.id });
  }

  if (req.method === 'DELETE') {
    const { endpoint } = req.body;

    if (!endpoint) {
      return sendError(res, 'Endpoint required', HttpStatus.BAD_REQUEST);
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('endpoint', endpoint);

    if (error) {
      console.error('[notifications/push-subscribe] Unsubscribe error:', error.message);
      return sendError(res, 'Failed to unsubscribe', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    console.log('[notifications/push-subscribe] Unsubscribed endpoint');
    return sendSuccess(res, { unsubscribed: true });
  }

  return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
}

async function handlePushSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  const { user_id, title, body, icon, badge, url, tag } = req.body;

  if (!title || !body) {
    return sendError(res, 'title and body are required', HttpStatus.BAD_REQUEST);
  }

  // Get active subscriptions for the user (or all if no user_id)
  let query = supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('is_active', true);

  if (user_id) {
    query = query.eq('user_id', user_id);
  }

  const { data: subscriptions, error } = await query;

  if (error) {
    console.error('[notifications/push-send] Error fetching subscriptions:', error.message);
    return sendError(res, 'Failed to fetch subscriptions', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  if (!subscriptions || subscriptions.length === 0) {
    return sendSuccess(res, { sent: 0, message: 'No active subscriptions found' });
  }

  // Web Push requires VAPID keys - check if configured
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admissions@mihas.edu.zm';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.log('[notifications/push-send] VAPID keys not configured');
    return sendError(res, 'Push notifications not configured (missing VAPID keys)', HttpStatus.SERVICE_UNAVAILABLE);
  }

  // Configure web-push with VAPID details
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  // Prepare notification payload
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

  // Send to each subscription using web-push library
  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      await webpush.sendNotification(pushSubscription, payload, {
        TTL: 86400, // 24 hours
      });
      sentCount++;
    } catch (err: unknown) {
      const pushError = err as { statusCode?: number };
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        // Subscription expired or invalid - mark as inactive
        await supabaseAdmin
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', sub.id);
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
    expired_removed: expiredEndpoints.length
  });
}
