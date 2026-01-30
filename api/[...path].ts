import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { sendError, HttpStatus, ErrorCode } from './_lib/errorHandler';

/**
 * Catch-All 404 Handler for Non-Existent API Routes
 * 
 * This handler catches any requests to `/api/*` paths that don't match
 * existing serverless functions and returns a proper JSON 404 response.
 * 
 * Without this handler, Vercel would return the SPA index.html for
 * non-existent API routes, which is incorrect behavior.
 * 
 * @example Request to non-existent route:
 * GET /api/nonexistent
 * 
 * @example Response:
 * HTTP 404
 * {
 *   "success": false,
 *   "error": "API endpoint not found",
 *   "code": "NOT_FOUND"
 * }
 * 
 * Validates: Requirements 1.5, 6.4
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight requests
  if (handleCors(req, res)) return;

  // Extract the requested path for logging (without PII)
  const requestedPath = req.url || 'unknown';
  
  // Log the 404 for monitoring (no PII in path)
  console.warn(`[api/404] Route not found: ${requestedPath}`);

  // Return consistent JSON 404 error response
  return sendError(
    res,
    'API endpoint not found',
    HttpStatus.NOT_FOUND,
    ErrorCode.NOT_FOUND
  );
}
