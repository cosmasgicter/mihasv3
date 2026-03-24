import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// lib/db.ts
var exports_db = {};
__export(exports_db, {
  verifyDatabaseSchema: () => verifyDatabaseSchema,
  userQueries: () => userQueries,
  transaction: () => transaction,
  sessionQueries: () => sessionQueries,
  query: () => query,
  auditQueries: () => auditQueries,
  DatabaseErrorCode: () => DatabaseErrorCode,
  DatabaseError: () => DatabaseError
});
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
async function transaction(operations) {
  if (operations.length === 0) {
    return [];
  }
  const results = [];
  try {
    await query("BEGIN");
    for (const op of operations) {
      const result = await query(op.text, op.values);
      results.push(result);
    }
    await query("COMMIT");
    return results;
  } catch (error) {
    try {
      await query("ROLLBACK");
    } catch (rollbackError) {
      console.error("[DB] Rollback failed:", rollbackError.message);
    }
    if (error instanceof DatabaseError) {
      throw new DatabaseError(`Transaction failed: ${error.message}`, DatabaseErrorCode.TRANSACTION_ERROR, { query: error.query, originalError: error });
    }
    throw new DatabaseError(`Transaction failed: ${error.message}`, DatabaseErrorCode.TRANSACTION_ERROR, { originalError: error });
  }
}
async function verifyDatabaseSchema() {
  const errors = [];
  const warnings = [];
  console.log("[DB] Verifying Neon database schema...");
  for (const table of REQUIRED_TABLES) {
    try {
      await query(`SELECT 1 FROM ${table} LIMIT 1`);
      console.log(`[DB] ✓ Table '${table}' exists`);
    } catch (error) {
      const errorMsg = error.message;
      if (errorMsg.includes("does not exist") || errorMsg.includes("relation") || errorMsg.includes("404")) {
        errors.push(`Required table '${table}' is missing`);
        console.error(`[DB] ✗ Table '${table}' is missing`);
      } else {
        warnings.push(`Could not verify table '${table}': ${errorMsg}`);
        console.warn(`[DB] ? Table '${table}' verification inconclusive`);
      }
    }
  }
  if (!errors.some((e) => e.includes("'profiles'"))) {
    try {
      const columnCheckQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name = ANY($1)
      `;
      const result = await query(columnCheckQuery, [[...REQUIRED_PROFILE_COLUMNS]]);
      const existingColumns = new Set(result.rows.map((r) => r.column_name));
      for (const col of REQUIRED_PROFILE_COLUMNS) {
        if (!existingColumns.has(col)) {
          if (col === "password_hash" || col === "refresh_token_hash") {
            warnings.push(`Column 'profiles.${col}' is missing - run auth migration`);
            console.warn(`[DB] ? Column 'profiles.${col}' missing (migration needed)`);
          } else {
            errors.push(`Required column 'profiles.${col}' is missing`);
            console.error(`[DB] ✗ Column 'profiles.${col}' is missing`);
          }
        }
      }
    } catch (error) {
      warnings.push(`Could not verify profiles columns: ${error.message}`);
    }
  }
  const ok = errors.length === 0;
  if (ok) {
    console.log("[DB] Schema verification passed");
  } else {
    console.error(`[DB] Schema verification failed with ${errors.length} error(s)`);
  }
  return { ok, errors, warnings };
}
var DatabaseErrorCode, DatabaseError, REQUIRED_TABLES, REQUIRED_PROFILE_COLUMNS, userQueries, sessionQueries, auditQueries;
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
  REQUIRED_TABLES = [
    "profiles",
    "device_sessions",
    "audit_logs"
  ];
  REQUIRED_PROFILE_COLUMNS = [
    "id",
    "email",
    "role",
    "password_hash",
    "refresh_token_hash"
  ];
  userQueries = {
    findByEmail: (email) => ({
      text: `SELECT id, email, password_hash, refresh_token_hash, role, first_name, last_name, 
                  is_active, failed_login_attempts, locked_until, created_at, updated_at 
           FROM profiles 
           WHERE email = $1 
           LIMIT 1`,
      values: [email]
    }),
    findById: (id) => ({
      text: `SELECT id, email, role, first_name, last_name, is_active, created_at, updated_at 
           FROM profiles 
           WHERE id = $1 
           LIMIT 1`,
      values: [id]
    }),
    create: (id, email, passwordHash, role, firstName, lastName) => ({
      text: `INSERT INTO profiles (id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
           RETURNING id, email, role, is_active`,
      values: [id, email, passwordHash, role, firstName, lastName]
    }),
    updatePassword: (id, passwordHash) => ({
      text: `UPDATE profiles 
           SET password_hash = $2, password_changed_at = NOW(), updated_at = NOW() 
           WHERE id = $1`,
      values: [id, passwordHash]
    }),
    updateRefreshToken: (id, tokenHash) => ({
      text: `UPDATE profiles 
           SET refresh_token_hash = $2, updated_at = NOW() 
           WHERE id = $1`,
      values: [id, tokenHash]
    }),
    findByRefreshToken: (tokenHash) => ({
      text: `SELECT id, email, role, is_active 
           FROM profiles 
           WHERE refresh_token_hash = $1 AND is_active = true
           LIMIT 1`,
      values: [tokenHash]
    }),
    incrementFailedAttempts: (id) => ({
      text: `UPDATE profiles 
           SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1, updated_at = NOW() 
           WHERE id = $1`,
      values: [id]
    }),
    resetFailedAttempts: (id) => ({
      text: `UPDATE profiles 
           SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() 
           WHERE id = $1`,
      values: [id]
    }),
    lockAccount: (id, lockUntil) => ({
      text: `UPDATE profiles 
           SET locked_until = $2, updated_at = NOW() 
           WHERE id = $1`,
      values: [id, lockUntil]
    })
  };
  sessionQueries = {
    create: (id, userId, deviceInfo, ipAddress, userAgent) => ({
      text: `INSERT INTO device_sessions (id, user_id, device_info, ip_address, user_agent, is_active, last_activity, created_at, expires_at)
           VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW(), NOW() + INTERVAL '30 days')
           RETURNING id, user_id, is_active, created_at`,
      values: [id, userId, deviceInfo, ipAddress, userAgent || ""]
    }),
    updateActivity: (id) => ({
      text: `UPDATE device_sessions 
           SET last_activity = NOW() 
           WHERE id = $1 AND is_active = true`,
      values: [id]
    }),
    deactivate: (id) => ({
      text: `UPDATE device_sessions 
           SET is_active = false 
           WHERE id = $1`,
      values: [id]
    }),
    deactivateAllForUser: (userId) => ({
      text: `UPDATE device_sessions 
           SET is_active = false 
           WHERE user_id = $1`,
      values: [userId]
    }),
    getActiveForUser: (userId) => ({
      text: `SELECT id, device_info, ip_address, user_agent, last_activity, created_at 
           FROM device_sessions 
           WHERE user_id = $1 AND is_active = true 
           ORDER BY last_activity DESC`,
      values: [userId]
    }),
    deactivateExpired: () => ({
      text: `UPDATE device_sessions 
           SET is_active = false 
           WHERE is_active = true AND last_activity < NOW() - INTERVAL '30 days'`,
      values: []
    })
  };
  auditQueries = {
    log: (actorId, action, entityType, entityId, changes, ipAddress, userAgent) => ({
      text: `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, changes, ip_address, user_agent, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      values: [actorId, action, entityType, entityId, JSON.stringify(changes), ipAddress, userAgent]
    })
  };
});

// lib/auth/jwt.ts
import { SignJWT, jwtVerify } from "jose";
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
async function generateAccessToken(userId, email, role, permissions, sessionId) {
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
      ...sessionId ? { sid: sessionId } : {},
      type: "access"
    }).setProtectedHeader({ alg: ALGORITHM }).setSubject(userId).setIssuedAt().setExpirationTime(ACCESS_TOKEN_EXPIRATION).setIssuer(TOKEN_ISSUER).setAudience(TOKEN_AUDIENCE).sign(secret);
    return token;
  } catch (error) {
    console.error("[JWT] Access token generation failed");
    throw new Error("Failed to generate access token");
  }
}
async function generateRefreshToken(userId, sessionId) {
  if (!userId || userId.trim().length === 0) {
    throw new Error("User ID is required for refresh token generation");
  }
  try {
    const secret = getRefreshTokenSecret();
    const token = await new SignJWT({
      ...sessionId ? { sid: sessionId } : {},
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
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
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
    const { payload } = await jwtVerify(token, secret, {
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
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
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
var ACCESS_TOKEN_EXPIRATION = "15m", REFRESH_TOKEN_EXPIRATION = "7d", TOKEN_ISSUER = "mihas-auth", TOKEN_AUDIENCE = "mihas-app", ALGORITHM = "HS256";
var init_jwt = () => {};

// lib/auth/cookies.ts
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
    "SameSite=Lax"
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
function extractRefreshTokenFromCookie(req) {
  const cookies = parseCookies(req);
  const token = cookies[REFRESH_TOKEN_COOKIE];
  if (!token || token.length === 0) {
    return null;
  }
  return token;
}
var ACCESS_TOKEN_COOKIE = "access_token", REFRESH_TOKEN_COOKIE = "refresh_token", ACCESS_TOKEN_MAX_AGE = 900, REFRESH_TOKEN_MAX_AGE = 604800, REFRESH_TOKEN_PATH = "/api/auth";

// lib/queries.ts
function sanitizeEntityId(entityId) {
  if (!entityId)
    return AUDIT_ENTITY_PLACEHOLDER_ID;
  return UUID_REGEX.test(entityId) ? entityId : AUDIT_ENTITY_PLACEHOLDER_ID;
}
function mergeEntityIdIntoChanges(entityId, changes) {
  if (!entityId || UUID_REGEX.test(entityId))
    return changes;
  return { ...changes, _entity_id_label: entityId };
}
var AUDIT_ENTITY_PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000", UUID_REGEX, SessionQueries, AuditQueries;
var init_queries = __esm(() => {
  UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  SessionQueries = {
    create: (id, userId, deviceInfo, ipAddress, userAgent) => ({
      text: `
      INSERT INTO device_sessions (
        id, user_id, device_id, session_token, device_info, ip_address, user_agent,
        is_active, last_activity, created_at, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        true, NOW(), NOW(), NOW() + INTERVAL '30 days'
      )
      RETURNING id, user_id, is_active, last_activity, created_at, expires_at
    `,
      values: [id, userId, id, id, JSON.stringify(deviceInfo), ipAddress, userAgent]
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
  AuditQueries = {
    log: (input) => {
      const safeEntityId = sanitizeEntityId(input.entity_id);
      const mergedChanges = mergeEntityIdIntoChanges(input.entity_id, input.changes);
      return {
        text: `
        INSERT INTO audit_logs (
          actor_id, action, entity_type, entity_id,
          changes, ip_address, user_agent, retention_category, created_at
        )
        VALUES ($1, $2, $3, $4::uuid, $5, $6, $7, $8, NOW())
        RETURNING id, created_at
      `,
        values: [
          input.actor_id,
          input.action,
          input.entity_type,
          safeEntityId,
          mergedChanges ? JSON.stringify(mergedChanges) : null,
          input.ip_address || null,
          input.user_agent || null,
          input.retention_category || "standard"
        ]
      };
    },
    logAuthEvent: (actorId, action, success, ipAddress, userAgent, additionalInfo) => ({
      text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, retention_category, created_at
      )
      VALUES ($1, $2, 'user', COALESCE($1, '${AUDIT_ENTITY_PLACEHOLDER_ID}')::uuid, $3, $4, $5, 'security', NOW())
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
        changes, ip_address, user_agent, retention_category, created_at
      )
      VALUES ($1, 'authorization_failure', $2, COALESCE($3, '${AUDIT_ENTITY_PLACEHOLDER_ID}')::uuid, $4, $5, $6, 'security', NOW())
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
        changes, ip_address, user_agent, retention_category, created_at
      )
      VALUES ($1, $2, 'session', COALESCE($3, '${AUDIT_ENTITY_PLACEHOLDER_ID}')::uuid, $4, $5, $6, 'standard', NOW())
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
      WHERE (
        (retention_category = 'standard' AND created_at < NOW() - INTERVAL '1 day' * $1)
        OR
        (retention_category = 'security' AND created_at < NOW() - INTERVAL '365 days')
        OR
        (retention_category IS NULL AND created_at < NOW() - INTERVAL '1 day' * $1)
      )
      RETURNING id
    `,
      values: [daysOld]
    })
  };
});

// lib/auditLogger.ts
var exports_auditLogger = {};
__export(exports_auditLogger, {
  sanitizeContext: () => sanitizeContext,
  logTokenRefresh: () => logTokenRefresh,
  logSessionEvent: () => logSessionEvent,
  logSecurityEvent: () => logSecurityEvent,
  logPasswordReset: () => logPasswordReset,
  logLogout: () => logLogout,
  logLogin: () => logLogin,
  logFailedLogin: () => logFailedLogin,
  logAuthorizationFailure: () => logAuthorizationFailure,
  logAuthEvent: () => logAuthEvent,
  logAuditEvent: () => logAuditEvent,
  logApplicationStatusChange: () => logApplicationStatusChange,
  logAdminAction: () => logAdminAction,
  logAccountUnlocked: () => logAccountUnlocked,
  logAccountLocked: () => logAccountLocked
});
async function executeQuery(config) {
  const result = await query(config.text, config.values);
  return result.rows;
}
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
function extractRequestMetadata(ipAddress, userAgent) {
  return {
    ip_address: ipAddress ? sanitizeError(ipAddress).replace("[IP]", ipAddress) : null,
    user_agent: userAgent ? userAgent.substring(0, 500) : null
  };
}
async function logAuthEvent(actorId, event, success, ipAddress, userAgent, additionalInfo) {
  try {
    const sanitizedInfo = additionalInfo ? sanitizeContext(additionalInfo) : null;
    const changes = {
      success,
      timestamp: new Date().toISOString()
    };
    if (sanitizedInfo) {
      Object.assign(changes, sanitizedInfo);
    }
    const metadata = extractRequestMetadata(ipAddress, userAgent);
    const input = {
      actor_id: actorId,
      action: event,
      entity_type: "user",
      entity_id: actorId,
      changes,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent
    };
    await executeQuery(AuditQueries.log(input));
  } catch (error) {
    console.error("[AuditLogger] Failed to log auth event:", sanitizeError(error instanceof Error ? error.message : String(error)));
  }
}
async function logAuthorizationFailure(actorId, attemptedAction, entityType, entityId, requiredPermission, ipAddress, userAgent) {
  try {
    const metadata = extractRequestMetadata(ipAddress, userAgent);
    await executeQuery(AuditQueries.logAuthorizationFailure(actorId, attemptedAction, entityType, entityId, requiredPermission, metadata.ip_address, metadata.user_agent));
  } catch (error) {
    console.error("[AuditLogger] Failed to log authorization failure:", sanitizeError(error instanceof Error ? error.message : String(error)));
  }
}
async function logSessionEvent(actorId, action, sessionId, ipAddress, userAgent, additionalInfo) {
  try {
    const sanitizedInfo = additionalInfo ? sanitizeContext(additionalInfo) : undefined;
    const metadata = extractRequestMetadata(ipAddress, userAgent);
    await executeQuery(AuditQueries.logSessionEvent(actorId, action, sessionId, metadata.ip_address, metadata.user_agent, sanitizedInfo || undefined));
  } catch (error) {
    console.error("[AuditLogger] Failed to log session event:", sanitizeError(error instanceof Error ? error.message : String(error)));
  }
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
async function logSecurityEvent(actorId, eventType, details, ipAddress, userAgent) {
  try {
    const sanitizedDetails = sanitizeContext(details);
    const metadata = extractRequestMetadata(ipAddress, userAgent);
    const input = {
      actor_id: actorId,
      action: `security_${eventType}`,
      entity_type: "user",
      entity_id: actorId,
      changes: sanitizedDetails || undefined,
      ip_address: metadata.ip_address,
      user_agent: metadata.user_agent
    };
    await executeQuery(AuditQueries.log(input));
  } catch (error) {
    console.error("[AuditLogger] Failed to log security event:", sanitizeError(error instanceof Error ? error.message : String(error)));
  }
}
async function logLogin(userId, ipAddress, userAgent, sessionId) {
  await logAuthEvent(userId, "user_login", true, ipAddress, userAgent, {
    session_created: !!sessionId
  });
}
async function logFailedLogin(reason, ipAddress, userAgent) {
  await logAuthEvent(null, "auth_failure", false, ipAddress, userAgent, {
    reason: sanitizeError(reason)
  });
}
async function logLogout(userId, ipAddress, userAgent) {
  await logAuthEvent(userId, "user_logout", true, ipAddress, userAgent);
}
async function logTokenRefresh(userId, ipAddress, userAgent) {
  await logAuthEvent(userId, "token_refresh", true, ipAddress, userAgent);
}
async function logAccountLocked(userId, reason, lockDurationMinutes, ipAddress, userAgent) {
  await logAuthEvent(userId, "account_locked", true, ipAddress, userAgent, {
    reason: sanitizeError(reason),
    lock_duration_minutes: lockDurationMinutes
  });
}
async function logAccountUnlocked(userId, unlockedBy, ipAddress, userAgent) {
  await logAuthEvent(userId, "account_unlocked", true, ipAddress, userAgent, {
    unlocked_by: unlockedBy
  });
}
async function logApplicationStatusChange(actorId, applicationId, oldStatus, newStatus, retentionCategory = "standard") {
  await logAuditEvent({
    actor_id: actorId,
    action: "application_status_change",
    entity_type: "application",
    entity_id: applicationId,
    changes: {
      old_status: oldStatus,
      new_status: newStatus,
      retention_category: retentionCategory
    }
  });
}
async function logAdminAction(actorId, actionType, entityType, entityId, changes, retentionCategory = "standard") {
  await logAuditEvent({
    actor_id: actorId,
    action: `admin_${actionType}`,
    entity_type: entityType,
    entity_id: entityId,
    changes: {
      ...changes ? sanitizeContext(changes) : {},
      retention_category: retentionCategory
    }
  });
}
async function logPasswordReset(userId, ipAddress) {
  await logAuthEvent(userId, "password_reset", true, ipAddress, null, {
    retention_category: "security"
  });
}
var SENSITIVE_PATTERNS, PII_PATTERNS;
var init_auditLogger = __esm(() => {
  init_db();
  init_queries();
  init_errorHandler();
  SENSITIVE_PATTERNS = [
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
  PII_PATTERNS = [
    /email/i,
    /phone/i,
    /address/i,
    /name/i,
    /ssn/i,
    /national_id/i,
    /passport/i,
    /birth/i
  ];
});

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
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = sanitizeError(message);
  if (error instanceof AuthError) {
    console.error(`[${context}] Error (${error.code}):`, sanitized);
  } else {
    console.error(`[${context}] Error:`, sanitized);
  }
}
async function logErrorAuditEvent(context, error) {
  try {
    const { logAuditEvent: logAuditEvent2 } = await Promise.resolve().then(() => (init_auditLogger(), exports_auditLogger));
    const errorCode = error instanceof AuthError ? error.code : "INTERNAL_ERROR";
    const errorType = error instanceof AuthError ? "auth_error" : error instanceof Error ? error.constructor.name : "unknown";
    const message = error instanceof Error ? error.message : String(error);
    const sanitizedMessage = sanitizeError(message);
    const input = {
      actor_id: null,
      action: "api_error",
      entity_type: "system",
      entity_id: null,
      changes: {
        endpoint: context,
        error_code: errorCode,
        error_type: errorType,
        error_message: sanitizedMessage,
        timestamp: new Date().toISOString()
      }
    };
    await logAuditEvent2(input);
  } catch {}
}
function handleError(res, error, context = "API") {
  logError(context, error);
  logErrorAuditEvent(context, error).catch(() => {});
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
function sendValidationError(res, fieldErrors, message = "Validation failed") {
  res.setHeader("Content-Type", "application/json");
  const response = {
    success: false,
    error: sanitizeError(message),
    code: ErrorCode.VALIDATION_ERROR,
    fieldErrors
  };
  return res.status(HttpStatus.BAD_REQUEST).json(response);
}
var HttpStatus, ErrorCode, AuthError;
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
  AuthError = class AuthError extends Error {
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
  };
});

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
async function updateActivity(sessionId) {
  const updateQuery = SessionQueries.updateActivity(sessionId);
  const result = await query(updateQuery.text, updateQuery.values);
  return result.rowCount > 0;
}
async function isSessionActive(userId, sessionId) {
  const result = await query(`SELECT id
     FROM device_sessions
     WHERE id = $1
       AND user_id = $2
       AND is_active = true
       AND expires_at > NOW()
     LIMIT 1`, [sessionId, userId]);
  return result.rowCount > 0;
}
var init_sessions = __esm(() => {
  init_db();
  init_queries();
});

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
    const sessionValid = await validateTrackedSession(payload);
    if (!sessionValid) {
      return null;
    }
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
    permissions: payload.permissions || [],
    sessionId: payload.sid
  };
}
async function validateTrackedSession(payload) {
  if (!payload.sid) {
    return true;
  }
  try {
    return await isSessionActive(payload.sub, payload.sid);
  } catch (error) {
    console.log("[AUTH] Session validation failed:", error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}
var init_middleware = __esm(() => {
  init_jwt();
  init_sessions();
});

// lib/csrf.ts
var exports_csrf = {};
__export(exports_csrf, {
  validateToken: () => validateToken,
  rotateToken: () => rotateToken,
  requireCsrf: () => requireCsrf,
  hashToken: () => hashToken,
  generateToken: () => generateToken,
  ensureToken: () => ensureToken
});
import { randomBytes, createHash as createHash2 } from "crypto";
function hashToken(raw) {
  return createHash2("sha256").update(raw).digest("hex");
}
async function generateToken(userId) {
  const raw = randomBytes(32).toString("hex");
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await query("DELETE FROM csrf_tokens WHERE user_id = $1", [userId]);
  await query(`INSERT INTO csrf_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`, [userId, hash, expiresAt]);
  return raw;
}
async function validateToken(userId, raw) {
  if (!raw || !userId)
    return false;
  const hash = hashToken(raw);
  const result = await query(`SELECT id FROM csrf_tokens
     WHERE user_id = $1 AND token_hash = $2 AND expires_at > NOW()
     LIMIT 1`, [userId, hash]);
  return result.rows.length > 0;
}
async function rotateToken(userId) {
  return generateToken(userId);
}
async function ensureToken(userId) {
  await query("DELETE FROM csrf_tokens WHERE user_id = $1 AND expires_at <= NOW()", [userId]);
  const raw = randomBytes(32).toString("hex");
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await query(`INSERT INTO csrf_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`, [userId, hash, expiresAt]);
  return raw;
}
async function requireCsrf(req, res) {
  const method = (req.method || "").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    return false;
  }
  const user = await getAuthUser(req);
  if (!user) {
    return false;
  }
  const token = req.headers["x-csrf-token"];
  if (!token) {
    sendError(res, "CSRF token required", 403, "CSRF_VALIDATION_FAILED");
    return true;
  }
  const valid = await validateToken(user.userId, token);
  if (!valid) {
    sendError(res, "Invalid CSRF token", 403, "CSRF_VALIDATION_FAILED");
    return true;
  }
  return false;
}
var TOKEN_TTL_MS;
var init_csrf = __esm(() => {
  init_db();
  init_middleware();
  init_errorHandler();
  TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
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

// api-src/auth.ts
init_db();

// lib/auth/password.ts
import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "crypto";
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
function isSha256Hash(hash) {
  if (!hash || hash.length !== 64)
    return false;
  return /^[a-f0-9]{64}$/i.test(hash) && !hash.startsWith("$2");
}
function verifySha256Password(password, storedHash) {
  if (!password || !storedHash)
    return false;
  try {
    const computedHash = createHash("sha256").update(password).digest("hex");
    const computedBuffer = Buffer.from(computedHash, "hex");
    const storedBuffer = Buffer.from(storedHash, "hex");
    if (computedBuffer.length !== storedBuffer.length)
      return false;
    return timingSafeEqual(computedBuffer, storedBuffer);
  } catch {
    return false;
  }
}
async function migrateSha256ToBcrypt(userId, password) {
  try {
    const bcryptHash = await hashPassword(password);
    const { query: dbQuery } = await Promise.resolve().then(() => (init_db(), exports_db));
    await dbQuery("UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2", [bcryptHash, userId]);
    console.log(`[PASSWORD] Migrated SHA-256 hash to bcrypt for user: ${userId}`);
    return bcryptHash;
  } catch (error) {
    console.error("[PASSWORD] SHA-256 to bcrypt migration failed");
    return null;
  }
}

// api-src/auth.ts
init_jwt();

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
  registration: { window: "10m", max: 3 }
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
async function arcjetProtect(req, routeType = "general") {
  if (!ARCJET_KEY) {
    console.warn("[ARCJET] WARNING: ARCJET_KEY not set, allowing request");
    return { allowed: true, reason: "ARCJET_KEY not set" };
  }
  try {
    const protectedAj = createProtectedArcjet(routeType);
    const decision = await protectedAj.protect(req);
    if (decision.isDenied()) {
      const reasonType = getBlockReasonType(decision);
      console.log("[ARCJET] BLOCKED (manual): reason=" + reasonType + ", id=" + decision.id);
      return {
        allowed: false,
        reason: reasonType
      };
    }
    return { allowed: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[ARCJET] Service error (manual): " + errorMsg);
    return { allowed: false, reason: "SECURITY_SERVICE_ERROR" };
  }
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

// api-src/auth.ts
init_errorHandler();
init_auditLogger();
init_csrf();
import { createHash as createHash3, randomBytes as randomBytes2 } from "crypto";

// lib/validation/middleware.ts
init_errorHandler();
function formatZodErrors(error) {
  const fieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}
function validateBody(schema, req, res) {
  const result = schema.safeParse(req.body || {});
  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    sendValidationError(res, fieldErrors);
    return null;
  }
  return result.data;
}
function validateQuery(schema, req, res) {
  const result = schema.safeParse(req.query || {});
  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    sendValidationError(res, fieldErrors);
    return null;
  }
  return result.data;
}

// lib/validation/auth.ts
import { z as z2 } from "zod";

// lib/validation/sanitize.ts
import { z } from "zod";
var sanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed"));
var optionalSanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed")).optional();
var nonEmptySanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty"));

// lib/validation/auth.ts
var emailSchema = z2.string().transform((s) => s.trim()).pipe(z2.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => z2.string().email().safeParse(s).success, "Invalid email format"));
var passwordSchema = z2.string().min(8, "Password must be at least 8 characters").refine((s) => /[A-Z]/.test(s), "Password must contain at least one uppercase letter").refine((s) => /[a-z]/.test(s), "Password must contain at least one lowercase letter").refine((s) => /\d/.test(s), "Password must contain at least one digit");
var loginBodySchema = z2.object({
  email: emailSchema,
  password: z2.string().min(1, "Password is required")
});
var registerBodySchema = z2.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nonEmptySanitizedString,
  lastName: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  date_of_birth: optionalSanitizedString,
  sex: optionalSanitizedString,
  residence_town: optionalSanitizedString,
  country: optionalSanitizedString,
  nationality: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString
});
var passwordResetRequestBodySchema = z2.object({
  email: emailSchema
});
var passwordResetBodySchema = z2.object({
  token: z2.string().min(1, "Token is required"),
  newPassword: passwordSchema
});
var profileUpdateBodySchema = z2.object({
  full_name: optionalSanitizedString,
  first_name: optionalSanitizedString,
  last_name: optionalSanitizedString,
  phone: optionalSanitizedString,
  date_of_birth: optionalSanitizedString,
  sex: optionalSanitizedString,
  residence_town: optionalSanitizedString,
  country: optionalSanitizedString,
  nationality: optionalSanitizedString,
  nrc_number: optionalSanitizedString,
  address: optionalSanitizedString,
  avatar_url: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString
}).partial();
var checkEmailQuerySchema = z2.object({
  action: z2.literal("check-email"),
  email: emailSchema
});

// lib/envValidator.ts
var MIN_JWT_SECRET_LENGTH = 32;
var VALID_DB_PREFIXES = ["postgres://", "postgresql://"];
var REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
  "ARCJET_KEY"
];
function validateDatabaseUrl(url) {
  return VALID_DB_PREFIXES.some((prefix) => url.startsWith(prefix));
}
function validateJwtSecret(secret) {
  return secret.length >= MIN_JWT_SECRET_LENGTH;
}
function validateServerEnv() {
  const errors = [];
  for (const name of REQUIRED_ENV_VARS) {
    const value = process.env[name];
    if (!value || value.trim().length === 0) {
      errors.push({ variable: name, message: `${name} is missing or empty` });
      continue;
    }
    if (name === "DATABASE_URL" && !validateDatabaseUrl(value)) {
      errors.push({
        variable: name,
        message: `DATABASE_URL must start with postgres:// or postgresql://`
      });
    }
    if ((name === "JWT_SECRET" || name === "JWT_REFRESH_SECRET") && !validateJwtSecret(value)) {
      errors.push({
        variable: name,
        message: `${name} must be at least ${MIN_JWT_SECRET_LENGTH} characters long`
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

// api-src/auth.ts
init_sessions();

// lib/auth/userPermissionOverrides.ts
init_db();

// lib/auth/permissions.ts
init_queries();
var USER_ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  ADMISSIONS_OFFICER: "admissions_officer",
  REGISTRAR: "registrar",
  FINANCE_OFFICER: "finance_officer",
  ACADEMIC_HEAD: "academic_head",
  REVIEWER: "reviewer",
  STUDENT: "student"
};
var ALL_USER_ROLES = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.ADMIN,
  USER_ROLES.ADMISSIONS_OFFICER,
  USER_ROLES.REGISTRAR,
  USER_ROLES.FINANCE_OFFICER,
  USER_ROLES.ACADEMIC_HEAD,
  USER_ROLES.REVIEWER,
  USER_ROLES.STUDENT
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
  admissions_officer: [
    "applications:read",
    "applications:review",
    "applications:write",
    "documents:read",
    "documents:verify",
    "payments:read"
  ],
  registrar: [
    "applications:read",
    "applications:review",
    "programs:read",
    "documents:read",
    "analytics:read"
  ],
  finance_officer: [
    "applications:read",
    "payments:read",
    "payments:verify",
    "documents:read"
  ],
  academic_head: [
    "applications:read",
    "applications:review",
    "programs:read",
    "documents:read",
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

// lib/auth/userPermissionOverrides.ts
function toDatabaseErrorCode(error) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }
  const code = error.code;
  return typeof code === "string" ? code : null;
}
function isPermissionOverrideTableMissing(error) {
  return toDatabaseErrorCode(error) === "42P01";
}
function getAllKnownPermissions() {
  const permissions = new Set;
  for (const rolePermissions of Object.values(ROLE_PERMISSIONS)) {
    for (const permission of rolePermissions) {
      permissions.add(permission);
    }
  }
  return Array.from(permissions).sort();
}
var KNOWN_PERMISSION_SET = new Set(getAllKnownPermissions());
function validatePermissionList(permissions) {
  const invalid = new Set;
  const normalized = new Set;
  for (const rawPermission of permissions) {
    const permission = rawPermission.trim();
    if (!permission) {
      continue;
    }
    if (!KNOWN_PERMISSION_SET.has(permission)) {
      invalid.add(permission);
      continue;
    }
    normalized.add(permission);
  }
  return {
    normalized: Array.from(normalized).sort(),
    invalid: Array.from(invalid).sort()
  };
}
async function getPermissionOverrideForUser(userId) {
  try {
    const result = await query("SELECT permissions FROM user_permission_overrides WHERE user_id = $1 LIMIT 1", [userId]);
    if (result.rows.length === 0) {
      return null;
    }
    return validatePermissionList(result.rows[0].permissions || []).normalized;
  } catch (error) {
    if (isPermissionOverrideTableMissing(error)) {
      return null;
    }
    throw error;
  }
}
async function getEffectivePermissionsForUser(userId, role) {
  const overridePermissions = await getPermissionOverrideForUser(userId);
  if (overridePermissions !== null) {
    return {
      permissions: overridePermissions,
      source: "override"
    };
  }
  return {
    permissions: getPermissionsForRole(role),
    source: "role"
  };
}

// api-src/auth.ts
function deriveFullName(params) {
  const normalize = (value) => {
    if (!value)
      return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  const explicitFullName = normalize(params.full_name);
  if (explicitFullName)
    return explicitFullName;
  const firstName = normalize(params.first_name ?? params.firstName);
  const lastName = normalize(params.last_name ?? params.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (combinedName)
    return combinedName;
  const normalizedEmail = normalize(params.email);
  if (normalizedEmail) {
    const [localPart] = normalizedEmail.split("@");
    const cleanLocalPart = normalize(localPart);
    if (cleanLocalPart)
      return cleanLocalPart;
  }
  return "Student";
}
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join("; ");
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
  }
  const action = req.query.action;
  const csrfExemptActions = ["login", "register", "forgot-password", "reset-password", "password-reset-request", "password-reset", "refresh", "logout"];
  if (!csrfExemptActions.includes(action)) {
    const { requireCsrf: requireCsrf2 } = await Promise.resolve().then(() => (init_csrf(), exports_csrf));
    if (await requireCsrf2(req, res))
      return;
  }
  try {
    switch (action) {
      case "login":
        return await handleLogin(req, res);
      case "logout":
        return await handleLogout(req, res);
      case "register":
        return await handleRegister(req, res);
      case "session":
        return await handleSession(req, res);
      case "refresh":
        return await handleRefresh(req, res);
      case "check-email":
        return await handleCheckEmail(req, res);
      case "roles":
        return await handleRoles(req, res);
      case "profile":
        return await handleProfile(req, res);
      case "forgot-password":
      case "password-reset-request":
        return await handlePasswordResetRequest(req, res);
      case "reset-password":
      case "password-reset":
        return await handlePasswordReset(req, res);
      default:
        return sendError(res, "Invalid action. Use: login, logout, register, session, refresh, check-email, roles, profile, forgot-password, reset-password, password-reset-request, password-reset", HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error);
  }
}
function hashResetToken(token) {
  return createHash3("sha256").update(token).digest("hex");
}
function buildResetPasswordLink(token) {
  const origin = process.env.APP_URL || process.env.FRONTEND_URL || process.env.PUBLIC_URL || "http://localhost:5173";
  return `${origin.replace(/\/$/, "")}/auth/reset-password?token=${encodeURIComponent(token)}`;
}
async function sendPasswordResetEmail(email, fullName, resetLink) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[AUTH] RESEND_API_KEY not configured, cannot send reset email");
    return false;
  }
  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">Reset your MIHAS account password</h2>
      <p style="font-size: 16px; line-height: 1.6; color: #374151;">
        Hello ${fullName || "Student"}, we received a request to reset your account password.
      </p>
      <p style="font-size: 16px; line-height: 1.6; color: #374151;">
        Click the button below to continue. This link will expire in 60 minutes.
      </p>
      <p style="margin-top: 20px;">
        <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "noreply@mihas.edu.zm",
      to: email,
      subject: "Reset your MIHAS password",
      html: emailHtml
    })
  });
  return emailResponse.ok;
}
var LOGIN_COOLDOWN_THRESHOLD = 5;
var LOGIN_COOLDOWN_MINUTES = 15;
var LOGIN_LOCKOUT_THRESHOLD = 10;
var LOGIN_LOCKOUT_MINUTES = 30;
var REGISTRATION_RATE_LIMIT = 3;
var REGISTRATION_RATE_WINDOW_MINUTES = 10;
function hashForStorage(value) {
  return createHash3("sha256").update(value.toLowerCase().trim()).digest("hex");
}
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
function getRequestUserAgent(req) {
  const userAgent = req.headers["user-agent"];
  return typeof userAgent === "string" ? userAgent : null;
}
async function createTrackedSession(req, userId) {
  const userAgent = getRequestUserAgent(req);
  const session = await createSession({
    userId,
    deviceInfo: parseDeviceInfo(userAgent),
    ipAddress: getClientIp(req),
    userAgent
  });
  return session.id;
}
async function ensureTrackedSession(req, userId, sessionId) {
  if (sessionId) {
    const active = await isSessionActive(userId, sessionId);
    if (!active) {
      throw new Error("SESSION_REVOKED");
    }
    await updateActivity(sessionId).catch(() => {});
    return sessionId;
  }
  return createTrackedSession(req, userId);
}
async function recordLoginAttempt(emailHash, ipHash, success) {
  try {
    await query(`INSERT INTO login_attempts (email_hash, ip_hash, attempted_at, success)
       VALUES ($1, $2, NOW(), $3)`, [emailHash, ipHash, success]);
  } catch (err) {
    console.error("[AUTH] Failed to record login attempt:", err.message);
    logErrorAuditEvent("auth/record-login-attempt", err).catch(() => {});
  }
}
async function checkLoginCooldown(emailHash) {
  try {
    const result = await query(`SELECT COUNT(*) AS fail_count, MIN(attempted_at) AS oldest_failure
       FROM login_attempts
       WHERE email_hash = $1
         AND success = FALSE
         AND attempted_at > NOW() - INTERVAL '${LOGIN_COOLDOWN_MINUTES} minutes'`, [emailHash]);
    const failCount = parseInt(result.rows[0]?.fail_count || "0", 10);
    if (failCount >= LOGIN_COOLDOWN_THRESHOLD) {
      const oldestFailure = new Date(result.rows[0].oldest_failure);
      const cooldownEnd = new Date(oldestFailure.getTime() + LOGIN_COOLDOWN_MINUTES * 60 * 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000));
      return { blocked: true, retryAfterSeconds };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  } catch (err) {
    console.error("[AUTH] Failed to check login cooldown:", err.message);
    logErrorAuditEvent("auth/check-login-cooldown", err).catch(() => {});
    return { blocked: false, retryAfterSeconds: 0 };
  }
}
async function checkAccountLockout(emailHash) {
  try {
    const result = await query(`SELECT success, attempted_at
       FROM login_attempts
       WHERE email_hash = $1
       ORDER BY attempted_at DESC
       LIMIT $2`, [emailHash, LOGIN_LOCKOUT_THRESHOLD]);
    if (result.rows.length < LOGIN_LOCKOUT_THRESHOLD) {
      return { locked: false, retryAfterSeconds: 0 };
    }
    const allFailed = result.rows.every((row) => !row.success);
    if (!allFailed) {
      return { locked: false, retryAfterSeconds: 0 };
    }
    const tenthFailure = new Date(result.rows[result.rows.length - 1].attempted_at);
    const lockoutEnd = new Date(tenthFailure.getTime() + LOGIN_LOCKOUT_MINUTES * 60 * 1000);
    if (Date.now() < lockoutEnd.getTime()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((lockoutEnd.getTime() - Date.now()) / 1000));
      return { locked: true, retryAfterSeconds };
    }
    return { locked: false, retryAfterSeconds: 0 };
  } catch (err) {
    console.error("[AUTH] Failed to check account lockout:", err.message);
    logErrorAuditEvent("auth/check-account-lockout", err).catch(() => {});
    return { locked: false, retryAfterSeconds: 0 };
  }
}
async function sendLockoutNotificationEmail(email, fullName) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[AUTH] RESEND_API_KEY not configured, cannot send lockout notification");
    return;
  }
  try {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc2626;">MIHAS Account Security Alert</h2>
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          Hello ${fullName || "Student"},
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          Your MIHAS account has been temporarily locked due to multiple failed login attempts.
          The account will be automatically unlocked after ${LOGIN_LOCKOUT_MINUTES} minutes.
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #374151;">
          If this was not you, we recommend resetting your password immediately after the lockout period ends.
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          This is an automated security notification from the MIHAS Application System.
        </p>
      </div>
    `;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "noreply@mihas.edu.zm",
        to: email,
        subject: "MIHAS Account Locked — Security Alert",
        html: emailHtml
      })
    });
  } catch (err) {
    console.error("[AUTH] Failed to send lockout notification email:", err.message);
    logErrorAuditEvent("auth/send-lockout-email", err).catch(() => {});
  }
}
async function handlePasswordResetRequest(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(passwordResetRequestBodySchema, req, res);
  if (!parsed)
    return;
  const normalizedEmail = parsed.email.toLowerCase().trim();
  const userResult = await query(`SELECT id, email, first_name, last_name
     FROM profiles WHERE email = $1 AND is_active = true LIMIT 1`, [normalizedEmail]);
  if (userResult.rows.length > 0) {
    const user = userResult.rows[0];
    const rateLimitResult = await query(`SELECT COUNT(*) AS request_count FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`, [user.id]);
    const requestCount = parseInt(rateLimitResult.rows[0]?.request_count || "0", 10);
    if (requestCount >= 3) {
      const oldestInWindowResult = await query(`SELECT MIN(created_at) AS oldest FROM password_reset_tokens
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`, [user.id]);
      const oldest = oldestInWindowResult.rows[0]?.oldest;
      let retryAfterSeconds = 900;
      if (oldest) {
        const windowEnd = new Date(oldest).getTime() + 900000;
        retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - Date.now()) / 1000));
      }
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return sendError(res, "Too many password reset requests. Please try again later.", HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
    }
    const rawToken = randomBytes2(32).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    await query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [user.id, tokenHash]);
    const resetLink = buildResetPasswordLink(rawToken);
    const fullName = deriveFullName(user);
    try {
      const sent = await sendPasswordResetEmail(user.email, fullName, resetLink);
      if (!sent) {
        console.warn("[AUTH] Password reset email delivery failed, should be retried");
      }
    } catch (emailErr) {
      console.warn("[AUTH] Password reset email send threw, should be retried");
      logErrorAuditEvent("auth/password-reset-email", emailErr).catch(() => {});
    }
  }
  return sendSuccess(res, {
    message: "If an account with that email exists, a password reset link has been sent."
  });
}
async function handlePasswordReset(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(passwordResetBodySchema, req, res);
  if (!parsed)
    return;
  const { token, newPassword } = parsed;
  const tokenHash = hashResetToken(token);
  const tokenResult = await query(`SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1
       AND expires_at > NOW()
       AND used_at IS NULL
     LIMIT 1`, [tokenHash]);
  if (tokenResult.rows.length === 0) {
    return sendError(res, "Invalid or expired reset token", HttpStatus.BAD_REQUEST, "INVALID_TOKEN");
  }
  const { id: tokenId, user_id: userId } = tokenResult.rows[0];
  const hashedPassword = await hashPassword(newPassword);
  await query(`UPDATE profiles SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [hashedPassword, userId]);
  await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [tokenId]);
  await query(`UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`, [userId]);
  return sendSuccess(res, {
    message: "Password has been reset successfully."
  });
}
async function handleLogin(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(loginBodySchema, req, res);
  if (!parsed)
    return;
  const { email, password } = parsed;
  const emailHash = hashForStorage(email);
  const ipHash = hashForStorage(getClientIp(req));
  const lockout = await checkAccountLockout(emailHash);
  if (lockout.locked) {
    res.setHeader("Retry-After", String(lockout.retryAfterSeconds));
    return sendError(res, "Account temporarily locked due to too many failed attempts. Please try again later.", HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
  }
  const cooldown = await checkLoginCooldown(emailHash);
  if (cooldown.blocked) {
    res.setHeader("Retry-After", String(cooldown.retryAfterSeconds));
    return sendError(res, "Too many login attempts. Please try again later.", HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
  }
  const result = await query(`SELECT id, email, password_hash, role, first_name, last_name, is_active 
     FROM profiles WHERE email = $1 LIMIT 1`, [email.toLowerCase()]);
  if (result.rows.length === 0) {
    await recordLoginAttempt(emailHash, ipHash, false);
    return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
  }
  const user = result.rows[0];
  if (!user.is_active) {
    await recordLoginAttempt(emailHash, ipHash, false);
    return sendError(res, "Account is disabled", HttpStatus.FORBIDDEN);
  }
  let passwordValid = false;
  if (user.password_hash && isSha256Hash(user.password_hash)) {
    const sha256Valid = verifySha256Password(password, user.password_hash);
    if (sha256Valid) {
      const migrated = await migrateSha256ToBcrypt(user.id, password);
      passwordValid = migrated !== null;
    }
  } else {
    passwordValid = await verifyPassword(password, user.password_hash);
  }
  if (!passwordValid) {
    await recordLoginAttempt(emailHash, ipHash, false);
    const postFailLockout = await checkAccountLockout(emailHash);
    if (postFailLockout.locked) {
      sendLockoutNotificationEmail(user.email, deriveFullName(user)).catch(() => {});
    }
    return sendError(res, "Invalid credentials", HttpStatus.UNAUTHORIZED);
  }
  await recordLoginAttempt(emailHash, ipHash, true);
  const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);
  const sessionId = await createTrackedSession(req, user.id);
  const accessToken = await generateAccessToken(user.id, user.email, user.role, permissions, sessionId);
  const refreshToken = await generateRefreshToken(user.id, sessionId);
  setAuthCookies(res, accessToken, refreshToken);
  const csrfToken = await generateToken(user.id);
  res.setHeader("X-CSRF-Token", csrfToken);
  return sendSuccess(res, {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      full_name: deriveFullName(user),
      permissions
    }
  });
}
async function handleLogout(req, res) {
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      const ipAddress = getClientIp(req);
      const userAgent = getRequestUserAgent(req);
      if (payload.sid) {
        await deactivateSession(payload.sid, payload.sub, ipAddress, userAgent);
      } else {
        await deactivateAllSessions(payload.sub, ipAddress, userAgent);
      }
      try {
        await logAuditEvent({
          actor_id: payload.sub,
          action: "user_logout",
          entity_type: "session",
          entity_id: payload.sid || payload.sub,
          changes: {
            current_session_deactivated: Boolean(payload.sid),
            fallback_all_sessions_deactivated: !payload.sid
          }
        });
      } catch {}
    } catch (logoutErr) {
      logErrorAuditEvent("auth/logout-session-deactivation", logoutErr).catch(() => {});
    }
  }
  clearAuthCookies(res);
  return sendSuccess(res, { message: "Logged out successfully" });
}
function registrationKey(ipHash) {
  return createHash3("sha256").update("reg:" + ipHash).digest("hex");
}
async function checkRegistrationRateLimit(ipHash) {
  try {
    const result = await query(`SELECT COUNT(*) AS reg_count, MIN(attempted_at) AS oldest_reg
       FROM login_attempts
       WHERE email_hash = $1
         AND attempted_at > NOW() - INTERVAL '${REGISTRATION_RATE_WINDOW_MINUTES} minutes'`, [registrationKey(ipHash)]);
    const regCount = parseInt(result.rows[0]?.reg_count || "0", 10);
    if (regCount >= REGISTRATION_RATE_LIMIT) {
      const oldestReg = new Date(result.rows[0].oldest_reg);
      const windowEnd = new Date(oldestReg.getTime() + REGISTRATION_RATE_WINDOW_MINUTES * 60 * 1000);
      const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd.getTime() - Date.now()) / 1000));
      return { blocked: true, retryAfterSeconds };
    }
    return { blocked: false, retryAfterSeconds: 0 };
  } catch (err) {
    console.error("[AUTH] Failed to check registration rate limit:", err.message);
    logErrorAuditEvent("auth/check-registration-rate-limit", err).catch(() => {});
    return { blocked: false, retryAfterSeconds: 0 };
  }
}
async function recordRegistrationAttempt(ipHash) {
  try {
    await query(`INSERT INTO login_attempts (email_hash, ip_hash, attempted_at, success)
       VALUES ($1, $2, NOW(), TRUE)`, [registrationKey(ipHash), ipHash]);
  } catch (err) {
    console.error("[AUTH] Failed to record registration attempt:", err.message);
    logErrorAuditEvent("auth/record-registration-attempt", err).catch(() => {});
  }
}
async function handleRegister(req, res) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(registerBodySchema, req, res);
  if (!parsed)
    return;
  const arcjetResult = await arcjetProtect(req, "registration");
  if (!arcjetResult.allowed) {
    res.setHeader("Retry-After", "600");
    return sendError(res, "Too many registration attempts. Please try again later.", HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
  }
  const ipHash = hashForStorage(getClientIp(req));
  const regLimit = await checkRegistrationRateLimit(ipHash);
  if (regLimit.blocked) {
    res.setHeader("Retry-After", String(regLimit.retryAfterSeconds));
    return sendError(res, "Too many registration attempts. Please try again later.", HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
  }
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    date_of_birth,
    sex,
    residence_town,
    nationality,
    next_of_kin_name,
    next_of_kin_phone
  } = parsed;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  const existing = await query("SELECT id FROM profiles WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return sendError(res, "Email already registered", HttpStatus.CONFLICT);
  }
  const passwordHash = await hashPassword(password);
  const result = await query(`INSERT INTO profiles (
       email,
       password_hash,
       role,
       first_name,
       last_name,
       full_name,
       phone,
       date_of_birth,
       sex,
       residence_town,
       nationality,
       next_of_kin_name,
       next_of_kin_phone,
       is_active,
       created_at,
       updated_at
     )
     VALUES ($1, $2, 'student', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW(), NOW())
     RETURNING id`, [
    email.toLowerCase(),
    passwordHash,
    firstName,
    lastName,
    fullName,
    phone || null,
    date_of_birth || null,
    sex || null,
    residence_town || null,
    nationality || "Zambian",
    next_of_kin_name || null,
    next_of_kin_phone || null
  ]);
  const userId = result.rows[0].id;
  const { permissions } = await getEffectivePermissionsForUser(userId, "student");
  const sessionId = await createTrackedSession(req, userId);
  const accessToken = await generateAccessToken(userId, email.toLowerCase(), "student", permissions, sessionId);
  const refreshToken = await generateRefreshToken(userId, sessionId);
  setAuthCookies(res, accessToken, refreshToken);
  const csrfToken = await generateToken(userId);
  res.setHeader("X-CSRF-Token", csrfToken);
  await recordRegistrationAttempt(ipHash);
  try {
    await logAuditEvent({
      actor_id: userId,
      action: "user_registered",
      entity_type: "user",
      entity_id: userId,
      changes: { role: "student", self_registered: true }
    });
  } catch (auditError) {
    console.error("[auth] Failed to create registration audit log:", auditError);
    logErrorAuditEvent("auth/registration-audit", auditError).catch(() => {});
  }
  return sendSuccess(res, {
    user: {
      id: userId,
      email: email.toLowerCase(),
      role: "student",
      firstName,
      lastName,
      full_name: deriveFullName({ firstName, lastName, email }),
      permissions
    },
    profile: {
      id: userId,
      email: email.toLowerCase(),
      role: "student",
      first_name: firstName,
      last_name: lastName,
      full_name: fullName || deriveFullName({ firstName, lastName, email }),
      phone: phone || null,
      date_of_birth: date_of_birth || null,
      sex: sex || null,
      residence_town: residence_town || null,
      nationality: nationality || "Zambian",
      next_of_kin_name: next_of_kin_name || null,
      next_of_kin_phone: next_of_kin_phone || null
    }
  }, HttpStatus.CREATED);
}
async function handleSession(req, res) {
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (!token) {
    return sendSuccess(res, { user: null });
  }
  try {
    const payload = await verifyAccessToken(token);
    if (payload.sid) {
      const sessionActive = await isSessionActive(payload.sub, payload.sid);
      if (!sessionActive) {
        clearAuthCookies(res);
        return sendSuccess(res, { user: null });
      }
      await updateActivity(payload.sid).catch(() => {});
    }
    const result = await query("SELECT id, email, role, first_name, last_name FROM profiles WHERE id = $1", [payload.sub]);
    if (result.rows.length === 0) {
      clearAuthCookies(res);
      return sendSuccess(res, { user: null });
    }
    const user = result.rows[0];
    const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);
    const csrfToken = await ensureToken(user.id);
    res.setHeader("X-CSRF-Token", csrfToken);
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        full_name: deriveFullName(user),
        permissions
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
    const refreshPayload = await verifyRefreshToken(refreshTokenValue);
    const { sub: userId } = refreshPayload;
    const result = await query("SELECT id, email, role, first_name, last_name, is_active FROM profiles WHERE id = $1", [userId]);
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      clearAuthCookies(res);
      return sendError(res, "User not found or inactive", HttpStatus.UNAUTHORIZED);
    }
    const user = result.rows[0];
    const sessionId = await ensureTrackedSession(req, user.id, refreshPayload.sid);
    const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);
    const newAccessToken = await generateAccessToken(user.id, user.email, user.role, permissions, sessionId);
    const newRefreshToken = await generateRefreshToken(user.id, sessionId);
    setAuthCookies(res, newAccessToken, newRefreshToken);
    const newCsrfToken = await rotateToken(user.id);
    res.setHeader("X-CSRF-Token", newCsrfToken);
    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.first_name,
        lastName: user.last_name,
        full_name: deriveFullName(user),
        permissions
      }
    });
  } catch (error) {
    clearAuthCookies(res);
    if (error instanceof Error && error.message === "SESSION_REVOKED") {
      return sendError(res, "Session has expired or was revoked", HttpStatus.UNAUTHORIZED);
    }
    return sendError(res, "Invalid refresh token", HttpStatus.UNAUTHORIZED);
  }
}
async function handleRoles(req, res) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
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
    const { permissions } = await getEffectivePermissionsForUser(user.id, user.role);
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
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (!token) {
    return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED");
  }
  try {
    const payload = await verifyAccessToken(token);
    if (req.method === "GET") {
      const result2 = await query(`SELECT id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, country, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone
         FROM profiles WHERE id = $1 LIMIT 1`, [payload.sub]);
      if (result2.rows.length === 0) {
        clearAuthCookies(res);
        return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED);
      }
      const profileUser2 = {
        ...result2.rows[0],
        full_name: deriveFullName(result2.rows[0])
      };
      return sendSuccess(res, {
        ...profileUser2,
        user: profileUser2
      });
    }
    const allowedFields = [
      "full_name",
      "first_name",
      "last_name",
      "phone",
      "date_of_birth",
      "sex",
      "residence_town",
      "country",
      "nationality",
      "nrc_number",
      "address",
      "avatar_url",
      "next_of_kin_name",
      "next_of_kin_phone"
    ];
    const isAllowedField = (key) => allowedFields.includes(key);
    const updates = validateBody(profileUpdateBodySchema, req, res);
    if (!updates)
      return;
    if (updates.full_name && typeof updates.full_name === "string") {
      const parts = updates.full_name.trim().split(/\s+/);
      if (!updates.first_name)
        updates.first_name = parts[0] || undefined;
      if (!updates.last_name)
        updates.last_name = parts.slice(1).join(" ") || undefined;
    }
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
       RETURNING id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, country, nationality, nrc_number, address, avatar_url, next_of_kin_name, next_of_kin_phone`, values);
    if (result.rows.length === 0) {
      return sendError(res, "Profile not found", HttpStatus.NOT_FOUND);
    }
    const profileUser = {
      ...result.rows[0],
      full_name: deriveFullName(result.rows[0])
    };
    return sendSuccess(res, {
      ...profileUser,
      user: profileUser
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg.includes("expired") || msg.includes("signature") || msg.includes("invalid")) {
      clearAuthCookies(res);
      return sendError(res, "Authentication required", HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED");
    }
    console.error("[AUTH] Profile error:", msg);
    logErrorAuditEvent("auth/profile", error).catch(() => {});
    return sendError(res, "Internal error", HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR");
  }
}
var auth_default = withArcjetProtection(handler, "auth");
async function handleCheckEmail(req, res) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateQuery(checkEmailQuerySchema, req, res);
  if (!parsed)
    return;
  const email = parsed.email;
  const existing = await query("SELECT id FROM profiles WHERE email = $1 LIMIT 1", [email.toLowerCase()]);
  return sendSuccess(res, { available: existing.rows.length === 0 });
}
export {
  auth_default as default
};
