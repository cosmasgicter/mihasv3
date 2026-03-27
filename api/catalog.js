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
var AUDIT_ENTITY_PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000", UUID_REGEX, AuditQueries, CatalogQueries;
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
  CatalogQueries = {
    getPrograms: () => ({
      text: `
      SELECT 
        id, name, code, description, duration_months,
        application_fee, tuition_fee, requirements,
        regulatory_body, accreditation_status, institution_id, is_active,
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
        regulatory_body, accreditation_status, institution_id, is_active,
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
        regulatory_body, accreditation_status, institution_id, is_active,
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

// lib/securityHeaders.ts
function setSecurityHeaders(res, options) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", options?.cacheControl ?? "no-store");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

// api-src/catalog.ts
init_db();
init_queries();

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

// api-src/catalog.ts
init_auditLogger();
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

// lib/validation/common.ts
import { z } from "zod";
var uuidParamSchema = z.string().uuid("Must be a valid UUID");
var paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive("Page must be a positive integer").default(1),
  pageSize: z.coerce.number().int().positive("Page size must be a positive integer").max(100, "Page size must not exceed 100").default(20)
});
// lib/validation/bootstrap.ts
import { z as z2 } from "zod";
var bootstrapBodySchema = z2.object({
  email: z2.string().trim().email("Invalid email"),
  password: z2.string().trim().min(1, "Password is required"),
  secret: z2.string().trim().optional()
});
// lib/validation/sanitize.ts
import { z as z3 } from "zod";
var sanitizedString = z3.string().transform((s) => s.trim()).pipe(z3.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed"));
var optionalSanitizedString = z3.string().transform((s) => s.trim()).pipe(z3.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed")).optional();
var nonEmptySanitizedString = z3.string().transform((s) => s.trim()).pipe(z3.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty"));
// lib/validation/zambian.ts
import { z as z4 } from "zod";
var nrcSchema = z4.string().transform((s) => s.trim()).pipe(z4.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => /^\d{6}\/\d{2}\/\d$/.test(s), "Invalid NRC format. Expected: 123456/78/9"));
var zambianPhoneSchema = z4.string().transform((s) => s.trim()).pipe(z4.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => /^\+260\d{9}$/.test(s), "Must be +260 followed by 9 digits"));
var eczGradeSchema = z4.number().int("Grade must be a whole number").min(1, "Grade minimum is 1").max(9, "Grade maximum is 9");
var optionalNrcSchema = z4.union([
  z4.literal(""),
  nrcSchema
]).optional();
var optionalZambianPhoneSchema = z4.union([
  z4.literal(""),
  zambianPhoneSchema
]).optional();
var optionalEczGradeSchema = eczGradeSchema.optional();
// lib/validation/auth.ts
import { z as z5 } from "zod";
var emailSchema = z5.string().transform((s) => s.trim()).pipe(z5.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => z5.string().email().safeParse(s).success, "Invalid email format"));
var passwordSchema = z5.string().min(8, "Password must be at least 8 characters").refine((s) => /[A-Z]/.test(s), "Password must contain at least one uppercase letter").refine((s) => /[a-z]/.test(s), "Password must contain at least one lowercase letter").refine((s) => /\d/.test(s), "Password must contain at least one digit");
var loginBodySchema = z5.object({
  email: emailSchema,
  password: z5.string().min(1, "Password is required")
});
var registerBodySchema = z5.object({
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
var passwordResetRequestBodySchema = z5.object({
  email: emailSchema
});
var passwordResetBodySchema = z5.object({
  token: z5.string().min(1, "Token is required"),
  newPassword: passwordSchema
});
var profileUpdateBodySchema = z5.object({
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
var checkEmailQuerySchema = z5.object({
  action: z5.literal("check-email"),
  email: emailSchema
});
// lib/validation/applications.ts
import { z as z6 } from "zod";
var applicationStatusSchema = z6.enum([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "pending_documents"
]);
var paymentStatusSchema = z6.enum(["pending_review", "verified", "rejected"]);
var interviewModeSchema = z6.enum(["in-person", "in_person", "virtual", "phone"]);
var institutionSchema = nonEmptySanitizedString;
var createApplicationBodySchema = z6.object({
  application_number: nonEmptySanitizedString,
  public_tracking_code: optionalSanitizedString,
  full_name: nonEmptySanitizedString,
  nrc_number: optionalSanitizedString,
  passport_number: optionalSanitizedString,
  date_of_birth: nonEmptySanitizedString,
  sex: nonEmptySanitizedString,
  phone: nonEmptySanitizedString,
  email: z6.string().email("Invalid email"),
  residence_town: nonEmptySanitizedString,
  country: optionalSanitizedString,
  nationality: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString,
  program: nonEmptySanitizedString,
  intake: nonEmptySanitizedString,
  institution: institutionSchema,
  status: applicationStatusSchema.optional()
});
var reviewApplicationBodySchema = z6.object({
  application_id: nonEmptySanitizedString,
  status: applicationStatusSchema,
  notes: optionalSanitizedString
});
var updateApplicationBodySchema = z6.object({
  full_name: optionalSanitizedString,
  phone: optionalSanitizedString,
  email: z6.string().email().optional(),
  residence_town: optionalSanitizedString,
  country: optionalSanitizedString,
  nationality: optionalSanitizedString,
  nrc_number: optionalSanitizedString,
  passport_number: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString,
  status: applicationStatusSchema.optional(),
  grades: z6.array(z6.object({
    subject_id: z6.string(),
    grade: eczGradeSchema
  })).optional()
}).partial();
var trackApplicationQuerySchema = z6.object({
  action: z6.literal("track"),
  code: sanitizedString
});
var scheduleInterviewBodySchema = z6.object({
  application_id: nonEmptySanitizedString,
  interview_date: nonEmptySanitizedString,
  interview_time: optionalSanitizedString,
  location: optionalSanitizedString,
  notes: optionalSanitizedString
});
var patchUpdateStatusSchema = z6.object({
  status: applicationStatusSchema,
  notes: optionalSanitizedString
});
var patchUpdatePaymentStatusSchema = z6.object({
  paymentStatus: paymentStatusSchema,
  verificationNotes: optionalSanitizedString
});
var patchSendNotificationSchema = z6.object({
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString
});
var patchScheduleInterviewSchema = z6.object({
  scheduledAt: nonEmptySanitizedString,
  mode: interviewModeSchema,
  location: nonEmptySanitizedString,
  notes: optionalSanitizedString
});
var patchRescheduleInterviewSchema = z6.object({
  scheduledAt: nonEmptySanitizedString,
  mode: interviewModeSchema.optional(),
  location: optionalSanitizedString,
  notes: optionalSanitizedString
});
var patchCancelInterviewSchema = z6.object({
  notes: optionalSanitizedString
});
var patchSyncGradesSchema = z6.object({
  grades: z6.array(z6.object({
    subject_id: nonEmptySanitizedString,
    grade: eczGradeSchema
  }))
});
var patchSaveDraftSchema = z6.object({
  version: z6.number().int().positive("Version must be a positive integer"),
  data: z6.record(z6.string(), z6.unknown())
});
// lib/validation/admin.ts
import { z as z7 } from "zod";
var roleSchema = z7.enum([
  "student",
  "reviewer",
  "admissions_officer",
  "registrar",
  "finance_officer",
  "academic_head",
  "admin",
  "super_admin"
]);
var adminRegisterBodySchema = z7.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nonEmptySanitizedString,
  lastName: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  role: roleSchema.optional()
});
var adminSetPasswordBodySchema = z7.object({
  email: emailSchema,
  password: z7.string().min(8, "Password must be at least 8 characters")
});
var updateRoleBodySchema = z7.object({
  userId: nonEmptySanitizedString,
  role: roleSchema
});
var updateUserBodySchema = z7.object({
  userId: nonEmptySanitizedString,
  email: emailSchema,
  full_name: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  role: roleSchema
});
var userPermissionsBodySchema = z7.object({
  userId: nonEmptySanitizedString,
  permissions: z7.array(sanitizedString).optional()
});
var createSettingBodySchema = z7.object({
  key: nonEmptySanitizedString,
  value: z7.unknown().refine((v) => v !== undefined && v !== null, "Value is required"),
  description: optionalSanitizedString,
  category: optionalSanitizedString,
  is_public: z7.boolean().optional()
});
var updateSettingBodySchema = z7.object({
  id: nonEmptySanitizedString.optional(),
  key: optionalSanitizedString,
  value: z7.unknown().optional(),
  description: optionalSanitizedString,
  category: optionalSanitizedString,
  is_public: z7.boolean().optional()
});
var deleteSettingQuerySchema = z7.object({
  key: nonEmptySanitizedString.optional(),
  id: z7.string().uuid("Must be a valid UUID").optional()
}).refine((data) => data.key !== undefined || data.id !== undefined, { message: "Either key or id must be provided" });
var importSettingsBodySchema = z7.object({
  settings: z7.array(z7.object({
    key: nonEmptySanitizedString,
    value: z7.unknown(),
    description: optionalSanitizedString,
    category: optionalSanitizedString,
    is_public: z7.boolean().optional()
  }))
});
var migrateBodySchema = z7.object({
  secret: optionalSanitizedString
});
var applicationStatusSchema2 = z7.enum([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "pending_documents"
]);
var bulkEmailBodySchema = z7.object({
  subject: z7.string().max(200).transform((s) => s.trim()).pipe(z7.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty")),
  message: z7.string().max(5000).transform((s) => s.trim()).pipe(z7.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty")),
  userIds: z7.array(nonEmptySanitizedString).min(1).max(500)
});
var bulkStatusBodySchema = z7.object({
  status: applicationStatusSchema2,
  applicationIds: z7.array(nonEmptySanitizedString).min(1).max(500)
});
// lib/validation/documents.ts
import { z as z8 } from "zod";
var uploadDocumentBodySchema = z8.object({
  file: z8.string().min(1, "File data is required"),
  fileName: nonEmptySanitizedString,
  fileType: optionalSanitizedString,
  contentType: optionalSanitizedString,
  userId: optionalSanitizedString,
  applicationId: optionalSanitizedString,
  applicationNumber: optionalSanitizedString,
  documentType: optionalSanitizedString
});
var extractDocumentBodySchema = z8.object({
  documentUrl: z8.string().url("Invalid document URL"),
  documentType: optionalSanitizedString,
  applicationId: optionalSanitizedString
});
var deleteDocumentBodySchema = z8.object({
  documentId: nonEmptySanitizedString
});
var signedUrlBodySchema = z8.object({
  documentId: nonEmptySanitizedString
});
var registerSlipBodySchema = z8.object({
  applicationNumber: nonEmptySanitizedString,
  path: nonEmptySanitizedString,
  publicUrl: optionalSanitizedString,
  documentName: optionalSanitizedString
});
var resolveReferenceBodySchema = z8.object({
  reference: nonEmptySanitizedString
});
var documentPathSchema = z8.string().trim().refine((s) => !s.includes("../") && !s.includes("..\\") && !s.includes("%00") && !s.includes("\x00"), "Path contains disallowed traversal or null byte patterns");
// lib/validation/payments.ts
import { z as z9 } from "zod";
var receiptQuerySchema = z9.object({
  action: z9.literal("receipt"),
  applicationId: nonEmptySanitizedString
});
// lib/validation/catalog.ts
import { z as z10 } from "zod";
var numericStringOrNumber = z10.union([z10.string(), z10.number()]);
var optionalNumber = numericStringOrNumber.transform((value) => Number(value)).refine((value) => Number.isFinite(value), "Must be a valid number").optional();
var optionalNullableNumber = z10.union([numericStringOrNumber, z10.null()]).transform((value) => value === null ? null : Number(value)).refine((value) => value === null || Number.isFinite(value), "Must be a valid number").optional();
var booleanLike = z10.union([z10.boolean(), z10.literal("true"), z10.literal("false")]).transform((value) => value === true || value === "true");
var catalogTypeQuerySchema = z10.object({
  type: z10.enum(["programs", "intakes", "subjects", "institutions"]).optional().default("programs")
});
var deleteCatalogEntityQuerySchema = z10.object({
  id: nonEmptySanitizedString
});
var createProgramBodySchema = z10.object({
  name: nonEmptySanitizedString,
  code: optionalSanitizedString,
  description: optionalSanitizedString,
  duration_months: optionalNumber,
  duration_years: optionalNumber,
  application_fee: optionalNullableNumber,
  tuition_fee: optionalNullableNumber,
  regulatory_body: optionalSanitizedString,
  institution_id: nonEmptySanitizedString
}).superRefine((value, ctx) => {
  const durationMonths = value.duration_months ?? (value.duration_years ? value.duration_years * 12 : undefined);
  if (!durationMonths || durationMonths < 1 || durationMonths > 120) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
      message: "duration_months must be between 1 and 120",
      path: ["duration_months"]
    });
  }
});
var updateProgramBodySchema = createProgramBodySchema.extend({
  id: nonEmptySanitizedString,
  is_active: booleanLike.optional()
});
var createInstitutionBodySchema = z10.object({
  name: nonEmptySanitizedString,
  full_name: optionalSanitizedString,
  fullName: optionalSanitizedString,
  code: optionalSanitizedString,
  description: optionalSanitizedString
});
var updateInstitutionBodySchema = createInstitutionBodySchema.extend({
  id: nonEmptySanitizedString,
  is_active: booleanLike.optional()
});
var createIntakeBodySchema = z10.object({
  name: nonEmptySanitizedString,
  year: numericStringOrNumber.transform((value) => Number(value)),
  semester: optionalSanitizedString.nullable().optional(),
  start_date: nonEmptySanitizedString,
  end_date: nonEmptySanitizedString,
  application_deadline: nonEmptySanitizedString,
  max_capacity: optionalNumber,
  total_capacity: optionalNumber
}).superRefine((value, ctx) => {
  if (!Number.isFinite(value.year) || value.year < 2000) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
      message: "Valid year is required",
      path: ["year"]
    });
  }
  const maxCapacity = value.max_capacity ?? value.total_capacity;
  if (!maxCapacity || maxCapacity < 1) {
    ctx.addIssue({
      code: z10.ZodIssueCode.custom,
      message: "max_capacity must be at least 1",
      path: ["max_capacity"]
    });
  }
});
var updateIntakeBodySchema = createIntakeBodySchema.extend({
  id: nonEmptySanitizedString,
  current_enrollment: optionalNumber,
  is_active: booleanLike.optional()
});
// lib/validation/sessions.ts
import { z as z11 } from "zod";
var revokeSessionBodySchema = z11.object({
  sessionId: nonEmptySanitizedString
});
var revokeAllSessionsBodySchema = z11.object({
  keepCurrent: z11.boolean().optional()
});
var pollQuerySchema = z11.object({
  action: z11.literal("poll"),
  lastEventId: z11.string().optional()
});
// lib/validation/notifications.ts
import { z as z12 } from "zod";
var markReadBodySchema = z12.object({
  notificationId: nonEmptySanitizedString
});
var deleteNotificationBodySchema = z12.object({
  notificationId: nonEmptySanitizedString
});
var checkDuplicateBodySchema = z12.object({
  user_id: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  type: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString
});
var createNotificationBodySchema = z12.object({
  user_id: optionalSanitizedString,
  type: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  action_url: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString,
  priority: z12.enum(["low", "normal", "high", "urgent"]).optional()
});
var sendNotificationBodySchema = z12.object({
  user_id: nonEmptySanitizedString,
  type: optionalSanitizedString,
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
  action_url: optionalSanitizedString,
  entity_type: optionalSanitizedString,
  entity_id: optionalSanitizedString
});
var updatePreferencesBodySchema = z12.object({
  email_notifications: z12.boolean().optional(),
  push_notifications: z12.boolean().optional(),
  sms_notifications: z12.boolean().optional(),
  notification_types: z12.record(z12.string(), z12.boolean()).optional()
}).partial();
var preferencesBodySchema = z12.object({
  sms_enabled: z12.boolean().optional(),
  application_updates: z12.boolean().optional(),
  payment_reminders: z12.boolean().optional(),
  interview_reminders: z12.boolean().optional(),
  marketing_emails: z12.boolean().optional(),
  quiet_hours_start: optionalSanitizedString,
  quiet_hours_end: optionalSanitizedString
});
// lib/validation/email.ts
import { z as z13 } from "zod";
var sendEmailBodySchema = z13.object({
  recipient_email: z13.string().email("Invalid recipient email"),
  recipient_name: optionalSanitizedString,
  subject: nonEmptySanitizedString,
  body: nonEmptySanitizedString,
  template_name: optionalSanitizedString,
  template_data: z13.record(z13.string(), z13.unknown()).optional(),
  priority: z13.number().int().min(1).max(10).optional()
});
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
// api-src/catalog.ts
var ADMIN_ROLES = ["admin", "super_admin", "admissions_officer"];
function isAdminRole(role) {
  return Boolean(role && ADMIN_ROLES.includes(role));
}
function normalizeProgram(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    duration_months: Number(row.duration_months ?? 0),
    duration_years: Math.ceil(Number(row.duration_months ?? 0) / 12),
    application_fee: Number(row.application_fee ?? 153),
    tuition_fee: row.tuition_fee ? Number(row.tuition_fee) : null,
    regulatory_body: row.regulatory_body,
    accreditation_status: row.accreditation_status,
    institution_id: row.institution_id,
    institutions: row.institution_id ? {
      id: row.institution_id,
      name: row.institution_name ?? "",
      full_name: row.institution_full_name ?? row.institution_name ?? ""
    } : null,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
function generateProgramCode(name) {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
}
function parseDeleteId(req, res) {
  const result = deleteCatalogEntityQuerySchema.safeParse({
    id: req.query.id ?? req.body?.id
  });
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    sendError(res, firstIssue?.message || "Validation failed", HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    return null;
  }
  return result.data.id;
}
function normalizeInstitution(record) {
  return {
    id: record.id,
    name: record.name,
    full_name: record.full_name ?? record.name,
    code: record.code ?? null,
    description: record.description ?? "",
    is_active: record.is_active !== false,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
}
function normalizeIntake(row) {
  return {
    id: row.id,
    name: row.name,
    year: Number(row.year ?? (row.start_date ? new Date(row.start_date).getFullYear() : new Date().getFullYear())),
    semester: row.semester,
    start_date: row.start_date,
    end_date: row.end_date,
    application_start_date: row.application_start_date,
    application_deadline: row.application_deadline,
    max_capacity: Number(row.max_capacity ?? 0),
    current_enrollment: Number(row.current_enrollment ?? 0),
    available_spots: Math.max(0, Number(row.max_capacity ?? 0) - Number(row.current_enrollment ?? 0)),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
async function ensureAdmin(req, res) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendError(res, error.message, error.statusCode, error.code);
      return null;
    }
    throw error;
  }
  if (!isAdminRole(user.role)) {
    sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
    return null;
  }
  return user;
}
function getHeaderValue(header) {
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }
  return header ?? null;
}
async function logCatalogAuditEvent(input) {
  const forwardedFor = getHeaderValue(input.req.headers["x-forwarded-for"]);
  const ipAddress = forwardedFor ? forwardedFor.split(",")[0]?.trim() ?? null : null;
  const userAgent = getHeaderValue(input.req.headers["user-agent"]);
  await logAuditEvent({
    actor_id: input.actorId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    changes: input.changes,
    ip_address: ipAddress,
    user_agent: userAgent
  });
}
async function listPrograms(res, includeInactive, shouldCache) {
  try {
    const result = await query(`SELECT
        p.id,
        p.name,
        p.code,
        p.description,
        p.duration_months,
        p.application_fee,
        p.tuition_fee,
        p.regulatory_body,
        p.accreditation_status,
        p.institution_id,
        i.name AS institution_name,
        i.full_name AS institution_full_name,
        p.is_active,
        p.created_at,
        p.updated_at
      FROM programs p
      LEFT JOIN institutions i ON i.id = p.institution_id
      WHERE ($1::boolean = true OR p.is_active = true)
      ORDER BY p.name ASC`, [includeInactive]);
    if (shouldCache) {
      res.setHeader("Cache-Control", "public, max-age=300");
    }
    return sendSuccess(res, { programs: result.rows.map(normalizeProgram) });
  } catch (error) {
    return handleError(res, error, "catalog/list-programs");
  }
}
async function listIntakes(res, includeInactive, shouldCache) {
  try {
    const result = await query(`SELECT
        id,
        name,
        COALESCE(year, EXTRACT(YEAR FROM start_date)::int) AS year,
        semester,
        start_date,
        end_date,
        application_start_date,
        application_deadline,
        COALESCE(max_capacity, 0) AS max_capacity,
        COALESCE(current_enrollment, 0) AS current_enrollment,
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
  } catch (error) {
    return handleError(res, error, "catalog/list-intakes");
  }
}
async function createProgram(req, res, actorId) {
  const parsed = validateBody(createProgramBodySchema, req, res);
  if (!parsed)
    return;
  const name = parsed.name;
  const code = String(parsed.code || generateProgramCode(name)).trim();
  const description = parsed.description ?? "";
  const durationMonths = Number(parsed.duration_months ?? Number(parsed.duration_years) * 12);
  const applicationFee = parsed.application_fee !== undefined && parsed.application_fee !== null ? Number(parsed.application_fee) : 153;
  const tuitionFee = parsed.tuition_fee !== undefined ? parsed.tuition_fee : null;
  const regulatoryBody = parsed.regulatory_body ?? null;
  const institutionId = parsed.institution_id;
  try {
    const result = await query(`INSERT INTO programs (name, code, description, duration_months, application_fee, tuition_fee, regulatory_body, institution_id, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW(), NOW())
       RETURNING *`, [name, code, description || null, durationMonths, applicationFee, tuitionFee, regulatoryBody, institutionId]);
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_program_created",
      entityType: "program",
      entityId: result.rows[0].id,
      changes: {
        code,
        institution_id: institutionId,
        duration_months: durationMonths
      }
    });
    return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, "catalog/create-program");
  }
}
async function updateProgram(req, res, actorId) {
  const parsed = validateBody(updateProgramBodySchema, req, res);
  if (!parsed)
    return;
  const id = parsed.id;
  const name = parsed.name;
  const code = String(parsed.code || generateProgramCode(name)).trim();
  const description = parsed.description ?? "";
  const durationMonths = Number(parsed.duration_months ?? Number(parsed.duration_years) * 12);
  const applicationFee = parsed.application_fee !== undefined && parsed.application_fee !== null ? Number(parsed.application_fee) : null;
  const tuitionFee = parsed.tuition_fee !== undefined ? parsed.tuition_fee : null;
  const regulatoryBody = parsed.regulatory_body ?? null;
  const institutionId = parsed.institution_id;
  const isActive = parsed.is_active;
  try {
    const result = await query(`UPDATE programs
       SET name = $2,
           code = $3,
           description = $4,
           duration_months = $5,
           application_fee = COALESCE($6, application_fee),
           tuition_fee = $7,
           regulatory_body = $8,
           institution_id = $9,
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`, [id, name, code, description || null, durationMonths, applicationFee, tuitionFee, regulatoryBody, institutionId, isActive ?? null]);
    if (result.rowCount === 0) {
      return sendError(res, "Program not found", HttpStatus.NOT_FOUND);
    }
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_program_updated",
      entityType: "program",
      entityId: result.rows[0].id,
      changes: {
        code,
        institution_id: institutionId,
        is_active: isActive ?? undefined
      }
    });
    return sendSuccess(res, { program: normalizeProgram(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, "catalog/update-program");
  }
}
async function deleteProgram(req, res, actorId) {
  const id = parseDeleteId(req, res);
  if (!id)
    return;
  try {
    const result = await query(`UPDATE programs
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return sendError(res, "Program not found or already inactive", HttpStatus.NOT_FOUND);
    }
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_program_archived",
      entityType: "program",
      entityId: result.rows[0].id,
      changes: { is_active: false }
    });
    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, "catalog/delete-program");
  }
}
async function listInstitutions(res, includeInactive, shouldCache) {
  try {
    const result = await query(`SELECT id, name, full_name, code, description, is_active, created_at, updated_at
       FROM institutions
       WHERE ($1::boolean = true OR is_active = true)
       ORDER BY full_name ASC, name ASC`, [includeInactive]);
    if (shouldCache) {
      res.setHeader("Cache-Control", "public, max-age=300");
    }
    return sendSuccess(res, { institutions: result.rows.map(normalizeInstitution) });
  } catch (error) {
    return handleError(res, error, "catalog/list-institutions");
  }
}
async function createInstitution(req, res, actorId) {
  const parsed = validateBody(createInstitutionBodySchema, req, res);
  if (!parsed)
    return;
  const name = parsed.name;
  const fullName = parsed.full_name || parsed.fullName || name;
  const code = parsed.code || null;
  const description = parsed.description ?? "";
  try {
    const result = await query(`INSERT INTO institutions (name, full_name, code, description, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, NOW(), NOW())
       RETURNING id, name, full_name, code, description, is_active, created_at, updated_at`, [name, fullName, code, description || null]);
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_institution_created",
      entityType: "institution",
      entityId: result.rows[0].id,
      changes: { code, full_name: fullName }
    });
    return sendSuccess(res, { institution: normalizeInstitution(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, "catalog/create-institution");
  }
}
async function updateInstitution(req, res, actorId) {
  const parsed = validateBody(updateInstitutionBodySchema, req, res);
  if (!parsed)
    return;
  const id = parsed.id;
  const name = parsed.name;
  const fullName = parsed.full_name || parsed.fullName || name;
  const code = parsed.code || null;
  const description = parsed.description ?? "";
  const isActive = parsed.is_active;
  try {
    const result = await query(`UPDATE institutions
       SET name = $2,
           full_name = $3,
           code = $4,
           description = $5,
           is_active = COALESCE($6, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, full_name, code, description, is_active, created_at, updated_at`, [id, name, fullName, code, description || null, isActive ?? null]);
    if (result.rowCount === 0) {
      return sendError(res, "Institution not found", HttpStatus.NOT_FOUND);
    }
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_institution_updated",
      entityType: "institution",
      entityId: result.rows[0].id,
      changes: { code, is_active: isActive ?? undefined }
    });
    return sendSuccess(res, { institution: normalizeInstitution(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, "catalog/update-institution");
  }
}
async function deleteInstitution(req, res, actorId) {
  const id = parseDeleteId(req, res);
  if (!id)
    return;
  try {
    const programCount = await query(`SELECT COUNT(*)::text AS count
       FROM programs
       WHERE institution_id = $1
         AND is_active = true`, [id]);
    if (Number(programCount.rows[0]?.count ?? "0") > 0) {
      return sendError(res, "Cannot archive an institution that still has active programs", HttpStatus.CONFLICT);
    }
    const result = await query(`UPDATE institutions
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return sendError(res, "Institution not found or already inactive", HttpStatus.NOT_FOUND);
    }
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_institution_archived",
      entityType: "institution",
      entityId: result.rows[0].id,
      changes: { is_active: false }
    });
    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, "catalog/delete-institution");
  }
}
async function createIntake(req, res, actorId) {
  const parsed = validateBody(createIntakeBodySchema, req, res);
  if (!parsed)
    return;
  const name = parsed.name;
  const year = Number(parsed.year);
  const semester = parsed.semester ?? null;
  const startDate = parsed.start_date;
  const endDate = parsed.end_date;
  const applicationDeadline = parsed.application_deadline;
  const maxCapacity = Number(parsed.max_capacity || parsed.total_capacity);
  try {
    const result = await query(`INSERT INTO intakes (
        name, year, semester, start_date, end_date, application_deadline,
        max_capacity, current_enrollment, is_active, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 0, true, NOW(), NOW())
      RETURNING *`, [name, year, semester, startDate, endDate, applicationDeadline, maxCapacity]);
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_intake_created",
      entityType: "intake",
      entityId: result.rows[0].id,
      changes: {
        year,
        semester,
        max_capacity: maxCapacity
      }
    });
    return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, "catalog/create-intake");
  }
}
async function updateIntake(req, res, actorId) {
  const parsed = validateBody(updateIntakeBodySchema, req, res);
  if (!parsed)
    return;
  const id = parsed.id;
  const name = parsed.name;
  const year = Number(parsed.year);
  const semester = parsed.semester ?? null;
  const startDate = parsed.start_date;
  const endDate = parsed.end_date;
  const applicationDeadline = parsed.application_deadline;
  const maxCapacity = Number(parsed.max_capacity || parsed.total_capacity);
  const currentEnrollment = parsed.current_enrollment !== undefined ? Number(parsed.current_enrollment) : null;
  const isActive = parsed.is_active;
  try {
    const result = await query(`UPDATE intakes
       SET name = $2,
           year = $3,
           semester = $4,
           start_date = $5,
           end_date = $6,
           application_deadline = $7,
           max_capacity = $8,
           current_enrollment = COALESCE($9, current_enrollment),
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`, [id, name, year, semester, startDate, endDate, applicationDeadline, maxCapacity, currentEnrollment, isActive ?? null]);
    if (result.rowCount === 0) {
      return sendError(res, "Intake not found", HttpStatus.NOT_FOUND);
    }
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_intake_updated",
      entityType: "intake",
      entityId: result.rows[0].id,
      changes: {
        max_capacity: maxCapacity,
        current_enrollment: currentEnrollment ?? undefined,
        is_active: isActive ?? undefined
      }
    });
    return sendSuccess(res, { intake: normalizeIntake(result.rows[0]) });
  } catch (error) {
    return handleError(res, error, "catalog/update-intake");
  }
}
async function deleteIntake(req, res, actorId) {
  const id = parseDeleteId(req, res);
  if (!id)
    return;
  try {
    const result = await query(`UPDATE intakes
       SET is_active = false,
           updated_at = NOW()
       WHERE id = $1 AND is_active = true
       RETURNING id`, [id]);
    if (result.rowCount === 0) {
      return sendError(res, "Intake not found or already inactive", HttpStatus.NOT_FOUND);
    }
    await logCatalogAuditEvent({
      req,
      actorId,
      action: "catalog_intake_archived",
      entityType: "intake",
      entityId: result.rows[0].id,
      changes: { is_active: false }
    });
    return sendSuccess(res, { deleted: true, id });
  } catch (error) {
    return handleError(res, error, "catalog/delete-intake");
  }
}
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  setSecurityHeaders(res);
  if (!["GET", "POST", "PUT", "DELETE"].includes(req.method || "")) {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join("; ");
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
  }
  const parsedQuery = validateQuery(catalogTypeQuerySchema, req, res);
  if (!parsedQuery)
    return;
  const type = parsedQuery.type;
  try {
    const authUser = await getAuthUser(req);
    const isAdmin = isAdminRole(authUser?.role);
    if (req.method === "GET") {
      res.setHeader("Cache-Control", "public, max-age=300");
      if (type === "programs") {
        return await listPrograms(res, isAdmin, !authUser);
      }
      if (type === "intakes") {
        return await listIntakes(res, isAdmin, !authUser);
      }
      if (type === "subjects") {
        const q = CatalogQueries.getSubjects();
        const result = await query(q.text, q.values);
        return sendSuccess(res, { subjects: result.rows });
      }
      if (type === "institutions") {
        return await listInstitutions(res, isAdmin, !authUser);
      }
      return sendError(res, "Invalid type. Use: programs, intakes, subjects, or institutions", HttpStatus.BAD_REQUEST);
    }
    if (await requireCsrf(req, res))
      return;
    if (!["programs", "intakes", "institutions"].includes(type)) {
      return sendError(res, "Write operations are only supported for programs, institutions, and intakes", HttpStatus.BAD_REQUEST);
    }
    const adminUser = await ensureAdmin(req, res);
    if (!adminUser) {
      return;
    }
    if (type === "programs") {
      if (req.method === "POST")
        return await createProgram(req, res, adminUser.userId);
      if (req.method === "PUT")
        return await updateProgram(req, res, adminUser.userId);
      return await deleteProgram(req, res, adminUser.userId);
    }
    if (type === "institutions") {
      if (req.method === "POST")
        return await createInstitution(req, res, adminUser.userId);
      if (req.method === "PUT")
        return await updateInstitution(req, res, adminUser.userId);
      return await deleteInstitution(req, res, adminUser.userId);
    }
    if (req.method === "POST")
      return await createIntake(req, res, adminUser.userId);
    if (req.method === "PUT")
      return await updateIntake(req, res, adminUser.userId);
    return await deleteIntake(req, res, adminUser.userId);
  } catch (error) {
    return handleError(res, error, "catalog");
  }
}
var catalog_default = withArcjetProtection(handler, "general");
export {
  catalog_default as default
};
