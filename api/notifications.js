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
  const commands = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"];
  for (const cmd of commands) {
    if (trimmed.startsWith(cmd)) {
      return cmd;
    }
  }
  return "UNKNOWN";
}
function getNeonInstance() {
  if (!cachedSql) {
    const { url } = getDatabaseConfig();
    const { neon } = __require("@neondatabase/serverless");
    cachedSql = neon(url);
  }
  return cachedSql;
}
async function executeNeonQuery(queryText, params) {
  const command = extractCommand(queryText);
  try {
    const sql = getNeonInstance();
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
var DatabaseErrorCode, DatabaseError, cachedSql = null;
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
var USER_ROLES, AUDIT_ENTITY_PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000", UUID_REGEX, AuditQueries;
var init_queries = __esm(() => {
  USER_ROLES = {
    SUPER_ADMIN: "super_admin",
    ADMIN: "admin",
    ADMISSIONS_OFFICER: "admissions_officer",
    REGISTRAR: "registrar",
    FINANCE_OFFICER: "finance_officer",
    ACADEMIC_HEAD: "academic_head",
    REVIEWER: "reviewer",
    STUDENT: "student"
  };
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

// api-src/notifications.ts
init_db();

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

// lib/sessions.ts
init_db();
init_queries();
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
async function requireAuth(req) {
  const token = extractToken(req);
  if (!token) {
    throw new AuthenticationError("Authentication required", "AUTHENTICATION_REQUIRED", 401);
  }
  try {
    const payload = await verifyAccessToken(token);
    const sessionValid = await validateTrackedSession(payload);
    if (!sessionValid) {
      throw new AuthenticationError("Session has expired or was revoked", "SESSION_REVOKED", 401);
    }
    return mapPayloadToAuthContext(payload);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
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
  registration: { window: "10m", max: 3 },
  documents: { window: "10m", max: 20 }
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
      const isProduction = false;
      if (isProduction) {
        console.error("[ARCJET] FATAL: ARCJET_KEY not set in production — rejecting request");
        res.status(503).json({
          success: false,
          error: "Security service unavailable",
          code: "SECURITY_SERVICE_ERROR"
        });
        return;
      }
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

// api-src/notifications.ts
init_queries();
init_errorHandler();

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

// lib/csrf.ts
init_db();
import { randomBytes, createHash } from "crypto";
init_errorHandler();
var TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
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

// lib/validation/notifications.ts
import { z as z2 } from "zod";

// lib/validation/sanitize.ts
import { z } from "zod";
var sanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed"));
var optionalSanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed")).optional();
var nonEmptySanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty"));

// lib/validation/notifications.ts
var markReadBodySchema = z2.object({
  notificationId: nonEmptySanitizedString
});
var deleteNotificationBodySchema = z2.object({
  notificationId: nonEmptySanitizedString
});
var checkDuplicateBodySchema = z2.object({
  user_id: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  type: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString
});
var createNotificationBodySchema = z2.object({
  user_id: optionalSanitizedString,
  type: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  action_url: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString,
  priority: z2.enum(["low", "normal", "high", "urgent"]).optional()
});
var sendNotificationBodySchema = z2.object({
  user_id: nonEmptySanitizedString,
  type: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  action_url: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString
});
var updatePreferencesBodySchema = z2.object({
  email_notifications: z2.boolean().optional(),
  push_notifications: z2.boolean().optional(),
  sms_notifications: z2.boolean().optional(),
  notification_types: z2.record(z2.string(), z2.boolean()).optional()
}).partial();
var preferencesBodySchema = z2.object({
  sms_enabled: z2.boolean().optional(),
  application_updates: z2.boolean().optional(),
  payment_reminders: z2.boolean().optional(),
  interview_reminders: z2.boolean().optional(),
  marketing_emails: z2.boolean().optional(),
  quiet_hours_start: optionalSanitizedString,
  quiet_hours_end: optionalSanitizedString
});

// lib/securityHeaders.ts
function setSecurityHeaders(res, options) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", options?.cacheControl ?? "no-store");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

// api-src/notifications.ts
init_auditLogger();

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

// src/lib/urlSafety.ts
var APPLICATION_DOMAIN = "apply.mihas.edu.zm";
function isSafeActionUrl(url) {
  if (!url || typeof url !== "string")
    return false;
  const trimmed = url.trim();
  if (!trimmed)
    return false;
  if (trimmed.startsWith("//"))
    return false;
  if (trimmed.startsWith("/"))
    return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && parsed.hostname === APPLICATION_DOMAIN;
  } catch {
    return false;
  }
}

// api-src/notifications.ts
function generateIdempotencyKey(userId, type, entityType, entityId) {
  return `${userId}:${type}:${entityType}:${entityId}`;
}
var VALID_ACTIONS = [
  "preferences",
  "history",
  "list",
  "mark-read",
  "mark-all-read",
  "delete",
  "check-duplicate",
  "create",
  "send",
  "push-subscribe",
  "push-send"
];
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  setSecurityHeaders(res);
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join("; ");
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
  }
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  if (await requireCsrf(req, res))
    return;
  let user;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    throw error;
  }
  const action = req.query.action || "preferences";
  if (!VALID_ACTIONS.includes(action)) {
    return sendError(res, `Invalid action '${action}'. Valid actions: ${VALID_ACTIONS.join(", ")}`, HttpStatus.BAD_REQUEST);
  }
  try {
    if (action === "preferences") {
      return await handlePreferences(req, res, user);
    }
    if (action === "history") {
      return await handleHistory(req, res, user);
    }
    if (action === "list") {
      return await handleList(req, res, user);
    }
    if (action === "mark-read") {
      return await handleMarkRead(req, res, user);
    }
    if (action === "mark-all-read") {
      return await handleMarkAllRead(req, res, user);
    }
    if (action === "delete") {
      return await handleDelete(req, res, user);
    }
    if (action === "check-duplicate") {
      return await handleCheckDuplicate(req, res, user);
    }
    if (action === "create") {
      return await handleCreate(req, res, user);
    }
    if (action === "send") {
      return await handleSend(req, res, user);
    }
    if (action === "push-subscribe") {
      return await handlePushSubscribe(req, res, user);
    }
    if (action === "push-send") {
      return await handlePushSend(req, res, user);
    }
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    return handleError(res, error, "notifications");
  }
}
async function handlePreferences(req, res, user) {
  try {
    if (req.method === "GET") {
      const preferences = await getCanonicalPreferences(user.userId);
      return sendSuccess(res, { preferences });
    }
    if (req.method === "POST") {
      const parsed = validateBody(preferencesBodySchema, req, res);
      if (!parsed)
        return;
      const { sms_enabled, application_updates, payment_reminders, interview_reminders, marketing_emails, quiet_hours_start, quiet_hours_end } = parsed;
      const upsertQ = {
        text: `
          INSERT INTO user_notification_preferences (
            user_id, email_enabled, push_enabled, sms_enabled,
            application_updates, payment_reminders, interview_reminders, marketing_emails,
            quiet_hours_start, quiet_hours_end, updated_at, created_at
          )
          VALUES ($1, true, true, COALESCE($2, true), $3, $4, $5, $6, $7, $8, NOW(), NOW())
          ON CONFLICT (user_id) DO UPDATE SET
            email_enabled = true,
            push_enabled = true,
            sms_enabled = COALESCE($2, user_notification_preferences.sms_enabled, true),
            application_updates = COALESCE($3, user_notification_preferences.application_updates, true),
            payment_reminders = COALESCE($4, user_notification_preferences.payment_reminders, true),
            interview_reminders = COALESCE($5, user_notification_preferences.interview_reminders, true),
            marketing_emails = COALESCE($6, user_notification_preferences.marketing_emails, false),
            quiet_hours_start = COALESCE($7, user_notification_preferences.quiet_hours_start),
            quiet_hours_end = COALESCE($8, user_notification_preferences.quiet_hours_end),
            updated_at = NOW()
          RETURNING *
        `,
        values: [
          user.userId,
          sms_enabled ?? true,
          application_updates ?? true,
          payment_reminders ?? true,
          interview_reminders ?? true,
          marketing_emails ?? false,
          quiet_hours_start ?? null,
          quiet_hours_end ?? null
        ]
      };
      await query(upsertQ.text, upsertQ.values);
      const preferences = await getCanonicalPreferences(user.userId);
      console.log("[notifications/preferences] Updated for user:", user.userId.substring(0, 8) + "...");
      return sendSuccess(res, { preferences });
    }
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, "notifications/preferences");
  }
}
async function handleHistory(req, res, user) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMISSIONS_OFFICER].includes(user.role);
  if (!isAdmin) {
    return sendError(res, "Admin access required", HttpStatus.FORBIDDEN);
  }
  const applicationId = typeof req.query.applicationId === "string" ? req.query.applicationId.trim() : "";
  if (!applicationId) {
    return sendError(res, "applicationId is required", HttpStatus.BAD_REQUEST);
  }
  try {
    const applicationResult = await query(`SELECT user_id, application_number
       FROM applications
       WHERE id = $1
       LIMIT 1`, [applicationId]);
    if (applicationResult.rowCount === 0) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    const application = applicationResult.rows[0];
    const actionPath = `/student/application/${applicationId}`;
    const legacyActionPath = `/application/${applicationId}`;
    const values = [application.user_id, actionPath, legacyActionPath];
    const filters = ["n.action_url = $2", "n.action_url = $3"];
    if (application.application_number) {
      const searchPattern = `%${application.application_number.replace(/[%_]/g, "\\$&")}%`;
      values.push(searchPattern);
      filters.push(`n.message ILIKE $4 ESCAPE '\\'`, `n.title ILIKE $4 ESCAPE '\\'`);
    }
    const historyResult = await query(`SELECT
         n.id,
         n.title,
         n.message,
         n.type,
         n.is_read,
         n.action_url,
         n.created_at,
         n.read_at,
         al.actor_id,
         NULLIF(TRIM(CONCAT(COALESCE(actor.first_name, ''), ' ', COALESCE(actor.last_name, ''))), '') AS actor_name
       FROM notifications n
       LEFT JOIN audit_logs al
         ON al.entity_type = 'notification'
        AND al.entity_id = n.id
        AND al.action IN ('admin_notification_send', 'application_notification_sent')
       LEFT JOIN profiles actor ON actor.id = al.actor_id
       WHERE n.user_id = $1
         AND (${filters.join(" OR ")})
       ORDER BY n.created_at DESC
       LIMIT 100`, values);
    const communications = historyResult.rows.map((item) => ({
      id: item.id,
      applicant_id: applicationId,
      channel: "in-app",
      subject: item.title,
      message: item.message,
      template: null,
      status: "sent",
      sent_by: item.actor_id || "system",
      sent_by_name: item.actor_name || "System",
      sent_at: item.created_at,
      error_message: null,
      action_url: item.action_url,
      type: item.type || "info",
      read_at: item.read_at
    }));
    return sendSuccess(res, {
      communications,
      lastContactedAt: historyResult.rows[0]?.created_at ?? null
    });
  } catch (error) {
    return handleError(res, error, "notifications/history");
  }
}
async function handleList(req, res, user) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  try {
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
  } catch (error) {
    return handleError(res, error, "notifications/list");
  }
}
async function handleMarkRead(req, res, user) {
  if (req.method !== "PUT") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(markReadBodySchema, req, res);
  if (!parsed)
    return;
  const { notificationId } = parsed;
  try {
    await query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`, [notificationId, user.userId]);
    return sendSuccess(res, { marked: true });
  } catch (error) {
    return handleError(res, error, "notifications/mark-read");
  }
}
async function handleMarkAllRead(req, res, user) {
  if (req.method !== "PUT") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  try {
    await query(`UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`, [user.userId]);
    return sendSuccess(res, { marked: true });
  } catch (error) {
    return handleError(res, error, "notifications/mark-all-read");
  }
}
async function handleDelete(req, res, user) {
  if (req.method !== "DELETE") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(deleteNotificationBodySchema, req, res);
  if (!parsed)
    return;
  const { notificationId } = parsed;
  try {
    await query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [notificationId, user.userId]);
    await logAuditEvent({
      actor_id: user.userId,
      action: "notification_delete",
      entity_type: "notification",
      entity_id: notificationId
    });
    return sendSuccess(res, { deleted: true });
  } catch (error) {
    return handleError(res, error, "notifications/delete");
  }
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
  const result = await query(`INSERT INTO notifications (id, user_id, type, title, message, idempotency_key, action_url, is_read, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, false, NOW())
     RETURNING *`, [
    userId,
    eventType,
    extra?.title || message,
    message,
    idempotencyKey,
    extra?.action_url || null
  ]);
  return {
    created: true,
    notificationId: result.rows[0]?.id,
    notification: result.rows[0]
  };
}
async function handleCheckDuplicate(req, res, user) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(checkDuplicateBodySchema, req, res);
  if (!parsed)
    return;
  const { user_id, title, message, type, entity_type, entity_id } = parsed;
  const targetUserId = user_id || user.userId;
  const isAdmin = [USER_ROLES.ADMIN, USER_ROLES.SUPER_ADMIN, USER_ROLES.ADMISSIONS_OFFICER].includes(user.role);
  if (targetUserId !== user.userId && !isAdmin) {
    return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
  }
  try {
    const normalizedType = type || "info";
    const idempotencyKey = generateIdempotencyKey(targetUserId, normalizedType, entity_type || "notification", entity_id || title);
    const existing = await query(`SELECT id FROM notifications
       WHERE user_id = $1 AND idempotency_key = $2
       AND created_at > NOW() - INTERVAL '1 minute'
       LIMIT 1`, [targetUserId, idempotencyKey]);
    return sendSuccess(res, { duplicate: existing.rows.length > 0 });
  } catch (error) {
    return handleError(res, error, "notifications/check-duplicate");
  }
}
async function handleCreate(req, res, user) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const parsed = validateBody(createNotificationBodySchema, req, res);
  if (!parsed)
    return;
  const { user_id, title, message, type, action_url, entity_type, entity_id } = parsed;
  const targetUserId = user_id || user.userId;
  if (action_url && !isSafeActionUrl(action_url)) {
    return sendError(res, "action_url must be a relative path or an HTTPS URL on the application domain", HttpStatus.BAD_REQUEST, "INVALID_ACTION_URL");
  }
  const isAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (targetUserId !== user.userId && !isAdmin) {
    return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
  }
  try {
    const notificationType = type || "info";
    const idempotencyKey = generateIdempotencyKey(targetUserId, notificationType, entity_type || "notification", entity_id || title);
    const existing = await query(`SELECT id FROM notifications
       WHERE user_id = $1 AND idempotency_key = $2
       AND created_at > NOW() - INTERVAL '1 minute'
       LIMIT 1`, [targetUserId, idempotencyKey]);
    if (existing.rows.length > 0) {
      return sendSuccess(res, { duplicate: true });
    }
    const created = await query(`INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, false, NOW(), $6)
       RETURNING *`, [targetUserId, title, message, notificationType, action_url || null, idempotencyKey]);
    try {
      await queueEmailForNotification(targetUserId, notificationType, title, message, action_url);
    } catch {
      console.log("[notifications/create] Email queuing failed — in-app notification still created");
    }
    await logAuditEvent({
      actor_id: user.userId,
      action: "notification_create",
      entity_type: "notification",
      entity_id: created.rows[0]?.id || null,
      changes: { type: notificationType, target_user: targetUserId !== user.userId ? targetUserId : undefined }
    });
    return sendSuccess(res, { duplicate: false, notification: created.rows[0] });
  } catch (error) {
    return handleError(res, error, "notifications/create");
  }
}
async function handleSend(req, res, user) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const isAdminUser = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.SUPER_ADMIN;
  if (!isAdminUser) {
    return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
  }
  const parsed = validateBody(sendNotificationBodySchema, req, res);
  if (!parsed)
    return;
  const { user_id, title, message, type, action_url, entity_id, entity_type } = parsed;
  if (action_url && !isSafeActionUrl(action_url)) {
    return sendError(res, "action_url must be a relative path or an HTTPS URL on the application domain", HttpStatus.BAD_REQUEST, "INVALID_ACTION_URL");
  }
  try {
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
    await logAuditEvent({
      actor_id: user.userId,
      action: "admin_notification_send",
      entity_type: "notification",
      entity_id: notificationRow?.id || null,
      changes: { type: notificationType, target_user: user_id, mandatory }
    });
    return sendSuccess(res, { notification: notificationRow, email_queued: emailQueued, mandatory });
  } catch (error) {
    return handleError(res, error, "notifications/send");
  }
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
  const result = await query(`SELECT
       p.phone,
       np.email_enabled,
       np.push_enabled,
       np.sms_enabled,
       np.application_updates,
       np.payment_reminders,
       np.interview_reminders,
       np.marketing_emails,
       np.quiet_hours_start,
       np.quiet_hours_end,
       np.timezone,
       np.created_at,
       np.updated_at
     FROM profiles p
     LEFT JOIN user_notification_preferences np ON np.user_id = p.id
     WHERE p.id = $1
     LIMIT 1`, [userId]);
  const row = result.rows[0] ?? {};
  const smsEnabled = row.sms_enabled ?? true;
  const updatedAt = row.updated_at ?? row.created_at ?? null;
  return {
    user_id: userId,
    phone: row.phone ?? null,
    email_enabled: row.email_enabled ?? true,
    push_enabled: row.push_enabled ?? true,
    sms_enabled: smsEnabled,
    whatsapp_enabled: false,
    in_app_enabled: true,
    application_updates: row.application_updates ?? true,
    payment_reminders: row.payment_reminders ?? true,
    interview_reminders: row.interview_reminders ?? true,
    marketing_emails: row.marketing_emails ?? false,
    quiet_hours_start: row.quiet_hours_start ?? null,
    quiet_hours_end: row.quiet_hours_end ?? null,
    timezone: row.timezone ?? "Africa/Lusaka",
    frequency: "realtime",
    optimalTiming: true,
    channels: [
      { type: "sms", enabled: Boolean(smsEnabled), priority: 2 }
    ],
    sms_opt_in_at: smsEnabled ? updatedAt : null,
    sms_opt_in_source: smsEnabled ? "portal" : null,
    sms_opt_in_actor: null,
    sms_opt_out_at: smsEnabled ? null : updatedAt,
    sms_opt_out_source: smsEnabled ? null : "portal",
    sms_opt_out_actor: null,
    sms_opt_out_reason: smsEnabled ? null : "Preference disabled",
    whatsapp_opt_in_at: null,
    whatsapp_opt_in_source: null,
    whatsapp_opt_in_actor: null,
    whatsapp_opt_out_at: null,
    whatsapp_opt_out_source: null,
    whatsapp_opt_out_actor: null,
    whatsapp_opt_out_reason: null,
    notification_types: {
      application_update: row.application_updates ?? true,
      interview_schedule: row.interview_reminders ?? true,
      document_ready: row.application_updates ?? true
    }
  };
}
async function handlePushSubscribe(req, res, _user) {
  if (req.method === "POST") {
    return sendSuccess(res, { subscribed: false, message: "Push notifications not yet configured" });
  }
  if (req.method === "DELETE") {
    return sendSuccess(res, { unsubscribed: true });
  }
  return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
}
async function handlePushSend(req, res, _user) {
  return sendSuccess(res, { sent: 0, message: "Push notifications not yet configured" });
}
var notifications_default = withArcjetProtection(handler, "general");
export {
  isMandatoryEmailType,
  generateIdempotencyKey,
  notifications_default as default,
  MANDATORY_EMAIL_TYPES
};
