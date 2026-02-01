import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_utils/cors';
import { query } from './_utils/db';
import { getAuthUser } from './_utils/auth_middleware';
import { withArcjetProtection } from './_utils/arcjet';
import { USER_ROLES } from './_utils/queries';
import { handleError, sendSuccess, sendError, HttpStatus } from './_utils/errorHandler';

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

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
  }

  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  const action = req.query.action as string || 'receipt';

  try {
    if (action === 'receipt') {
      return handleReceipt(req, res, user.userId, isAdmin);
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
  const applicationId = req.query.applicationId as string;

  if (!applicationId) {
    return sendError(res, 'Application ID required', HttpStatus.BAD_REQUEST);
  }

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
      text: `SELECT full_name FROM profiles WHERE id = $1 LIMIT 1`,
      values: [application.payment_verified_by],
    };
    const verifierResult = await query<{ full_name: string }>(verifierQ.text, verifierQ.values);
    if (verifierResult.rows[0]?.full_name) {
      verifierName = verifierResult.rows[0].full_name;
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
  return sendSuccess(res, receiptData);
}

// Export with Arcjet protection
export default withArcjetProtection(handler, 'general');
