/**
 * Auth Session Logging
 * POST /api/auth/session - Log login/logout events
 * 
 * Migrated from functions/api/auth/session.js for Vercel deployment
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
    const { action } = req.body || {};

    // Validate action
    if (!action || !['login', 'logout'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    // Get authenticated user
    const authResult = await getUserFromRequest(req);
    if ('error' in authResult) {
      return res.status(401).json({ success: false, error: authResult.error });
    }

    const { user } = authResult;

    // Get IP and user agent for audit log (no PII)
    const ipAddress = 
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers['x-real-ip'] as string) ||
      'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log to audit_logs table
    const { error: auditError } = await supabaseAdmin
      .from('audit_logs')
      .insert({
        actor_id: user.id,
        action: action === 'login' ? 'user_login' : 'user_logout',
        entity_type: 'user',
        entity_id: user.id,
        changes: { action },
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: new Date().toISOString()
      });

    if (auditError) {
      // Log error but don't fail - audit logging is non-critical
      console.error('[session] Audit log error:', auditError.message);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[session] Error:', error instanceof Error ? error.message : 'Unknown error');
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
