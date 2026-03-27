import type { VercelResponse } from '@vercel/node';

interface SecurityHeaderOptions {
  /** Override default 'no-store' cache control. E.g., 'public, max-age=300' for cacheable data */
  cacheControl?: string;
}

/**
 * Apply standard security headers to all API responses.
 * Called after CORS handling, before any business logic.
 *
 * Headers applied:
 * - X-Content-Type-Options: nosniff
 * - X-Frame-Options: DENY
 * - Cache-Control: no-store (overridable)
 * - Referrer-Policy: strict-origin-when-cross-origin
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.7
 */
export function setSecurityHeaders(res: VercelResponse, options?: SecurityHeaderOptions): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', options?.cacheControl ?? 'no-store');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
}
