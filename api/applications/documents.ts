import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * GET /api/applications/documents
 * List application documents
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('application_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return sendError(res, error.message, HttpStatus.BAD_REQUEST);
    }

    return sendSuccess(res, data || []);
  } catch (error) {
    return handleError(res, error, 'applications/documents');
  }
}
