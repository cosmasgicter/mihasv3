import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { requireAuth, requireRole, AuthenticationError, AuthorizationError, type AuthContext } from '../lib/auth/middleware';
import { withArcjetProtection } from '../lib/arcjet';
import { sendSuccess, sendError, handleError, HttpStatus } from '../lib/errorHandler';
import { USER_ROLES } from '../lib/queries';
import { renderEmailTemplate } from '../lib/emailTemplates';
import { requireCsrf } from '../lib/csrf';
import { validateBody } from '../lib/validation/middleware';
import { sendEmailBodySchema } from '../lib/validation/email';
import { logAuditEvent } from '../lib/auditLogger';
import { validateServerEnv } from '../lib/envValidator';

/**
 * Consolidated Email API
 *
 * PROTECTED: Arcjet rate limiting
 *
 * POST /api/email?action=send           - Queue a single email (admin only)
 * POST /api/email?action=process-queue   - Process pending emails via Resend (admin only)
 * POST /api/email?action=retry-failed    - Reset failed emails to pending (admin only)
 * GET  /api/email?action=queue-status    - Get email queue counts by status (admin only)
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> {
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  // CSRF validation for state-changing requests
  if (await requireCsrf(req, res)) return;

  // Require authentication for all email actions (Req 9.1)
  let user: AuthContext;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    throw error;
  }

  const action = req.query.action as string;

  try {
    switch (action) {
      case 'send':
        return await handleSend(req, res, user);
      case 'process-queue':
        return await handleProcessQueue(req, res, user);
      case 'retry-failed':
        return await handleRetryFailed(req, res, user);
      case 'queue-status':
        return await handleQueueStatus(req, res, user);
      default:
        return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    return handleError(res, error, 'email');
  }
}

/**
 * Queue a single email.
 * Any authenticated user can call this action.
 * Validates recipient, subject, body. Optionally renders HTML from a template.
 */
async function handleSend(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin role for sending emails (Req 9.2)
  const isAdminUser = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdminUser) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  const parsed = validateBody(sendEmailBodySchema, req, res);
  if (!parsed) return;

  const { recipient_email, recipient_name, subject, body, template_name, template_data, priority } = parsed;

  try {
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

    // Audit trail for email queue (Requirement 8.4)
    try {
      await logAuditEvent({
        actor_id: user.userId,
        action: 'email_queued',
        entity_type: 'email',
        entity_id: result.rows[0]?.id,
        changes: { template: template_name || 'custom', priority: priority ?? 5 },
      });
    } catch { /* non-blocking */ }

    return sendSuccess(res, { queued: true, id: result.rows[0]?.id });
  } catch (error) {
    return handleError(res, error, 'email/send');
  }
}

/**
 * Process pending emails from the queue via Resend API.
 * Admin or super_admin only. Processes up to 10 emails per call.
 */
async function handleProcessQueue(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin role (Req 9.2)
  const isAdminUser = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdminUser) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  if (!process.env.RESEND_API_KEY) {
    return sendError(res, 'RESEND_API_KEY is not configured', HttpStatus.SERVICE_UNAVAILABLE);
  }

  try {
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

    // Audit trail for email processing (Requirement 8.4)
    try {
      await logAuditEvent({
        actor_id: user.userId,
        action: 'admin_email_process_queue',
        entity_type: 'email',
        entity_id: null,
        changes: { processed: pending.rows.length, sent, failed },
      });
    } catch { /* non-blocking */ }

    return sendSuccess(res, { processed: pending.rows.length, sent, failed });
  } catch (error) {
    return handleError(res, error, 'email/process-queue');
  }
}

/**
 * Reset all failed emails back to pending for reprocessing.
 * Admin or super_admin only.
 */
async function handleRetryFailed(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin role (Req 9.2)
  const isAdminUser = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdminUser) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  try {
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

    // Audit trail for email retry (Requirement 8.4)
    try {
      await logAuditEvent({
        actor_id: user.userId,
        action: 'admin_email_retry_failed',
        entity_type: 'email',
        entity_id: null,
        changes: { reset_count: resetCount },
      });
    } catch { /* non-blocking */ }

    return sendSuccess(res, { reset: resetCount });
  } catch (error) {
    return handleError(res, error, 'email/retry-failed');
  }
}

/**
 * Get email queue counts grouped by status.
 * Admin or super_admin only.
 */
async function handleQueueStatus(req: VercelRequest, res: VercelResponse, user: AuthContext) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin role (Req 9.2)
  const isAdminUser = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdminUser) {
    return sendError(res, 'Insufficient permissions', HttpStatus.FORBIDDEN, 'INSUFFICIENT_PERMISSIONS');
  }

  try {
    const result = await query<{ status: string; count: string }>(
      `SELECT status, COUNT(*)::text AS count FROM email_queue GROUP BY status`
    );

    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.status] = parseInt(row.count, 10);
    }

    return sendSuccess(res, { counts });
  } catch (error) {
    return handleError(res, error, 'email/queue-status');
  }
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
