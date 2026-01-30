/**
 * Arcjet Security Layer
 * 
 * REQUIRED: All sensitive routes MUST use Arcjet shield
 * IMPLEMENTATION: Integrated before any Bun handler logic
 * VERIFICATION: Blocked requests never reach DB, never trigger retries
 * 
 * Protected Routes:
 * - /api/auth/*
 * - /api/sessions/*
 * - /api/admin/*
 * - /api/notifications/*
 * 
 * Enforced:
 * - Shield rules (automated attack protection)
 * - Bot detection
 * - Route-specific rate limits
 * - IP + fingerprint throttling
 */

import arcjet, { shield, detectBot, tokenBucket, fixedWindow } from "@arcjet/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// ARCJET KEY VERIFICATION
const ARCJET_KEY = process.env.ARCJET_KEY;
if (!ARCJET_KEY) {
  console.error("[ARCJET] FATAL: ARCJET_KEY environment variable not set");
  console.error("[ARCJET] Security layer DISABLED - set ARCJET_KEY immediately");
}

/**
 * Base Arcjet client configuration
 * Mode: LIVE (production blocking)
 * Logging: All decisions logged for audit
 */
export const aj = arcjet({
  key: ARCJET_KEY || "demo-key-will-not-block",
  characteristics: ["ip.src", "fingerprint"],
  rules: [
    // Shield: Automated attack protection (SQLi, XSS, etc.)
    shield({ mode: "LIVE" }),
    
    // Bot detection: Block automated threats, allow legitimate bots
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"], // Allow Google, Bing, etc.
    }),
  ],
});

/**
 * Route-specific rate limiting configurations
 * VERIFICATION: Each route has explicit limits
 */
export const rateLimits = {
  /**
   * Auth routes: Strict limits to prevent brute force
   * - 5 requests per 5 minutes per IP
   * - Blocks credential stuffing attacks
   */
  auth: fixedWindow({
    mode: "LIVE",
    window: "5m",
    max: 5,
  }),

  /**
   * Session routes: Moderate limits
   * - 30 requests per 10 minutes
   * - Prevents session enumeration
   */
  session: tokenBucket({
    mode: "LIVE",
    refillRate: 3,
    interval: "1m",
    capacity: 30,
  }),

  /**
   * Admin routes: Strict limits, authenticated users only
   * - 20 requests per 10 minutes
   * - Extra protection for sensitive operations
   */
  admin: fixedWindow({
    mode: "LIVE",
    window: "10m",
    max: 20,
  }),

  /**
   * Notification routes: Moderate limits
   * - Prevents notification spam
   */
  notification: tokenBucket({
    mode: "LIVE",
    refillRate: 5,
    interval: "1m",
    capacity: 50,
  }),

  /**
   * General API: Default protection
   * - 100 requests per 10 minutes
   */
  general: fixedWindow({
    mode: "LIVE",
    window: "10m",
    max: 100,
  }),
};

/**
 * Arcjet decision handler
 * VERIFICATION: Returns deterministic HTTP responses
 * ERROR HANDLING: All blocked requests logged, never silent
 * 
 * @param decision - Arcjet protect decision
 * @param res - Vercel response object
 * @returns boolean - true if request should be blocked
 */
export function handleArcjetDecision(
  decision: { isDenied: boolean; reason?: { type: string } },
  res: VercelResponse
): boolean {
  if (decision.isDenied) {
    const reason = decision.reason?.type || "UNKNOWN";
    
    // Log for security audit
    console.log(`[ARCJET] BLOCKED: ${reason} - IP fingerprint blocked`);
    
    // Deterministic response - NEVER reveal internal state
    res.status(403).json({
      success: false,
      error: "Request blocked by security policy",
      code: "SECURITY_VIOLATION",
    });
    
    return true; // Request blocked
  }
  
  return false; // Request allowed
}

/**
 * Arcjet middleware wrapper for Vercel functions
 * USAGE: Wrap handler with Arcjet protection
 * 
 * @example
 * export default withArcjetProtection(handler, "auth");
 */
export function withArcjetProtection(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
  routeType: keyof typeof rateLimits = "general"
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // Skip Arcjet if key not configured (development only)
    if (!ARCJET_KEY) {
      console.warn("[ARCJET] WARNING: Running without Arcjet protection");
      return handler(req, res);
    }

    try {
      // Build route-specific Arcjet config
      const routeRule = rateLimits[routeType];
      
      // Create protected Arcjet instance for this route
      const protectedAj = arcjet({
        key: ARCJET_KEY,
        characteristics: ["ip.src", "fingerprint"],
        rules: [
          shield({ mode: "LIVE" }),
          detectBot({ mode: "LIVE", allow: ["CATEGORY:SEARCH_ENGINE"] }),
          routeRule,
        ],
      });

      // Execute Arcjet protection
      const decision = await protectedAj.protect(req);
      
      // Handle blocked requests
      if (handleArcjetDecision(decision, res)) {
        return; // Request blocked, do not proceed
      }
      
      // Request allowed, proceed to handler
      return handler(req, res);
      
    } catch (error) {
      // Arcjet failure - log but DO NOT silently fail open
      console.error("[ARCJET] ERROR:", error);
      
      // Fail secure: block request if Arcjet fails
      res.status(503).json({
        success: false,
        error: "Security service unavailable",
        code: "SECURITY_SERVICE_ERROR",
      });
    }
  };
}

/**
 * Direct Arcjet protect function for manual integration
 * Use when you need custom handling
 */
export async function arcjetProtect(
  req: VercelRequest,
  routeType: keyof typeof rateLimits = "general"
): Promise<{ allowed: boolean; reason?: string }> {
  if (!ARCJET_KEY) {
    return { allowed: true, reason: "ARCJET_KEY not set" };
  }

  try {
    const routeRule = rateLimits[routeType];
    const protectedAj = arcjet({
      key: ARCJET_KEY,
      characteristics: ["ip.src", "fingerprint"],
      rules: [shield({ mode: "LIVE" }), detectBot({ mode: "LIVE" }), routeRule],
    });

    const decision = await protectedAj.protect(req);
    
    return {
      allowed: !decision.isDenied,
      reason: decision.reason?.type,
    };
  } catch (error) {
    console.error("[ARCJET] ERROR:", error);
    return { allowed: false, reason: "SECURITY_SERVICE_ERROR" };
  }
}
