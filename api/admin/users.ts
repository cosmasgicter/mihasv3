import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * GET /api/admin/users
 * List all users with pagination (admin only)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  // Require admin access
  const auth = await getUserFromRequest(req, { requireAdmin: true });
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    // Parse pagination parameters
    let page = parseInt(req.query.page as string || '1', 10);
    let limit = parseInt(req.query.limit as string || '50', 10);

    // Validate parameters
    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 50;
    if (limit > 100) limit = 100; // Cap limit

    const offset = (page - 1) * limit;

    const { data, count, error } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return sendError(res, error.message, HttpStatus.BAD_REQUEST);
    }

    // Map id to user_id for frontend compatibility
    const users = (data || []).map((user) => ({
      ...user,
      user_id: user.id,
    }));

    // No cache for user data
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    return sendSuccess(res, {
      data: users,
      meta: {
        page,
        limit,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    return handleError(res, error, 'admin/users');
  }
}
