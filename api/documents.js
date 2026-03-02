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

// lib/auth/ownership.ts
var ADMIN_ROLES = ["admin", "super_admin"];
var REVIEWER_ROLES = ["admin", "super_admin", "reviewer"];
function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}
function isReviewer(role) {
  return REVIEWER_ROLES.includes(role);
}
async function checkApplicationOwnership(userId, applicationId, userRole) {
  if (isReviewer(userRole)) {
    return true;
  }
  try {
    const result = await query("SELECT user_id FROM applications WHERE id = $1", [applicationId]);
    if (result.rows.length === 0) {
      return false;
    }
    return result.rows[0].user_id === userId;
  } catch {
    return false;
  }
}
async function checkDocumentUploadAccess(userId, applicationId, userRole) {
  if (isAdmin(userRole)) {
    return true;
  }
  return checkApplicationOwnership(userId, applicationId, userRole);
}

// lib/storage.ts
import { createHmac, createHash } from "crypto";
var R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
var R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
var R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
var R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "***REMOVED***";
var R2_ENDPOINT = process.env.R2_ENDPOINT || "";
var R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

class AwsV4Signer {
  accessKeyId;
  secretAccessKey;
  region;
  service;
  constructor(accessKeyId, secretAccessKey, region = "auto", service = "s3") {
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.region = region;
    this.service = service;
  }
  sign(method, url, headers, body) {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = datetime.substring(0, 8);
    headers["x-amz-date"] = datetime;
    headers["x-amz-content-sha256"] = body ? createHash("sha256").update(body).digest("hex") : "UNSIGNED-PAYLOAD";
    headers["host"] = parsedUrl.host;
    const signedHeaders = Object.keys(headers).map((k) => k.toLowerCase()).sort().join(";");
    const canonicalHeaders = Object.keys(headers).map((k) => `${k.toLowerCase()}:${headers[k].trim()}`).sort().join(`
`);
    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      parsedUrl.search.substring(1),
      canonicalHeaders + `
`,
      signedHeaders,
      headers["x-amz-content-sha256"]
    ].join(`
`);
    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      datetime,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex")
    ].join(`
`);
    const kDate = createHmac("sha256", `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac("sha256", kDate).update(this.region).digest();
    const kService = createHmac("sha256", kRegion).update(this.service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    headers["Authorization"] = [
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(", ");
    return headers;
  }
  getSignedUrl(method, url, expiresIn = 3600) {
    const parsedUrl = new URL(url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = datetime.substring(0, 8);
    const credentialScope = `${date}/${this.region}/${this.service}/aws4_request`;
    const params = new URLSearchParams(parsedUrl.search);
    params.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
    params.set("X-Amz-Credential", `${this.accessKeyId}/${credentialScope}`);
    params.set("X-Amz-Date", datetime);
    params.set("X-Amz-Expires", String(expiresIn));
    params.set("X-Amz-SignedHeaders", "host");
    const sortedParams = new URLSearchParams([...params.entries()].sort());
    parsedUrl.search = sortedParams.toString();
    const canonicalRequest = [
      method,
      parsedUrl.pathname,
      sortedParams.toString(),
      `host:${parsedUrl.host}
`,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join(`
`);
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      datetime,
      credentialScope,
      createHash("sha256").update(canonicalRequest).digest("hex")
    ].join(`
`);
    const kDate = createHmac("sha256", `AWS4${this.secretAccessKey}`).update(date).digest();
    const kRegion = createHmac("sha256", kDate).update(this.region).digest();
    const kService = createHmac("sha256", kRegion).update(this.service).digest();
    const kSigning = createHmac("sha256", kService).update("aws4_request").digest();
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    sortedParams.set("X-Amz-Signature", signature);
    parsedUrl.search = sortedParams.toString();
    return parsedUrl.toString();
  }
}

class R2StorageAdapter {
  signer;
  bucketName;
  endpoint;
  publicUrl;
  constructor() {
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      console.warn("[R2Storage] Missing R2 credentials - storage operations will fail");
    }
    this.signer = new AwsV4Signer(R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
    this.bucketName = R2_BUCKET_NAME;
    this.endpoint = R2_ENDPOINT;
    this.publicUrl = R2_PUBLIC_URL;
  }
  isConfigured() {
    return !!(R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_ACCOUNT_ID);
  }
  async upload(path, data, contentType = "application/octet-stream") {
    if (!this.isConfigured()) {
      return { success: false, error: "R2 storage not configured" };
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {
      "Content-Type": contentType,
      "Content-Length": String(data.length)
    };
    try {
      const signedHeaders = this.signer.sign("PUT", url, headers, data);
      const response = await fetch(url, {
        method: "PUT",
        headers: signedHeaders,
        body: data
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("[R2Storage] Upload failed:", response.status, errorText);
        return { success: false, error: `Upload failed: ${response.status}` };
      }
      console.log("[R2Storage] File uploaded:", path);
      return {
        success: true,
        path,
        url: `${this.publicUrl}/${path}`,
        size: data.length,
        contentType
      };
    } catch (error) {
      console.error("[R2Storage] Upload error:", error);
      return { success: false, error: error.message };
    }
  }
  async download(path) {
    if (!this.isConfigured()) {
      console.error("[R2Storage] R2 storage not configured");
      return null;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("GET", url, headers);
      const response = await fetch(url, {
        method: "GET",
        headers: signedHeaders
      });
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        console.error("[R2Storage] Download failed:", response.status);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error("[R2Storage] Download error:", error);
      return null;
    }
  }
  async delete(path) {
    if (!this.isConfigured()) {
      console.error("[R2Storage] R2 storage not configured");
      return false;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("DELETE", url, headers);
      const response = await fetch(url, {
        method: "DELETE",
        headers: signedHeaders
      });
      if (!response.ok && response.status !== 204) {
        console.error("[R2Storage] Delete failed:", response.status);
        return false;
      }
      console.log("[R2Storage] File deleted:", path);
      return true;
    } catch (error) {
      console.error("[R2Storage] Delete error:", error);
      return false;
    }
  }
  getSignedUrl(path, expiresIn = 3600) {
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    return this.signer.getSignedUrl("GET", url, expiresIn);
  }
  getPublicUrl(path) {
    return `${this.publicUrl}/${path}`;
  }
  async exists(path) {
    if (!this.isConfigured()) {
      return false;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("HEAD", url, headers);
      const response = await fetch(url, {
        method: "HEAD",
        headers: signedHeaders
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  async getMetadata(path) {
    if (!this.isConfigured()) {
      return null;
    }
    const url = `${this.endpoint}/${this.bucketName}/${path}`;
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("HEAD", url, headers);
      const response = await fetch(url, {
        method: "HEAD",
        headers: signedHeaders
      });
      if (!response.ok) {
        return null;
      }
      return {
        path,
        size: parseInt(response.headers.get("content-length") || "0", 10),
        contentType: response.headers.get("content-type") || "application/octet-stream",
        lastModified: new Date(response.headers.get("last-modified") || Date.now()),
        etag: response.headers.get("etag") || undefined
      };
    } catch {
      return null;
    }
  }
  async list(prefix = "", maxKeys = 1000) {
    if (!this.isConfigured()) {
      return [];
    }
    const url = new URL(`${this.endpoint}/${this.bucketName}`);
    if (prefix) {
      url.searchParams.set("prefix", prefix);
    }
    url.searchParams.set("max-keys", String(maxKeys));
    const headers = {};
    try {
      const signedHeaders = this.signer.sign("GET", url.toString(), headers);
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: signedHeaders
      });
      if (!response.ok) {
        console.error("[R2Storage] List failed:", response.status);
        return [];
      }
      const xml = await response.text();
      const keys = [];
      const keyMatches = xml.matchAll(/<Key>([^<]+)<\/Key>/g);
      for (const match of keyMatches) {
        keys.push(match[1]);
      }
      return keys;
    } catch (error) {
      console.error("[R2Storage] List error:", error);
      return [];
    }
  }
}
var r2Instance = null;
function getR2Storage() {
  if (!r2Instance) {
    r2Instance = new R2StorageAdapter;
  }
  return r2Instance;
}
function isR2Available() {
  return getR2Storage().isConfigured();
}

// api-src/documents.ts
var MAX_FILE_SIZE = 10 * 1024 * 1024;
var ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  const user = await getAuthUser(req);
  if (!user) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  const action = req.query.action || "upload";
  try {
    switch (action) {
      case "upload":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleUpload(req, res, user.userId, user.role);
      case "extract":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleExtract(req, res, user.userId, user.role);
      case "download":
        if (req.method !== "GET") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleDownload(req, res, user.userId, user.role);
      case "delete":
        if (req.method !== "DELETE" && req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleDelete(req, res, user.userId, user.role);
      case "signed-url":
        if (req.method !== "GET" && req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleSignedUrl(req, res, user.userId, user.role);
      case "register-slip":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleRegisterSlip(req, res, user.userId, user.role);
      case "resolve-reference":
        if (req.method !== "POST") {
          return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
        }
        return await handleResolveReference(req, res, user.userId, user.role);
      default:
        return sendError(res, "Invalid action. Valid: upload, extract, download, delete, signed-url, register-slip, resolve-reference", HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, "documents");
  }
}
function normalizeLegacySupabasePath(reference) {
  const trimmed = reference.trim();
  if (!trimmed)
    return null;
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const match = parsed.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/app_docs\/(.+)$/i);
    if (!match?.[1])
      return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
async function handleRegisterSlip(req, res, authUserId, userRole) {
  const { applicationNumber, path, publicUrl, documentName } = req.body || {};
  if (!applicationNumber || !path) {
    return sendError(res, "applicationNumber and path are required", HttpStatus.BAD_REQUEST);
  }
  const applicationResult = await query(`SELECT id, user_id FROM applications WHERE application_number = $1 LIMIT 1`, [applicationNumber]);
  const application = applicationResult.rows[0];
  if (!application) {
    return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
  }
  const adminRoles = ["admin", "super_admin", "admissions_officer"];
  if (!adminRoles.includes(userRole) && application.user_id !== authUserId) {
    return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
  }
  const r2 = getR2Storage();
  const fileUrl = publicUrl || r2.getPublicUrl(path);
  const safeDocumentName = documentName || `Application Slip - ${applicationNumber}.pdf`;
  const existingResult = await query(`SELECT id FROM application_documents
     WHERE application_id = $1 AND document_type = 'application_slip'
     ORDER BY created_at DESC
     LIMIT 1`, [application.id]);
  const existingId = existingResult.rows[0]?.id;
  let documentId;
  if (existingId) {
    const updated = await query(`UPDATE application_documents
       SET document_name = $2,
           file_url = $3,
           system_generated = true,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id`, [existingId, safeDocumentName, fileUrl]);
    documentId = updated.rows[0].id;
  } else {
    const inserted = await query(`INSERT INTO application_documents (
        id, application_id, document_type, document_name,
        file_url, mime_type, system_generated,
        verification_status, uploaded_at, created_at, updated_at
      ) VALUES (gen_random_uuid(), $1, 'application_slip', $2, $3, 'application/pdf', true, 'pending', NOW(), NOW(), NOW())
      RETURNING id`, [application.id, safeDocumentName, fileUrl]);
    documentId = inserted.rows[0].id;
  }
  return sendSuccess(res, { documentId, path, publicUrl: fileUrl });
}
async function handleResolveReference(req, res, authUserId, userRole) {
  const { reference, applicationId } = req.body || {};
  if (!reference || typeof reference !== "string") {
    return sendError(res, "reference is required", HttpStatus.BAD_REQUEST);
  }
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
    }
  }
  const normalizedPath = normalizeLegacySupabasePath(reference);
  if (!normalizedPath) {
    return sendError(res, "Unsupported document reference", HttpStatus.BAD_REQUEST);
  }
  const r2 = getR2Storage();
  const url = r2.getPublicUrl(normalizedPath);
  return sendSuccess(res, {
    path: normalizedPath,
    publicUrl: url,
    migrated: reference !== normalizedPath
  });
}
async function handleUpload(req, res, authUserId, userRole) {
  const { file, fileName, fileType, contentType, userId, applicationId, applicationNumber, documentType } = req.body;
  if (!file || !fileName) {
    return sendError(res, "File and fileName are required", HttpStatus.BAD_REQUEST);
  }
  let resolvedApplicationId = applicationId;
  if (!resolvedApplicationId && applicationNumber) {
    const appResult = await query(`SELECT id FROM applications WHERE application_number = $1 LIMIT 1`, [applicationNumber]);
    resolvedApplicationId = appResult.rows[0]?.id;
  }
  if (resolvedApplicationId) {
    const canUpload = await checkDocumentUploadAccess(authUserId, resolvedApplicationId, userRole);
    if (!canUpload) {
      return sendError(res, "Access denied: cannot upload to this application", HttpStatus.FORBIDDEN);
    }
  }
  const fileBuffer = Buffer.from(file, "base64");
  if (fileBuffer.length > MAX_FILE_SIZE) {
    return sendError(res, "File size must be less than 10MB", HttpStatus.BAD_REQUEST);
  }
  const mimeType = contentType || fileType || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return sendError(res, "Only PDF, JPG, JPEG, and PNG files are allowed", HttpStatus.BAD_REQUEST);
  }
  const effectiveUserId = isAdmin(userRole) && userId ? userId : authUserId;
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const storagePath = `${effectiveUserId}/${resolvedApplicationId || applicationNumber || "general"}/${documentType || "document"}/${timestamp}-${sanitizedFileName}`;
  if (!isR2Available()) {
    console.error("[documents/upload] R2 storage is not configured");
    return sendError(res, "Storage service unavailable", HttpStatus.SERVICE_UNAVAILABLE);
  }
  const r2 = getR2Storage();
  const result = await r2.upload(storagePath, fileBuffer, mimeType);
  if (!result.success) {
    console.error("[documents/upload] R2 upload failed:", result.error);
    return sendError(res, "Failed to upload document", HttpStatus.INTERNAL_SERVER_ERROR);
  }
  console.log("[documents/upload] Document uploaded to R2:", result.path);
  return sendSuccess(res, {
    path: result.path,
    url: result.url,
    storage: "r2",
    size: result.size
  });
}
async function handleDownload(req, res, authUserId, userRole) {
  const path = req.query.path;
  const applicationId = req.query.applicationId;
  if (!path) {
    return sendError(res, "Path is required", HttpStatus.BAD_REQUEST);
  }
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
    }
  }
  if (!isR2Available()) {
    console.error("[documents/download] R2 storage is not configured");
    return sendError(res, "Storage service unavailable", HttpStatus.SERVICE_UNAVAILABLE);
  }
  const r2 = getR2Storage();
  const data = await r2.download(path);
  if (!data) {
    return sendError(res, "Document not found", HttpStatus.NOT_FOUND);
  }
  const metadata = await r2.getMetadata(path);
  res.setHeader("Content-Type", metadata?.contentType || "application/octet-stream");
  res.setHeader("Content-Length", data.length);
  res.setHeader("Content-Disposition", `attachment; filename="${path.split("/").pop()}"`);
  return res.status(200).send(data);
}
async function handleDelete(req, res, authUserId, userRole) {
  const path = req.query.path || req.body?.path;
  const applicationId = req.query.applicationId || req.body?.applicationId;
  if (!path) {
    return sendError(res, "Path is required", HttpStatus.BAD_REQUEST);
  }
  if (!isAdmin(userRole)) {
    if (!path.startsWith(authUserId)) {
      return sendError(res, "Access denied: cannot delete this document", HttpStatus.FORBIDDEN);
    }
  }
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
    }
  }
  if (!isR2Available()) {
    console.error("[documents/delete] R2 storage is not configured");
    return sendError(res, "Storage service unavailable", HttpStatus.SERVICE_UNAVAILABLE);
  }
  const r2 = getR2Storage();
  const deleted = await r2.delete(path);
  if (!deleted) {
    return sendError(res, "Document not found or could not be deleted", HttpStatus.NOT_FOUND);
  }
  console.log("[documents/delete] Document deleted from R2:", path);
  return sendSuccess(res, { deleted: true, path });
}
async function handleSignedUrl(req, res, authUserId, userRole) {
  const path = req.query.path || req.body?.path;
  const applicationId = req.query.applicationId || req.body?.applicationId;
  const expiresIn = parseInt(req.query.expiresIn || req.body?.expiresIn || "3600", 10);
  if (!path) {
    return sendError(res, "Path is required", HttpStatus.BAD_REQUEST);
  }
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
    }
  }
  if (!isR2Available()) {
    console.error("[documents/signed-url] R2 storage is not configured");
    return sendError(res, "Storage service unavailable", HttpStatus.SERVICE_UNAVAILABLE);
  }
  const r2 = getR2Storage();
  const exists = await r2.exists(path);
  if (!exists) {
    return sendError(res, "Document not found", HttpStatus.NOT_FOUND);
  }
  const signedUrl = r2.getSignedUrl(path, expiresIn);
  return sendSuccess(res, {
    url: signedUrl,
    expiresIn,
    storage: "r2"
  });
}
async function handleExtract(req, res, authUserId, userRole) {
  const { documentUrl, applicationId } = req.body;
  if (!documentUrl) {
    return sendError(res, "Document URL is required", HttpStatus.BAD_REQUEST);
  }
  if (applicationId) {
    const canAccess = await checkDocumentUploadAccess(authUserId, applicationId, userRole);
    if (!canAccess) {
      return sendError(res, "Access denied: cannot access this application", HttpStatus.FORBIDDEN);
    }
  }
  let pdfBytes;
  try {
    const response = await fetch(documentUrl);
    if (!response.ok) {
      return sendError(res, "Document not found", HttpStatus.NOT_FOUND);
    }
    pdfBytes = await response.arrayBuffer();
  } catch {
    return sendError(res, "Failed to fetch document", HttpStatus.INTERNAL_SERVER_ERROR);
  }
  const { PDFDocument } = await import("pdf-lib");
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(pdfBytes);
  } catch {
    return sendError(res, "Invalid PDF format", HttpStatus.BAD_REQUEST);
  }
  const metadata = {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle() || null,
    author: pdfDoc.getAuthor() || null,
    creationDate: pdfDoc.getCreationDate()?.toISOString() || null
  };
  const isScanned = true;
  const result = { metadata, isScanned, text: "" };
  if (applicationId) {
    try {
      console.log("[documents/extract] Skipping document_analysis storage (table not configured)");
    } catch {
      console.log("[documents/extract] Failed to store results");
    }
  }
  console.log("[documents/extract] PDF processed, pages:", metadata.pageCount);
  return sendSuccess(res, result);
}
var documents_default = withArcjetProtection(handler, "general");
export {
  documents_default as default
};
