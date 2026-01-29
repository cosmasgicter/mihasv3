import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Allowed origins for CORS requests.
 * - Production: mihas.vercel.app
 * - Development: localhost on common ports
 */
const ALLOWED_ORIGINS = [
  'https://mihas.vercel.app',
  'http://localhost:5173',  // Vite dev server
  'http://localhost:3000',  // Alternative dev port
];

/**
 * Get CORS headers for a given origin.
 * If the origin is in the allowed list, it's returned as the allowed origin.
 * Otherwise, the first allowed origin (production) is used.
 * 
 * @param origin - The request origin header
 * @returns CORS headers object
 */
export function getCorsHeaders(origin: string | undefined): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

/**
 * Handle CORS for Vercel serverless functions.
 * Sets appropriate CORS headers on the response and handles OPTIONS preflight requests.
 * 
 * @param req - Vercel request object
 * @param res - Vercel response object
 * @returns true if this was an OPTIONS preflight request (caller should return early), false otherwise
 * 
 * @example
 * ```typescript
 * export default async function handler(req: VercelRequest, res: VercelResponse) {
 *   if (handleCors(req, res)) return; // Handle OPTIONS preflight
 *   
 *   // ... handler logic
 *   return res.status(200).json({ success: true, data: result });
 * }
 * ```
 */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  const headers = getCorsHeaders(origin);

  // Set CORS headers on the response
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }

  return false;
}

/**
 * Check if an origin is allowed for CORS.
 * Useful for validation or logging purposes.
 * 
 * @param origin - The origin to check
 * @returns true if the origin is in the allowed list
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  return origin !== undefined && ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get the list of allowed origins.
 * Useful for testing or configuration display.
 * 
 * @returns Array of allowed origin strings
 */
export function getAllowedOrigins(): readonly string[] {
  return ALLOWED_ORIGINS;
}
