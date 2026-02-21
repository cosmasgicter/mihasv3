import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { getAuthUser } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
import { sendSuccess, sendError, handleError, HttpStatus } from '../lib/errorHandler';
import { USER_ROLES } from '../lib/queries';
import { renderEmailTemplate } from '../lib/emailTemplates';

/**
 * Consolidated Email API
 *
 * PROTECTED: Arcjet rate limiting
 *
 * POST /api/email?action=send           - Queue a single email (any authenticated user)
 * POST /api/email?action=process-queue   - Process pending emails via Resend (admin only)
 * POST /api/email?action=retry-failed    - Reset failed emails to pending (admin only)
 * GET  /api/email?action=queue-status    - Get email queue counts by status (admin only)
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  const action = req.query.action as string;

  try {
    switch (action) {
      case 'send':
        return await handleSend(req, res);
      case 'process-queue':
        return await handleProcessQueue(req, res);
      case 'retry-failed':
        return await handleRetryFailed(req, res);
      case 'queue-status':
        return await handleQueueStatus(req, res);
      default:
        return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, 'email');
  }
}

/**
 * Queue a single email.
 * Any authenticated user can call this action.
 * Validates recipient, subject, body. Optionally renders HTML from a template.
 */
async function handleSend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const { recipient_email, recipient_name, subject, body, template_name, template_data, priority } = req.body || {};

  if (!recipient_email || !subject || !body) {
    return sendError(res, 'recipient_email, subject, and body are required', HttpStatus.BAD_REQUEST);
  }

  // Render HTML from template if template_name is provided
  let htmlBody: string | null = null;
  if (template_name) {
    htmlBody = renderEmailTemplate(template_name, template_data || {});
  }

  const result = await query<{ id: string }>(
    `INSERT INTO email_queue (recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
     RETURNING id`,
    [
      recipient_email,
      recipient_name || null,
      subject,
      body,
      htmlBody,
      template_name || null,
      template_data ? JSON.stringify(template_data) : null,
      priority ?? 5,
    ]
  );

  console.log('[email/send] Queued email for:', recipient_email.substring(0, 3) + '***');
  return sendSuccess(res, { queued: true, id: result.rows[0]?.id });
}

/**
 * Process pending emails from the queue via Resend API.
 * Admin or super_admin only. Processes up to 10 emails per call.
 */
async function handleProcessQueue(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  if (!process.env.RESEND_API_KEY) {
    return sendError(res, 'RESEND_API_KEY is not configured', HttpStatus.SERVICE_UNAVAILABLE);
  }

  // Select up to 10 pending emails ordered by priority ASC, created_at ASC
  const pending = await query<{
    id: string;
    recipient_email: string;
    subject: string;
    body: string;
    html_body: string | null;
    retry_count: number;
    max_retries: number;
  }>(
    `SELECT id, recipient_email, subject, body, html_body, retry_count, max_retries
     FROM email_queue
     WHERE status = 'pending'
     ORDER BY priority ASC, created_at ASC
     LIMIT 10`
  );

  let sent = 0;
  let failed = 0;

  for (const email of pending.rows) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'noreply@mihas.edu.zm',
          to: [email.recipient_email],
          subject: email.subject,
          html: email.html_body || email.body,
        }),
      });

      if (response.ok) {
        await query(
          `UPDATE email_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
          [email.id]
        );
        sent++;
      } else {
        const errorText = await response.text().catch(() => 'Unknown error');
        const newRetryCount = email.retry_count + 1;
        const newStatus = newRetryCount >= email.max_retries ? 'failed' : 'pending';

        await query(
          `UPDATE email_queue SET retry_count = $1, error_message = $2, status = $3 WHERE id = $4`,
          [newRetryCount, errorText, newStatus, email.id]
        );
        failed++;
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      const newRetryCount = email.retry_count + 1;
      const newStatus = newRetryCount >= email.max_retries ? 'failed' : 'pending';

      await query(
        `UPDATE email_queue SET retry_count = $1, error_message = $2, status = $3 WHERE id = $4`,
        [newRetryCount, errorMsg, newStatus, email.id]
      );
      failed++;
    }
  }

  console.log(`[email/process-queue] Processed ${pending.rows.length}: ${sent} sent, ${failed} failed`);
  return sendSuccess(res, { processed: pending.rows.length, sent, failed });
}

/**
 * Reset all failed emails back to pending for reprocessing.
 * Admin or super_admin only.
 */
async function handleRetryFailed(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  const result = await query<{ count: string }>(
    `WITH updated AS (
       UPDATE email_queue
       SET status = 'pending', retry_count = 0, error_message = NULL
       WHERE status = 'failed'
       RETURNING id
     )
     SELECT COUNT(*)::text AS count FROM updated`
  );

  const resetCount = parseInt(result.rows[0]?.count || '0', 10);
  console.log(`[email/retry-failed] Reset ${resetCount} failed emails to pending`);
  return sendSuccess(res, { reset: resetCount });
}

/**
 * Get email queue counts grouped by status.
 * Admin or super_admin only.
 */
async function handleQueueStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    return sendError(res, 'Admin access required', HttpStatus.FORBIDDEN);
  }

  const result = await query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM email_queue GROUP BY status`
  );

  const counts: Record<string, number> = {};
  for (const row of result.rows) {
    counts[row.status] = parseInt(row.count, 10);
  }

  return sendSuccess(res, { counts });
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
