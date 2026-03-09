import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { query } from '../lib/db';
import { requireAuth, AuthenticationError, type AuthContext } from '../lib/auth/middleware';
import { isAdmin as isAdminRole } from '../lib/auth/ownership';
import { withArcjetProtection } from '../lib/arcjet';
import { USER_ROLES } from '../lib/queries';
import { handleError, sendSuccess, sendError, HttpStatus } from '../lib/errorHandler';
import { validateQuery } from '../lib/validation/middleware';
import { receiptQuerySchema } from '../lib/validation/payments';
import { logAuditEvent } from '../lib/auditLogger';
import { validateServerEnv } from '../lib/envValidator';

/**
 * Consolidated Payments API
 * 
 * MIGRATED: Uses custom auth middleware and database abstraction
 * PROTECTED: Arcjet rate limiting (replaces legacy rateLimiter)
 * 
 * GET /api/payments?action=receipt&applicationId=xxx - Generate receipt
 */
async function handler(req: VercelRequest, res: VercelResponse) {
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

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require authentication (Req 9.1)
  let user: AuthContext;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    throw error;
  }

  const isAdmin = isAdminRole(user.role);
  const action = req.query.action as string || 'receipt';

  try {
    if (action === 'receipt') {
      return await handleReceipt(req, res, user.userId, isAdmin);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'payments');
  }
}

async function handleReceipt(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  isAdmin: boolean
) {
  const parsed = validateQuery(receiptQuerySchema, req, res);
  if (!parsed) return;

  const applicationId = parsed.applicationId;

  try {
    // Fetch application
    const appQ = {
      text: `SELECT * FROM applications WHERE id = $1 LIMIT 1`,
      values: [applicationId],
    };
    const appResult = await query<{
      id: string;
      user_id: string;
      application_number: string;
      full_name: string;
      email: string;
      phone: string;
      program: string;
      institution: string;
      amount: number;
      payment_method: string;
      momo_ref: string;
      paid_at: string;
      payment_status: string;
      payment_verified_at: string;
      payment_verified_by: string;
      receipt_number: string;
      created_at: string;
    }>(appQ.text, appQ.values);

    if (appResult.rowCount === 0) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    const application = appResult.rows[0];

    // Check access
    if (!isAdmin && application.user_id !== userId) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }

    if (application.payment_status !== 'verified') {
      return sendError(res, 'Payment not verified', HttpStatus.BAD_REQUEST);
    }

    // Generate receipt number if not exists
    let receiptNumber = application.receipt_number;
    if (!receiptNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      receiptNumber = `RCP-${timestamp}-${random}`;

      const updateQ = {
        text: `UPDATE applications SET receipt_number = $1 WHERE id = $2`,
        values: [receiptNumber, applicationId],
      };
      await query(updateQ.text, updateQ.values);
    }

    // Get verifier name
    let verifierName = 'System';
    if (application.payment_verified_by) {
      const verifierQ = {
        text: `SELECT first_name, last_name FROM profiles WHERE id = $1 LIMIT 1`,
        values: [application.payment_verified_by],
      };
      const verifierResult = await query<{ first_name: string; last_name: string }>(verifierQ.text, verifierQ.values);
      const v = verifierResult.rows[0];
      if (v) {
        verifierName = [v.first_name, v.last_name].filter(Boolean).join(' ') || 'System';
      }
    }

    const receiptData = {
      receiptNumber,
      applicationNumber: application.application_number,
      studentName: application.full_name,
      email: application.email,
      phone: application.phone,
      program: application.program,
      institution: application.institution || 'MIHAS',
      amount: application.amount || 153,
      paymentMethod: application.payment_method,
      paymentReference: application.momo_ref,
      paymentDate: application.paid_at || application.created_at,
      verifiedDate: application.payment_verified_at,
      verifiedBy: verifierName,
    };

    console.log('[payments/receipt] Receipt generated:', receiptNumber);

    await logAuditEvent({
      actor_id: userId,
      action: 'receipt_generated',
      entity_type: 'application',
      entity_id: applicationId,
      changes: { receipt_number: receiptNumber },
    });

    return sendSuccess(res, receiptData);
  } catch (error) {
    return handleError(res, error, 'payments/receipt');
  }
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
