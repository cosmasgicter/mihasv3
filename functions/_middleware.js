// Rate limiting for slip generation endpoints
const RATE_LIMITS = {
  '/applications/generate/slip': { requests: 10, window: 60000 }, // 10 per minute
  '/applications/email/slip': { requests: 5, window: 60000 }, // 5 per minute
  '/applications/batch/slips': { requests: 2, window: 300000 }, // 2 per 5 minutes
};

const rateLimitStore = new Map();

function getRateLimitKey(userId, path) {
  return `${userId}:${path}`;
}

function checkRateLimit(userId, path) {
  const limit = RATE_LIMITS[path];
  if (!limit) return { allowed: true };

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
      resetTime,
      retryAfter: Math.ceil((resetTime - now) / 1000)
    };
  }

  validRequests.push(now);
  rateLimitStore.set(key, validRequests);

  return {
    allowed: true,
    remaining: limit.requests - validRequests.length,
    resetTime: now + limit.window
  };
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Only apply rate limiting to slip endpoints
  if (path.includes('/applications/') && (path.includes('/slip') || path.includes('/slips'))) {
    try {
      // Extract user ID from Authorization header
      const authHeader = request.headers.get('Authorization');
      if (!authHeader) {
        return next();
      }

      const token = authHeader.replace('Bearer ', '');
      // Simple user ID extraction (in production, verify JWT)
      const userId = token.split('.')[1]; // Simplified - use proper JWT decode

      const rateLimit = checkRateLimit(userId, path);

      if (!rateLimit.allowed) {
        return new Response(JSON.stringify({
          error: 'Rate limit exceeded',
          retryAfter: rateLimit.retryAfter,
          message: `Too many requests. Please try again in ${rateLimit.retryAfter} seconds.`
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': rateLimit.retryAfter.toString(),
            'X-RateLimit-Limit': RATE_LIMITS[path].requests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString()
          }
        });
      }

      // Add rate limit headers to response
      const response = await next();
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-RateLimit-Limit', RATE_LIMITS[path].requests.toString());
      newHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
      newHeaders.set('X-RateLimit-Reset', new Date(rateLimit.resetTime).toISOString());

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (error) {
      console.error('Rate limit middleware error:', error);
      return next();
    }
  }

  return next();
}
