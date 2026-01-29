import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from '../_lib/errorHandler';

/**
 * GET/POST /api/notifications/preferences
 * Manage user notification preferences
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  const auth = await getUserFromRequest(req);
  if ('error' in auth) {
    return sendError(res, auth.error, HttpStatus.UNAUTHORIZED);
  }

  try {
    // GET - Fetch user preferences
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('notification_preferences')
        .select('*')
        .eq('user_id', auth.user.id)
        .maybeSingle();

      if (error) {
        return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      }

      // Return default preferences if none exist
      const preferences = data || {
        user_id: auth.user.id,
        email_enabled: true,
        push_enabled: true,
        in_app_enabled: true,
        quiet_hours_start: null,
        quiet_hours_end: null,
      };

      return sendSuccess(res, { preferences });
    }

    // POST - Update preferences
    if (req.method === 'POST') {
      const {
        email_enabled,
        push_enabled,
        in_app_enabled,
        quiet_hours_start,
        quiet_hours_end,
      } = req.body;

      const updateData: Record<string, unknown> = {
        user_id: auth.user.id,
        updated_at: new Date().toISOString(),
      };

      if (email_enabled !== undefined) updateData.email_enabled = email_enabled;
      if (push_enabled !== undefined) updateData.push_enabled = push_enabled;
      if (in_app_enabled !== undefined) updateData.in_app_enabled = in_app_enabled;
      if (quiet_hours_start !== undefined) updateData.quiet_hours_start = quiet_hours_start;
      if (quiet_hours_end !== undefined) updateData.quiet_hours_end = quiet_hours_end;

      const { data, error } = await supabaseAdmin
        .from('notification_preferences')
        .upsert(updateData, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        return sendError(res, error.message, HttpStatus.BAD_REQUEST);
      }

      console.log('[preferences] Updated for user:', auth.user.id);
      return sendSuccess(res, { preferences: data });
    }

    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, 'notifications/preferences');
  }
}
