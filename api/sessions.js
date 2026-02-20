import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

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
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

// lib/arcjet.ts
import arcjet, { shield, detectBot, fixedWindow } from "@arcjet/node";
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
  general: { window: "10m", max: 100 }
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
      const origin = req.headers.origin;
      const allowedOrigins = [
        "***REMOVED***",
        "https://mihas.vercel.app",
        "http://localhost:5173",
        "http://localhost:3000"
      ];
      const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Max-Age", "86400");
      return res.status(204).end();
    }
    if (!ARCJET_KEY) {
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

// lib/errorHandler.ts
var HttpStatus = {
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
var ErrorCode = {
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

class AuthError extends Error {
  code;
  statusCode;
  isOperational;
  constructor(message, code = ErrorCode.INTERNAL_ERROR, statusCode = HttpStatus.BAD_REQUEST, isOperational = true) {
    super(sanitizeError(message));
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }
  static validation(message) {
    return new AuthError(message, ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);
  }
  static authentication(message = "Authentication required") {
    return new AuthError(message, ErrorCode.AUTHENTICATION_ERROR, HttpStatus.UNAUTHORIZED);
  }
  static invalidCredentials() {
    return new AuthError("Invalid email or password", ErrorCode.INVALID_CREDENTIALS, HttpStatus.UNAUTHORIZED);
  }
  static tokenExpired() {
    return new AuthError("Token has expired", ErrorCode.TOKEN_EXPIRED, HttpStatus.UNAUTHORIZED);
  }
  static invalidToken() {
    return new AuthError("Invalid token", ErrorCode.INVALID_TOKEN, HttpStatus.UNAUTHORIZED);
  }
  static forbidden(message = "Access denied") {
    return new AuthError(message, ErrorCode.AUTHORIZATION_ERROR, HttpStatus.FORBIDDEN);
  }
  static insufficientPermissions() {
    return new AuthError("Insufficient permissions", ErrorCode.INSUFFICIENT_PERMISSIONS, HttpStatus.FORBIDDEN);
  }
  static securityViolation() {
    return new AuthError("Request blocked by security policy", ErrorCode.SECURITY_VIOLATION, HttpStatus.FORBIDDEN);
  }
  static rateLimited() {
    return new AuthError("Too many requests. Please try again later.", ErrorCode.RATE_LIMITED, HttpStatus.TOO_MANY_REQUESTS);
  }
  static notFound(resource = "Resource") {
    return new AuthError(`${resource} not found`, ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND);
  }
  static internal() {
    return new AuthError("An unexpected error occurred", ErrorCode.INTERNAL_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, false);
  }
  static serviceUnavailable() {
    return new AuthError("Service temporarily unavailable", ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
  }
  static database() {
    return new AuthError("Database operation failed", ErrorCode.DATABASE_ERROR, HttpStatus.INTERNAL_SERVER_ERROR, false);
  }
  toJSON() {
    return {
      success: false,
      error: this.message,
      code: this.code
    };
  }
}
function sanitizeError(message) {
  if (!message || typeof message !== "string") {
    return "An error occurred";
  }
  let sanitized = message;
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[ID]");
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, "[TOKEN]");
  sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s"']+/gi, "[CONNECTION_STRING]");
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.supabase\.co[^\s"']*/gi, "[SUPABASE_URL]");
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.neon\.tech[^\s"']*/gi, "[NEON_URL]");
  sanitized = sanitized.replace(/(?:api[_-]?key|secret|password|token|auth|bearer)[=:]\s*["']?[a-zA-Z0-9_\-./+=]{16,}["']?/gi, "[CREDENTIAL]");
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{100,}/g, "[SERVICE_KEY]");
  sanitized = sanitized.replace(/\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}/g, "[HASH]");
  sanitized = sanitized.replace(/\b[a-f0-9]{64}\b/gi, "[HASH]");
  sanitized = sanitized.replace(/(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)[^\s"']*|[A-Z]:\\[^\s"']*)/gi, "[PATH]");
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");
  sanitized = sanitized.replace(/:\d{4,5}(?=\s|$|\/)/g, ":[PORT]");
  sanitized = sanitized.replace(/\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, "[PHONE]");
  sanitized = sanitized.replace(/(?:user|profile|account)\s+['"]?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?['"]?/gi, "[USER]");
  return sanitized;
}
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = sanitizeError(message);
  if (error instanceof AuthError) {
    console.error(`[${context}] Error (${error.code}):`, sanitized);
  } else {
    console.error(`[${context}] Error:`, sanitized);
  }
}
function handleError(res, error, context = "API") {
  logError(context, error);
  res.setHeader("Content-Type", "application/json");
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json(error.toJSON());
  }
  let status = HttpStatus.INTERNAL_SERVER_ERROR;
  let message = "An unexpected error occurred";
  let code = ErrorCode.INTERNAL_ERROR;
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("unauthorized") || errorMessage.includes("no authorization") || errorMessage.includes("authentication")) {
      status = HttpStatus.UNAUTHORIZED;
      message = "Authentication required";
      code = ErrorCode.AUTHENTICATION_ERROR;
    } else if (errorMessage.includes("forbidden") || errorMessage.includes("access denied") || errorMessage.includes("permission") || errorMessage.includes("insufficient")) {
      status = HttpStatus.FORBIDDEN;
      message = "Access denied";
      code = ErrorCode.AUTHORIZATION_ERROR;
    } else if (errorMessage.includes("not found")) {
      status = HttpStatus.NOT_FOUND;
      message = "Resource not found";
      code = ErrorCode.NOT_FOUND;
    } else if (errorMessage.includes("validation") || errorMessage.includes("invalid")) {
      status = HttpStatus.BAD_REQUEST;
      message = sanitizeError(error.message);
      code = ErrorCode.VALIDATION_ERROR;
    } else if (errorMessage.includes("rate limit") || errorMessage.includes("too many")) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = "Too many requests. Please try again later.";
      code = ErrorCode.RATE_LIMITED;
    } else if (errorMessage.includes("unavailable") || errorMessage.includes("timeout")) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = "Service temporarily unavailable";
      code = ErrorCode.SERVICE_UNAVAILABLE;
    } else if (errorMessage.includes("expired")) {
      status = HttpStatus.UNAUTHORIZED;
      message = "Token has expired";
      code = ErrorCode.TOKEN_EXPIRED;
    }
  }
  const response = {
    success: false,
    error: message,
    code
  };
  return res.status(status).json(response);
}
function sendSuccess(res, data, status = HttpStatus.OK) {
  res.setHeader("Content-Type", "application/json");
  const response = {
    success: true,
    data
  };
  return res.status(status).json(response);
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

// lib/auth/jwt.ts
import { SignJWT, jwtVerify } from "jose";
var TOKEN_ISSUER = "mihas-auth";
var TOKEN_AUDIENCE = "mihas-app";
var ALGORITHM = "HS256";
function getAccessTokenSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }
  return new TextEncoder().encode(secret);
}
async function verifyAccessToken(token) {
  if (!token || token.trim().length === 0) {
    throw new Error("Token is required for verification");
  }
  try {
    const secret = getAccessTokenSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: [ALGORITHM]
    });
    if (payload.type !== "access") {
      throw new Error("Invalid token type: expected access token");
    }
    if (!payload.sub) {
      throw new Error("Token missing required subject claim");
    }
    if (!payload.email || typeof payload.email !== "string") {
      throw new Error("Token missing required email claim");
    }
    if (!payload.role || typeof payload.role !== "string") {
      throw new Error("Token missing required role claim");
    }
    const accessPayload = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      type: "access",
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0]
    };
    return accessPayload;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("expired")) {
      throw new Error("Access token has expired");
    }
    if (errorMessage.includes("signature")) {
      throw new Error("Invalid token signature");
    }
    if (errorMessage.includes("issuer")) {
      throw new Error("Invalid token issuer");
    }
    if (errorMessage.includes("audience")) {
      throw new Error("Invalid token audience");
    }
    if (errorMessage.includes("token type")) {
      throw new Error(errorMessage);
    }
    if (errorMessage.includes("missing required")) {
      throw new Error(errorMessage);
    }
    throw new Error("Access token verification failed");
  }
}

// lib/auth/cookies.ts
var ACCESS_TOKEN_COOKIE = "access_token";
function parseCookies(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return {};
  }
  const cookies = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const equalsIndex = pair.indexOf("=");
    if (equalsIndex > 0) {
      const name = pair.substring(0, equalsIndex).trim();
      const value = pair.substring(equalsIndex + 1);
      cookies[name] = value;
    }
  }
  return cookies;
}
function extractBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return null;
  }
  const token = authHeader.substring(bearerPrefix.length).trim();
  if (token.length === 0) {
    return null;
  }
  return token;
}
function extractAccessTokenFromCookie(req) {
  const cookies = parseCookies(req);
  const token = cookies[ACCESS_TOKEN_COOKIE];
  if (!token || token.length === 0) {
    return null;
  }
  return token;
}

// lib/db.ts
var DatabaseErrorCode = {
  CONNECTION_ERROR: "CONNECTION_ERROR",
  QUERY_ERROR: "QUERY_ERROR",
  TRANSACTION_ERROR: "TRANSACTION_ERROR",
  SCHEMA_ERROR: "SCHEMA_ERROR",
  CONFIG_ERROR: "CONFIG_ERROR",
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
  NOT_FOUND: "NOT_FOUND"
};

class DatabaseError extends Error {
  code;
  query;
  originalError;
  constructor(message, code = DatabaseErrorCode.QUERY_ERROR, options) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
    this.query = options?.query ? sanitizeQueryForLogging(options.query) : undefined;
    this.originalError = options?.originalError;
  }
}
function getDatabaseConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new DatabaseError("DATABASE_URL not configured. Set the Neon connection string.", DatabaseErrorCode.CONFIG_ERROR);
  }
  return { url };
}
function sanitizeQueryForLogging(query) {
  return query.replace(/'[^']*'/g, "'[REDACTED]'").replace(/"[^"]*"/g, '"[REDACTED]"');
}
function extractCommand(query) {
  const trimmed = query.trim().toUpperCase();
  const commands = ["SELECT", "INSERT", "UPDATE", "DELETE", "BEGIN", "COMMIT", "ROLLBACK", "CREATE", "ALTER", "DROP"];
  for (const cmd of commands) {
    if (trimmed.startsWith(cmd)) {
      return cmd;
    }
  }
  return "UNKNOWN";
}
async function executeNeonQuery(queryText, params) {
  const command = extractCommand(queryText);
  try {
    const { neon } = await import("@neondatabase/serverless");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new DatabaseError("DATABASE_URL not configured for Neon", DatabaseErrorCode.CONFIG_ERROR);
    }
    const sql = neon(connectionString);
    let rows;
    if (params && params.length > 0) {
      rows = await sql.query(queryText, params);
    } else {
      rows = await sql.query(queryText);
    }
    const resultRows = Array.isArray(rows) ? rows : [];
    return {
      rows: resultRows,
      rowCount: resultRows.length,
      command
    };
  } catch (error) {
    if (error instanceof DatabaseError)
      throw error;
    const errorMessage = error.message || "Unknown error";
    if (errorMessage.includes("duplicate key")) {
      throw new DatabaseError("Duplicate key violation", DatabaseErrorCode.CONSTRAINT_VIOLATION, { query: queryText, originalError: error });
    }
    if (errorMessage.includes("foreign key")) {
      throw new DatabaseError("Foreign key violation", DatabaseErrorCode.CONSTRAINT_VIOLATION, { query: queryText, originalError: error });
    }
    if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
      throw new DatabaseError("Database query timeout", DatabaseErrorCode.TIMEOUT_ERROR, { query: queryText, originalError: error });
    }
    throw new DatabaseError(`Neon query execution failed: ${errorMessage}`, DatabaseErrorCode.QUERY_ERROR, { query: queryText, originalError: error });
  }
}
async function query(queryText, params) {
  getDatabaseConfig();
  return executeNeonQuery(queryText, params);
}

// lib/queries.ts
var SessionQueries = {
  create: (id, userId, deviceInfo, ipAddress, userAgent) => ({
    text: `
      INSERT INTO device_sessions (
        id, user_id, device_info, ip_address, user_agent,
        is_active, last_activity, created_at, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        true, NOW(), NOW(), NOW() + INTERVAL '1 hour'
      )
      RETURNING id, user_id, is_active, last_activity, created_at, expires_at
    `,
    values: [id, userId, JSON.stringify(deviceInfo), ipAddress, userAgent]
  }),
  findById: (id) => ({
    text: `
      SELECT 
        id, user_id, device_info, ip_address, user_agent,
        is_active, last_activity, created_at, expires_at
      FROM device_sessions
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  updateActivity: (id) => ({
    text: `
      UPDATE device_sessions
      SET last_activity = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING id, last_activity
    `,
    values: [id]
  }),
  deactivate: (id) => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE id = $1
      RETURNING id
    `,
    values: [id]
  }),
  deactivateAllForUser: (userId) => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE user_id = $1 AND is_active = true
      RETURNING id
    `,
    values: [userId]
  }),
  deactivateAllExcept: (userId, currentSessionId) => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE user_id = $1 AND id != $2 AND is_active = true
      RETURNING id
    `,
    values: [userId, currentSessionId]
  }),
  getActiveForUser: (userId) => ({
    text: `
      SELECT 
        id, user_id, device_info, ip_address, user_agent,
        last_activity, created_at, expires_at
      FROM device_sessions
      WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
      ORDER BY last_activity DESC
    `,
    values: [userId]
  }),
  countActiveForUser: (userId) => ({
    text: `
      SELECT COUNT(*) as count
      FROM device_sessions
      WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
    `,
    values: [userId]
  }),
  deactivateExpired: () => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE is_active = true 
        AND (expires_at < NOW() OR last_activity < NOW() - INTERVAL '1 hour')
      RETURNING id, user_id
    `,
    values: []
  }),
  deleteOldInactive: (daysOld) => ({
    text: `
      DELETE FROM device_sessions
      WHERE is_active = false 
        AND created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `,
    values: [daysOld]
  }),
  isValid: (id) => ({
    text: `
      SELECT EXISTS(
        SELECT 1 FROM device_sessions
        WHERE id = $1 
          AND is_active = true 
          AND expires_at > NOW()
      ) as is_valid
    `,
    values: [id]
  }),
  extendExpiration: (id, days) => ({
    text: `
      UPDATE device_sessions
      SET 
        expires_at = NOW() + INTERVAL '1 day' * $2,
        last_activity = NOW()
      WHERE id = $1 AND is_active = true
      RETURNING id, expires_at
    `,
    values: [id, days]
  })
};
var AuditQueries = {
  log: (input) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, created_at
    `,
    values: [
      input.actor_id,
      input.action,
      input.entity_type,
      input.entity_id,
      input.changes ? JSON.stringify(input.changes) : null,
      input.ip_address || null,
      input.user_agent || null
    ]
  }),
  logAuthEvent: (actorId, action, success, ipAddress, userAgent, additionalInfo) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'user', $1, $3, $4, $5, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      action,
      JSON.stringify({ success, ...additionalInfo }),
      ipAddress,
      userAgent
    ]
  }),
  logAuthorizationFailure: (actorId, attemptedAction, entityType, entityId, requiredPermission, ipAddress, userAgent) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, 'authorization_failure', $2, $3, $4, $5, $6, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      entityType,
      entityId,
      JSON.stringify({
        attempted_action: attemptedAction,
        required_permission: requiredPermission
      }),
      ipAddress,
      userAgent
    ]
  }),
  logSessionEvent: (actorId, action, sessionId, ipAddress, userAgent, additionalInfo) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'session', $3, $4, $5, $6, NOW())
      RETURNING id, created_at
    `,
    values: [
      actorId,
      action,
      sessionId,
      additionalInfo ? JSON.stringify(additionalInfo) : null,
      ipAddress,
      userAgent
    ]
  }),
  findById: (id) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  getForEntity: (entityType, entityId, limit = 50) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    values: [entityType, entityId, limit]
  }),
  getByActor: (actorId, limit = 50) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE actor_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    values: [actorId, limit]
  }),
  getByAction: (action, limit = 50) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE action = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    values: [action, limit]
  }),
  getRecent: (limit, offset) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset]
  }),
  getByDateRange: (startDate, endDate, limit = 100) => ({
    text: `
      SELECT 
        id, actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      FROM audit_logs
      WHERE created_at >= $1 AND created_at <= $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    values: [startDate, endDate, limit]
  }),
  countByAction: (action) => ({
    text: `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = $1
    `,
    values: [action]
  }),
  countFailedAuthInWindow: (windowMinutes) => ({
    text: `
      SELECT COUNT(*) as count
      FROM audit_logs
      WHERE action = 'auth_failure'
        AND created_at > NOW() - INTERVAL '1 minute' * $1
    `,
    values: [windowMinutes]
  }),
  deleteOlderThan: (daysOld) => ({
    text: `
      DELETE FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `,
    values: [daysOld]
  })
};

// lib/sessions.ts
function generateSessionId() {
  return crypto.randomUUID();
}
function parseDeviceInfo(userAgent) {
  if (!userAgent) {
    return { browser: "Unknown", os: "Unknown", device_type: "unknown", is_mobile: false };
  }
  const ua = userAgent.toLowerCase();
  let browser = "Unknown";
  if (ua.includes("firefox"))
    browser = "Firefox";
  else if (ua.includes("edg/"))
    browser = "Edge";
  else if (ua.includes("chrome"))
    browser = "Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome"))
    browser = "Safari";
  let os = "Unknown";
  if (ua.includes("windows"))
    os = "Windows";
  else if (ua.includes("mac os x"))
    os = "macOS";
  else if (ua.includes("linux"))
    os = "Linux";
  else if (ua.includes("android"))
    os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad"))
    os = "iOS";
  const is_mobile = ua.includes("mobile") || ua.includes("android") || ua.includes("iphone");
  const device_type = ua.includes("tablet") || ua.includes("ipad") ? "tablet" : is_mobile ? "mobile" : "desktop";
  return { browser, os, device_type, is_mobile };
}
async function createSession(input) {
  const { userId, deviceInfo, ipAddress, userAgent } = input;
  const sessionId = generateSessionId();
  const createQuery = SessionQueries.create(sessionId, userId, deviceInfo, ipAddress, userAgent);
  const result = await query(createQuery.text, createQuery.values);
  if (result.rows.length === 0)
    throw new Error("Failed to create session");
  const session = result.rows[0];
  const auditQuery = AuditQueries.logSessionEvent(userId, "session_create", sessionId, ipAddress, userAgent, { device_type: deviceInfo.device_type, browser: deviceInfo.browser, os: deviceInfo.os });
  query(auditQuery.text, auditQuery.values).catch(() => {});
  return {
    id: session.id,
    userId: session.user_id,
    isActive: session.is_active,
    lastActivity: new Date(session.last_activity),
    createdAt: new Date(session.created_at),
    expiresAt: new Date(session.expires_at)
  };
}
async function getActiveSessions(userId, currentSessionId) {
  const getQuery = SessionQueries.getActiveForUser(userId);
  const result = await query(getQuery.text, getQuery.values);
  const sessions = result.rows.map((row) => {
    let deviceInfo;
    if (typeof row.device_info === "string") {
      try {
        deviceInfo = JSON.parse(row.device_info);
      } catch {
        deviceInfo = { browser: "Unknown", os: "Unknown", device_type: "unknown" };
      }
    } else {
      deviceInfo = row.device_info || { browser: "Unknown", os: "Unknown", device_type: "unknown" };
    }
    return {
      id: row.id,
      user_id: row.user_id,
      device_info: deviceInfo,
      ip_address: row.ip_address,
      last_activity: new Date(row.last_activity),
      created_at: new Date(row.created_at),
      is_current: currentSessionId ? row.id === currentSessionId : undefined
    };
  });
  return { sessions, count: sessions.length };
}
async function deactivateSession(sessionId, userId, ipAddress = null, userAgent = null) {
  const deactivateQuery = SessionQueries.deactivate(sessionId);
  const result = await query(deactivateQuery.text, deactivateQuery.values);
  const success = result.rowCount > 0;
  if (success) {
    const auditQuery = AuditQueries.logSessionEvent(userId, "session_revoke", sessionId, ipAddress, userAgent);
    query(auditQuery.text, auditQuery.values).catch(() => {});
  }
  return { success, sessionId };
}
async function deactivateAllSessions(userId, ipAddress = null, userAgent = null) {
  const deactivateQuery = SessionQueries.deactivateAllForUser(userId);
  const result = await query(deactivateQuery.text, deactivateQuery.values);
  const sessionIds = result.rows.map((row) => row.id);
  if (result.rowCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(userId, "session_revoke_all", null, ipAddress, userAgent, { deactivated_count: result.rowCount });
    query(auditQuery.text, auditQuery.values).catch(() => {});
  }
  return { success: true, deactivatedCount: result.rowCount, sessionIds };
}
async function deactivateOtherSessions(userId, currentSessionId, ipAddress = null, userAgent = null) {
  const deactivateQuery = SessionQueries.deactivateAllExcept(userId, currentSessionId);
  const result = await query(deactivateQuery.text, deactivateQuery.values);
  const sessionIds = result.rows.map((row) => row.id);
  if (result.rowCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(userId, "session_revoke_all", currentSessionId, ipAddress, userAgent, { deactivated_count: result.rowCount, kept_session: currentSessionId });
    query(auditQuery.text, auditQuery.values).catch(() => {});
  }
  return { success: true, deactivatedCount: result.rowCount, sessionIds };
}

// lib/realtimeBroker.ts
var userEvents = new Map;
var seenEventIds = new Set;
var deliveryLatencyTotal = 0;
function pollRealtimeEvents(userId, lastEventId) {
  const list = userEvents.get(userId) || [];
  if (!lastEventId)
    return list.slice(-25);
  const index = list.findIndex((event) => event.event_id === lastEventId);
  if (index === -1)
    return list.slice(-25);
  return list.slice(index + 1);
}
function recordDeliveryLatency(createdAtIso) {
  const latency = Math.max(0, Date.now() - new Date(createdAtIso).getTime());
  deliveryLatencyTotal += latency;
}

// api-src/sessions.ts
async function getUserFromRequest(req) {
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (!token)
    return null;
  try {
    const payload = await verifyAccessToken(token);
    return { userId: payload.sub, sessionId: undefined };
  } catch {
    return null;
  }
}
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  const action = req.query.action;
  try {
    const auth = await getUserFromRequest(req);
    if (!auth) {
      return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
    }
    const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || null;
    const userAgent = req.headers["user-agent"] || null;
    switch (action) {
      case "list":
        return await handleList(req, res, auth.userId, auth.sessionId);
      case "track":
        return await handleTrack(req, res, auth.userId, ipAddress, userAgent);
      case "revoke":
        return await handleRevoke(req, res, auth.userId, ipAddress, userAgent);
      case "revoke-all":
        return await handleRevokeAll(req, res, auth.userId, auth.sessionId, ipAddress, userAgent);
      case "connect":
        return await handleConnect(req, res, auth.userId);
      case "poll":
        return await handlePoll(req, res, auth.userId);
      default:
        return sendError(res, "Invalid action. Use: list, track, revoke, revoke-all, connect, poll", HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, "sessions");
  }
}
async function handleConnect(req, res, userId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const events = pollRealtimeEvents(userId);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  for (const event of events) {
    recordDeliveryLatency(event.created_at);
    res.write(`id: ${event.event_id}
`);
    res.write(`event: ${event.event_type}
`);
    res.write(`data: ${JSON.stringify(event)}

`);
  }
  res.write(`event: ping
data: ${JSON.stringify({ created_at: new Date().toISOString() })}

`);
  res.end();
}
async function handlePoll(req, res, userId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const lastEventId = req.query.lastEventId;
  const events = pollRealtimeEvents(userId, lastEventId);
  events.forEach((event) => recordDeliveryLatency(event.created_at));
  return sendSuccess(res, { events });
}
async function handleList(req, res, userId, currentSessionId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const result = await getActiveSessions(userId, currentSessionId);
  return sendSuccess(res, { sessions: result.sessions, count: result.count });
}
async function handleTrack(req, res, userId, ipAddress, userAgent) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const deviceInfo = parseDeviceInfo(userAgent);
  const session = await createSession({
    userId,
    deviceInfo,
    ipAddress,
    userAgent
  });
  return sendSuccess(res, { session }, HttpStatus.CREATED);
}
async function handleRevoke(req, res, userId, ipAddress, userAgent) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const { sessionId } = req.body || {};
  if (!sessionId) {
    return sendError(res, "sessionId is required", HttpStatus.BAD_REQUEST);
  }
  const result = await deactivateSession(sessionId, userId, ipAddress, userAgent);
  return sendSuccess(res, { revoked: result.success, sessionId: result.sessionId });
}
async function handleRevokeAll(req, res, userId, currentSessionId, ipAddress, userAgent) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const { keepCurrent } = req.body || {};
  let result;
  if (keepCurrent && currentSessionId) {
    result = await deactivateOtherSessions(userId, currentSessionId, ipAddress, userAgent);
  } else {
    result = await deactivateAllSessions(userId, ipAddress, userAgent);
  }
  return sendSuccess(res, {
    revoked: result.success,
    count: result.deactivatedCount,
    sessionIds: result.sessionIds
  });
}
var sessions_default = withArcjetProtection(handler, "session");
export {
  sessions_default as default
};
