/**
 * Arcjet Security Layer
 * 
 * REQUIRED: All sensitive routes MUST use Arcjet shield
 * IMPLEMENTATION: Integrated before any Bun handler logic
 * VERIFICATION: Blocked requests never reach DB, never trigger retries
 * 
 * Protected Routes:
 * - /api/auth/* (5 req / 5 min)
 * - /api/sessions/* (30 req / 10 min)
 * - /api/admin/* (20 req / 10 min)
 * - /api/notifications/* (50 req / 10 min)
 * - General routes (100 req / 10 min)
 * 
 * Enforced:
 * - Shield rules (automated attack protection)
 * - Bot detection
 * - Route-specific rate limits
 * - IP throttling
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
 */

import arcjet, { shield, detectBot, fixedWindow } from "@arcjet/node";
import type { ArcjetDecision } from "@arcjet/node";
import type { VercelRequest, VercelResponse } from "@vercel/node";

// Route type for rate limiting configuration
export type RouteType = "auth" | "session" | "admin" | "notification" | "general";

// Protected handler type - allows returning VercelResponse or void
export type ProtectedHandler = (req: VercelRequest, res: VercelResponse) => Promise<VercelResponse | void>;

// ARCJET KEY VERIFICATION
const ARCJET_KEY = process.env.ARCJET_KEY;
if (!ARCJET_KEY) {
  console.error("[ARCJET] FATAL: ARCJET_KEY environment variable not set");
  console.error("[ARCJET] Security layer DISABLED - set ARCJET_KEY immediately");
}


/**
 * Route-specific rate limiting configurations
 * Requirements: 2.7 - Route-specific rate limits
 * 
 * Note: Using fixedWindow for all routes for simplicity and consistency.
 * 
 * VERIFICATION: Each route has explicit limits
 */
export const rateLimitConfigs = {
  /**
   * Auth routes: Strict limits to prevent brute force
   * - 5 requests per 5 minutes per IP
   * - Blocks credential stuffing attacks
   * Requirement: 2.7 (auth routes: 5 requests per 5 minutes)
   */
  auth: { window: "5m", max: 5 },

  /**
   * Session routes: Moderate limits
   * - 30 requests per 10 minutes
   * - Prevents session enumeration
   * Requirement: 2.7 (session routes: 30 per 10 minutes)
   */
  session: { window: "10m", max: 30 },

  /**
   * Admin routes: Strict limits, authenticated users only
   * - 20 requests per 10 minutes
   * - Extra protection for sensitive operations
   * Requirement: 2.7 (admin routes: 20 per 10 minutes)
   */
  admin: { window: "10m", max: 20 },

  /**
   * Notification routes: Moderate limits
   * - 50 requests per 10 minutes
   * - Prevents notification spam
   * Design spec: notification (50 req / 10 min)
   */
  notification: { window: "10m", max: 50 },

  /**
   * General API: Default protection
   * - 100 requests per 10 minutes
   * Design spec: general (100 req / 10 min)
   */
  general: { window: "10m", max: 100 },
} as const;


/**
 * Get block reason type for logging
 * Requirement: 2.6 - Log block reason without exposing internal state
 * 
 * @param decision - Arcjet decision object
 * @returns Sanitized reason string for logging
 */
function getBlockReasonType(decision: ArcjetDecision): string {
  if (decision.reason.isRateLimit()) {
    return "RATE_LIMIT";
  }
  if (decision.reason.isBot()) {
    return "BOT_DETECTED";
  }
  if (decision.reason.isShield()) {
    return "SHIELD_BLOCK";
  }
  return "POLICY_VIOLATION";
}

/**
 * Arcjet decision handler
 * Requirements: 2.5, 2.6, 2.9
 * - 2.5: Return 403 with code "SECURITY_VIOLATION" on block
 * - 2.6: Log block reason without exposing internal state
 * - 2.9: Blocked requests never reach database
 * 
 * VERIFICATION: Returns deterministic HTTP responses
 * ERROR HANDLING: All blocked requests logged, never silent
 * 
 * @param decision - Arcjet protect decision
 * @param res - Vercel response object
 * @returns boolean - true if request should be blocked
 */
export function handleArcjetDecision(
  decision: ArcjetDecision,
  res: VercelResponse
): boolean {
  if (decision.isDenied()) {
    const reasonType = getBlockReasonType(decision);
    
    // Log for security audit without exposing internal state
    // Requirement: 2.6 - Log block reason for security audit
    console.log("[ARCJET] BLOCKED: reason=" + reasonType + ", id=" + decision.id);
    
    // Deterministic response - NEVER reveal internal state
    // Requirement: 2.5 - Return 403 with code "SECURITY_VIOLATION"
    res.status(403).json({
      success: false,
      error: "Request blocked by security policy",
      code: "SECURITY_VIOLATION",
    });
    
    return true; // Request blocked - never reaches database (Requirement 2.9)
  }
  
  return false; // Request allowed
}


/**
 * Create a protected Arcjet instance for a specific route type
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.10
 * - Shield rules for attack protection
 * - Bot detection
 * - Route-specific rate limits
 * - IP throttling
 * 
 * @param routeType - The type of route for rate limiting
 * @returns Arcjet instance configured for the route
 */
function createProtectedArcjet(routeType: RouteType) {
  const config = rateLimitConfigs[routeType];
  
  return arcjet({
    key: ARCJET_KEY!,
    // Requirement: 2.10 - Use IP address for throttling
    characteristics: ["ip.src"],
    rules: [
      // Requirement: 2.1-2.4 - Shield rules for attack protection
      shield({ mode: "LIVE" }),
      // Bot detection - allow legitimate search engine bots
      detectBot({
        mode: "LIVE",
        allow: ["CATEGORY:SEARCH_ENGINE"],
      }),
      // Route-specific rate limit using fixedWindow
      fixedWindow({
        mode: "LIVE",
        window: config.window,
        max: config.max,
      }),
    ],
  });
}


/**
 * Arcjet middleware wrapper for Vercel functions
 * Requirements: 2.1-2.10
 * 
 * USAGE: Wrap handler with Arcjet protection
 * 
 * @example
 * export default withArcjetProtection(handler, "auth");
 * 
 * @param handler - The handler function to protect
 * @param routeType - The type of route for rate limiting configuration
 * @returns Protected handler function
 */
export function withArcjetProtection(
  handler: ProtectedHandler,
  routeType: RouteType = "general"
): ProtectedHandler {
  return async (req: VercelRequest, res: VercelResponse): Promise<VercelResponse | void> => {
    // CRITICAL: Handle OPTIONS preflight requests BEFORE Arcjet
    // This prevents CORS preflight from being blocked as "bot"
    if (req.method === 'OPTIONS') {
      // Set CORS headers for preflight
      const origin = req.headers.origin as string | undefined;
      const allowedOrigins = [
        'https://apply.mihas.edu.zm',
        'https://mihas.vercel.app',
        'http://localhost:5173',
        'http://localhost:3000',
      ];
      const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
      
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }

    // Skip Arcjet if key not configured (development only)
    if (!ARCJET_KEY) {
      console.warn("[ARCJET] WARNING: Running without Arcjet protection");
      return handler(req, res);
    }

    try {
      // Create route-specific Arcjet instance
      const protectedAj = createProtectedArcjet(routeType);

      // Execute Arcjet protection
      // Requirements: 2.1-2.4 - Execute shield rules, bot detection, rate limiting before handler
      const decision = await protectedAj.protect(req);
      
      // Handle blocked requests
      // Requirement: 2.9 - Blocked requests never reach database
      if (handleArcjetDecision(decision, res)) {
        return; // Request blocked, do not proceed
      }
      
      // Request allowed, proceed to handler
      return handler(req, res);
      
    } catch (error) {
      // Arcjet failure - log but DO NOT silently fail open
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[ARCJET] Service error: " + errorMsg);
      
      // Requirement: 2.8 - Fail secure: block request if Arcjet fails
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
 * Use when you need custom handling of the Arcjet decision
 * 
 * Requirements: 2.1-2.10
 * 
 * @param req - Vercel request object
 * @param routeType - The type of route for rate limiting
 * @returns Object with allowed status and optional reason
 */
export async function arcjetProtect(
  req: VercelRequest,
  routeType: RouteType = "general"
): Promise<{ allowed: boolean; reason?: string }> {
  if (!ARCJET_KEY) {
    console.warn("[ARCJET] WARNING: ARCJET_KEY not set, allowing request");
    return { allowed: true, reason: "ARCJET_KEY not set" };
  }

  try {
    const protectedAj = createProtectedArcjet(routeType);
    const decision = await protectedAj.protect(req);
    
    if (decision.isDenied()) {
      const reasonType = getBlockReasonType(decision);
      // Log for security audit
      console.log("[ARCJET] BLOCKED (manual): reason=" + reasonType + ", id=" + decision.id);
      return {
        allowed: false,
        reason: reasonType,
      };
    }
    
    return { allowed: true };
  } catch (error) {
    // Requirement: 2.8 - Fail secure on service unavailable
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ARCJET] Service error (manual): " + errorMsg);
    return { allowed: false, reason: "SECURITY_SERVICE_ERROR" };
  }
}


/**
 * Base Arcjet client for direct usage (advanced use cases)
 * Includes shield and bot detection but no rate limiting
 * 
 * Note: Prefer withArcjetProtection() or arcjetProtect() for standard usage
 */
export const aj = ARCJET_KEY
  ? arcjet({
      key: ARCJET_KEY,
      characteristics: ["ip.src"],
      rules: [
        shield({ mode: "LIVE" }),
        detectBot({
          mode: "LIVE",
          allow: ["CATEGORY:SEARCH_ENGINE"],
        }),
      ],
    })
  : null;
