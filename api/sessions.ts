import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';

/**
 * Consolidated Sessions API - TEMPORARILY DISABLED
 * 
 * CRITICAL FIX: This endpoint is non-critical and was causing issues.
 * Short-circuited until auth is stable.
 * 
 * POST /api/sessions?action=track - Track device session (DISABLED)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set JSON content type for all responses
  res.setHeader('Content-Type', 'application/json');
  
  if (handleCors(req, res)) return;

  // Handle HEAD requests for health checks (no auth required)
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  // CRITICAL FIX: Short-circuit all session tracking until auth is stable
  // Return 204 No Content - success but no body
  return res.status(204).end();
}
