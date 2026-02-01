import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Rate limit configuration for specific endpoints
 */
interface RateLimitConfig {
  requests: number;  // Max requests allowed
  window: number;    // Time window in milliseconds
}

/**
 * Rate limit check result
 */
interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  resetTime?: number;
  retryAfter?: number;
}

/**
 * Rate limits for slip generation endpoints
 * These are critical to prevent abuse of PDF generation
 */
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  '/api/applications/generate/slip': { requests: 10, window: 60000 },    // 10 per minute
  '/api/applications/email/slip': { requests: 5, window: 60000 },        // 5 per minute
  '/api/applications/batch/slips': { requests: 2, window: 300000 },      // 2 per 5 minutes
  '/api/payments/generate-receipt': { requests: 10, window: 60000 },     // 10 per minute
};

/**
 * In-memory rate limit store
 * Note: In serverless, this resets per instance. For production scale,
 * consider using Vercel KV or Upstash Redis.
 */
const rateLimitStore = new Map<string, number[]>();

/**
 * Generate rate limit key from user ID and path
 */
function getRateLimitKey(userId: string, path: string): string {
  return `${userId}:${path}`;
}

/**
 * Extract user ID from request authorization header
 * Returns IP address as fallback for unauthenticated requests
 */
function extractUserId(req: VercelRequest): string {
  const authHeader = req.headers.authorization;
  
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      try {
        // Extract user ID from JWT payload (sub claim)
        const parts = token.split('.');
        if (parts.length === 3) {
          // Bun-compatible Base64 URL-safe decoding
          let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          const padding = base64.length % 4;
          if (padding) {
            base64 += '='.repeat(4 - padding);
          }
          const binaryString = atob(base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const decoded = new TextDecoder().decode(bytes);
          const payload = JSON.parse(decoded);
          if (payload.sub) {
            return payload.sub;
          }
        }
      } catch {
        // Fall through to IP-based limiting
      }
    }
  }

  // Fallback to IP address
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' 
    ? forwarded.split(',')[0].trim() 
    : req.socket?.remoteAddress || 'unknown';
  
  return `ip:${ip}`;
}

/**
 * Check if a request is within rate limits
 * 
 * @param userId - User identifier (from JWT or IP)
 * @param path - Request path
 * @returns Rate limit result
 */
function checkRateLimit(userId: string, path: string): RateLimitResult {
  // Find matching rate limit config
  const limit = Object.entries(RATE_LIMITS).find(([pattern]) => 
    path.includes(pattern.replace('/api', ''))
  )?.[1];

  if (!limit) {
    return { allowed: true };
  }

  const key = getRateLimitKey(userId, path);
  const now = Date.now();
  const userRequests = rateLimitStore.get(key) || [];

  // Remove expired requests
  const validRequests = userRequests.filter(timestamp => now - timestamp < limit.window);

  if (validRequests.length >= limit.requests) {
    const oldestRequest = Math.min(...validRequests);
    const resetTime = oldestRequest + limit.window;
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      retryAfter: Math.ceil((resetTime - now) / 1000),
    };
  }

  // Record this request
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);

  return {
    allowed: true,
    remaining: limit.requests - validRequests.length,
    resetTime: now + limit.window,
  };
}

/**
 * Apply rate limiting to a request.
 * Returns true if rate limited (caller should return early).
 * 
 * @param req - Vercel request object
 * @param res - Vercel response object
 * @returns true if rate limited, false if allowed
 * 
 * @example
 * ```typescript
 * export default async function handler(req: VercelRequest, res: VercelResponse) {
 *   if (handleCors(req, res)) return;
 *   if (applyRateLimit(req, res)) return;
 *   
 *   // ... handler logic
 * }
 * ```
 */
export function applyRateLimit(req: VercelRequest, res: VercelResponse): boolean {
  const path = req.url || '';
  
  // Only rate limit slip/receipt generation endpoints
  const isRateLimitedPath = path.includes('/slip') || 
                            path.includes('/slips') || 
                            path.includes('/receipt');
  
  if (!isRateLimitedPath) {
    return false;
  }

  const userId = extractUserId(req);
  const result = checkRateLimit(userId, path);

  if (!result.allowed) {
    res.setHeader('Retry-After', result.retryAfter?.toString() || '60');
    res.setHeader('X-RateLimit-Remaining', '0');
    if (result.resetTime) {
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    }

    res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      retryAfter: result.retryAfter,
      message: `Too many requests. Please try again in ${result.retryAfter} seconds.`,
    });

    return true;
  }

  // Add rate limit headers to response
  if (result.remaining !== undefined) {
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  }
  if (result.resetTime) {
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
  }

  return false;
}

/**
 * Get rate limit configuration for a path
 * Useful for testing or displaying limits to users
 */
export function getRateLimitConfig(path: string): RateLimitConfig | null {
  const entry = Object.entries(RATE_LIMITS).find(([pattern]) => 
    path.includes(pattern.replace('/api', ''))
  );
  return entry ? entry[1] : null;
}

/**
 * Clear rate limit store (useful for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
