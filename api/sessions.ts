import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { supabaseAdmin, getUserFromRequest } from './_lib/supabaseClient';
import { handleError, sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Consolidated Sessions API
 * POST /api/sessions?action=track - Track device session
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const authResult = await getUserFromRequest(req);
  if ('error' in authResult) {
    return sendError(res, authResult.error, HttpStatus.UNAUTHORIZED);
  }

  const action = req.query.action as string || 'track';

  try {
    if (action === 'track') {
      return handleTrack(req, res, authResult);
    }
    return sendError(res, 'Invalid action', HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, 'sessions');
  }
}

async function handleTrack(req: VercelRequest, res: VercelResponse, authResult: { user: { id: string } }) {
  const { user } = authResult;
  const { device_id, device_info } = req.body || {};

  if (!device_id) {
    return sendError(res, 'device_id required', HttpStatus.BAD_REQUEST);
  }

  const authHeader = req.headers.authorization || req.headers.Authorization as string || '';
  const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  const { error } = await supabaseAdmin
    .from('device_sessions')
    .upsert({
      user_id: user.id,
      device_id,
      device_info: device_info || 'Unknown',
      session_token: sessionToken,
      last_activity: new Date().toISOString(),
      is_active: true,
    }, { onConflict: 'user_id,device_id' });

  if (error) {
    console.error('[sessions/track] Database error:', error.message);
    return sendError(res, 'Failed to track session', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  return sendSuccess(res, { tracked: true });
}
