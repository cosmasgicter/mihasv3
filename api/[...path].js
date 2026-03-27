var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// lib/errorHandler.ts
function sanitizeError(message) {
  if (!message || typeof message !== "string") {
    return "An error occurred";
  }
  let sanitized = message;
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[ID]");
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[TOKEN]");
  sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s"']+/gi, "[CONNECTION_STRING]");
  sanitized = sanitized.replace(/https?:\/\/[^\s"']+(?:\/auth\/v1|\/rest\/v1)[^\s"']*/gi, "[DB_API_URL]");
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.neon\.tech[^\s"']*/gi, "[DB_URL]");
  sanitized = sanitized.replace(/(?:api[_-]?key|secret|password|token|auth|bearer)[=:]\s*["']?[a-zA-Z0-9_\-./+=]{16,}["']?/gi, "[CREDENTIAL]");
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{100,}/g, "[SERVICE_KEY]");
  sanitized = sanitized.replace(/\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}/g, "[HASH]");
  sanitized = sanitized.replace(/\b[a-f0-9]{64}\b/gi, "[HASH]");
  sanitized = sanitized.replace(/(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)[^\s"']*|[A-Z]:\\[^\s"']*)/gi, "[PATH]");
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");
  sanitized = sanitized.replace(/:\d{4,5}(?=\s|$|\/)/g, ":[PORT]");
  sanitized = sanitized.replace(/(?<!\d)(?:\+260|0)\d{9}(?!\d)/g, "[PHONE]");
  sanitized = sanitized.replace(/(?<!\d)\+?\d{1,3}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?!\d)/g, "[PHONE]");
  sanitized = sanitized.replace(/(?:user|profile|account)\s+['"]?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?['"]?/gi, "[USER]");
  return sanitized;
}
function sendError(res, message, status = HttpStatus.BAD_REQUEST, code = ErrorCode.VALIDATION_ERROR) {
  res.setHeader("Content-Type", "application/json");
  const response = {
    success: false,
    error: sanitizeError(message),
    code
  };
  return res.status(status).json(response);
}
var HttpStatus, ErrorCode;
var init_errorHandler = __esm(() => {
  HttpStatus = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  };
  ErrorCode = {
    VALIDATION_ERROR: "VALIDATION_ERROR",
    INVALID_INPUT: "INVALID_INPUT",
    MISSING_REQUIRED_FIELD: "MISSING_REQUIRED_FIELD",
    AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
    AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
    INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    INVALID_TOKEN: "INVALID_TOKEN",
    AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR",
    INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",
    SECURITY_VIOLATION: "SECURITY_VIOLATION",
    NOT_FOUND: "NOT_FOUND",
    RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
    RATE_LIMITED: "RATE_LIMITED",
    TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    INTERNAL_ERROR: "INTERNAL_ERROR",
    DATABASE_ERROR: "DATABASE_ERROR",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE"
  };
});

// lib/cors.ts
var ALLOWED_ORIGINS = [
  "***REMOVED***",
  "https://mihas.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];
function getCorsHeaders(origin) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CSRF-Token",
    "Access-Control-Expose-Headers": "X-CSRF-Token",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}
function handleCors(req, res) {
  const origin = req.headers.origin;
  const headers = getCorsHeaders(origin);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

// lib/securityHeaders.ts
function setSecurityHeaders(res, options) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", options?.cacheControl ?? "no-store");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

// lib/arcjet.ts
import arcjet, { shield, detectBot, fixedWindow } from "@arcjet/node";
var originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, ...args) {
  if (typeof warning === "string" && args[0] === "DeprecationWarning" && args[1] === "DEP0169")
    return;
  if (warning && typeof warning === "object" && warning.code === "DEP0169")
    return;
  return originalEmitWarning.call(process, warning, ...args);
};
var ARCJET_KEY = process.env.ARCJET_KEY;
if (!ARCJET_KEY) {
  console.error("[ARCJET] FATAL: ARCJET_KEY environment variable not set");
  console.error("[ARCJET] Security layer DISABLED - set ARCJET_KEY immediately");
}
var rateLimitConfigs = {
  auth: { window: "5m", max: 60 },
  session: { window: "10m", max: 30 },
  admin: { window: "10m", max: 60 },
  notification: { window: "10m", max: 50 },
  general: { window: "10m", max: 100 },
  registration: { window: "10m", max: 3 },
  documents: { window: "10m", max: 20 }
};
function getBlockReasonType(decision) {
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
function handleArcjetDecision(decision, res) {
  if (decision.isDenied()) {
    const reasonType = getBlockReasonType(decision);
    console.log("[ARCJET] BLOCKED: reason=" + reasonType + ", id=" + decision.id);
    res.status(403).json({
      success: false,
      error: "Request blocked by security policy",
      code: "SECURITY_VIOLATION"
    });
    return true;
  }
  return false;
}
function createProtectedArcjet(routeType) {
  const config = rateLimitConfigs[routeType];
  return arcjet({
    key: ARCJET_KEY,
    characteristics: ["ip.src"],
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({
        mode: "LIVE",
        allow: ["CATEGORY:SEARCH_ENGINE"]
      }),
      fixedWindow({
        mode: "LIVE",
        window: config.window,
        max: config.max
      })
    ]
  });
}
function withArcjetProtection(handler, routeType = "general") {
  return async (req, res) => {
    if (req.method === "OPTIONS") {
      handleCors(req, res);
      return;
    }
    if (!ARCJET_KEY) {
      const isProduction = false;
      if (isProduction) {
        console.error("[ARCJET] FATAL: ARCJET_KEY not set in production — rejecting request");
        res.status(503).json({
          success: false,
          error: "Security service unavailable",
          code: "SECURITY_SERVICE_ERROR"
        });
        return;
      }
      console.warn("[ARCJET] WARNING: Running without Arcjet protection");
      return handler(req, res);
    }
    try {
      const protectedAj = createProtectedArcjet(routeType);
      const decision = await protectedAj.protect(req);
      if (handleArcjetDecision(decision, res)) {
        return;
      }
      return handler(req, res);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error("[ARCJET] Service error: " + errorMsg);
      res.status(503).json({
        success: false,
        error: "Security service unavailable",
        code: "SECURITY_SERVICE_ERROR"
      });
    }
  };
}
var aj = ARCJET_KEY ? arcjet({
  key: ARCJET_KEY,
  characteristics: ["ip.src"],
  rules: [
    shield({ mode: "LIVE" }),
    detectBot({
      mode: "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"]
    })
  ]
}) : null;

// api-src/[...path].ts
init_errorHandler();
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  setSecurityHeaders(res);
  sendError(res, "Not found", HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
}
var __path__default = withArcjetProtection(handler, "general");
export {
  __path__default as default
};
