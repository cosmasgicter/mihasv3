import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from '../lib/cors';
import { setSecurityHeaders } from '../lib/securityHeaders';
import { withArcjetProtection } from '../lib/arcjet';
import { sendError, HttpStatus, ErrorCode } from '../lib/errorHandler';

/**
 * Catch-All 404 Handler for Non-Existent API Routes
 * 
 * This handler catches any requests to `/api/*` paths that don't match
 * existing serverless functions and returns a proper JSON 404 response.
 * 
 * Without this handler, Vercel would return the SPA index.html for
 * non-existent API routes, which is incorrect behavior.
 * 
 * Security: Does not reveal internal routing info, file paths, or
 * available endpoints in error responses (Req 13.4).
 * 
 * @example Request to non-existent route:
 * GET /api/nonexistent
 * 
 * @example Response:
 * HTTP 404
 * {
 *   "success": false,
 *   "error": "Not found",
 *   "code": "NOT_FOUND"
 * }
 * 
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 8.1, 8.2, 8.3, 8.4
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Handle CORS preflight requests
  if (handleCors(req, res)) return;

  // Apply security headers (Req 8.1, 8.2, 8.3, 8.4)
  setSecurityHeaders(res);

  // Generic 404 — do NOT reveal internal routing info, file paths,
  // or available endpoints (Req 13.4)
  sendError(res, 'Not found', HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
}

// Wrap with Arcjet protection to prevent route-probing abuse (Req 13.2)
export default withArcjetProtection(handler, 'general');
