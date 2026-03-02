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

// api-src/bootstrap.ts
init_db();

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

// api-src/bootstrap.ts
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  try {
    const { email, password, secret } = req.body || {};
    const BOOTSTRAP_SECRET = process.env.BOOTSTRAP_SECRET || process.env.MIGRATE_SECRET || process.env.JWT_SECRET;
    if (!BOOTSTRAP_SECRET) {
      return sendError(res, "Bootstrap not configured", HttpStatus.SERVICE_UNAVAILABLE);
    }
    if (!secret || secret !== BOOTSTRAP_SECRET) {
      return sendError(res, "Invalid bootstrap secret", HttpStatus.UNAUTHORIZED);
    }
    if (!email || !password) {
      return sendError(res, "Email and password required", HttpStatus.BAD_REQUEST);
    }
    if (password.length < 8) {
      return sendError(res, "Password must be at least 8 characters", HttpStatus.BAD_REQUEST);
    }
    const result = await query(`SELECT id, email, role, first_name, last_name, password_hash 
       FROM profiles WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
    if (result.rows.length === 0) {
      return sendError(res, "User not found", HttpStatus.NOT_FOUND);
    }
    const user = result.rows[0];
    const passwordHash = await hashPassword(password);
    await query(`UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [passwordHash, user.id]);
    return sendSuccess(res, {
      message: "Password set successfully",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        hadPassword: !!user.password_hash
      }
    });
  } catch (error) {
    return handleError(res, error);
  }
}
export {
  handler as default
};
