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

// api-src/auth.ts
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
async function verifyPassword(password, hash) {
  if (!password || !hash) {
    return false;
  }
  if (!hash.startsWith("$2")) {
    return false;
  }
  try {
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error) {
    console.error("[PASSWORD] Verification operation failed");
    return false;
  }
}

// lib/auth/legacy.ts
init_db();
import { jwtVerify, decodeJwt } from "jose";

// lib/queries.ts
var UserQueries = {
  findByEmail: (email) => ({
    text: `
      SELECT 
        id, email, password_hash, refresh_token_hash, role,
        first_name, last_name, full_name, phone, is_active,
        failed_login_attempts, locked_until, password_changed_at,
        created_at, updated_at
      FROM profiles
      WHERE email = $1
      LIMIT 1
    `,
    values: [email]
  }),
  findById: (id) => ({
    text: `
      SELECT 
        id, email, password_hash, refresh_token_hash, role,
        first_name, last_name, full_name, phone, is_active,
        failed_login_attempts, locked_until, password_changed_at,
        created_at, updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  findByIdPublic: (id) => ({
    text: `
      SELECT 
        id, email, role, first_name, last_name, full_name,
        is_active, created_at, updated_at
      FROM profiles
      WHERE id = $1
      LIMIT 1
    `,
    values: [id]
  }),
  findByRefreshToken: (tokenHash) => ({
    text: `
      SELECT id, email, role, is_active, refresh_token_hash
      FROM profiles
      WHERE refresh_token_hash = $1 AND is_active = true
      LIMIT 1
    `,
    values: [tokenHash]
  }),
  create: (id, email, passwordHash, role, firstName, lastName) => ({
    text: `
      INSERT INTO profiles (
        id, email, password_hash, role, first_name, last_name,
        is_active, failed_login_attempts, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, true, 0, NOW(), NOW())
      RETURNING id, email, role, is_active, created_at
    `,
    values: [id, email, passwordHash, role, firstName, lastName]
  }),
  createWithoutPassword: (id, email, role, firstName, lastName) => ({
    text: `
      INSERT INTO profiles (
        id, email, role, first_name, last_name,
        is_active, failed_login_attempts, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, true, 0, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
      RETURNING id, email, role, is_active
    `,
    values: [id, email, role, firstName, lastName]
  }),
  updatePassword: (id, passwordHash) => ({
    text: `
      UPDATE profiles
      SET 
        password_hash = $2,
        password_changed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id, passwordHash]
  }),
  updateRefreshToken: (id, tokenHash) => ({
    text: `
      UPDATE profiles
      SET 
        refresh_token_hash = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id, tokenHash]
  }),
  incrementFailedAttempts: (id) => ({
    text: `
      UPDATE profiles
      SET 
        failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1,
        updated_at = NOW()
      WHERE id = $1
      RETURNING failed_login_attempts
    `,
    values: [id]
  }),
  resetFailedAttempts: (id) => ({
    text: `
      UPDATE profiles
      SET 
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id]
  }),
  lockAccount: (id, lockUntil) => ({
    text: `
      UPDATE profiles
      SET 
        locked_until = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, locked_until
    `,
    values: [id, lockUntil]
  }),
  unlockAccount: (id) => ({
    text: `
      UPDATE profiles
      SET 
        locked_until = NULL,
        failed_login_attempts = 0,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id]
  }),
  updateRole: (id, role) => ({
    text: `
      UPDATE profiles
      SET 
        role = $2,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id, role
    `,
    values: [id, role]
  }),
  deactivate: (id) => ({
    text: `
      UPDATE profiles
      SET 
        is_active = false,
        refresh_token_hash = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id]
  }),
  reactivate: (id) => ({
    text: `
      UPDATE profiles
      SET 
        is_active = true,
        failed_login_attempts = 0,
        locked_until = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING id
    `,
    values: [id]
  }),
  list: (limit, offset) => ({
    text: `
      SELECT 
        id, email, role, first_name, last_name, full_name,
        is_active, created_at, updated_at
      FROM profiles
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `,
    values: [limit, offset]
  }),
  listByRole: (role, limit, offset) => ({
    text: `
      SELECT 
        id, email, role, first_name, last_name, full_name,
        is_active, created_at, updated_at
      FROM profiles
      WHERE role = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `,
    values: [role, limit, offset]
  }),
  count: () => ({
    text: `SELECT COUNT(*) as count FROM profiles`,
    values: []
  }),
  countByRole: (role) => ({
    text: `SELECT COUNT(*) as count FROM profiles WHERE role = $1`,
    values: [role]
  }),
  emailExists: (email) => ({
    text: `SELECT EXISTS(SELECT 1 FROM profiles WHERE email = $1) as exists`,
    values: [email]
  })
};

// lib/auth/legacy.ts
async function upgradePasswordHash(userId, newPassword) {
  try {
    const passwordHash = await hashPassword(newPassword);
    const updateQuery = UserQueries.updatePassword(userId, passwordHash);
    await query(updateQuery.text, updateQuery.values);
    console.log(`[Legacy Auth] Upgraded password hash for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("[Legacy Auth] Error upgrading password hash:", error.message);
    return false;
  }
}
function needsPasswordUpgrade(user) {
  if (!user.password_hash) {
    return true;
  }
  const isBcrypt = /^\$2[aby]\$\d{1,2}\$/.test(user.password_hash);
  return !isBcrypt;
}

// lib/auth/jwt.ts
import { SignJWT, jwtVerify as jwtVerify2 } from "jose";
var ACCESS_TOKEN_EXPIRATION = "15m";
var REFRESH_TOKEN_EXPIRATION = "7d";
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
function getRefreshTokenSecret() {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) {
    throw new Error("JWT_REFRESH_SECRET environment variable is not configured");
  }
  return new TextEncoder().encode(secret);
}
async function generateAccessToken(userId, email, role, permissions) {
  if (!userId || userId.trim().length === 0) {
    throw new Error("User ID is required for access token generation");
  }
  if (!email || email.trim().length === 0) {
    throw new Error("Email is required for access token generation");
  }
  if (!role) {
    throw new Error("Role is required for access token generation");
  }
  try {
    const secret = getAccessTokenSecret();
    const token = await new SignJWT({
      email,
      role,
      permissions: permissions || [],
      type: "access"
    }).setProtectedHeader({ alg: ALGORITHM }).setSubject(userId).setIssuedAt().setExpirationTime(ACCESS_TOKEN_EXPIRATION).setIssuer(TOKEN_ISSUER).setAudience(TOKEN_AUDIENCE).sign(secret);
    return token;
  } catch (error) {
    console.error("[JWT] Access token generation failed");
    throw new Error("Failed to generate access token");
  }
}
async function generateRefreshToken(userId) {
  if (!userId || userId.trim().length === 0) {
    throw new Error("User ID is required for refresh token generation");
  }
  try {
    const secret = getRefreshTokenSecret();
    const token = await new SignJWT({
      type: "refresh"
    }).setProtectedHeader({ alg: ALGORITHM }).setSubject(userId).setIssuedAt().setExpirationTime(REFRESH_TOKEN_EXPIRATION).setIssuer(TOKEN_ISSUER).setAudience(TOKEN_AUDIENCE).sign(secret);
    return token;
  } catch (error) {
    console.error("[JWT] Refresh token generation failed");
    throw new Error("Failed to generate refresh token");
  }
}
async function verifyAccessToken(token) {
  if (!token || token.trim().length === 0) {
    throw new Error("Token is required for verification");
  }
  try {
    const secret = getAccessTokenSecret();
    const { payload } = await jwtVerify2(token, secret, {
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
async function verifyRefreshToken(token) {
  if (!token || token.trim().length === 0) {
    throw new Error("Token is required for verification");
  }
  try {
    const secret = getRefreshTokenSecret();
    const { payload } = await jwtVerify2(token, secret, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      algorithms: [ALGORITHM]
    });
    if (payload.type !== "refresh") {
      throw new Error("Invalid token type: expected refresh token");
    }
    if (!payload.sub) {
      throw new Error("Token missing required subject claim");
    }
    const refreshPayload = {
      sub: payload.sub,
      type: "refresh",
      iat: payload.iat,
      exp: payload.exp,
      iss: payload.iss,
      aud: typeof payload.aud === "string" ? payload.aud : payload.aud?.[0]
    };
    return refreshPayload;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("expired")) {
      throw new Error("Refresh token has expired");
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
    throw new Error("Refresh token verification failed");
  }
}

// lib/auth/permissions.ts
var USER_ROLES2 = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  REVIEWER: "reviewer",
  STUDENT: "student"
};
var ALL_USER_ROLES = [
  USER_ROLES2.SUPER_ADMIN,
  USER_ROLES2.ADMIN,
  USER_ROLES2.REVIEWER,
  USER_ROLES2.STUDENT
];
var ROLE_PERMISSIONS = {
  super_admin: [
    "users:read",
    "users:write",
    "users:delete",
    "applications:read",
    "applications:write",
    "applications:review",
    "programs:read",
    "programs:write",
    "payments:read",
    "payments:verify",
    "documents:read",
    "documents:verify",
    "analytics:read",
    "settings:read",
    "settings:write"
  ],
  admin: [
    "users:read",
    "applications:read",
    "applications:write",
    "applications:review",
    "programs:read",
    "payments:read",
    "payments:verify",
    "documents:read",
    "documents:verify",
    "analytics:read"
  ],
  reviewer: [
    "applications:read",
    "applications:review",
    "documents:read"
  ],
  student: [
    "applications:create",
    "applications:read_own",
    "applications:update_own",
    "documents:upload_own",
    "documents:read_own",
    "payments:make_own",
    "payments:read_own",
    "profile:read_own",
    "profile:update_own"
  ]
};
function getPermissionsForRole(role) {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    console.warn(`[PERMISSIONS] Unknown role requested: ${role}`);
    return [];
  }
  return [...permissions];
}

// lib/auth/cookies.ts
var ACCESS_TOKEN_COOKIE = "access_token";
var REFRESH_TOKEN_COOKIE = "refresh_token";
var ACCESS_TOKEN_MAX_AGE = 900;
var REFRESH_TOKEN_MAX_AGE = 604800;
var REFRESH_TOKEN_PATH = "/api/auth";
function isProduction() {
  const env = process["env"];
  return env.NODE_ENV === "production";
}
function buildCookieString(name, value, maxAge, path = "/") {
  const parts = [
    `${name}=${value}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (isProduction()) {
    parts.push("Secure");
  }
  return parts.join("; ");
}
function setAuthCookies(res, accessToken, refreshToken) {
  const accessCookie = buildCookieString(ACCESS_TOKEN_COOKIE, accessToken, ACCESS_TOKEN_MAX_AGE, "/");
  const refreshCookie = buildCookieString(REFRESH_TOKEN_COOKIE, refreshToken, REFRESH_TOKEN_MAX_AGE, REFRESH_TOKEN_PATH);
  res.setHeader("Set-Cookie", [accessCookie, refreshCookie]);
}
function clearAuthCookies(res) {
  const clearAccessCookie = buildCookieString(ACCESS_TOKEN_COOKIE, "", 0, "/");
  const clearRefreshCookie = buildCookieString(REFRESH_TOKEN_COOKIE, "", 0, REFRESH_TOKEN_PATH);
  res.setHeader("Set-Cookie", [clearAccessCookie, clearRefreshCookie]);
}
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
function extractAccessTokenFromCookie(req) {
  const cookies = parseCookies(req);
  const token = cookies[ACCESS_TOKEN_COOKIE];
  if (!token || token.length === 0) {
    return null;
  }
  return token;
}
function extractRefreshTokenFromCookie(req) {
  const cookies = parseCookies(req);
  const token = cookies[REFRESH_TOKEN_COOKIE];
  if (!token || token.length === 0) {
    return null;
  }
  return token;
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

// api-src/auth.ts
import { createHash, timingSafeEqual } from "crypto";
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  const action = req.query.action;
  try {
    switch (action) {
      case "login":
        return handleLogin(req, res);
      case "logout":
        return handleLogout(req, res);
      case "register":
        return handleRegister(req, res);
      case "session":
        return handleSession(req, res);
      case "refresh":
        return handleRefresh(req, res);
      case "bootstrap":
        return handleBootstrap(req, res);
      case "check-email":
        return handleCheckEmail(req, res);
      case "roles":
        return handleRoles(req, res);
      case "profile":
        return handleProfile(req, res);
      default:
        return sendError(res, "Invalid action. Use: login, logout, register, session, refresh, bootstrap, check-email, roles, profile", HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error);
  }
}
async function handleLogin(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const { email, password } = req.body || {};
  if (!email || !password) {
    return sendError(res, "Email and password required", HttpStatus.BAD_REQUEST);
  }
  const result = await query(`SELECT id, email, password_hash, role, first_name, last_name, is_active 
     FROM profiles WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
  if (result.rows.length === 0) {
    return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
  }
  const user = result.rows[0];
  if (!user.is_active) {
    return sendError(res, "Account is disabled", HttpStatus.FORBIDDEN);
  }
  if (needsPasswordUpgrade(toLegacyCompatibleUserRecord(user))) {
    const legacyAuthResult = verifyLegacyPassword(password, user.password_hash);
    if (!legacyAuthResult.isValid) {
      if (legacyAuthResult.requiresMigration) {
        return sendError(res, "Password migration required. Use account recovery or bootstrap migration to reset your password.", HttpStatus.UNAUTHORIZED, "PASSWORD_MIGRATION_REQUIRED");
      }
      return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
    }
    const upgraded = await upgradePasswordHash(user.id, password);
    if (!upgraded) {
      return sendError(res, "Password migration required. Use account recovery or bootstrap migration to reset your password.", HttpStatus.UNAUTHORIZED, "PASSWORD_MIGRATION_REQUIRED");
    }
  } else {
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
    }
  }
  const permissions = getPermissionsForRole(user.role);
  const accessToken = await generateAccessToken(user.id, user.email, user.role, permissions);
  const refreshToken = await generateRefreshToken(user.id);
  setAuthCookies(res, accessToken, refreshToken);
  return sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name
    }
  });
}
function toLegacyCompatibleUserRecord(user) {
  const now = new Date;
  return {
    id: user.id,
    email: user.email,
    password_hash: user.password_hash,
    refresh_token_hash: null,
    role: user.role,
    first_name: null,
    last_name: null,
    full_name: null,
    phone: null,
    is_active: user.is_active,
    failed_login_attempts: 0,
    locked_until: null,
    password_changed_at: null,
    created_at: now,
    updated_at: now
  };
}
function verifyLegacyPassword(password, storedHash) {
  if (!storedHash) {
    return { isValid: false, requiresMigration: true };
  }
  if (storedHash.startsWith("plain:")) {
    const legacyPassword = storedHash.slice("plain:".length);
    const passwordBuffer = Buffer.from(password);
    const legacyBuffer = Buffer.from(legacyPassword);
    if (passwordBuffer.length !== legacyBuffer.length) {
      return { isValid: false, requiresMigration: false };
    }
    return {
      isValid: timingSafeEqual(passwordBuffer, legacyBuffer),
      requiresMigration: false
    };
  }
  if (/^[a-f0-9]{64}$/i.test(storedHash)) {
    const passwordHash = createHash("sha256").update(password).digest("hex");
    const passwordBuffer = Buffer.from(passwordHash, "hex");
    const legacyBuffer = Buffer.from(storedHash, "hex");
    return {
      isValid: timingSafeEqual(passwordBuffer, legacyBuffer),
      requiresMigration: false
    };
  }
  return { isValid: false, requiresMigration: true };
}
async function handleLogout(_req, res) {
  clearAuthCookies(res);
  return sendSuccess(res, { message: "Logged out successfully" });
}
async function handleRegister(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const { email, password, firstName, lastName } = req.body || {};
  if (!email || !password || !firstName || !lastName) {
    return sendError(res, "All fields required: email, password, firstName, lastName", HttpStatus.BAD_REQUEST);
  }
  const existing = await query("SELECT id FROM profiles WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return sendError(res, "Email already registered", HttpStatus.CONFLICT);
  }
  const passwordHash = await hashPassword(password);
  const result = await query(`INSERT INTO profiles (email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1, $2, 'student', $3, $4, true, NOW(), NOW())
     RETURNING id`, [email.toLowerCase(), passwordHash, firstName, lastName]);
  const userId = result.rows[0].id;
  const permissions = getPermissionsForRole("student");
  const accessToken = await generateAccessToken(userId, email.toLowerCase(), "student", permissions);
  const refreshToken = await generateRefreshToken(userId);
  setAuthCookies(res, accessToken, refreshToken);
  return sendSuccess(res, {
    user: {
      id: userId,
      email: email.toLowerCase(),
      role: "student",
      firstName,
      lastName
    }
  }, HttpStatus.CREATED);
}
async function handleSession(req, res) {
  const token = extractAccessTokenFromCookie(req);
  if (!token) {
    return sendSuccess(res, { user: null });
  }
  try {
    const payload = await verifyAccessToken(token);
    const result = await query("SELECT id, email, role, first_name, last_name FROM profiles WHERE id = $1", [payload.sub]);
    if (result.rows.length === 0) {
      clearAuthCookies(res);
      return sendSuccess(res, { user: null });
    }
    const user = result.rows[0];
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        permissions: payload.permissions
      }
    });
  } catch {
    return sendSuccess(res, { user: null });
  }
}
async function handleRefresh(req, res) {
  const refreshTokenValue = extractRefreshTokenFromCookie(req);
  if (!refreshTokenValue) {
    return sendError(res, "No refresh token", HttpStatus.UNAUTHORIZED);
  }
  try {
    const { sub: userId } = await verifyRefreshToken(refreshTokenValue);
    const result = await query("SELECT id, email, role, first_name, last_name, is_active FROM profiles WHERE id = $1", [userId]);
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      clearAuthCookies(res);
      return sendError(res, "User not found or inactive", HttpStatus.UNAUTHORIZED);
    }
    const user = result.rows[0];
    const permissions = getPermissionsForRole(user.role);
    const newAccessToken = await generateAccessToken(user.id, user.email, user.role, permissions);
    const newRefreshToken = await generateRefreshToken(user.id);
    setAuthCookies(res, newAccessToken, newRefreshToken);
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name
      }
    });
  } catch {
    clearAuthCookies(res);
    return sendError(res, "Invalid refresh token", HttpStatus.UNAUTHORIZED);
  }
}
async function handleRoles(req, res) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const token = extractAccessTokenFromCookie(req);
  if (!token) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  try {
    const payload = await verifyAccessToken(token);
    const result = await query("SELECT id, role, is_active FROM profiles WHERE id = $1 LIMIT 1", [payload.sub]);
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      clearAuthCookies(res);
      return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
    }
    const user = result.rows[0];
    const permissions = getPermissionsForRole(user.role);
    return sendSuccess(res, {
      id: user.id,
      user_id: user.id,
      role: user.role,
      permissions,
      department: null,
      is_active: user.is_active
    });
  } catch {
    clearAuthCookies(res);
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
}
async function handleProfile(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const token = extractAccessTokenFromCookie(req);
  if (!token) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
  try {
    const payload = await verifyAccessToken(token);
    if (req.method === "GET") {
      const result2 = await query(`SELECT id, full_name, email, phone, role, date_of_birth, sex, residence_town, nationality, next_of_kin_name, next_of_kin_phone
         FROM profiles WHERE id = $1 LIMIT 1`, [payload.sub]);
      if (result2.rows.length === 0) {
        clearAuthCookies(res);
        return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
      }
      return sendSuccess(res, result2.rows[0]);
    }
    const allowedFields = [
      "full_name",
      "phone",
      "date_of_birth",
      "sex",
      "residence_town",
      "nationality",
      "next_of_kin_name",
      "next_of_kin_phone"
    ];
    const isAllowedField = (key) => allowedFields.includes(key);
    const updates = req.body || {};
    const providedFields = Object.keys(updates).filter(isAllowedField);
    if (providedFields.length === 0) {
      return sendError(res, "No valid fields to update", HttpStatus.BAD_REQUEST);
    }
    const values = [];
    const setClauses = providedFields.map((field, index) => {
      values.push(updates[field] ?? null);
      return `${field} = $${index + 1}`;
    });
    values.push(payload.sub);
    const result = await query(`UPDATE profiles
       SET ${setClauses.join(", ")}, updated_at = NOW()
       WHERE id = $${providedFields.length + 1}
       RETURNING id, full_name, email, phone, role, date_of_birth, sex, residence_town, nationality, next_of_kin_name, next_of_kin_phone`, values);
    if (result.rows.length === 0) {
      return sendError(res, "Profile not found", HttpStatus.NOT_FOUND);
    }
    return sendSuccess(res, result.rows[0]);
  } catch {
    clearAuthCookies(res);
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
  }
}
var auth_default = withArcjetProtection(handler, "auth");
async function handleCheckEmail(req, res) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const email = req.query.email;
  if (!email) {
    return sendError(res, "Email is required", HttpStatus.BAD_REQUEST);
  }
  const existing = await query("SELECT id FROM profiles WHERE email = $1 LIMIT 1", [email.toLowerCase()]);
  return sendSuccess(res, { available: existing.rows.length === 0 });
}
async function handleBootstrap(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
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
}
export {
  auth_default as default
};
