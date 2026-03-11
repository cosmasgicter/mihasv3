import { createRequire } from "node:module";
var __defProp = Object.defineProperty;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
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
var AUDIT_ENTITY_PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000", UUID_REGEX, AuditQueries;
var init_queries = __esm(() => {
  UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
async function logErrorAuditEvent(context, error) {
  try {
    const { logAuditEvent: logAuditEvent2 } = await Promise.resolve().then(() => (init_auditLogger(), exports_auditLogger));
    const errorCode = error instanceof AuthError ? error.code : "INTERNAL_ERROR";
    const errorType = error instanceof AuthError ? "auth_error" : error instanceof Error ? error.constructor.name : "unknown";
    const input = {
      actor_id: null,
      action: "api_error",
      entity_type: "system",
      entity_id: null,
      changes: {
        endpoint: context,
        error_code: errorCode,
        error_type: errorType,
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

// api-src/bootstrap.ts
init_errorHandler();

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

// api-src/bootstrap.ts
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join("; ");
    sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
    return;
  }
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
