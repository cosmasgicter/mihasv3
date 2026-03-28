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
async function transaction(operations) {
  if (operations.length === 0) {
    return [];
  }
  try {
    const sql = getNeonInstance();
    const results = [];
    await sql.transaction((tx) => operations.map((op) => {
      const promise = op.values && op.values.length > 0 ? tx.query(op.text, op.values) : tx.query(op.text);
      promise.then((rows) => {
        const resultRows = Array.isArray(rows) ? rows : [];
        results.push({
          rows: resultRows,
          rowCount: resultRows.length,
          command: extractCommand(op.text)
        });
      });
      return promise;
    }));
    return results;
  } catch (error) {
    if (error instanceof DatabaseError) {
      throw new DatabaseError(`Transaction failed: ${error.message}`, DatabaseErrorCode.TRANSACTION_ERROR, { query: error.query, originalError: error });
    }
    throw new DatabaseError(`Transaction failed: ${error.message}`, DatabaseErrorCode.TRANSACTION_ERROR, { originalError: error });
  }
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

// api-src/admin.ts
init_db();
init_errorHandler();

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

// api-src/admin.ts
init_auditLogger();

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

// lib/securityHeaders.ts
function setSecurityHeaders(res, options) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", options?.cacheControl ?? "no-store");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
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

// lib/validation/admin.ts
import { z as z3 } from "zod";

// lib/validation/sanitize.ts
import { z } from "zod";
var sanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed"));
var optionalSanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed")).optional();
var nonEmptySanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty"));

// lib/validation/auth.ts
import { z as z2 } from "zod";
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

// lib/validation/admin.ts
var roleSchema = z3.enum([
  "student",
  "reviewer",
  "admissions_officer",
  "registrar",
  "finance_officer",
  "academic_head",
  "admin",
  "super_admin"
]);
var adminRegisterBodySchema = z3.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nonEmptySanitizedString,
  lastName: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  role: roleSchema.optional()
});
var adminSetPasswordBodySchema = z3.object({
  email: emailSchema,
  password: z3.string().min(8, "Password must be at least 8 characters")
});
var updateRoleBodySchema = z3.object({
  userId: nonEmptySanitizedString,
  role: roleSchema
});
var updateUserBodySchema = z3.object({
  userId: nonEmptySanitizedString,
  email: emailSchema,
  full_name: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  role: roleSchema
});
var userPermissionsBodySchema = z3.object({
  userId: nonEmptySanitizedString,
  permissions: z3.array(sanitizedString).optional()
});
var createSettingBodySchema = z3.object({
  key: nonEmptySanitizedString,
  value: z3.unknown().refine((v) => v !== undefined && v !== null, "Value is required"),
  description: optionalSanitizedString,
  category: optionalSanitizedString,
  is_public: z3.boolean().optional()
});
var updateSettingBodySchema = z3.object({
  id: nonEmptySanitizedString.optional(),
  key: optionalSanitizedString,
  value: z3.unknown().optional(),
  description: optionalSanitizedString,
  category: optionalSanitizedString,
  is_public: z3.boolean().optional()
});
var deleteSettingQuerySchema = z3.object({
  key: nonEmptySanitizedString.optional(),
  id: z3.string().uuid("Must be a valid UUID").optional()
}).refine((data) => data.key !== undefined || data.id !== undefined, { message: "Either key or id must be provided" });
var importSettingsBodySchema = z3.object({
  settings: z3.array(z3.object({
    key: nonEmptySanitizedString,
    value: z3.unknown(),
    description: optionalSanitizedString,
    category: optionalSanitizedString,
    is_public: z3.boolean().optional()
  }))
});
var migrateBodySchema = z3.object({
  secret: optionalSanitizedString
});
var applicationStatusSchema = z3.enum([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "pending_documents"
]);
var bulkEmailBodySchema = z3.object({
  subject: z3.string().max(200).transform((s) => s.trim()).pipe(z3.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty")),
  message: z3.string().max(5000).transform((s) => s.trim()).pipe(z3.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty")),
  userIds: z3.array(nonEmptySanitizedString).min(1).max(500)
});
var bulkStatusBodySchema = z3.object({
  status: applicationStatusSchema,
  applicationIds: z3.array(nonEmptySanitizedString).min(1).max(500)
});

// lib/validation/common.ts
import { z as z4 } from "zod";
var uuidParamSchema = z4.string().uuid("Must be a valid UUID");
var paginationQuerySchema = z4.object({
  page: z4.coerce.number().int().positive("Page must be a positive integer").default(1),
  pageSize: z4.coerce.number().int().positive("Page size must be a positive integer").max(100, "Page size must not exceed 100").default(20)
});

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
init_db();
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

// api-src/admin.ts
var VALID_ACTIONS = [
  "dashboard",
  "users",
  "user-permissions",
  "settings",
  "register",
  "stats",
  "errors",
  "bulk-email",
  "bulk-status",
  "export-users",
  "migrate",
  "set-password",
  "import-settings",
  "reset-settings",
  "eligibility-rules",
  "update-role",
  "eligibility-assessments",
  "audit-log",
  "appeals",
  "schema"
];
var SAFE_USER_COLUMNS = [
  "id",
  "email",
  "full_name",
  "first_name",
  "last_name",
  "phone",
  "nationality",
  "role",
  "is_active",
  "created_at",
  "updated_at",
  "avatar_url",
  "date_of_birth",
  "sex",
  "address",
  "nrc_number",
  "residence_town",
  "next_of_kin_name",
  "next_of_kin_phone",
  "email_verified",
  "last_login_at"
];
var SAFE_USER_COLUMNS_SQL = SAFE_USER_COLUMNS.join(", ");
function splitFullName(fullName) {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  const [firstName, ...rest] = normalized.split(" ");
  return {
    firstName,
    lastName: rest.join(" ") || firstName
  };
}
async function revokeUserSessions(userId) {
  await query(`UPDATE profiles
     SET refresh_token_hash = NULL,
         updated_at = NOW()
     WHERE id = $1`, [userId]);
  const sessionResult = await query(`UPDATE device_sessions
     SET is_active = false
     WHERE user_id = $1 AND is_active = true`, [userId]);
  return sessionResult.rowCount ?? 0;
}
function samePermissions(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((permission, index) => permission === right[index]);
}
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  setSecurityHeaders(res);
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join("; ");
    sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
    return;
  }
  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }
  if (await requireCsrf(req, res))
    return;
  const action = req.query.action || "dashboard";
  if (!VALID_ACTIONS.includes(action)) {
    sendError(res, `Invalid action '${action}'. Valid actions: ${VALID_ACTIONS.join(", ")}`, HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    if (action === "migrate") {
      const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
      const { secret } = req.body || {};
      if (MIGRATE_SECRET && secret === MIGRATE_SECRET) {
        await handleMigrate(req, res);
        return;
      }
    }
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
        await handleUsers(req, res, auth);
        return;
      case "user-permissions":
        if (req.method !== "GET" && req.method !== "PUT") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleUserPermissions(req, res, auth);
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
      case "bulk-email":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleBulkEmail(req, res, auth);
        return;
      case "bulk-status":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleBulkStatus(req, res, auth);
        return;
      case "export-users":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleExportUsers(res, auth);
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
      case "schema":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleGetSchema(req, res);
        return;
      default:
        sendError(res, `Invalid action '${action}'.`, HttpStatus.BAD_REQUEST);
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
    handleError(res, error, "admin/get-settings");
  }
}
async function handleCreateSetting(req, res, auth) {
  const parsed = validateBody(createSettingBodySchema, req, res);
  if (!parsed)
    return;
  const body = parsed;
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
    const message = error instanceof Error ? error.message : "";
    if (message.includes("duplicate key") || message.includes("23505")) {
      sendError(res, `Setting with key '${body.key}' already exists`, HttpStatus.CONFLICT);
      return;
    }
    handleError(res, error, "admin/create-setting");
  }
}
async function handleUpdateSetting(req, res, auth) {
  const parsed = validateBody(updateSettingBodySchema, req, res);
  if (!parsed)
    return;
  const body = parsed;
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
    handleError(res, error, "admin/update-setting");
  }
}
async function handleDeleteSetting(req, res) {
  const merged = {
    ...req.body || {},
    id: req.body?.id || req.query.id,
    key: req.body?.key || req.query.key
  };
  const result = deleteSettingQuerySchema.safeParse(merged);
  if (!result.success) {
    const fieldErrors = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".") || "_root";
      fieldErrors[path] = issue.message;
    }
    sendError(res, result.error.issues[0]?.message || "Either key or id must be provided", HttpStatus.BAD_REQUEST);
    return;
  }
  const { id, key: settingKey } = result.data;
  try {
    let result2;
    if (id) {
      result2 = await query("DELETE FROM settings WHERE id = $1", [id]);
    } else {
      result2 = await query("DELETE FROM settings WHERE key = $1", [settingKey]);
    }
    if (result2.rowCount === 0) {
      sendError(res, "Setting not found", HttpStatus.NOT_FOUND);
      return;
    }
    sendSuccess(res, { deleted: true });
  } catch (error) {
    handleError(res, error, "admin/delete-setting");
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
    handleError(res, error, "admin/dashboard");
  }
}
async function handleUsers(req, res, auth) {
  if (req.method === "PUT" || req.method === "POST") {
    await handleUpdateUser(req, res, auth);
    return;
  }
  if (req.method === "DELETE") {
    await handleDeactivateUser(req, res, auth);
    return;
  }
  if (req.method !== "GET") {
    sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
    return;
  }
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
  const includeInactive = req.query.includeInactive === "true";
  const conditions = [];
  const params = [];
  let paramIndex = 1;
  if (!includeInactive) {
    conditions.push("is_active = true");
  }
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
      query(`SELECT ${SAFE_USER_COLUMNS_SQL} FROM profiles ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, [...params, limit, offset]),
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
    handleError(res, error, "admin/users");
  }
}
async function handleBulkEmail(req, res, auth) {
  const parsed = validateBody(bulkEmailBodySchema, req, res);
  if (!parsed)
    return;
  const { subject, message, userIds } = parsed;
  const dedupedUserIds = Array.from(new Set(userIds.map((id) => id.trim()).filter(Boolean)));
  if (dedupedUserIds.length === 0) {
    sendError(res, "At least one target user is required", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    const recipients = await query(`SELECT id, full_name, email
       FROM profiles
       WHERE id::text = ANY($1::text[])
         AND is_active = true`, [dedupedUserIds]);
    const recipientById = new Map(recipients.rows.map((row) => [row.id, row]));
    let success = 0;
    let failed = 0;
    const errors = [];
    for (const targetId of dedupedUserIds) {
      const recipient = recipientById.get(targetId);
      if (!recipient) {
        failed++;
        errors.push(`User not found or inactive: ${targetId}`);
        continue;
      }
      if (!recipient.email) {
        failed++;
        errors.push(`User email missing: ${targetId}`);
        continue;
      }
      try {
        await transaction([
          {
            text: `INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
                   VALUES ($1, $2, $3, 'info', false, NOW())`,
            values: [targetId, subject, message]
          },
          {
            text: `INSERT INTO email_queue (
                     recipient_email,
                     recipient_name,
                     subject,
                     body,
                     html_body,
                     template_name,
                     template_data,
                     status,
                     priority
                   )
                   VALUES ($1, $2, $3, $4, $5, 'generic', $6, 'pending', 5)`,
            values: [
              recipient.email,
              recipient.full_name,
              subject,
              message,
              `<p>${message}</p>`,
              JSON.stringify({ actorId: auth.userId, targetUserId: targetId })
            ]
          }
        ]);
        success++;
      } catch {
        failed++;
        errors.push(`Failed to queue notification for user: ${targetId}`);
      }
    }
    await logAuditEvent({
      actor_id: auth.userId,
      action: "bulk_notification_sent",
      entity_type: "notification",
      entity_id: "bulk",
      changes: {
        target_count: dedupedUserIds.length,
        success,
        failed
      }
    });
    sendSuccess(res, { success, failed, errors });
  } catch (error) {
    handleError(res, error, "admin/bulk-email");
  }
}
async function handleBulkStatus(req, res, auth) {
  const parsed = validateBody(bulkStatusBodySchema, req, res);
  if (!parsed)
    return;
  const { status, applicationIds } = parsed;
  const dedupedApplicationIds = Array.from(new Set(applicationIds.map((id) => id.trim()).filter(Boolean)));
  if (dedupedApplicationIds.length === 0) {
    sendError(res, "At least one application is required", HttpStatus.BAD_REQUEST);
    return;
  }
  let success = 0;
  let failed = 0;
  const errors = [];
  for (const applicationId of dedupedApplicationIds) {
    try {
      const appResult = await query(`SELECT id, payment_status
         FROM applications
         WHERE id = $1
         LIMIT 1`, [applicationId]);
      if (appResult.rowCount === 0) {
        failed++;
        errors.push(`Application not found: ${applicationId}`);
        continue;
      }
      const app = appResult.rows[0];
      if (status === "approved" && app.payment_status !== "verified") {
        failed++;
        errors.push(`Payment not verified: ${applicationId}`);
        continue;
      }
      await transaction([
        {
          text: `UPDATE applications
                 SET status = $2,
                     reviewed_by = $3,
                     review_started_at = COALESCE(review_started_at, NOW()),
                     updated_at = NOW()
                 WHERE id = $1`,
          values: [applicationId, status, auth.userId]
        },
        {
          text: `INSERT INTO application_status_history (id, application_id, status, new_status, changed_by, notes, created_at)
                 VALUES (gen_random_uuid(), $1, $2, $2, $3, $4, NOW())`,
          values: [applicationId, status, auth.userId, "Bulk status update"]
        }
      ]);
      success++;
    } catch {
      failed++;
      errors.push(`Failed status update: ${applicationId}`);
    }
  }
  try {
    await logAuditEvent({
      actor_id: auth.userId,
      action: "bulk_status_updated",
      entity_type: "application",
      entity_id: "bulk",
      changes: {
        status,
        target_count: dedupedApplicationIds.length,
        success,
        failed
      }
    });
  } catch {}
  sendSuccess(res, { success, failed, errors });
}
async function handleExportUsers(res, auth) {
  try {
    const result = await query(`SELECT id, full_name, email, phone, role, is_active, created_at
       FROM profiles
       ORDER BY created_at DESC`);
    const csvRows = [
      "id,full_name,email,phone,role,is_active,created_at",
      ...result.rows.map((row) => {
        const values = [
          row.id,
          row.full_name || "",
          row.email || "",
          row.phone || "",
          row.role || "",
          row.is_active ? "true" : "false",
          row.created_at || ""
        ];
        return values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",");
      })
    ].join(`
`);
    await logAuditEvent({
      actor_id: auth.userId,
      action: "users_exported",
      entity_type: "user",
      entity_id: "bulk",
      changes: {
        exported_count: result.rows.length
      }
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="users-export-${Date.now()}.csv"`);
    res.status(HttpStatus.OK).send(csvRows);
  } catch (error) {
    handleError(res, error, "admin/export-users");
  }
}
async function handleDeactivateUser(req, res, auth) {
  const userId = req.query.userId?.trim();
  if (!userId) {
    sendError(res, "userId is required", HttpStatus.BAD_REQUEST);
    return;
  }
  const uuidResult = uuidParamSchema.safeParse(userId);
  if (!uuidResult.success) {
    sendError(res, "userId must be a valid UUID", HttpStatus.BAD_REQUEST);
    return;
  }
  if (userId === auth.userId) {
    sendError(res, "Cannot deactivate your own account", HttpStatus.FORBIDDEN);
    return;
  }
  try {
    const targetResult = await query("SELECT id, role, is_active, email FROM profiles WHERE id = $1 LIMIT 1", [userId]);
    if (targetResult.rows.length === 0) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    const targetUser = targetResult.rows[0];
    if (!targetUser.is_active) {
      sendSuccess(res, {
        userId,
        alreadyDeactivated: true,
        message: "User account is already inactive"
      });
      return;
    }
    if (targetUser.role === "super_admin") {
      sendError(res, "Super admin accounts cannot be deactivated", HttpStatus.FORBIDDEN);
      return;
    }
    if (targetUser.role === "admin" && auth.role !== "super_admin") {
      sendError(res, "Only super_admin can deactivate admin accounts", HttpStatus.FORBIDDEN);
      return;
    }
    const result = await query(`UPDATE profiles
       SET is_active = false,
           refresh_token_hash = NULL,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id, email, role, is_active, updated_at`, [userId]);
    if (result.rows.length === 0) {
      sendSuccess(res, {
        userId,
        alreadyDeactivated: true,
        message: "User account is already inactive"
      });
      return;
    }
    const sessionResult = await query(`UPDATE device_sessions
       SET is_active = false
       WHERE user_id = $1 AND is_active = true`, [userId]);
    await logAuditEvent({
      actor_id: auth.userId,
      action: "user_deactivated",
      entity_type: "user",
      entity_id: userId,
      changes: {
        role: targetUser.role,
        deactivated: true,
        sessions_revoked: sessionResult.rowCount ?? 0
      }
    });
    sendSuccess(res, {
      user: {
        ...result.rows[0],
        user_id: result.rows[0].id
      },
      revokedSessions: sessionResult.rowCount ?? 0,
      message: "User deactivated successfully"
    });
  } catch (error) {
    handleError(res, error, "admin/deactivate-user");
  }
}
async function handleUserPermissions(req, res, auth) {
  if (req.method === "PUT") {
    const parsed = validateBody(userPermissionsBodySchema, req, res);
    if (!parsed || !Array.isArray(parsed.permissions)) {
      sendError(res, "permissions array is required", HttpStatus.BAD_REQUEST);
      return;
    }
    const { userId: userId2, permissions: requestedPermissions } = parsed;
    if (userId2 === auth.userId) {
      sendError(res, "Cannot change your own permissions", HttpStatus.FORBIDDEN);
      return;
    }
    const { normalized, invalid } = validatePermissionList(requestedPermissions);
    if (invalid.length > 0) {
      sendError(res, `Invalid permissions: ${invalid.join(", ")}`, HttpStatus.BAD_REQUEST);
      return;
    }
    try {
      const targetResult = await query("SELECT id, role FROM profiles WHERE id = $1 LIMIT 1", [userId2]);
      if (targetResult.rows.length === 0) {
        sendError(res, "User not found", HttpStatus.NOT_FOUND);
        return;
      }
      const user = targetResult.rows[0];
      if ((user.role === "admin" || user.role === "super_admin") && auth.role !== "super_admin") {
        sendError(res, "Only super_admin can change permissions for admin accounts", HttpStatus.FORBIDDEN);
        return;
      }
      const defaultPermissions = [...getPermissionsForRole(user.role)].sort();
      const source = samePermissions(normalized, defaultPermissions) ? "role" : "override";
      try {
        if (source === "role") {
          await query("DELETE FROM user_permission_overrides WHERE user_id = $1", [userId2]);
        } else {
          await query(`INSERT INTO user_permission_overrides (user_id, permissions, updated_by, created_at, updated_at)
             VALUES ($1, $2::text[], $3, NOW(), NOW())
             ON CONFLICT (user_id)
             DO UPDATE SET
               permissions = EXCLUDED.permissions,
               updated_by = EXCLUDED.updated_by,
               updated_at = NOW()`, [userId2, normalized, auth.userId]);
        }
      } catch (error) {
        if (isPermissionOverrideTableMissing(error)) {
          sendError(res, "Permission overrides require migration 010_user_permission_overrides.sql to be applied first", HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
          return;
        }
        throw error;
      }
      const revokedSessions = await revokeUserSessions(userId2);
      await logAuditEvent({
        actor_id: auth.userId,
        action: "user.permissions_updated",
        entity_type: "user",
        entity_id: userId2,
        changes: {
          role: user.role,
          permission_source: source,
          permissions: normalized,
          revoked_sessions: revokedSessions
        }
      });
      sendSuccess(res, {
        userId: user.id,
        role: user.role,
        permissions: source === "override" ? normalized : defaultPermissions,
        defaultPermissions,
        source,
        revokedSessions
      });
    } catch (error) {
      handleError(res, error, "admin/update-user-permissions");
    }
    return;
  }
  const userId = req.query.userId?.trim();
  if (!userId) {
    sendError(res, "userId is required", HttpStatus.BAD_REQUEST);
    return;
  }
  try {
    const result = await query("SELECT id, role FROM profiles WHERE id = $1 LIMIT 1", [userId]);
    if (result.rows.length === 0) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    const user = result.rows[0];
    const { permissions, source } = await getEffectivePermissionsForUser(user.id, user.role);
    sendSuccess(res, {
      userId: user.id,
      role: user.role,
      permissions,
      defaultPermissions: getPermissionsForRole(user.role),
      source
    });
  } catch (error) {
    handleError(res, error, "admin/user-permissions");
  }
}
async function handleUpdateUser(req, res, auth) {
  const parsed = validateBody(updateUserBodySchema, req, res);
  if (!parsed)
    return;
  const { userId, email, full_name, phone, role } = parsed;
  const { firstName, lastName } = splitFullName(full_name);
  if ((role === "admin" || role === "super_admin") && auth.role !== "super_admin") {
    sendError(res, "Only super_admin can assign admin or super_admin roles", HttpStatus.FORBIDDEN);
    return;
  }
  if (userId === auth.userId && role !== auth.role) {
    sendError(res, "Cannot change your own role", HttpStatus.FORBIDDEN);
    return;
  }
  try {
    const currentUserResult = await query("SELECT id, role FROM profiles WHERE id = $1 LIMIT 1", [userId]);
    if (currentUserResult.rows.length === 0) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    const currentUser = currentUserResult.rows[0];
    const existing = await query("SELECT id FROM profiles WHERE email = $1 AND id <> $2 LIMIT 1", [email.toLowerCase(), userId]);
    if (existing.rows.length > 0) {
      sendError(res, "Email already registered to another user", HttpStatus.CONFLICT);
      return;
    }
    const result = await query(`UPDATE profiles
       SET email = $1,
           first_name = $2,
           last_name = $3,
           full_name = $4,
           phone = $5,
           role = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, email, first_name, last_name, full_name, phone, role, updated_at`, [email.toLowerCase(), firstName, lastName, full_name.trim(), phone || null, role, userId]);
    if (result.rows.length === 0) {
      sendError(res, "User not found", HttpStatus.NOT_FOUND);
      return;
    }
    const roleChanged = currentUser.role !== role;
    const revokedSessions = roleChanged ? await revokeUserSessions(userId) : 0;
    await logAuditEvent({
      actor_id: auth.userId,
      action: "user_updated",
      entity_type: "user",
      entity_id: userId,
      changes: {
        email: email.toLowerCase(),
        full_name: full_name.trim(),
        phone: phone || null,
        role,
        role_changed: roleChanged,
        revoked_sessions: revokedSessions
      }
    });
    sendSuccess(res, {
      user: {
        ...result.rows[0],
        user_id: result.rows[0].id
      },
      revokedSessions
    });
  } catch (error) {
    handleError(res, error, "admin/update-user");
  }
}
async function handleRegisterUser(req, res, auth) {
  const parsed = validateBody(adminRegisterBodySchema, req, res);
  if (!parsed)
    return;
  const { email, password, firstName, lastName, phone, role } = parsed;
  const validRoles = [
    "student",
    "reviewer",
    "admissions_officer",
    "registrar",
    "finance_officer",
    "academic_head",
    "admin",
    "super_admin"
  ];
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
    const fullName = `${firstName} ${lastName}`.trim();
    const result = await query(`INSERT INTO profiles (email, password_hash, first_name, last_name, full_name, phone, role, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), NOW())
       RETURNING id, email, first_name, last_name, full_name, phone, role, created_at`, [email.toLowerCase(), passwordHash, firstName, lastName, fullName, phone || null, userRole]);
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
    handleError(res, error, "admin/register");
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
    handleError(res, error, "admin/stats");
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
    handleError(res, error, "admin/errors");
  }
}
async function handleSetPassword(req, res, auth) {
  if (auth.role !== "super_admin") {
    sendError(res, "Only super_admin can set passwords for other users", HttpStatus.FORBIDDEN);
    return;
  }
  const parsed = validateBody(adminSetPasswordBodySchema, req, res);
  if (!parsed)
    return;
  const { email, password } = parsed;
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
    handleError(res, error, "admin/set-password");
  }
}
async function handleMigrate(req, res) {
  const MIGRATE_SECRET = process.env.MIGRATE_SECRET;
  const { secret } = req.body || {};
  const ipAddress = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || null;
  if (MIGRATE_SECRET && secret !== MIGRATE_SECRET) {
    try {
      await logAuditEvent({
        actor_id: null,
        action: "migration_attempt_failed",
        entity_type: "system",
        entity_id: null,
        changes: { auth_method: "secret", reason: "invalid_secret" },
        ip_address: ipAddress
      });
    } catch {}
    sendError(res, "Invalid migration secret", HttpStatus.UNAUTHORIZED);
    return;
  }
  try {
    await logAuditEvent({
      actor_id: null,
      action: "migration_started",
      entity_type: "system",
      entity_id: null,
      changes: { auth_method: secret ? "secret" : "jwt" },
      ip_address: ipAddress
    });
  } catch {}
  const migrationQueries = [
    { id: "V2_001_MIGRATION_HISTORY", sql: `CREATE TABLE IF NOT EXISTS migration_history (id SERIAL PRIMARY KEY, migration_name TEXT UNIQUE NOT NULL, applied_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: "V2_002_CSRF_TOKENS", sql: `CREATE TABLE IF NOT EXISTS csrf_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES profiles(id), token_hash VARCHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id))` },
    { id: "V2_003_PWD_RESET_TOKENS", sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES profiles(id), token_hash VARCHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: "V2_004_LOGIN_ATTEMPTS", sql: `CREATE TABLE IF NOT EXISTS login_attempts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email_hash VARCHAR(64) NOT NULL, ip_hash VARCHAR(64) NOT NULL, attempted_at TIMESTAMPTZ DEFAULT NOW(), success BOOLEAN NOT NULL)` },
    { id: "V2_005_NOTIF_PREFS", sql: `CREATE TABLE IF NOT EXISTS user_notification_preferences (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID UNIQUE NOT NULL REFERENCES profiles(id), email_enabled BOOLEAN DEFAULT TRUE, push_enabled BOOLEAN DEFAULT TRUE, sms_enabled BOOLEAN DEFAULT TRUE, application_updates BOOLEAN DEFAULT TRUE, payment_reminders BOOLEAN DEFAULT TRUE, interview_reminders BOOLEAN DEFAULT TRUE, marketing_emails BOOLEAN DEFAULT FALSE, quiet_hours_start TIME, quiet_hours_end TIME, timezone VARCHAR(50) DEFAULT 'Africa/Lusaka', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: "V2_006_SUBJECTS", sql: `CREATE TABLE IF NOT EXISTS subjects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name VARCHAR(255) UNIQUE NOT NULL, code VARCHAR(50), category VARCHAR(100), is_core BOOLEAN DEFAULT FALSE, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: "V2_007_IDEMPOTENCY", sql: `CREATE TABLE IF NOT EXISTS idempotency_keys (key TEXT PRIMARY KEY, endpoint TEXT NOT NULL, response_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())` },
    { id: "V2_008_PROF_PWD_HASH", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT` },
    { id: "V2_009_PROF_REFRESH", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT` },
    { id: "V2_010_PROF_ROLE", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student'` },
    { id: "V2_010b_PROF_FNAME", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT` },
    { id: "V2_010c_PROF_LNAME", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT` },
    { id: "V2_011_PROF_FULL_NAME", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT` },
    { id: "V2_012_PROF_PHONE", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT` },
    { id: "V2_013_PROF_COUNTRY", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS country TEXT` },
    { id: "V2_014_PROF_DOB", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE` },
    { id: "V2_015_PROF_SEX", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sex TEXT` },
    { id: "V2_016_PROF_TOWN", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS residence_town TEXT` },
    { id: "V2_017_PROF_NAT", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nationality TEXT` },
    { id: "V2_018_PROF_NRC", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nrc_number TEXT` },
    { id: "V2_019_PROF_ADDR", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT` },
    { id: "V2_020_PROF_AVATAR", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT` },
    { id: "V2_021_PROF_NOK_NAME", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_of_kin_name TEXT` },
    { id: "V2_022_PROF_NOK_PHONE", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS next_of_kin_phone TEXT` },
    { id: "V2_023_PROF_VERIFIED", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE` },
    { id: "V2_024_PROF_FAILED_ATT", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0` },
    { id: "V2_025_PROF_LOCKED", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ` },
    { id: "V2_026_PROF_PWD_CHG", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ` },
    { id: "V2_026b_PROF_LAST_LOGIN", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ` },
    { id: "V2_026c_PROF_CREATED", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()` },
    { id: "V2_026d_PROF_UPDATED", sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()` },
    { id: "V2_027_APP_NRC", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS nrc_number VARCHAR(20)` },
    { id: "V2_027b_APP_DOB", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS date_of_birth DATE` },
    { id: "V2_027c_APP_SEX", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS sex VARCHAR(20)` },
    { id: "V2_027d_APP_PHONE", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS phone VARCHAR(20)` },
    { id: "V2_027e_APP_EMAIL", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS email VARCHAR(255)` },
    { id: "V2_027f_APP_TOWN", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS residence_town TEXT` },
    { id: "V2_027g_APP_FNAME", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS full_name TEXT` },
    { id: "V2_028_APP_PASSPORT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS passport_number VARCHAR(50)` },
    { id: "V2_029_APP_NAT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS nationality VARCHAR(100)` },
    { id: "V2_030_APP_ADDR1", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS address_line_1 TEXT` },
    { id: "V2_031_APP_ADDR2", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS address_line_2 TEXT` },
    { id: "V2_032_APP_POSTAL", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20)` },
    { id: "V2_033_APP_NOK_NAME", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS next_of_kin_name VARCHAR(255)` },
    { id: "V2_034_APP_NOK_PHONE", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS next_of_kin_phone VARCHAR(20)` },
    { id: "V2_035_APP_RESULT_URL", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS result_slip_url TEXT` },
    { id: "V2_036_APP_KYC_URL", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS extra_kyc_url TEXT` },
    { id: "V2_037_APP_FEE", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS application_fee NUMERIC(10,2) DEFAULT 153.00` },
    { id: "V2_038_APP_PAY_STAT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending_review'` },
    { id: "V2_039_APP_PAY_VER_AT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ` },
    { id: "V2_040_APP_PAY_VER_BY", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES profiles(id)` },
    { id: "V2_041_APP_REV_BY", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id)` },
    { id: "V2_042_APP_REV_START", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ` },
    { id: "V2_043_APP_FEEDBACK", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_feedback TEXT` },
    { id: "V2_044_APP_FEEDBACK_DT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_feedback_date TIMESTAMPTZ` },
    { id: "V2_045_APP_FEEDBACK_BY", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_feedback_by UUID REFERENCES profiles(id)` },
    { id: "V2_046_APP_DECISION_DT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS decision_date TIMESTAMPTZ` },
    { id: "V2_047_APP_VERSION", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1` },
    { id: "V2_048_APP_AMOUNT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2)` },
    { id: "V2_049_APP_PAY_METHOD", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payment_method TEXT` },
    { id: "V2_050_APP_PAYER_NAME", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payer_name TEXT` },
    { id: "V2_051_APP_PAYER_PHONE", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS payer_phone TEXT` },
    { id: "V2_052_APP_PAID_AT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ` },
    { id: "V2_053_APP_MOMO_REF", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS momo_ref TEXT` },
    { id: "V2_054_APP_POP_URL", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS pop_url TEXT` },
    { id: "V2_055_APP_RECEIPT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS receipt_number TEXT` },
    { id: "V2_056_APP_TRACK_CODE", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS public_tracking_code VARCHAR(20)` },
    { id: "V2_057_APP_SUB_AT", sql: `ALTER TABLE applications ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ` },
    { id: "V2_058_NOTIF_ACTION_URL", sql: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT` },
    { id: "V2_059_NOTIF_UP_AT", sql: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()` },
    { id: "V2_060_AUDIT_RET_CAT", sql: `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS retention_category TEXT DEFAULT 'standard'` },
    { id: "V2_061_INTV_BY_CREATED", sql: `ALTER TABLE application_interviews ADD COLUMN IF NOT EXISTS created_by UUID` },
    { id: "V2_062_INTV_BY_UPDATED", sql: `ALTER TABLE application_interviews ADD COLUMN IF NOT EXISTS updated_by UUID` },
    { id: "V2_063_IDX_PROF_EMAIL", sql: `CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email)` },
    { id: "V2_064_IDX_PROF_ROLE", sql: `CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role)` },
    { id: "V2_065_IDX_APP_USER", sql: `CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id)` },
    { id: "V2_066_IDX_AUDIT_CR_AT", sql: `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)` }
  ];
  const migrations = [];
  const errors = [];
  for (const m of migrationQueries) {
    try {
      if (m.id === "V2_001_MIGRATION_HISTORY") {
        await query(m.sql);
        continue;
      }
      const check = await query("SELECT 1 FROM migration_history WHERE migration_name = $1", [m.id]);
      if (check.rowCount > 0)
        continue;
      await query(m.sql);
      await query("INSERT INTO migration_history (migration_name) VALUES ($1)", [m.id]);
      migrations.push(m.id);
    } catch (e) {
      const errMessage = e instanceof Error ? e.message : String(e);
      if (errMessage.includes("already exists")) {
        await query("INSERT INTO migration_history (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING", [m.id]);
        continue;
      }
      errors.push(`${m.id}: ${errMessage}`);
    }
  }
  sendSuccess(res, { migrations, errors: errors.length > 0 ? errors : undefined });
}
async function handleImportSettings(req, res, auth) {
  const parsed = validateBody(importSettingsBodySchema, req, res);
  if (!parsed)
    return;
  const { settings } = parsed;
  if (settings.length === 0) {
    sendError(res, "settings array cannot be empty", HttpStatus.BAD_REQUEST);
    return;
  }
  const imported = [];
  const errors = [];
  try {
    const values = [];
    const placeholders = [];
    settings.forEach((setting, i) => {
      const offset = i * 6;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, NOW(), NOW())`);
      values.push(setting.key, JSON.stringify(setting.value), setting.description || null, setting.category || null, setting.is_public ?? false, auth.userId);
    });
    await query(`INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (key)
       DO UPDATE SET
         value = EXCLUDED.value,
         description = EXCLUDED.description,
         category = EXCLUDED.category,
         is_public = EXCLUDED.is_public,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`, values);
    for (const setting of settings) {
      imported.push(setting.key);
    }
  } catch (e) {
    for (const setting of settings) {
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
    const ops = [{ text: "DELETE FROM settings WHERE 1=1", values: [] }];
    if (defaultSettings.length > 0) {
      const values = [];
      const placeholders = [];
      defaultSettings.forEach((setting, i) => {
        const offset = i * 6;
        placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, NOW(), NOW())`);
        values.push(setting.key, JSON.stringify(setting.value), setting.description, setting.category, setting.is_public, auth.userId);
      });
      ops.push({
        text: `INSERT INTO settings (key, value, description, category, is_public, updated_by, created_at, updated_at)
         VALUES ${placeholders.join(", ")}`,
        values
      });
    }
    await transaction(ops);
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
    handleError(res, error, "admin/reset-settings");
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
  const parsed = validateBody(updateRoleBodySchema, req, res);
  if (!parsed)
    return;
  const { userId, role } = parsed;
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
    const revokedSessions = await revokeUserSessions(userId);
    await logAuditEvent({
      actor_id: auth.userId,
      action: "user_role_updated",
      entity_type: "user",
      entity_id: userId,
      changes: { new_role: role, revoked_sessions: revokedSessions }
    });
    sendSuccess(res, { user: result.rows[0], revokedSessions });
  } catch (error) {
    handleError(res, error, "admin/update-role");
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
  const filterActorEmail = req.query.filter_actor_email?.trim();
  const filterUserId = req.query.filter_user_id?.trim();
  const filterEntityType = req.query.filter_entity_type?.trim();
  const filterCategory = req.query.filter_category?.trim();
  const filterFrom = req.query.filter_from;
  const filterTo = req.query.filter_to;
  const offset = (page - 1) * pageSize;
  const categorySql = `
    CASE
      WHEN LOWER(al.action) ~ '(login|signin|logout|signout|register|signup|auth|password|session|refresh)' THEN 'Authentication'
      WHEN LOWER(al.action) ~ '(create|insert|add|update|modify|edit|delete|remove|archive|restore)' THEN 'Data'
      WHEN LOWER(al.action) ~ '(view|read|get|download|export)' THEN 'Access'
      WHEN LOWER(al.action) ~ '(settings|config|permission|role|admin|security|maintenance)' THEN 'System'
      WHEN LOWER(al.action) ~ '(email|notification|message|sms|communication)' THEN 'Communication'
      WHEN LOWER(al.action) ~ '(analytics|report|dashboard|metric)' THEN 'Analytics'
      ELSE 'General'
    END
  `;
  const fromSql = `
    FROM audit_logs al
    LEFT JOIN profiles actor ON actor.id = al.actor_id
  `;
  try {
    const whereClauses = [];
    const params = [];
    if (filterAction) {
      params.push(`%${filterAction}%`);
      whereClauses.push(`al.action ILIKE $${params.length}`);
    }
    if (filterActorEmail) {
      params.push(`%${filterActorEmail}%`);
      whereClauses.push(`COALESCE(actor.email, '') ILIKE $${params.length}`);
    }
    if (filterUserId) {
      params.push(filterUserId);
      whereClauses.push(`(al.actor_id = $${params.length}::uuid OR al.entity_id = $${params.length}::uuid)`);
    }
    if (filterEntityType) {
      params.push(filterEntityType);
      whereClauses.push(`al.entity_type = $${params.length}`);
    }
    if (filterCategory) {
      params.push(filterCategory);
      whereClauses.push(`(${categorySql}) = $${params.length}`);
    }
    if (filterFrom) {
      params.push(filterFrom);
      whereClauses.push(`al.created_at >= $${params.length}::timestamptz`);
    }
    if (filterTo) {
      params.push(filterTo);
      whereClauses.push(`al.created_at <= $${params.length}::timestamptz`);
    }
    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
    const countQuery = `SELECT COUNT(*) as count ${fromSql} ${whereSql}`;
    const entriesQuery = `
      SELECT
        al.id,
        al.actor_id,
        actor.email AS actor_email,
        COALESCE(
          NULLIF(actor.full_name, ''),
          NULLIF(TRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), ''),
          actor.email
        ) AS actor_name,
        actor.role AS actor_role,
        al.action,
        ${categorySql} AS category,
        al.entity_type,
        al.entity_id,
        al.changes,
        al.ip_address,
        al.user_agent,
        al.created_at
      ${fromSql}
      ${whereSql}
      ORDER BY al.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `;
    const uniqueActorsQuery = `
      SELECT COUNT(DISTINCT al.actor_id) as count
      ${fromSql}
      ${whereSql}
    `;
    const categoryBreakdownQuery = `
      SELECT ${categorySql} AS label, COUNT(*) as count
      ${fromSql}
      ${whereSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
    `;
    const entityBreakdownQuery = `
      SELECT al.entity_type AS label, COUNT(*) as count
      ${fromSql}
      ${whereSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 8
    `;
    const actionBreakdownQuery = `
      SELECT al.action AS label, COUNT(*) as count
      ${fromSql}
      ${whereSql}
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 8
    `;
    const [countResult, entriesResult, uniqueActorsResult, categoryBreakdownResult, entityBreakdownResult, actionBreakdownResult] = await Promise.all([
      query(countQuery, params),
      query(entriesQuery, [...params, pageSize, offset]),
      query(uniqueActorsQuery, params),
      query(categoryBreakdownQuery, params),
      query(entityBreakdownQuery, params),
      query(actionBreakdownQuery, params)
    ]);
    const totalCount = parseInt(countResult.rows[0]?.count || "0", 10);
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const uniqueActors = parseInt(uniqueActorsResult.rows[0]?.count || "0", 10);
    sendSuccess(res, {
      entries: entriesResult.rows,
      totalCount,
      page,
      pageSize,
      totalPages,
      summary: {
        uniqueActors,
        categoryBreakdown: categoryBreakdownResult.rows,
        entityBreakdown: entityBreakdownResult.rows,
        actionBreakdown: actionBreakdownResult.rows
      }
    });
  } catch (error) {
    handleError(res, error, "admin/audit-log");
  }
}
async function handleAppeals(_req, res) {
  sendSuccess(res, {
    appeals: [],
    totalCount: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1
  });
}
async function handleGetSchema(req, res) {
  const table = req.query.table;
  if (!table)
    return sendError(res, "Table name required", 400);
  try {
    const result = await query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    sendSuccess(res, { table, columns: result.rows });
  } catch (error) {
    handleError(res, error, "admin/schema");
  }
}
export {
  admin_default as default
};
