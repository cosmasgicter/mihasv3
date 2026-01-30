/**
 * Device Session Tracking
 * POST /api/sessions/track - Track device sessions for multi-device support
 * 
 * Migrated from functions/api/sessions/track.js for Vercel deployment
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../_lib/cors';
import { supabaseAdmin, getUserFromRequest } from '../_lib/supabaseClient';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Get authenticated user
    const authResult = await getUserFromRequest(req);
    if ('error' in authResult) {
      return res.status(401).json({ success: false, error: authResult.error });
    }

    const { user } = authResult;
    const { device_id, device_info } = req.body || {};

    // Validate required fields
    if (!device_id) {
      return res.status(400).json({ success: false, error: 'device_id required' });
    }

    // Get session token from auth header
    const authHeader = req.headers.authorization || req.headers.Authorization as string || '';
    const sessionToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Upsert device session
    const { error } = await supabaseAdmin
      .from('device_sessions')
      .upsert({
        user_id: user.id,
        device_id,
        device_info: device_info || 'Unknown',
        session_token: sessionToken,
        last_activity: new Date().toISOString(),
        is_active: true
      }, {
        onConflict: 'user_id,device_id'
      });

    if (error) {
      console.error('[sessions/track] Database error:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to track session' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[sessions/track] Error:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
