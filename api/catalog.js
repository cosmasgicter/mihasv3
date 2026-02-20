import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

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
var CatalogQueries = {
  getPrograms: () => ({
    text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, is_active,
        created_at, updated_at
      FROM programs
      ORDER BY created_at DESC
    `,
    values: []
  }),
  getActivePrograms: () => ({
    text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, is_active,
        created_at, updated_at
      FROM programs
      WHERE is_active = true
      ORDER BY name ASC
    `,
    values: []
  }),
  getProgramById: (id) => ({
    text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, is_active,
        created_at, updated_at
      FROM programs
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  getIntakes: () => ({
    text: `
      SELECT *
      FROM intakes
      ORDER BY created_at DESC
    `,
    values: []
  }),
  getActiveIntakes: () => ({
    text: `
      SELECT *
      FROM intakes
      WHERE is_active = true AND application_deadline > NOW()
      ORDER BY start_date ASC
    `,
    values: []
  }),
  getIntakeById: (id) => ({
    text: `
      SELECT *
      FROM intakes
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  getSubjects: () => ({
    text: `
      SELECT *
      FROM subjects
      WHERE is_active = true
      ORDER BY name ASC
    `,
    values: []
  }),
  getSubjectById: (id) => ({
    text: `
      SELECT *
      FROM subjects
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  })
};

// lib/arcjet.ts
import arcjet, { shield, detectBot, fixedWindow } from "@arcjet/node";
var ARCJET_KEY = process.env.ARCJET_KEY;
if (!ARCJET_KEY) {
  console.error("[ARCJET] FATAL: ARCJET_KEY environment variable not set");
  console.error("[ARCJET] Security layer DISABLED - set ARCJET_KEY immediately");
}
var rateLimitConfigs = {
  auth: { window: "5m", max: 20 },
  session: { window: "10m", max: 30 },
  admin: { window: "10m", max: 20 },
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

// api-src/catalog.ts
var ADMIN_ROLES = ["admin", "super_admin", "admissions_officer"];
function isAdminRole(role) {
  return Boolean(role && ADMIN_ROLES.includes(role));
}
function normalizeProgram(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    duration_years: Number(row.duration_years ?? 0),
    institution_id: row.institution_id,
    is_active: row.is_active !== false,
    institution_name: row.institution_name,
    institution_code: row.institution_code,
    institutions: row.institution_id ? {
      id: row.institution_id,
      name: row.institution_name ?? "Unknown Institution",
      code: row.institution_code ?? undefined
    } : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function normalizeIntake(row) {
  return {
    id: row.id,
    name: row.name,
    year: Number(row.year ?? new Date(row.start_date).getFullYear()),
    start_date: row.start_date,
    end_date: row.end_date,
    application_deadline: row.application_deadline,
    total_capacity: Number(row.total_capacity ?? 0),
    available_spots: Number(row.available_spots ?? 0),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
async function validateInstitution(institutionId) {
  const result = await query("SELECT id, name, code, description, is_active FROM institutions WHERE id = $1 LIMIT 1", [institutionId]);
  if (result.rowCount === 0) {
    return null;
  }
  const institution = result.rows[0];
  if (!institution.is_active) {
    return null;
  }
  return institution;
}
async function ensureAdmin(req, res) {
  const user = await getAuthUser(req);
  if (!user) {
    sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
    return null;
  }
  if (!isAdminRole(user.role)) {
    sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
    return null;
  }
  return user;
}
async function listPrograms(res, includeInactive, shouldCache) {
  const result = await query(`SELECT
      p.id,
      p.name,
      p.description,
      COALESCE(p.duration_years, CEIL(COALESCE(p.duration_months, 0)::numeric / 12)::int) AS duration_years,
      p.institution_id,
      p.is_active,
      p.created_at,
      p.updated_at,
      i.name AS institution_name,
      i.code AS institution_code
    FROM programs p
    LEFT JOIN institutions i ON i.id = p.institution_id
    WHERE ($1::boolean = true OR p.is_active = true)
    ORDER BY p.name ASC`, [includeInactive]);
  if (shouldCache) {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
  return sendSuccess(res, { programs: result.rows.map(normalizeProgram) });
}
async function listIntakes(res, includeInactive, shouldCache) {
  const result = await query(`SELECT
      id,
      name,
      COALESCE(year, EXTRACT(YEAR FROM start_date)::int) AS year,
      start_date,
      end_date,
      application_deadline,
      COALESCE(total_capacity, 0) AS total_capacity,
      COALESCE(available_spots, 0) AS available_spots,
      is_active,
      created_at,
      updated_at
    FROM intakes
    WHERE ($1::boolean = true OR is_active = true)
    ORDER BY year DESC, start_date DESC`, [includeInactive]);
  if (shouldCache) {
    res.setHeader("Cache-Control", "public, max-age=300");
  }
  return sendSuccess(res, { intakes: result.rows.map(normalizeIntake) });
}
async function createProgram(req, res) {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const durationYears = Number(body.duration_years);
  const institutionId = String(body.institution_id || "").trim();
  if (!name) {
    return sendError(res, "Program name is required", HttpStatus.BAD_REQUEST);
  }
  if (!institutionId) {
    return sendError(res, "institution_id is required", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(durationYears) || durationYears < 1 || durationYears > 10) {
    return sendError(res, "duration_years must be between 1 and 10", HttpStatus.BAD_REQUEST);
  }
  const institution = await validateInstitution(institutionId);
  if (!institution) {
    return sendError(res, "Invalid or inactive institution_id", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`INSERT INTO programs (name, description, duration_years, institution_id, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, true, NOW(), NOW())
     RETURNING
      id,
      name,
      description,
      duration_years,
      institution_id,
      is_active,
      created_at,
      updated_at,
      $5::text AS institution_name,
      $6::text AS institution_code`, [name, description || null, durationYears, institutionId, institution.name, institution.code || null]);
  return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
}
async function updateProgram(req, res) {
  const body = req.body || {};
  const id = String(body.id || "").trim();
  const name = String(body.name || "").trim();
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const durationYears = Number(body.duration_years);
  const institutionId = String(body.institution_id || "").trim();
  const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;
  if (!id) {
    return sendError(res, "Program id is required", HttpStatus.BAD_REQUEST);
  }
  if (!name) {
    return sendError(res, "Program name is required", HttpStatus.BAD_REQUEST);
  }
  if (!institutionId) {
    return sendError(res, "institution_id is required", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(durationYears) || durationYears < 1 || durationYears > 10) {
    return sendError(res, "duration_years must be between 1 and 10", HttpStatus.BAD_REQUEST);
  }
  const institution = await validateInstitution(institutionId);
  if (!institution) {
    return sendError(res, "Invalid or inactive institution_id", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`UPDATE programs
     SET name = $2,
         description = $3,
         duration_years = $4,
         institution_id = $5,
         is_active = COALESCE($6, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING
      id,
      name,
      description,
      duration_years,
      institution_id,
      is_active,
      created_at,
      updated_at,
      $7::text AS institution_name,
      $8::text AS institution_code`, [id, name, description || null, durationYears, institutionId, isActive ?? null, institution.name, institution.code || null]);
  if (result.rowCount === 0) {
    return sendError(res, "Program not found", HttpStatus.NOT_FOUND);
  }
  return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
}
async function deleteProgram(req, res) {
  const body = req.body || {};
  const id = String(body.id || req.query.id || "").trim();
  if (!id) {
    return sendError(res, "Program id is required", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`UPDATE programs
     SET is_active = false,
         updated_at = NOW()
     WHERE id = $1 AND is_active = true
     RETURNING id`, [id]);
  if (result.rowCount === 0) {
    return sendError(res, "Program not found or already inactive", HttpStatus.NOT_FOUND);
  }
  return sendSuccess(res, { deleted: true, id });
}
async function createIntake(req, res) {
  const body = req.body || {};
  const name = String(body.name || "").trim();
  const year = Number(body.year);
  const startDate = String(body.start_date || "").trim();
  const endDate = String(body.end_date || "").trim();
  const applicationDeadline = String(body.application_deadline || "").trim();
  const totalCapacity = Number(body.total_capacity);
  const availableSpots = Number(body.available_spots ?? totalCapacity);
  if (!name || !startDate || !endDate || !applicationDeadline) {
    return sendError(res, "name, start_date, end_date, and application_deadline are required", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(year) || year < 2000) {
    return sendError(res, "Valid year is required", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(totalCapacity) || totalCapacity < 1) {
    return sendError(res, "total_capacity must be at least 1", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(availableSpots) || availableSpots < 0 || availableSpots > totalCapacity) {
    return sendError(res, "available_spots must be between 0 and total_capacity", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`INSERT INTO intakes (
      name, year, start_date, end_date, application_deadline,
      total_capacity, available_spots, is_active, created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
    RETURNING
      id, name, year, start_date, end_date, application_deadline,
      total_capacity, available_spots, is_active, created_at, updated_at`, [name, year, startDate, endDate, applicationDeadline, totalCapacity, availableSpots]);
  return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
}
async function updateIntake(req, res) {
  const body = req.body || {};
  const id = String(body.id || "").trim();
  const name = String(body.name || "").trim();
  const year = Number(body.year);
  const startDate = String(body.start_date || "").trim();
  const endDate = String(body.end_date || "").trim();
  const applicationDeadline = String(body.application_deadline || "").trim();
  const totalCapacity = Number(body.total_capacity);
  const availableSpots = Number(body.available_spots ?? totalCapacity);
  const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;
  if (!id) {
    return sendError(res, "Intake id is required", HttpStatus.BAD_REQUEST);
  }
  if (!name || !startDate || !endDate || !applicationDeadline) {
    return sendError(res, "name, start_date, end_date, and application_deadline are required", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(year) || year < 2000) {
    return sendError(res, "Valid year is required", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(totalCapacity) || totalCapacity < 1) {
    return sendError(res, "total_capacity must be at least 1", HttpStatus.BAD_REQUEST);
  }
  if (!Number.isFinite(availableSpots) || availableSpots < 0 || availableSpots > totalCapacity) {
    return sendError(res, "available_spots must be between 0 and total_capacity", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`UPDATE intakes
     SET name = $2,
         year = $3,
         start_date = $4,
         end_date = $5,
         application_deadline = $6,
         total_capacity = $7,
         available_spots = $8,
         is_active = COALESCE($9, is_active),
         updated_at = NOW()
     WHERE id = $1
     RETURNING
       id, name, year, start_date, end_date, application_deadline,
       total_capacity, available_spots, is_active, created_at, updated_at`, [id, name, year, startDate, endDate, applicationDeadline, totalCapacity, availableSpots, isActive ?? null]);
  if (result.rowCount === 0) {
    return sendError(res, "Intake not found", HttpStatus.NOT_FOUND);
  }
  return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
}
async function deleteIntake(req, res) {
  const body = req.body || {};
  const id = String(body.id || req.query.id || "").trim();
  if (!id) {
    return sendError(res, "Intake id is required", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`UPDATE intakes
     SET is_active = false,
         updated_at = NOW()
     WHERE id = $1 AND is_active = true
     RETURNING id`, [id]);
  if (result.rowCount === 0) {
    return sendError(res, "Intake not found or already inactive", HttpStatus.NOT_FOUND);
  }
  return sendSuccess(res, { deleted: true, id });
}
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  const type = req.query.type || "programs";
  try {
    const authUser = await getAuthUser(req);
    const isAdmin = isAdminRole(authUser?.role);
    if (req.method === "GET") {
      if (type === "programs") {
        return await listPrograms(res, isAdmin, !authUser);
      }
      if (type === "intakes") {
        return await listIntakes(res, isAdmin, !authUser);
      }
      if (type === "subjects") {
        const q = CatalogQueries.getSubjects();
        const result = await query(q.text, q.values);
        if (!authUser) {
          res.setHeader("Cache-Control", "public, max-age=300");
        }
        return sendSuccess(res, { subjects: result.rows });
      }
      if (type === "institutions") {
        const result = await query("SELECT * FROM institutions WHERE is_active = true ORDER BY name ASC");
        if (!authUser) {
          res.setHeader("Cache-Control", "public, max-age=300");
        }
        return sendSuccess(res, { institutions: result.rows });
      }
      return sendError(res, "Invalid type. Use: programs, intakes, subjects, or institutions", HttpStatus.BAD_REQUEST);
    }
    if (!["POST", "PUT", "DELETE"].includes(req.method || "")) {
      return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
    }
    if (type !== "programs" && type !== "intakes") {
      return sendError(res, "Write operations are only supported for programs and intakes", HttpStatus.BAD_REQUEST);
    }
    const adminUser = await ensureAdmin(req, res);
    if (!adminUser) {
      return;
    }
    if (type === "programs") {
      if (req.method === "POST")
        return await createProgram(req, res);
      if (req.method === "PUT")
        return await updateProgram(req, res);
      return await deleteProgram(req, res);
    }
    if (req.method === "POST")
      return await createIntake(req, res);
    if (req.method === "PUT")
      return await updateIntake(req, res);
    return await deleteIntake(req, res);
  } catch (error) {
    return handleError(res, error, "catalog");
  }
}
var catalog_default = withArcjetProtection(handler, "general");
export {
  catalog_default as default
};
