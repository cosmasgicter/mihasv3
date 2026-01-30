import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Consolidated Notifications API
 * GET /api/notifications?action=preferences - Get user preferences
 * POST /api/notifications?action=preferences - Update preferences
 * POST /api/notifications?action=send - Send notification (admin only)
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
