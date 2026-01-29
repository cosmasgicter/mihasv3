import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * POST /api/notifications/send
 * Send a notification to a user (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin access
  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    const { user_id, title, message, type, action_url } = req.body;

    if (!user_id || !title || !message) {
      return sendError(res, 'user_id, title, and message are required', HttpStatus.BAD_REQUEST);
    }

    // Insert notification
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id,
        title,
        message,
        type: type || 'info',
        action_url,
        is_read: false,
      })
      .select()
      .single();

    if (error) {
      return sendError(res, error.message, HttpStatus.BAD_REQUEST);
    }

    // Try to send email notification
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
      // Email sending is best-effort
      console.log('[notifications/send] Email send failed');
    }

    console.log('[notifications/send] Notification created for user:', user_id);
    return sendSuccess(res, {
      notification: data,
      email_sent: emailSent,
    });
  } catch (error) {
    return handleError(res, error, 'notifications/send');
  }
}
