import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';
import { applyRateLimit } from '../_lib/rateLimiter';

/**
 * GET /api/payments/generate-receipt
 * Generate payment receipt for a verified application
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Apply rate limiting for receipt generation
  if (applyRateLimit(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    const applicationId = req.query.applicationId as string;

    if (!applicationId) {
      return sendError(res, 'Application ID required', HttpStatus.BAD_REQUEST);
    }

    // Fetch application
    const { data: application, error: appError } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return sendError(res, 'Application not found', HttpStatus.NOT_FOUND);
    }

    // Check access
    if (!auth.isAdmin && application.user_id !== auth.user.id) {
      return sendError(res, 'Access denied', HttpStatus.FORBIDDEN);
    }

    // Verify payment status
    if (application.payment_status !== 'verified') {
      return sendError(res, 'Payment not verified', HttpStatus.BAD_REQUEST);
    }

    // Generate receipt number if not exists
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

    // Get verifier name
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

    console.log('[generate-receipt] Receipt generated:', receiptNumber);
    return sendSuccess(res, receiptData);
  } catch (error) {
    return handleError(res, error, 'payments/generate-receipt');
  }
}
