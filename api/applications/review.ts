import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * GET/POST /api/applications/review
 * Admin application review operations
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Require admin access
  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    // GET - List applications pending review
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('applications')
        .select('*')
        .eq('status', 'submitted')
        .order('submitted_at', { ascending: true });

      if (error) {
        return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      }

      return sendSuccess(res, data || []);
    }

    // POST - Review an application
    if (req.method === 'POST') {
      const { application_id, status, notes } = req.body;

      if (!application_id || !status) {
        return sendError(res, 'application_id and status are required', HttpStatus.BAD_REQUEST);
      }

      const { data, error } = await supabaseAdmin
        .from('applications')
        .update({
          status,
          reviewed_by: auth.user.id,
          reviewed_at: new Date().toISOString(),
          review_notes: notes,
        })
        .eq('id', application_id)
        .select()
        .single();

      if (error) {
        return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      }

      // Log status change
      await supabaseAdmin.from('application_status_history').insert({
        application_id,
        status,
        changed_by: auth.user.id,
        notes,
      });

      console.log('[review] Application reviewed:', application_id, status);
      return sendSuccess(res, { application: data });
    }

    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, 'applications/review');
  }
}
