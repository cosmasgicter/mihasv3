import { createRequire } from "node:module";
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// lib/db.ts
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
var DatabaseErrorCode, DatabaseError;
var init_db = __esm(() => {
  DatabaseErrorCode = {
    CONNECTION_ERROR: "CONNECTION_ERROR",
    QUERY_ERROR: "QUERY_ERROR",
    TRANSACTION_ERROR: "TRANSACTION_ERROR",
    SCHEMA_ERROR: "SCHEMA_ERROR",
    CONFIG_ERROR: "CONFIG_ERROR",
    TIMEOUT_ERROR: "TIMEOUT_ERROR",
    CONSTRAINT_VIOLATION: "CONSTRAINT_VIOLATION",
    NOT_FOUND: "NOT_FOUND"
  };
  DatabaseError = class DatabaseError extends Error {
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
  };
});

// lib/queries.ts
var AuditQueries;
var init_queries = __esm(() => {
  AuditQueries = {
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
});

// lib/cors.ts
var ALLOWED_ORIGINS = [
  "https://apply.mihas.edu.zm",
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

// api-src/admin.ts
init_db();

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
        "https://apply.mihas.edu.zm",
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

// lib/auth/middleware.ts
class AuthenticationError extends Error {
  statusCode;
  code;
  constructor(message, code = "AUTHENTICATION_REQUIRED", statusCode = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

class AuthorizationError extends Error {
  statusCode;
  code;
  constructor(message, code = "INSUFFICIENT_PERMISSIONS", statusCode = 403) {
    super(message);
    this.name = "AuthorizationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
function extractToken(req) {
  const cookieToken = extractAccessTokenFromCookie(req);
  if (cookieToken) {
    return cookieToken;
  }
  const bearerToken = extractBearerToken(req);
  if (bearerToken) {
    return bearerToken;
  }
  return null;
}
async function requireAuth(req) {
  const token = extractToken(req);
  if (!token) {
    throw new AuthenticationError("Authentication required", "AUTHENTICATION_REQUIRED", 401);
  }
  try {
    const payload = await verifyAccessToken(token);
    return mapPayloadToAuthContext(payload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("[AUTH] Token verification failed:", errorMessage);
    if (errorMessage.includes("expired")) {
      throw new AuthenticationError("Access token has expired", "TOKEN_EXPIRED", 401);
    }
    if (errorMessage.includes("signature")) {
      throw new AuthenticationError("Invalid token", "INVALID_TOKEN", 401);
    }
    throw new AuthenticationError("Authentication failed", "AUTHENTICATION_FAILED", 401);
  }
}
async function requireRole(req, roles) {
  const user = await requireAuth(req);
  if (!roles.includes(user.role)) {
    console.log("[AUTH] Authorization failed: user role", user.role, "not in required roles", roles.join(", "));
    throw new AuthorizationError("Insufficient permissions", "INSUFFICIENT_PERMISSIONS", 403);
  }
  return user;
}
function mapPayloadToAuthContext(payload) {
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions || []
  };
}

// lib/auth/password.ts
import bcrypt from "bcryptjs";
var BCRYPT_ROUNDS = 12;
async function hashPassword(password) {
  if (!password || password.length === 0) {
    throw new Error("Password cannot be empty");
  }
  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return hash;
  } catch (error) {
    console.error("[PASSWORD] Hashing operation failed");
    throw new Error("Password hashing failed");
  }
}

// lib/auditLogger.ts
init_db();
init_queries();
async function executeQuery(config) {
  const result = await query(config.text, config.values);
  return result.rows;
}
var SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /key/i,
  /credential/i,
  /auth/i,
  /hash/i,
  /salt/i,
  /bearer/i,
  /cookie/i,
  /session_id/i,
  /refresh/i,
  /access/i
];
var PII_PATTERNS = [
  /email/i,
  /phone/i,
  /address/i,
  /name/i,
  /ssn/i,
  /national_id/i,
  /passport/i,
  /birth/i
];
function isSensitiveField(fieldName) {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(fieldName));
}
function isPIIField(fieldName) {
  return PII_PATTERNS.some((pattern) => pattern.test(fieldName));
}
function sanitizeValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeError(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value === "object") {
    return sanitizeContext(value);
  }
  return value;
}
function sanitizeContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(context)) {
    if (isSensitiveField(key)) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (isPIIField(key)) {
      sanitized[key] = "[PII_REDACTED]";
      continue;
    }
    sanitized[key] = sanitizeValue(value);
  }
  return sanitized;
}
async function logAuditEvent(input) {
  try {
    const sanitizedInput = {
      ...input,
      changes: input.changes ? sanitizeContext(input.changes) || undefined : undefined
    };
    await executeQuery(AuditQueries.log(sanitizedInput));
  } catch (error) {
    console.error("[AuditLogger] Failed to log audit event:", sanitizeError(error instanceof Error ? error.message : String(error)));
  }
}

// api-src/admin.ts
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  const action = req.query.action || "dashboard";
  try {
    const auth = await requireRole(req, ["admin", "super_admin"]);
    switch (action) {
      case "dashboard":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleDashboard(res);
        return;
      case "users":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUsers(req, res);
        return;
      case "settings":
        await handleSettings(req, res, auth);
        return;
      case "register":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleRegisterUser(req, res, auth);
        return;
      case "stats":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleDashboardStats(res);
        return;
      case "errors":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleErrorStatistics(res);
        return;
      case "migrate":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleMigrate(req, res);
        return;
      case "set-password":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleSetPassword(req, res, auth);
        return;
      case "import-settings":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleImportSettings(req, res, auth);
        return;
      case "reset-settings":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleResetSettings(res, auth);
        return;
      case "eligibility-rules":
        await handleEligibilityRules(req, res, auth);
        return;
      case "update-role":
        if (req.method !== "PUT" && req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUpdateRole(req, res, auth);
        return;
      case "eligibility-assessments":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleEligibilityAssessments(req, res);
        return;
      case "audit-log":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleAuditLog(req, res);
        return;
      case "appeals":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleAppeals(req, res);
        return;
      default:
        sendError(res, "Invalid action. Valid actions: dashboard, users, settings, register, migrate, stats, errors, set-password, import-settings, reset-settings, eligibility-rules, eligibility-assessments, audit-log, appeals", HttpStatus.BAD_REQUEST);
        return;
    }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    if (error instanceof AuthorizationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return;
    }
    handleError(res, error, "admin");
  }
}
var admin_default = withArcjetProtection(handler, "admin");
async function handleSettings(req, res, auth) {
  const method = req.method;
  switch (method) {
    case "GET":
      await handleGetSettings(res);
      return;
    case "POST":
      await handleCreateSetting(req, res, auth);
      return;
    case "PUT":
      await handleUpdateSetting(req, res, auth);
      return;
    case "DELETE":
      await handleDeleteSetting(req, res);
      return;
    default:
      sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
      return;
  }
}
async function handleGetSettings(res) {
  try {
    const result = await query("SELECT * FROM settings ORDER BY key ASC");
    sendSuccess(res, { settings: result.rows || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleCreateSetting(req, res, auth) {
  const body = req.body;
  if (!body.key || typeof body.key !== "string") {
    sendError(res, "key is required and must be a string", HttpStatus.BAD_REQUEST);
    return;
  }
  if (body.value === undefined || body.value === null) {
    sendError(res, "value is required", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    const result = await query(`INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`, [
      body.key.trim(),
      JSON.stringify(body.value),
      body.description || null,
      body.category || null,
      body.is_public ?? false,
      auth.userId
    ]);
    if (result.rows.length === 0) {
      sendError(res, "Failed to create setting", HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }
    sendSuccess(res, { setting: result.rows[0] }, HttpStatus.CREATED);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("duplicate key") || message.includes("23505")) {
      sendError(res, `Setting with key '${body.key}' already exists`, HttpStatus.CONFLICT);
      return;
    }
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleUpdateSetting(req, res, auth) {
  const body = req.body;
  if (!body.id && !body.key) {
    sendError(res, "Either id or key is required to update a setting", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    const updates = ["updated_by = $1", "updated_at = NOW()"];
    const values = [auth.userId];
    let paramIndex = 2;
    if (body.value !== undefined) {
      updates.push(`value = $${paramIndex}`);
      values.push(JSON.stringify(body.value));
      paramIndex++;
    }
    if (body.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      values.push(body.category);
      paramIndex++;
    }
    if (body.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      values.push(body.description);
      paramIndex++;
    }
    if (body.is_public !== undefined) {
      updates.push(`is_public = $${paramIndex}`);
      values.push(body.is_public);
      paramIndex++;
    }
    let whereClause;
    if (body.id) {
      whereClause = `id = $${paramIndex}`;
      values.push(body.id);
    } else {
      whereClause = `key = $${paramIndex}`;
      values.push(body.key);
    }
    const result = await query(`UPDATE settings SET ${updates.join(", ")} WHERE ${whereClause} RETURNING *`, values);
    if (result.rows.length === 0) {
      sendError(res, "Setting not found", HttpStatus.NOT_FOUND);
      return;
    }
    sendSuccess(res, { setting: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleDeleteSetting(req, res) {
  const body = req.body;
  const queryId = req.query.id;
  const queryKey = req.query.key;
  const id = body.id || queryId;
  const settingKey = body.key || queryKey;
  if (!id && !settingKey) {
    sendError(res, "Either id or key is required to delete a setting", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    let result;
    if (id) {
      result = await query("DELETE FROM settings WHERE id = $1", [id]);
    } else {
      result = await query("DELETE FROM settings WHERE key = $1", [settingKey]);
    }
    if (result.rowCount === 0) {
      sendError(res, "Setting not found", HttpStatus.NOT_FOUND);
      return;
    }
    sendSuccess(res, { deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleDashboard(res) {
  try {
    const now = new Date;
    const today = now.toISOString().split("T")[0];
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [
      recentAppsResult,
      countsResult,
      todayResult,
      weekResult,
      monthResult
    ] = await Promise.all([
      query(`SELECT id, application_number, full_name, status, program, created_at 
         FROM applications 
         ORDER BY created_at DESC 
         LIMIT 5`),
      query(`SELECT status, COUNT(*) as count FROM applications GROUP BY status`),
      query(`SELECT COUNT(*) as count FROM applications WHERE created_at >= $1 AND created_at < $2`, [today, tomorrow]),
      query(`SELECT COUNT(*) as count FROM applications WHERE created_at >= $1`, [weekAgo]),
      query(`SELECT COUNT(*) as count FROM applications WHERE created_at >= $1`, [monthAgo])
    ]);
    const statusCounts = {};
    let totalCount = 0;
    for (const row of countsResult.rows) {
      const count = parseInt(row.count, 10);
      statusCounts[row.status] = count;
      totalCount += count;
    }
    const draftCount = statusCounts["draft"] || 0;
    const submittedCount = statusCounts["submitted"] || 0;
    const underReviewCount = statusCounts["under_review"] || 0;
    const approvedCount = statusCounts["approved"] || 0;
    const rejectedCount = statusCounts["rejected"] || 0;
    const todayCount = parseInt(todayResult.rows[0]?.count || "0", 10);
    const weekCount = parseInt(weekResult.rows[0]?.count || "0", 10);
    const monthCount = parseInt(monthResult.rows[0]?.count || "0", 10);
    const pendingCount = submittedCount + underReviewCount;
    const recentActivity = recentAppsResult.rows.map((app) => ({
      id: app.id,
      type: "application",
      message: `New application from ${app.full_name} for ${app.program}`,
      timestamp: app.created_at,
      user: app.full_name,
      status: app.status
    }));
    res.setHeader("Cache-Control", "public, max-age=30");
    sendSuccess(res, {
      stats: {
        totalApplications: totalCount,
        pendingApplications: pendingCount,
        approvedApplications: approvedCount,
        rejectedApplications: rejectedCount,
        todayApplications: todayCount,
        weekApplications: weekCount,
        monthApplications: monthCount,
        systemHealth: pendingCount > 100 ? "critical" : pendingCount > 50 ? "warning" : "good"
      },
      recentActivity,
      statusBreakdown: { draft: draftCount, submitted: submittedCount, under_review: underReviewCount, approved: approvedCount, rejected: rejectedCount },
      periodTotals: { today: todayCount, week: weekCount, month: monthCount },
      generatedAt: now.toISOString()
    });
  } catch (error) {
    console.error("[ADMIN] Dashboard error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to fetch dashboard data", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleUsers(req, res) {
  let page = parseInt(req.query.page || "1", 10);
  let limit = parseInt(req.query.limit || "50", 10);
  if (isNaN(page) || page < 1)
    page = 1;
  if (isNaN(limit) || limit < 1)
    limit = 50;
  if (limit > 100)
    limit = 100;
  const offset = (page - 1) * limit;
  const role = req.query.role;
  const search = req.query.search;
  const conditions = [];
  const params = [];
  let paramIndex = 1;
  if (role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }
  if (search) {
    conditions.push(`(LOWER(full_name) LIKE $${paramIndex} OR LOWER(first_name) LIKE $${paramIndex} OR LOWER(last_name) LIKE $${paramIndex} OR LOWER(email) LIKE $${paramIndex})`);
    params.push(`%${search.toLowerCase()}%`);
    paramIndex++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  try {
    const [dataResult, countResult] = await Promise.all([
      query(`SELECT * FROM profiles ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]),
      query(`SELECT COUNT(*) as count FROM profiles ${whereClause}`, params)
    ]);
    const users = dataResult.rows.map((user) => ({ ...user, user_id: user.id }));
    const total = parseInt(countResult.rows[0]?.count || "0", 10);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    sendSuccess(res, {
      users,
      totalCount: total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleRegisterUser(req, res, auth) {
  const { email, password, firstName, lastName, role } = req.body;
  if (!email || !password || !firstName || !lastName) {
    sendError(res, "Email, password, firstName, and lastName are required", HttpStatus.BAD_REQUEST);
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    sendError(res, "Invalid email format", HttpStatus.BAD_REQUEST);
    return;
  }
  if (password.length < 8) {
    sendError(res, "Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
    return;
  }
  const validRoles = ["student", "reviewer", "admin", "super_admin"];
  const userRole = role && validRoles.includes(role) ? role : "student";
  if ((userRole === "admin" || userRole === "super_admin") && auth.role !== "super_admin") {
    sendError(res, "Only super_admin can assign admin or super_admin roles", HttpStatus.FORBIDDEN);
    return;
  }
  try {
    const existingResult = await query("SELECT id FROM profiles WHERE email = $1 LIMIT 1", [email.toLowerCase()]);
    if (existingResult.rows.length > 0) {
      sendError(res, "Email already registered", HttpStatus.CONFLICT);
      return;
    }
    const passwordHash = await hashPassword(password);
    const result = await query(`INSERT INTO profiles (email, password_hash, first_name, last_name, role, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
       RETURNING id, email, first_name, last_name, role, created_at`, [email.toLowerCase(), passwordHash, firstName, lastName, userRole]);
    if (result.rows.length === 0) {
      sendError(res, "Failed to create user", HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }
    const newUser = result.rows[0];
    await logAuditEvent({
      actor_id: auth.userId,
      action: "user_created",
      entity_type: "user",
      entity_id: newUser.id,
      changes: {
        role: userRole,
        created_by_admin: true
      }
    });
    sendSuccess(res, {
      user: newUser,
      message: "User created successfully"
    }, HttpStatus.CREATED);
  } catch (error) {
    console.error("[ADMIN] Registration error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Registration failed", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleDashboardStats(res) {
  try {
    const now = new Date;
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [
      totalAppsResult,
      statusCountsResult,
      programCountsResult,
      recentAppsResult,
      userCountsResult,
      todayResult,
      weekResult,
      monthResult
    ] = await Promise.all([
      query("SELECT COUNT(*) as count FROM applications"),
      query(`SELECT status, COUNT(*) as count FROM applications GROUP BY status`),
      query(`SELECT program, COUNT(*) as count FROM applications GROUP BY program ORDER BY count DESC LIMIT 10`),
      query(`SELECT id, application_number, full_name, status, created_at 
         FROM applications 
         ORDER BY created_at DESC 
         LIMIT 5`),
      query(`SELECT role, COUNT(*) as count FROM profiles GROUP BY role`),
      query(`SELECT COUNT(*) as count FROM applications WHERE created_at >= $1 AND created_at < $2`, [todayStart.toISOString(), tomorrowStart.toISOString()]),
      query(`SELECT COUNT(*) as count FROM applications WHERE created_at >= $1`, [weekAgo]),
      query(`SELECT COUNT(*) as count FROM applications WHERE created_at >= $1`, [monthAgo])
    ]);
    const totalApplications = parseInt(totalAppsResult.rows[0]?.count || "0", 10);
    const statusBreakdown = {};
    for (const row of statusCountsResult.rows) {
      statusBreakdown[row.status] = parseInt(row.count, 10);
    }
    const programBreakdown = {};
    for (const row of programCountsResult.rows) {
      programBreakdown[row.program] = parseInt(row.count, 10);
    }
    const userBreakdown = {};
    for (const row of userCountsResult.rows) {
      userBreakdown[row.role] = parseInt(row.count, 10);
    }
    const pendingCount = (statusBreakdown["submitted"] || 0) + (statusBreakdown["under_review"] || 0);
    const todayApplications = parseInt(todayResult.rows[0]?.count || "0", 10);
    const weekApplications = parseInt(weekResult.rows[0]?.count || "0", 10);
    const monthApplications = parseInt(monthResult.rows[0]?.count || "0", 10);
    res.setHeader("Cache-Control", "public, max-age=60");
    sendSuccess(res, {
      totalApplications,
      pendingApplications: pendingCount,
      approvedApplications: statusBreakdown["approved"] || 0,
      rejectedApplications: statusBreakdown["rejected"] || 0,
      todayApplications,
      weekApplications,
      monthApplications,
      statusBreakdown,
      programBreakdown,
      userBreakdown,
      recentApplications: recentAppsResult.rows,
      systemHealth: pendingCount > 100 ? "critical" : pendingCount > 50 ? "warning" : "good",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[ADMIN] Stats error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to fetch dashboard stats", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleErrorStatistics(res) {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [
      errorCountsResult,
      recentErrorsResult,
      errorsByDayResult
    ] = await Promise.all([
      query(`SELECT action, COUNT(*) as count 
         FROM audit_logs 
         WHERE action LIKE '%error%' OR action LIKE '%fail%'
         AND created_at > $1
         GROUP BY action`, [weekAgo]),
      query(`SELECT id, action, entity_type, created_at 
         FROM audit_logs 
         WHERE action LIKE '%error%' OR action LIKE '%fail%'
         ORDER BY created_at DESC 
         LIMIT 20`),
      query(`SELECT DATE(created_at) as day, COUNT(*) as count 
         FROM audit_logs 
         WHERE (action LIKE '%error%' OR action LIKE '%fail%')
         AND created_at > $1
         GROUP BY DATE(created_at)
         ORDER BY day DESC`, [weekAgo])
    ]);
    const errorsByType = {};
    for (const row of errorCountsResult.rows) {
      errorsByType[row.action] = parseInt(row.count, 10);
    }
    const errorsByDay = {};
    for (const row of errorsByDayResult.rows) {
      errorsByDay[row.day] = parseInt(row.count, 10);
    }
    const totalErrors = Object.values(errorsByType).reduce((sum, count) => sum + count, 0);
    res.setHeader("Cache-Control", "public, max-age=60");
    sendSuccess(res, {
      totalErrors,
      errorsByType,
      errorsByDay,
      recentErrors: recentErrorsResult.rows,
      period: "7 days",
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("[ADMIN] Error stats error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to fetch error statistics", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleSetPassword(req, res, auth) {
  if (auth.role !== "super_admin") {
    sendError(res, "Only super_admin can set passwords for other users", HttpStatus.FORBIDDEN);
    return;
  }
  const { email, password } = req.body;
  if (!email || !password) {
    sendError(res, "Email and password are required", HttpStatus.BAD_REQUEST);
    return;
  }
  if (password.length < 8) {
    sendError(res, "Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    const findResult = await query("SELECT id, email, first_name, last_name, role FROM profiles WHERE email = $1 LIMIT 1", [email.toLowerCase()]);
    if (findResult.rows.length === 0) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    const user = findResult.rows[0];
    const passwordHash = await hashPassword(password);
    const updateResult = await query("UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2", [passwordHash, user.id]);
    if (updateResult.rowCount === 0) {
      sendError(res, "Failed to update password", HttpStatus.INTERNAL_SERVER_ERROR);
      return;
    }
    await logAuditEvent({
      actor_id: auth.userId,
      action: "password_set_by_admin",
      entity_type: "user",
      entity_id: user.id,
      changes: {
        password_updated: true,
        updated_by_admin: true
      }
    });
    sendSuccess(res, {
      message: "Password set successfully",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error("[ADMIN] Set password error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to set password", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleMigrate(req, res) {
  const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
  const { secret } = req.body || {};
  if (MIGRATE_SECRET && secret !== MIGRATE_SECRET) {
    sendError(res, "Invalid migration secret", HttpStatus.UNAUTHORIZED);
    return;
  }
  const migrations = [];
  const errors = [];
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT`);
    migrations.push("Added password_hash column");
  } catch (e) {
    errors.push(`password_hash: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT`);
    migrations.push("Added refresh_token_hash column");
  } catch (e) {
    errors.push(`refresh_token_hash: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'`);
    migrations.push("Added role column");
  } catch (e) {
    errors.push(`role: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)`);
    migrations.push("Created idx_profiles_email index");
  } catch (e) {
    errors.push(`idx_profiles_email: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    await query(`CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role)`);
    migrations.push("Created idx_profiles_role index");
  } catch (e) {
    errors.push(`idx_profiles_role: ${e instanceof Error ? e.message : String(e)}`);
  }
  sendSuccess(res, {
    migrations,
    errors: errors.length > 0 ? errors : undefined,
    message: errors.length > 0 ? "Some migrations failed" : "All migrations completed successfully"
  });
}
async function handleImportSettings(req, res, auth) {
  const { settings } = req.body;
  if (!settings || !Array.isArray(settings)) {
    sendError(res, "settings array is required", HttpStatus.BAD_REQUEST);
    return;
  }
  if (settings.length === 0) {
    sendError(res, "settings array cannot be empty", HttpStatus.BAD_REQUEST);
    return;
  }
  const imported = [];
  const errors = [];
  for (const setting of settings) {
    if (!setting.key || setting.value === undefined) {
      errors.push(`Invalid setting: missing key or value`);
      continue;
    }
    try {
      await query(`INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (key) 
         DO UPDATE SET 
           value = EXCLUDED.value,
           description = EXCLUDED.description,
           category = EXCLUDED.category,
           is_public = EXCLUDED.is_public,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`, [
        setting.key,
        JSON.stringify(setting.value),
        setting.description || null,
        setting.category || null,
        setting.is_public ?? false,
        auth.userId
      ]);
      imported.push(setting.key);
    } catch (e) {
      errors.push(`${setting.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await logAuditEvent({
    actor_id: auth.userId,
    action: "settings_imported",
    entity_type: "setting",
    entity_id: "bulk",
    changes: {
      imported_count: imported.length,
      error_count: errors.length
    }
  });
  sendSuccess(res, {
    imported,
    errors: errors.length > 0 ? errors : undefined,
    message: `Successfully imported ${imported.length} settings${errors.length > 0 ? `, ${errors.length} failed` : ""}`
  });
}
async function handleResetSettings(res, auth) {
  try {
    await query("DELETE FROM settings WHERE 1=1");
    const defaultSettings = [
      {
        key: "site_name",
        value: "MIHAS-KATC Application System",
        description: "Name of the application system",
        category: "general",
        is_public: true
      },
      {
        key: "contact_email",
        value: "admissions@mihas-katc.ac.zm",
        description: "Main contact email for admissions",
        category: "contact",
        is_public: true
      },
      {
        key: "contact_phone",
        value: "+260-123-456-789",
        description: "Main contact phone number",
        category: "contact",
        is_public: true
      },
      {
        key: "application_fee",
        value: "50.00",
        description: "Application processing fee in USD",
        category: "finance",
        is_public: true
      },
      {
        key: "max_applications_per_user",
        value: "3",
        description: "Maximum number of applications a user can submit",
        category: "limits",
        is_public: false
      },
      {
        key: "enable_online_applications",
        value: "true",
        description: "Enable or disable online application submissions",
        category: "general",
        is_public: true
      }
    ];
    for (const setting of defaultSettings) {
      await query(`INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`, [
        setting.key,
        JSON.stringify(setting.value),
        setting.description,
        setting.category,
        setting.is_public,
        auth.userId
      ]);
    }
    await logAuditEvent({
      actor_id: auth.userId,
      action: "settings_reset_to_defaults",
      entity_type: "setting",
      entity_id: "all",
      changes: {
        reset_count: defaultSettings.length
      }
    });
    sendSuccess(res, {
      message: "Settings reset to defaults successfully",
      count: defaultSettings.length
    });
  } catch (error) {
    console.error("[ADMIN] Reset settings error:", error instanceof Error ? error.message : "Unknown error");
    sendError(res, "Failed to reset settings", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
async function handleEligibilityRules(req, res, _auth) {
  if (req.method === "GET") {
    sendSuccess(res, { rules: [], message: "Eligibility rules feature not yet configured" });
    return;
  }
  sendError(res, "Eligibility rules feature not yet configured", HttpStatus.SERVICE_UNAVAILABLE);
}
async function handleUpdateRole(req, res, auth) {
  const { userId, role } = req.body;
  if (!userId || !role) {
    sendError(res, "userId and role are required", HttpStatus.BAD_REQUEST);
    return;
  }
  const validRoles = ["student", "reviewer", "admin", "super_admin"];
  if (!validRoles.includes(role)) {
    sendError(res, `Invalid role. Valid roles: ${validRoles.join(", ")}`, HttpStatus.BAD_REQUEST);
    return;
  }
  if ((role === "admin" || role === "super_admin") && auth.role !== "super_admin") {
    sendError(res, "Only super_admin can assign admin or super_admin roles", HttpStatus.FORBIDDEN);
    return;
  }
  if (userId === auth.userId) {
    sendError(res, "Cannot change your own role", HttpStatus.FORBIDDEN);
    return;
  }
  try {
    const result = await query("UPDATE profiles SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, first_name, last_name, role", [role, userId]);
    if (result.rows.length === 0) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    try {
      await query(`INSERT INTO user_roles (user_id, role, is_active, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), NOW())
         ON CONFLICT (user_id) 
         DO UPDATE SET role = EXCLUDED.role, is_active = true, updated_at = NOW()`, [userId, role]);
    } catch {}
    await logAuditEvent({
      actor_id: auth.userId,
      action: "user_role_updated",
      entity_type: "user",
      entity_id: userId,
      changes: { new_role: role }
    });
    sendSuccess(res, { user: result.rows[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleEligibilityAssessments(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60");
  sendSuccess(res, { assessments: [], message: "Eligibility assessments feature not yet configured" });
}
async function handleAuditLog(req, res) {
  let page = parseInt(req.query.page || "1", 10);
  let pageSize = parseInt(req.query.pageSize || "50", 10);
  if (isNaN(page) || page < 1)
    page = 1;
  if (isNaN(pageSize) || pageSize < 1)
    pageSize = 50;
  if (pageSize > 200)
    pageSize = 200;
  const filterAction = req.query.filter_action?.trim();
  const filterEntityType = req.query.filter_entity_type?.trim();
  const filterFrom = req.query.filter_from;
  const filterTo = req.query.filter_to;
  const offset = (page - 1) * pageSize;
  try {
    const whereClauses = [];
    const params = [];
    if (filterAction) {
      params.push(filterAction);
      whereClauses.push(`action = $${params.length}`);
    }
    if (filterEntityType) {
      params.push(filterEntityType);
      whereClauses.push(`entity_type = $${params.length}`);
    }
    if (filterFrom) {
      params.push(filterFrom);
      whereClauses.push(`created_at >= $${params.length}::timestamptz`);
    }
    if (filterTo) {
      params.push(filterTo);
      whereClauses.push(`created_at <= $${params.length}::timestamptz`);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as count FROM audit_logs ${whereSql}`;
    const entriesQuery = `
      SELECT id, actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at
      FROM audit_logs
      ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const [countResult, entriesResult] = await Promise.all([
      query(countQuery, params),
      query(entriesQuery, [...params, pageSize, offset])
    ]);
    const totalCount = parseInt(countResult.rows[0]?.count || "0", 10);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    sendSuccess(res, {
      entries: entriesResult.rows,
      totalCount,
      page,
      pageSize,
      totalPages
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    sendError(res, message, HttpStatus.BAD_REQUEST);
  }
}
async function handleAppeals(req, res) {
  let page = parseInt(req.query.page || "1", 10);
  let pageSize = parseInt(req.query.limit || req.query.pageSize || "50", 10);
  if (isNaN(page) || page < 1)
    page = 1;
  if (isNaN(pageSize) || pageSize < 1)
    pageSize = 50;
  if (pageSize > 200)
    pageSize = 200;
  const offset = (page - 1) * pageSize;
  try {
    const [countResult, appealsResult] = await Promise.all([
      query("SELECT COUNT(*) as count FROM eligibility_appeals"),
      query(`SELECT * FROM eligibility_appeals ORDER BY submitted_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT $1 OFFSET $2`, [pageSize, offset])
    ]);
    const totalCount = parseInt(countResult.rows[0]?.count || "0", 10);
    sendSuccess(res, {
      appeals: appealsResult.rows,
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize))
    });
  } catch {
    sendSuccess(res, {
      appeals: [],
      totalCount: 0,
      page,
      pageSize,
      totalPages: 1
    });
  }
}
export {
  admin_default as default
};
