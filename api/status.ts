import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { sendSuccess, sendError, HttpStatus } from './_lib/errorHandler';

/**
 * Status Check API
 * GET /api/status - Returns API operational status
 * 
 * This is a lightweight endpoint for quick health checks
 * that doesn't require any external service calls.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight requests
  if (handleCors(req, res)) return;

  // Only allow GET requests
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED');
  }

  return sendSuccess(res, {
    status: 'operational',
    timestamp: new Date().toISOString(),
    service: 'mihas-api',
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'dev',
  });
}
