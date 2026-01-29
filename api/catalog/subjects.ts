import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * GET /api/catalog/subjects
 * List all subjects
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('subjects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return sendError(res, error.message, HttpStatus.BAD_REQUEST);
    }

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 'public, max-age=300');

    return sendSuccess(res, { subjects: data || [] });
  } catch (error) {
    return handleError(res, error, 'catalog/subjects');
  }
}
