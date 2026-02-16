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
var ApplicationQueries = {
  findAll: (limit = 100, offset = 0) => ({
    text: `
      SELECT *
      FROM applications
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset]
  }),
  findByUserId: (userId) => ({
    text: `
      SELECT *
      FROM applications
      WHERE user_id = $1
      ORDER BY created_at DESC
    `,
    values: [userId]
  }),
  findById: (id) => ({
    text: `
      SELECT *
      FROM applications
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  findByIdForUser: (id, userId) => ({
    text: `
      SELECT *
      FROM applications
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    values: [id, userId]
  }),
  findPendingReview: () => ({
    text: `
      SELECT *
      FROM applications
      WHERE status = 'submitted'
      ORDER BY submitted_at ASC
    `,
    values: []
  }),
  findByStatus: (status) => ({
    text: `
      SELECT *
      FROM applications
      WHERE status = $1
      ORDER BY created_at DESC
    `,
    values: [status]
  }),
  updateStatus: (id, status, reviewedBy, notes) => ({
    text: `
      UPDATE applications
      SET 
        status = $2,
        reviewed_by = $3,
        review_started_at = COALESCE(review_started_at, NOW()),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, status, reviewedBy]
  }),
  update: (id, data) => {
    const fields = [];
    const values = [id];
    let paramIndex = 2;
    const allowedFields = [
      "full_name",
      "nrc_number",
      "passport_number",
      "date_of_birth",
      "sex",
      "phone",
      "email",
      "residence_town",
      "next_of_kin_name",
      "next_of_kin_phone",
      "program",
      "intake",
      "institution",
      "result_slip_url",
      "extra_kyc_url",
      "payment_method",
      "payer_name",
      "payer_phone",
      "amount",
      "paid_at",
      "momo_ref",
      "pop_url",
      "payment_status",
      "status",
      "submitted_at"
    ];
    for (const field of allowedFields) {
      if (field in data) {
        fields.push(`${field} = $${paramIndex}`);
        values.push(data[field]);
        paramIndex++;
      }
    }
    fields.push("updated_at = NOW()");
    return {
      text: `
        UPDATE applications
        SET ${fields.join(", ")}
        WHERE id = $1
        RETURNING *
      `,
      values
    };
  },
  updatePaymentStatus: (id, paymentStatus, verifiedBy) => ({
    text: `
      UPDATE applications
      SET 
        payment_status = $2,
        payment_verified_by = $3,
        payment_verified_at = CASE WHEN $2 = 'verified' THEN NOW() ELSE NULL END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, paymentStatus, verifiedBy]
  }),
  submit: (id) => ({
    text: `
      UPDATE applications
      SET 
        status = 'submitted',
        submitted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1 AND status = 'draft'
      RETURNING *
    `,
    values: [id]
  }),
  delete: (id) => ({
    text: `
      DELETE FROM applications
      WHERE id = $1
      RETURNING id
    `,
    values: [id]
  }),
  checkOwnership: (id, userId) => ({
    text: `
      SELECT EXISTS(
        SELECT 1 FROM applications
        WHERE id = $1 AND user_id = $2
      ) as is_owner
    `,
    values: [id, userId]
  }),
  getSummary: () => ({
    text: `
      SELECT id, status, created_at
      FROM applications
      ORDER BY created_at DESC
    `,
    values: []
  }),
  countByStatus: (status) => ({
    text: `
      SELECT COUNT(*) as count
      FROM applications
      WHERE status = $1
    `,
    values: [status]
  }),
  count: () => ({
    text: `SELECT COUNT(*) as count FROM applications`,
    values: []
  })
};
var DocumentQueries = {
  findAll: (limit = 100, offset = 0) => ({
    text: `
      SELECT *
      FROM application_documents
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset]
  }),
  findByApplicationId: (applicationId) => ({
    text: `
      SELECT *
      FROM application_documents
      WHERE application_id = $1
      ORDER BY created_at DESC
    `,
    values: [applicationId]
  }),
  findById: (id) => ({
    text: `
      SELECT *
      FROM application_documents
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  create: (doc) => ({
    text: `
      INSERT INTO application_documents (
        id, application_id, document_type, document_name,
        file_url, file_size, mime_type, system_generated,
        verification_status, uploaded_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW(), NOW())
      RETURNING *
    `,
    values: [
      doc.id,
      doc.applicationId,
      doc.documentType,
      doc.documentName,
      doc.fileUrl,
      doc.fileSize || null,
      doc.mimeType || null,
      doc.systemGenerated || false
    ]
  }),
  updateVerification: (id, status, verifiedBy, notes) => ({
    text: `
      UPDATE application_documents
      SET 
        verification_status = $2,
        verified_by = $3,
        verified_at = NOW(),
        verification_notes = $4,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    values: [id, status, verifiedBy, notes || null]
  }),
  delete: (id) => ({
    text: `
      DELETE FROM application_documents
      WHERE id = $1
      RETURNING id, file_url
    `,
    values: [id]
  }),
  countByApplication: (applicationId) => ({
    text: `
      SELECT COUNT(*) as count
      FROM application_documents
      WHERE application_id = $1
    `,
    values: [applicationId]
  })
};
var GradeQueries = {
  findAll: (limit = 100, offset = 0) => ({
    text: `
      SELECT *
      FROM application_grades
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset]
  }),
  findByApplicationId: (applicationId) => ({
    text: `
      SELECT g.*, s.name as subject_name
      FROM application_grades g
      LEFT JOIN subjects s ON s.id = g.subject_id
      WHERE g.application_id = $1
    `,
    values: [applicationId]
  }),
  upsert: (applicationId, subjectId, grade) => ({
    text: `
      INSERT INTO application_grades (id, application_id, subject_id, grade, created_at)
      VALUES (gen_random_uuid(), $1, $2, $3, NOW())
      ON CONFLICT (application_id, subject_id) DO UPDATE SET grade = $3
      RETURNING *
    `,
    values: [applicationId, subjectId, grade]
  }),
  deleteByApplication: (applicationId) => ({
    text: `
      DELETE FROM application_grades
      WHERE application_id = $1
      RETURNING id
    `,
    values: [applicationId]
  })
};
var StatusHistoryQueries = {
  create: (applicationId, status, changedBy, notes) => ({
    text: `
      INSERT INTO application_status_history (
        id, application_id, status, changed_by, notes, created_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
      RETURNING *
    `,
    values: [applicationId, status, changedBy, notes || null]
  }),
  findByApplicationId: (applicationId) => ({
    text: `
      SELECT *
      FROM application_status_history
      WHERE application_id = $1
      ORDER BY created_at DESC
    `,
    values: [applicationId]
  })
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

// api-src/applications.ts
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
  const adminRoles = ["admin", "super_admin", "admissions_officer"];
  const isAdmin = adminRoles.includes(user.role);
  const action = req.query.action;
  const id = req.query.id;
  try {
    if (action === "details")
      return await handleDetails(req, res, user.userId, isAdmin);
    if (action === "documents")
      return await handleDocuments(res);
    if (action === "grades")
      return await handleGrades(res);
    if (action === "summary")
      return await handleSummary(res);
    if (action === "review")
      return await handleReview(req, res, user.userId, isAdmin);
    if (action === "interviews")
      return await handleInterviews(req, res, user.userId);
    if (action === "schedule-interview")
      return await handleScheduleInterview(req, res, user.userId, isAdmin);
    if (action === "stats")
      return await handleStats(req, res, user.userId);
    if (action === "export")
      return await handleExport(req, res, isAdmin);
    if (action === "versions")
      return await handleVersions(req, res, user.userId);
    if (id)
      return await handleById(req, res, user.userId, isAdmin, id);
    if (req.method === "GET")
      return await handleDetails(req, res, user.userId, isAdmin);
    if (req.method === "POST")
      return await handleCreate(req, res, user.userId);
    return sendError(res, "Invalid request", HttpStatus.BAD_REQUEST);
  } catch (error) {
    return handleError(res, error, "applications");
  }
}
async function handleCreate(req, res, userId) {
  const body = req.body;
  const requiredFields = [
    "application_number",
    "full_name",
    "date_of_birth",
    "sex",
    "phone",
    "email",
    "residence_town",
    "program",
    "intake",
    "institution"
  ];
  for (const field of requiredFields) {
    if (!body[field]) {
      return sendError(res, `Missing required field: ${field}`, HttpStatus.BAD_REQUEST);
    }
  }
  const fields = [
    "user_id",
    "application_number",
    "public_tracking_code",
    "full_name",
    "nrc_number",
    "passport_number",
    "date_of_birth",
    "sex",
    "phone",
    "email",
    "residence_town",
    "nationality",
    "next_of_kin_name",
    "next_of_kin_phone",
    "program",
    "intake",
    "institution",
    "status"
  ];
  const values = [
    userId,
    body.application_number,
    body.public_tracking_code || null,
    body.full_name,
    body.nrc_number || null,
    body.passport_number || null,
    body.date_of_birth,
    body.sex,
    body.phone,
    body.email,
    body.residence_town,
    body.nationality || "Zambian",
    body.next_of_kin_name || null,
    body.next_of_kin_phone || null,
    body.program,
    body.intake,
    body.institution,
    body.status || "draft"
  ];
  const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query(`INSERT INTO applications (${fields.join(", ")})
     VALUES (${placeholders})
     RETURNING *`, values);
  if (result.rowCount === 0) {
    return sendError(res, "Failed to create application", HttpStatus.INTERNAL_SERVER_ERROR);
  }
  console.log("[applications] Created application:", result.rows[0].id);
  return sendSuccess(res, result.rows[0], HttpStatus.CREATED);
}
async function handleDetails(req, res, userId, isAdmin) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  let q;
  if (isAdmin) {
    q = ApplicationQueries.findAll();
  } else {
    q = ApplicationQueries.findByUserId(userId);
  }
  const result = await query(q.text, q.values);
  return sendSuccess(res, result.rows);
}
async function handleDocuments(res) {
  const q = DocumentQueries.findAll();
  const result = await query(q.text, q.values);
  return sendSuccess(res, result.rows);
}
async function handleGrades(res) {
  const q = GradeQueries.findAll();
  const result = await query(q.text, q.values);
  return sendSuccess(res, result.rows);
}
async function handleSummary(res) {
  const q = ApplicationQueries.getSummary();
  const result = await query(q.text, q.values);
  return sendSuccess(res, result.rows);
}
async function handleInterviews(req, res, userId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const result = await query(`
    SELECT 
      ai.id,
      ai.application_id,
      ai.scheduled_at,
      ai.mode,
      ai.location,
      ai.status,
      ai.notes,
      a.program,
      a.application_number
    FROM application_interviews ai
    INNER JOIN applications a ON ai.application_id = a.id
    WHERE a.user_id = $1
    ORDER BY ai.scheduled_at ASC
  `, [userId]);
  return sendSuccess(res, { interviews: result.rows });
}
async function handleScheduleInterview(req, res, userId, isAdmin) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  if (!isAdmin) {
    return sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
  }
  const { applicationId, scheduled_at, mode, location, notes } = req.body || {};
  if (!applicationId || !scheduled_at || !mode || !location) {
    return sendError(res, "Missing required fields: applicationId, scheduled_at, mode, location", HttpStatus.BAD_REQUEST);
  }
  const normalizedMode = mode === "in-person" ? "in_person" : mode;
  if (!["in_person", "virtual", "phone"].includes(normalizedMode)) {
    return sendError(res, "Invalid mode. Use: in-person, in_person, virtual, or phone", HttpStatus.BAD_REQUEST);
  }
  const applicationResult = await query("SELECT id FROM applications WHERE id = $1 LIMIT 1", [applicationId]);
  if (applicationResult.rowCount === 0) {
    return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
  }
  const interviewResult = await query(`INSERT INTO application_interviews (
      application_id, scheduled_at, mode, location, notes, status, created_by, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, NOW(), NOW())
    RETURNING id, application_id, scheduled_at, mode, location, notes, status`, [applicationId, scheduled_at, normalizedMode, location, notes || null, userId]);
  return sendSuccess(res, { interview: interviewResult.rows[0] }, HttpStatus.CREATED);
}
async function handleStats(req, res, userId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const countResult = await query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'draft') as drafts,
      COUNT(*) FILTER (WHERE status != 'draft') as completed
    FROM applications
    WHERE user_id = $1
  `, [userId]);
  const avgTimeResult = await query(`
    SELECT 
      AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) as avg_time_hours
    FROM applications
    WHERE user_id = $1 AND status != 'draft'
  `, [userId]);
  const stats = countResult.rows[0];
  const avgTime = avgTimeResult.rows[0];
  return sendSuccess(res, {
    total_drafts: parseInt(stats?.drafts || "0", 10),
    completed_applications: parseInt(stats?.completed || "0", 10),
    total_applications: parseInt(stats?.total || "0", 10),
    avg_time_hours: avgTime?.avg_time_hours ? parseFloat(avgTime.avg_time_hours) : 0
  });
}
async function handleReview(req, res, userId, isAdmin) {
  if (!isAdmin) {
    return sendError(res, "Admin access required", HttpStatus.FORBIDDEN);
  }
  if (req.method === "GET") {
    const q = ApplicationQueries.findPendingReview();
    const result = await query(q.text, q.values);
    return sendSuccess(res, result.rows);
  }
  if (req.method === "POST") {
    const { application_id, status, notes } = req.body;
    if (!application_id || !status) {
      return sendError(res, "application_id and status are required", HttpStatus.BAD_REQUEST);
    }
    const updateQ = ApplicationQueries.updateStatus(application_id, status, userId, notes);
    const updateResult = await query(updateQ.text, updateQ.values);
    if (updateResult.rowCount === 0) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    const historyQ = StatusHistoryQueries.create(application_id, status, userId, notes);
    await query(historyQ.text, historyQ.values);
    console.log("[applications/review] Application reviewed:", application_id, status);
    return sendSuccess(res, { application: updateResult.rows[0] });
  }
  return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
}
async function handleById(req, res, userId, isAdmin, applicationId) {
  if (req.method === "GET") {
    if (!isAdmin) {
      const ownerQ = ApplicationQueries.checkOwnership(applicationId, userId);
      const ownerResult = await query(ownerQ.text, ownerQ.values);
      if (!ownerResult.rows[0]?.is_owner) {
        return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
      }
    }
    const include = req.query.include;
    const data = await fetchApplicationDetails(applicationId, include);
    if (!data) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    return sendSuccess(res, {
      application: data,
      grades: data.grades || [],
      documents: data.documents || [],
      statusHistory: data.statusHistory || []
    });
  }
  if (req.method === "DELETE") {
    const appQ = ApplicationQueries.findById(applicationId);
    const appResult = await query(appQ.text, appQ.values);
    if (appResult.rowCount === 0) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    const app = appResult.rows[0];
    if (app.user_id !== userId && !isAdmin) {
      return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
    }
    const deleteQ = ApplicationQueries.delete(applicationId);
    await query(deleteQ.text, deleteQ.values);
    console.log("[applications] Deleted application:", applicationId);
    return sendSuccess(res, { deleted: true });
  }
  if (req.method === "PUT" || req.method === "PATCH") {
    const appQ = ApplicationQueries.findById(applicationId);
    const appResult = await query(appQ.text, appQ.values);
    if (appResult.rowCount === 0) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    const app = appResult.rows[0];
    if (app.user_id !== userId && !isAdmin) {
      return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
    }
    const body = req.body;
    if (req.method === "PATCH" && body.action) {
      const { action, ...payload } = body;
      if (action === "update_status") {
        const { status, notes } = payload;
        const validStatuses = ["draft", "submitted", "under_review", "approved", "rejected", "pending_documents"];
        if (!validStatuses.includes(status)) {
          return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(", ")}`, HttpStatus.BAD_REQUEST);
        }
        if (status === "approved" && app.payment_status !== "verified") {
          return sendError(res, "Cannot approve without verified payment", HttpStatus.BAD_REQUEST);
        }
        const updateQ2 = ApplicationQueries.updateStatus(applicationId, status, userId, notes);
        const updateResult2 = await query(updateQ2.text, updateQ2.values);
        const historyQ = StatusHistoryQueries.create(applicationId, status, userId, notes);
        await query(historyQ.text, historyQ.values);
        console.log("[applications] Status updated:", applicationId, status);
        return sendSuccess(res, updateResult2.rows[0]);
      }
      if (action === "update_payment_status") {
        const { paymentStatus } = payload;
        const validPaymentStatuses = ["pending_review", "verified", "rejected"];
        if (!validPaymentStatuses.includes(paymentStatus)) {
          return sendError(res, `Invalid payment status. Must be one of: ${validPaymentStatuses.join(", ")}`, HttpStatus.BAD_REQUEST);
        }
        const updateQ2 = ApplicationQueries.updatePaymentStatus(applicationId, paymentStatus, paymentStatus === "verified" ? userId : null);
        const updateResult2 = await query(updateQ2.text, updateQ2.values);
        console.log("[applications] Payment status updated:", applicationId, paymentStatus);
        return sendSuccess(res, updateResult2.rows[0]);
      }
      if (action === "sync_grades") {
        const { grades } = payload;
        if (!Array.isArray(grades)) {
          return sendError(res, "Grades must be an array", HttpStatus.BAD_REQUEST);
        }
        const deleteQ = GradeQueries.deleteByApplication(applicationId);
        await query(deleteQ.text, deleteQ.values);
        if (grades.length > 0) {
          for (const g of grades) {
            const upsertQ = GradeQueries.upsert(applicationId, g.subject_id, g.grade);
            await query(upsertQ.text, upsertQ.values);
          }
        }
        console.log("[applications] Grades synced:", applicationId);
        return sendSuccess(res, { synced: true });
      }
    }
    const updateQ = ApplicationQueries.update(applicationId, body);
    const updateResult = await query(updateQ.text, updateQ.values);
    if (updateResult.rowCount === 0) {
      return sendError(res, "Update failed", HttpStatus.BAD_REQUEST);
    }
    return sendSuccess(res, updateResult.rows[0]);
  }
  return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
}
async function fetchApplicationDetails(id, include) {
  const appQ = ApplicationQueries.findById(id);
  const appResult = await query(appQ.text, appQ.values);
  if (appResult.rowCount === 0) {
    return null;
  }
  const application = appResult.rows[0];
  const result = { ...application };
  const includes = include ? include.split(",") : ["grades", "documents", "statusHistory"];
  const gradesQ = GradeQueries.findByApplicationId(id);
  const gradesResult = await query(gradesQ.text, gradesQ.values);
  result.grades = gradesResult.rows;
  if (includes.includes("documents")) {
    const docsQ = DocumentQueries.findByApplicationId(id);
    const docsResult = await query(docsQ.text, docsQ.values);
    result.documents = docsResult.rows;
  }
  if (includes.includes("statusHistory")) {
    const historyQ = StatusHistoryQueries.findByApplicationId(id);
    const historyResult = await query(historyQ.text, historyQ.values);
    result.statusHistory = historyResult.rows;
  }
  return result;
}
async function handleExport(req, res, isAdmin) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  if (!isAdmin) {
    return sendError(res, "Admin access required", HttpStatus.FORBIDDEN);
  }
  const page = parseInt(req.query.page || "0", 10);
  const limit = Math.min(parseInt(req.query.limit || "500", 10), 1000);
  const offset = page * limit;
  const conditions = [];
  const values = [];
  let paramIndex = 1;
  const search = req.query.search;
  if (search) {
    const searchPattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
    conditions.push(`(full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR application_number ILIKE $${paramIndex})`);
    values.push(searchPattern);
    paramIndex++;
  }
  const status = req.query.status;
  if (status) {
    conditions.push(`status = $${paramIndex}`);
    values.push(status);
    paramIndex++;
  }
  const payment = req.query.payment;
  if (payment) {
    conditions.push(`payment_status = $${paramIndex}`);
    values.push(payment);
    paramIndex++;
  }
  const program = req.query.program;
  if (program) {
    conditions.push(`program = $${paramIndex}`);
    values.push(program);
    paramIndex++;
  }
  const institution = req.query.institution;
  if (institution) {
    conditions.push(`institution = $${paramIndex}`);
    values.push(institution);
    paramIndex++;
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit);
  values.push(offset);
  const result = await query(`
    SELECT 
      id,
      application_number,
      full_name,
      email,
      phone,
      program,
      intake,
      institution,
      status,
      payment_status,
      COALESCE(application_fee, 0) as application_fee,
      COALESCE(amount, 0) as amount,
      submitted_at,
      created_at,
      COALESCE(EXTRACT(YEAR FROM AGE(date_of_birth))::int, 0) as age,
      COALESCE(EXTRACT(DAY FROM NOW() - submitted_at)::int, 0) as days_since_submission
    FROM applications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, values);
  return sendSuccess(res, {
    applications: result.rows,
    page,
    limit,
    hasMore: result.rows.length === limit
  });
}
async function handleVersions(req, res, userId) {
  if (req.method === "GET") {
    return sendSuccess(res, { versions: [], message: "Version history feature not yet configured" });
  }
  if (req.method === "POST") {
    return sendError(res, "Version history feature not yet configured", HttpStatus.SERVICE_UNAVAILABLE);
  }
  return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
}
var applications_default = withArcjetProtection(handler, "general");
export {
  applications_default as default
};
