import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';
import { applyRateLimit } from './_lib/rateLimiter';

/**
 * Consolidated Payments API
 * GET /api/payments?action=receipt&applicationId=xxx - Generate receipt
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (applyRateLimit(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  const action = req.query.action as string || 'receipt';

  try {
    if (action === 'receipt') {
      return handleReceipt(req, res, auth);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'payments');
  }
}

async function handleReceipt(req: VercelRequest, res: VercelResponse, auth: { user: { id: string }; isAdmin: boolean }) {
  const applicationId = req.query.applicationId as string;

  if (!applicationId) {
    return sendError(res, 'Application ID required', HttpStatus.BAD_REQUEST);
  }

  const { data: application, error: appError } = await supabaseAdmin
    .from('applications')
    .select('*')
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
  }

  if (!auth.isAdmin && application.user_id !== auth.user.id) {
    return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
  }

  if (application.payment_status !== 'verified') {
    return sendError(res, 'Payment not verified', HttpStatus.BAD_REQUEST);
  }

  let receiptNumber = application.receipt_number;
  if (!receiptNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    receiptNumber = `RCP-${timestamp}-${random}`;

    await supabaseAdmin
      .from('applications')
      .update({ receipt_number: receiptNumber })
      .eq('id', applicationId);
  }

  let verifierName = 'System';
  if (application.payment_verified_by) {
    const { data: verifier } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', application.payment_verified_by)
      .single();

    if (verifier?.full_name) {
      verifierName = verifier.full_name;
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
