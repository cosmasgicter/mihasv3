/**
 * Arcjet Security Middleware
 * 
 * Provides:
 * - Shield protection (attack detection)
 * - Bot detection
 * - Rate limiting per route
 * 
 * FIXED: Type-safe implementation for @arcjet/node v1.0.0
 */

import arcjet, { shield, detectBot, fixedWindow, type ArcjetContext } from "@arcjet/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Rate limit configurations per route type
const RATE_LIMITS = {
  auth: { max: 5, window: 300 },      // 5 requests per 5 minutes
  session: { max: 30, window: 600 },  // 30 requests per 10 minutes  
  admin: { max: 20, window: 600 },    // 20 requests per 10 minutes
  default: { max: 100, window: 600 }, // 100 requests per 10 minutes
} as const;

type RouteType = keyof typeof RATE_LIMITS;

/**
 * Get Arcjet client with proper configuration
 * FIXED: Properly typed for v1.0.0 API
 */
function getArcjetClient(routeType: RouteType = "default") {
  const limits = RATE_LIMITS[routeType] || RATE_LIMITS.default;
  
  return arcjet({
    key: process.env.ARCJET_KEY || "ajtest_placeholder",
    rules: [
      // Shield - attack protection
      shield({ mode: "LIVE" }),
      // Bot detection - block automated clients but allow search engines
      detectBot({ 
        mode: "LIVE",
        deny: ["AUTOMATED", "BOT"],
        allow: ["CATEGORY:SEARCH_ENGINE"]
      }),
      // Rate limiting
      fixedWindow({
        mode: "LIVE",
        max: limits.max,
        window: `${limits.window}s`,
      }),
    ],
  });
}

/**
 * Arcjet protection wrapper for API handlers
 * FIXED: Proper typing for Arcjet v1.0.0
 * 
 * @param req - VercelRequest
 * @param res - VercelResponse  
 * @param routeType - Type of route for rate limiting
 * @returns boolean - true if allowed, false if blocked
 */
export async function withArcjetProtection(
  req: VercelRequest,
  res: VercelResponse,
  routeType: RouteType = "default"
): Promise<boolean> {
  try {
    const client = getArcjetClient(routeType);
    
    // Create a minimal context for Arcjet
    const context: ArcjetContext = {
      getBody: async () => req.body,
      headers: new Headers(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
      method: req.method || "GET",
      url: new URL(req.url || "/", `https://${req.headers.host || "localhost"}`),
    };
    
    const decision = await client.protect(context);
    
    if (decision.isDenied()) {
      const reason = decision.reason;
      console.warn(`[ARCJET] Request blocked: ${reason?.type || "unknown"}`);
      
      res.status(403).json({
        error: "Access denied",
        code: "SECURITY_VIOLATION",
        reason: reason?.type || "unknown",
      });
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("[ARCJET] Protection error:", error);
    // Fail open - allow request if Arcjet fails
    return true;
  }
}

/**
 * Legacy export for compatibility
 * @deprecated Use withArcjetProtection instead
 */
export async function arcjetProtect(
  req: VercelRequest,
  res: VercelResponse,
  routeType: RouteType = "default"
): Promise<boolean> {
  return withArcjetProtection(req, res, routeType);
}

export default withArcjetProtection;
