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
async function getAuthUser(req) {
  const token = extractToken(req);
  if (!token) {
    return null;
  }
  try {
    const payload = await verifyAccessToken(token);
    return mapPayloadToAuthContext(payload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("[AUTH] Token verification failed:", errorMessage);
    return null;
  }
}
function mapPayloadToAuthContext(payload) {
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions || []
  };
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

// lib/queries.ts
var USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  REVIEWER: "reviewer",
  STUDENT: "student"
};

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
  sanitized = sanitized.replace(/https?:\/\/[^\s"']+(?:\/auth\/v1|\/rest\/v1)[^\s"']*/gi, "[DB_API_URL]");
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.neon\.tech[^\s"']*/gi, "[DB_URL]");
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

// lib/notificationPolicy.ts
var MANDATORY_EMAIL_TYPES = [
  "application_status_change",
  "payment_verified",
  "interview_scheduled"
];
function isMandatoryEmailType(type) {
  return MANDATORY_EMAIL_TYPES.includes(type);
}
var EMAIL_TYPE_MAP = {
  welcome: { templateName: "welcome", preferenceKey: null },
  application_submitted: { templateName: "application-submitted", preferenceKey: "application_updates" },
  application_status_change: { templateName: "status-change", preferenceKey: null },
  payment_verified: { templateName: "payment-verified", preferenceKey: null },
  interview_scheduled: { templateName: "interview-scheduled", preferenceKey: null },
  info: { templateName: "generic", preferenceKey: "application_updates" },
  warning: { templateName: "generic", preferenceKey: "application_updates" }
};
function getEmailMapping(type) {
  return EMAIL_TYPE_MAP[type] ?? null;
}

// lib/emailTemplates.ts
var PORTAL_URL = "***REMOVED***";
function esc(value) {
  const lookup = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(value ?? "").replace(/[&<>"']/g, (ch) => lookup[ch] ?? ch);
}
function greeting(name) {
  return name ? `Dear ${esc(name)},` : "Hello,";
}
function actionButton(url, label) {
  return `<tr><td style="padding:24px 0;">
    <a href="${esc(url)}" style="display:inline-block;padding:12px 28px;background-color:#0ea5e9;color:#ffffff;font-weight:600;border-radius:6px;text-decoration:none;font-size:15px;">${esc(label)}</a>
  </td></tr>`;
}
function wrapLayout(content) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MIHAS Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6f9;font-family:'Helvetica Neue',Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f9;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="background-color:#0f172a;padding:24px 40px;text-align:center;">
            <h1 style="margin:0;font-size:20px;color:#ffffff;font-weight:700;letter-spacing:0.5px;">Mukuba Institute of Health and Allied Sciences</h1>
            <p style="margin:4px 0 0;font-size:13px;color:#94a3b8;">MIHAS Admissions Portal</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${content}
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#64748b;line-height:1.6;">
              &copy; ${year} Mukuba Institute of Health and Allied Sciences (MIHAS). All rights reserved.<br/>
              This is an automated message. Please do not reply directly to this email.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
function welcomeTemplate(data) {
  const rows = `
    <tr><td style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 16px;">${greeting(data.recipientName)}</p>
      <p style="margin:0 0 16px;">Welcome to MIHAS! Your account has been created successfully. You can now begin your application through our admissions portal.</p>
      <p style="margin:0 0 4px;">Here is what to do next:</p>
      <ul style="margin:0 0 16px;padding-left:20px;color:#374151;">
        <li>Complete your profile information</li>
        <li>Start a new application</li>
        <li>Upload required documents</li>
      </ul>
    </td></tr>
    ${actionButton(data.actionUrl || PORTAL_URL, "Go to Portal")}`;
  return wrapLayout(rows);
}
function applicationSubmittedTemplate(data) {
  const rows = `
    <tr><td style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 16px;">${greeting(data.recipientName)}</p>
      <p style="margin:0 0 16px;">Your application has been submitted successfully. Our admissions team will review it and notify you of any updates.</p>
      ${data.applicationNumber ? `<p style="margin:0 0 8px;"><strong>Application Number:</strong> ${esc(data.applicationNumber)}</p>` : ""}
      ${data.programName ? `<p style="margin:0 0 16px;"><strong>Programme:</strong> ${esc(data.programName)}</p>` : ""}
      <p style="margin:0;">You can track your application status at any time through the portal.</p>
    </td></tr>
    ${actionButton(data.actionUrl || PORTAL_URL, "Track Application")}`;
  return wrapLayout(rows);
}
function statusChangeTemplate(data) {
  const statusDisplay = data.status ? data.status.replace(/[_\s]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Updated";
  const rows = `
    <tr><td style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 16px;">${greeting(data.recipientName)}</p>
      <p style="margin:0 0 16px;">The status of your application has been updated.</p>
      ${data.applicationNumber ? `<p style="margin:0 0 8px;"><strong>Application Number:</strong> ${esc(data.applicationNumber)}</p>` : ""}
      <p style="margin:0 0 8px;"><strong>New Status:</strong> ${esc(statusDisplay)}</p>
      ${data.programName ? `<p style="margin:0 0 16px;"><strong>Programme:</strong> ${esc(data.programName)}</p>` : ""}
      <p style="margin:0;">Log in to the portal for full details.</p>
    </td></tr>
    ${actionButton(data.actionUrl || PORTAL_URL, "View Application")}`;
  return wrapLayout(rows);
}
function paymentVerifiedTemplate(data) {
  const rows = `
    <tr><td style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 16px;">${greeting(data.recipientName)}</p>
      <p style="margin:0 0 16px;">Your payment has been verified. Thank you for completing this step in the admissions process.</p>
      ${data.applicationNumber ? `<p style="margin:0 0 8px;"><strong>Application Number:</strong> ${esc(data.applicationNumber)}</p>` : ""}
      ${data.programName ? `<p style="margin:0 0 16px;"><strong>Programme:</strong> ${esc(data.programName)}</p>` : ""}
      <p style="margin:0;">You will be notified of the next steps shortly.</p>
    </td></tr>
    ${actionButton(data.actionUrl || PORTAL_URL, "View Application")}`;
  return wrapLayout(rows);
}
function interviewScheduledTemplate(data) {
  const rows = `
    <tr><td style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 16px;">${greeting(data.recipientName)}</p>
      <p style="margin:0 0 16px;">An interview has been scheduled for your application. Please review the details below and make sure to attend on time.</p>
      ${data.applicationNumber ? `<p style="margin:0 0 8px;"><strong>Application Number:</strong> ${esc(data.applicationNumber)}</p>` : ""}
      ${data.interviewDate ? `<p style="margin:0 0 8px;"><strong>Date &amp; Time:</strong> ${esc(data.interviewDate)}</p>` : ""}
      ${data.interviewLocation ? `<p style="margin:0 0 8px;"><strong>Location:</strong> ${esc(data.interviewLocation)}</p>` : ""}
      ${data.programName ? `<p style="margin:0 0 16px;"><strong>Programme:</strong> ${esc(data.programName)}</p>` : ""}
      <p style="margin:0;">If you need to reschedule, please contact the admissions office as soon as possible.</p>
    </td></tr>
    ${actionButton(data.actionUrl || PORTAL_URL, "View Details")}`;
  return wrapLayout(rows);
}
function genericTemplate(data) {
  const rows = `
    <tr><td style="font-size:16px;line-height:1.6;">
      <p style="margin:0 0 16px;">${greeting(data.recipientName)}</p>
      <p style="margin:0 0 16px;">${esc(data.message || "You have a new notification from MIHAS. Please log in to the portal for details.")}</p>
    </td></tr>
    ${actionButton(data.actionUrl || PORTAL_URL, "Go to Portal")}`;
  return wrapLayout(rows);
}
var TEMPLATE_MAP = {
  welcome: welcomeTemplate,
  "application-submitted": applicationSubmittedTemplate,
  "status-change": statusChangeTemplate,
  "payment-verified": paymentVerifiedTemplate,
  "interview-scheduled": interviewScheduledTemplate,
  generic: genericTemplate
};
function renderEmailTemplate(templateName, data) {
  const render = TEMPLATE_MAP[templateName] || TEMPLATE_MAP["generic"];
  return render(data);
}

// api-src/notifications.ts
function generateIdempotencyKey(userId, type, entityType, entityId) {
  return `${userId}:${type}:${entityType}:${entityId}`;
}
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  const action = req.query.action || "preferences";
  try {
    if (action === "preferences") {
      return await handlePreferences(req, res);
    }
    if (action === "list") {
      return await handleList(req, res);
    }
    if (action === "mark-read") {
      return await handleMarkRead(req, res);
    }
    if (action === "mark-all-read") {
      return await handleMarkAllRead(req, res);
    }
    if (action === "delete") {
      return await handleDelete(req, res);
    }
    if (action === "check-duplicate") {
      return await handleCheckDuplicate(req, res);
    }
    if (action === "create") {
      return await handleCreate(req, res);
    }
    if (action === "send") {
      return await handleSend(req, res);
    }
    if (action === "push-subscribe") {
      return await handlePushSubscribe(req, res);
    }
    if (action === "push-send") {
      return await handlePushSend(req, res);
    }
    return sendError(res, "Invalid action", HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, "notifications");
  }
}
async function handlePreferences(req, res) {
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  if (req.method === "GET") {
    const preferences = await getCanonicalPreferences(user.userId);
    return sendSuccess(res, { preferences });
  }
  if (req.method === "POST") {
    const { sms_enabled, whatsapp_enabled, application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end } = req.body;
    const upsertQ = {
      text: `
        INSERT INTO user_notification_preferences (
          user_id, email_enabled, push_enabled, sms_enabled, whatsapp_enabled, in_app_enabled,
          application_updates, payment_reminders, interview_reminders, marketing_emails,
          quiet_hours_start, quiet_hours_end, updated_at, created_at
        )
        VALUES ($1, true, true, COALESCE($2, true), COALESCE($3, true), true, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          email_enabled = true,
          push_enabled = true,
          sms_enabled = COALESCE($2, user_notification_preferences.sms_enabled, true),
          whatsapp_enabled = COALESCE($3, user_notification_preferences.whatsapp_enabled, true),
          in_app_enabled = true,
          application_updates = COALESCE($4, user_notification_preferences.application_updates, true),
          payment_reminders = COALESCE($5, user_notification_preferences.payment_reminders, true),
          interview_reminders = COALESCE($6, user_notification_preferences.interview_reminders, true),
          marketing_emails = COALESCE($7, user_notification_preferences.marketing_emails, false),
          quiet_hours_start = COALESCE($8, user_notification_preferences.quiet_hours_start),
          quiet_hours_end = COALESCE($9, user_notification_preferences.quiet_hours_end),
          updated_at = NOW()
        RETURNING *
      `,
      values: [
        user.userId,
        sms_enabled ?? true,
        whatsapp_enabled ?? true,
        application_updates ?? true,
        payment_reminders ?? true,
        interview_reminders ?? true,
        marketing_emails ?? false,
        quiet_hours_start ?? null,
        quiet_hours_end ?? null
      ]
    };
    const result = await query(upsertQ.text, upsertQ.values);
    console.log("[notifications/preferences] Updated for user:", user.userId.substring(0, 8) + "...");
    return sendSuccess(res, { preferences: result.rows[0] });
  }
  return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
}
async function handleList(req, res) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const result = await query(`SELECT id, title, message, type, is_read, action_url, created_at, read_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 50`, [user.userId]);
  const notifications = result.rows.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.message,
    type: n.type || "info",
    read: n.is_read,
    action_url: n.action_url,
    created_at: n.created_at,
    read_at: n.read_at
  }));
  return sendSuccess(res, notifications);
}
async function handleMarkRead(req, res) {
  if (req.method !== "PUT") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const { notificationId } = req.body || {};
  if (!notificationId) {
    return sendError(res, "notificationId is required", HttpStatus.BAD_REQUEST);
  }
  await query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`, [notificationId, user.userId]);
  return sendSuccess(res, { marked: true });
}
async function handleMarkAllRead(req, res) {
  if (req.method !== "PUT") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  await query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`, [user.userId]);
  return sendSuccess(res, { marked: true });
}
async function handleDelete(req, res) {
  if (req.method !== "DELETE") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const { notificationId } = req.body || {};
  if (!notificationId) {
    return sendError(res, "notificationId is required", HttpStatus.BAD_REQUEST);
  }
  await query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [notificationId, user.userId]);
  return sendSuccess(res, { deleted: true });
}
async function createNotificationWithDedup(userId, eventType, entityId, entityType, message, channel, extra) {
  const idempotencyKey = generateIdempotencyKey(userId, eventType, entityType, entityId);
  const existing = await query(`SELECT id FROM notifications
     WHERE user_id = $1 AND idempotency_key = $2
     AND created_at > NOW() - INTERVAL '1 hour'
     LIMIT 1`, [userId, idempotencyKey]);
  if (existing.rows.length > 0) {
    console.log("[notifications/dedup] Duplicate skipped — key:", idempotencyKey, "user:", userId.substring(0, 8) + "...");
    return { created: false };
  }
  const result = await query(`INSERT INTO notifications (id, user_id, type, title, message, idempotency_key, channel, action_url, is_read, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, false, NOW())
     RETURNING *`, [
    userId,
    eventType,
    extra?.title || message,
    message,
    idempotencyKey,
    channel,
    extra?.action_url || null
  ]);
  return {
    created: true,
    notificationId: result.rows[0]?.id,
    notification: result.rows[0]
  };
}
async function handleCheckDuplicate(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const { user_id, title, message, type, entity_type, entity_id } = req.body || {};
  const targetUserId = user_id || user.userId;
  if (!targetUserId || !title || !message) {
    return sendError(res, "user_id, title, and message are required", HttpStatus.BAD_REQUEST);
  }
  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (targetUserId !== user.userId && !isAdmin) {
    return sendError(res, "Forbidden", HttpStatus.FORBIDDEN);
  }
  const normalizedType = type || "info";
  const idempotencyKey = generateIdempotencyKey(targetUserId, normalizedType, entity_type || "notification", entity_id || title);
  const existing = await query(`SELECT id FROM notifications
     WHERE user_id = $1 AND idempotency_key = $2
     AND created_at > NOW() - INTERVAL '1 minute'
     LIMIT 1`, [targetUserId, idempotencyKey]);
  return sendSuccess(res, { duplicate: existing.rows.length > 0 });
}
async function handleCreate(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const { user_id, title, message, type, action_url, entity_type, entity_id } = req.body || {};
  const targetUserId = user_id || user.userId;
  if (!targetUserId || !title || !message) {
    return sendError(res, "user_id, title, and message are required", HttpStatus.BAD_REQUEST);
  }
  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (targetUserId !== user.userId && !isAdmin) {
    return sendError(res, "Forbidden", HttpStatus.FORBIDDEN);
  }
  const notificationType = type || "info";
  const idempotencyKey = generateIdempotencyKey(targetUserId, notificationType, entity_type || "notification", entity_id || title);
  const existing = await query(`SELECT id FROM notifications
     WHERE user_id = $1 AND idempotency_key = $2
     AND created_at > NOW() - INTERVAL '1 minute'
     LIMIT 1`, [targetUserId, idempotencyKey]);
  if (existing.rows.length > 0) {
    return sendSuccess(res, { duplicate: true });
  }
  const created = await query(`INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at, idempotency_key, channel)
     VALUES ($1, $2, $3, $4, $5, false, NOW(), $6, 'in_app')
     RETURNING *`, [targetUserId, title, message, notificationType, action_url || null, idempotencyKey]);
  try {
    await queueEmailForNotification(targetUserId, notificationType, title, message, action_url);
  } catch {
    console.log("[notifications/create] Email queuing failed — in-app notification still created");
  }
  return sendSuccess(res, { duplicate: false, notification: created.rows[0] });
}
async function handleSend(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdmin) {
    return sendError(res, "Admin access required", HttpStatus.FORBIDDEN);
  }
  const { user_id, title, message, type, action_url, entity_id, entity_type } = req.body;
  if (!user_id || !title || !message) {
    return sendError(res, "user_id, title, and message are required", HttpStatus.BAD_REQUEST);
  }
  const notificationType = type || "info";
  const mandatory = isMandatoryEmailType(notificationType);
  let notificationRow;
  if (entity_id && entity_type) {
    const dedupResult = await createNotificationWithDedup(user_id, notificationType, entity_id, entity_type, message, "in_app", { title, action_url: action_url || null });
    if (!dedupResult.created) {
      console.log("[notifications/send] Duplicate notification skipped for user:", user_id.substring(0, 8) + "...");
      return sendSuccess(res, { duplicate: true, message: "Notification already sent within deduplication window" });
    }
    notificationRow = dedupResult.notification;
  } else {
    const insertQ = {
      text: `
        INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
        VALUES ($1, $2, $3, $4, $5, false, NOW())
        RETURNING *
      `,
      values: [user_id, title, message, notificationType, action_url || null]
    };
    const result = await query(insertQ.text, insertQ.values);
    notificationRow = result.rows[0];
  }
  const recipientPreferences = await getCanonicalPreferences(user_id);
  const shouldSendEmail = mandatory || Boolean(recipientPreferences.email_enabled);
  let emailQueued = false;
  try {
    if (shouldSendEmail) {
      emailQueued = await queueEmailForNotification(user_id, notificationType, title, message, action_url);
    }
  } catch {
    console.log("[notifications/send] Email queuing failed — in-app notification still created");
  }
  console.log("[notifications/send] Notification created for user:", user_id.substring(0, 8) + "...");
  return sendSuccess(res, { notification: notificationRow, email_queued: emailQueued, mandatory });
}
async function queueEmailForNotification(userId, notificationType, title, message, actionUrl) {
  const mapping = getEmailMapping(notificationType);
  if (!mapping) {
    return false;
  }
  const profileResult = await query(`SELECT email, first_name FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
  const profile = profileResult.rows[0];
  if (!profile?.email) {
    console.log("[notifications/email-queue] No email on profile — skipping email queue");
    return false;
  }
  if (mapping.preferenceKey !== null) {
    const preferences = await getCanonicalPreferences(userId);
    if (!preferences[mapping.preferenceKey]) {
      console.log("[notifications/email-queue] User opted out of category — skipping");
      return false;
    }
  }
  const htmlBody = renderEmailTemplate(mapping.templateName, {
    recipientName: profile.first_name || undefined,
    message,
    actionUrl: actionUrl || undefined
  });
  await query(`INSERT INTO email_queue (recipient_email, recipient_name, subject, body, html_body, template_name, template_data, status, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`, [
    profile.email,
    profile.first_name || null,
    title,
    message,
    htmlBody,
    mapping.templateName,
    JSON.stringify({ recipientName: profile.first_name || null, message, actionUrl: actionUrl || null }),
    mapping.preferenceKey === null ? 1 : 5
  ]);
  console.log("[notifications/email-queue] Email queued — type:", notificationType);
  return true;
}
async function getCanonicalPreferences(userId) {
  const q = {
    text: `SELECT * FROM user_notification_preferences WHERE user_id = $1 LIMIT 1`,
    values: [userId]
  };
  const result = await query(q.text, q.values);
  return {
    user_id: userId,
    email_enabled: true,
    push_enabled: true,
    sms_enabled: result.rows[0]?.sms_enabled ?? true,
    whatsapp_enabled: result.rows[0]?.whatsapp_enabled ?? true,
    in_app_enabled: true,
    application_updates: result.rows[0]?.application_updates ?? true,
    payment_reminders: result.rows[0]?.payment_reminders ?? true,
    interview_reminders: result.rows[0]?.interview_reminders ?? true,
    marketing_emails: result.rows[0]?.marketing_emails ?? false,
    quiet_hours_start: result.rows[0]?.quiet_hours_start ?? null,
    quiet_hours_end: result.rows[0]?.quiet_hours_end ?? null
  };
}
async function handlePushSubscribe(req, res) {
  if (req.method === "POST") {
    return sendSuccess(res, { subscribed: false, message: "Push notifications not yet configured" });
  }
  if (req.method === "DELETE") {
    return sendSuccess(res, { unsubscribed: true });
  }
  return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
}
async function handlePushSend(req, res) {
  return sendSuccess(res, { sent: 0, message: "Push notifications not yet configured" });
}
var notifications_default = withArcjetProtection(handler, "general");
export {
  isMandatoryEmailType,
  generateIdempotencyKey,
  notifications_default as default,
  MANDATORY_EMAIL_TYPES
};
