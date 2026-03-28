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
var AUDIT_ENTITY_PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000", UUID_REGEX, AuditQueries, ApplicationQueries, DocumentQueries, GradeQueries, StatusHistoryQueries;
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
  ApplicationQueries = {
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
        "nationality",
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
  DocumentQueries = {
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
  GradeQueries = {
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
  StatusHistoryQueries = {
    create: (applicationId, status, changedBy, notes, oldStatus) => ({
      text: `
      INSERT INTO application_status_history (
        id, application_id, status, old_status, new_status, changed_by, notes, created_at
      )
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `,
      values: [applicationId, status, oldStatus || null, status, changedBy, notes || null]
    }),
    findByApplicationId: (applicationId) => ({
      text: `
      SELECT
        h.id,
        h.application_id,
        h.old_status,
        h.new_status AS status,
        h.changed_by,
        h.notes,
        h.created_at,
        json_build_object(
          'email', p.email,
          'full_name', NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '')
        ) AS changed_by_profile
      FROM application_status_history h
      LEFT JOIN profiles p ON p.id = h.changed_by
      WHERE h.application_id = $1
      ORDER BY h.created_at DESC
    `,
      values: [applicationId]
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

// api-src/applications.ts
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

// lib/auth/ownership.ts
init_db();
var ADMIN_ROLES = ["admin", "super_admin"];
var REVIEWER_ROLES = ["admin", "super_admin", "reviewer"];
function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}
function isReviewer(role) {
  return REVIEWER_ROLES.includes(role);
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

// api-src/applications.ts
init_queries();
init_errorHandler();

// lib/realtimeBroker.ts
var MAX_EVENTS_PER_USER = 200;
var userEvents = new Map;
var seenEventIds = new Set;
var publishedCount = 0;
var duplicateCount = 0;
function publishRealtimeEvent(userId, event) {
  if (seenEventIds.has(event.event_id)) {
    duplicateCount += 1;
    return;
  }
  seenEventIds.add(event.event_id);
  publishedCount += 1;
  const list = userEvents.get(userId) || [];
  list.push(event);
  if (list.length > MAX_EVENTS_PER_USER) {
    list.shift();
  }
  userEvents.set(userId, list);
}

// api-src/applications.ts
init_auditLogger();

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

// lib/validation/applications.ts
import { z as z3 } from "zod";

// lib/validation/sanitize.ts
import { z } from "zod";
var sanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed"));
var optionalSanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed")).optional();
var nonEmptySanitizedString = z.string().transform((s) => s.trim()).pipe(z.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => s.length > 0, "Must not be empty"));

// lib/validation/zambian.ts
import { z as z2 } from "zod";
var nrcSchema = z2.string().transform((s) => s.trim()).pipe(z2.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => /^\d{6}\/\d{2}\/\d$/.test(s), "Invalid NRC format. Expected: 123456/78/9"));
var zambianPhoneSchema = z2.string().transform((s) => s.trim()).pipe(z2.string().refine((s) => !s.includes("\x00"), "Null bytes not allowed").refine((s) => /^\+260\d{9}$/.test(s), "Must be +260 followed by 9 digits"));
var eczGradeSchema = z2.number().int("Grade must be a whole number").min(1, "Grade minimum is 1").max(9, "Grade maximum is 9");
var optionalNrcSchema = z2.union([
  z2.literal(""),
  nrcSchema
]).optional();
var optionalZambianPhoneSchema = z2.union([
  z2.literal(""),
  zambianPhoneSchema
]).optional();
var optionalEczGradeSchema = eczGradeSchema.optional();

// lib/validation/applications.ts
var applicationStatusSchema = z3.enum([
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "pending_documents"
]);
var paymentStatusSchema = z3.enum(["pending_review", "verified", "rejected"]);
var interviewModeSchema = z3.enum(["in-person", "in_person", "virtual", "phone"]);
var institutionSchema = nonEmptySanitizedString;
var createApplicationBodySchema = z3.object({
  application_number: nonEmptySanitizedString,
  public_tracking_code: optionalSanitizedString,
  full_name: nonEmptySanitizedString,
  nrc_number: optionalSanitizedString,
  passport_number: optionalSanitizedString,
  date_of_birth: nonEmptySanitizedString,
  sex: nonEmptySanitizedString,
  phone: nonEmptySanitizedString,
  email: z3.string().email("Invalid email"),
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
var reviewApplicationBodySchema = z3.object({
  application_id: nonEmptySanitizedString,
  status: applicationStatusSchema,
  notes: optionalSanitizedString
});
var updateApplicationBodySchema = z3.object({
  full_name: optionalSanitizedString,
  phone: optionalSanitizedString,
  email: z3.string().email().optional(),
  residence_town: optionalSanitizedString,
  country: optionalSanitizedString,
  nationality: optionalSanitizedString,
  nrc_number: optionalSanitizedString,
  passport_number: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString,
  status: applicationStatusSchema.optional(),
  grades: z3.array(z3.object({
    subject_id: z3.string(),
    grade: eczGradeSchema
  })).optional()
}).partial();
var trackApplicationQuerySchema = z3.object({
  action: z3.literal("track"),
  code: sanitizedString
});
var scheduleInterviewBodySchema = z3.object({
  application_id: nonEmptySanitizedString,
  interview_date: nonEmptySanitizedString,
  interview_time: optionalSanitizedString,
  location: optionalSanitizedString,
  notes: optionalSanitizedString
});
var patchUpdateStatusSchema = z3.object({
  status: applicationStatusSchema,
  notes: optionalSanitizedString
});
var patchUpdatePaymentStatusSchema = z3.object({
  paymentStatus: paymentStatusSchema,
  verificationNotes: optionalSanitizedString
});
var patchSendNotificationSchema = z3.object({
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString
});
var patchScheduleInterviewSchema = z3.object({
  scheduledAt: nonEmptySanitizedString,
  mode: interviewModeSchema,
  location: nonEmptySanitizedString,
  notes: optionalSanitizedString
});
var patchRescheduleInterviewSchema = z3.object({
  scheduledAt: nonEmptySanitizedString,
  mode: interviewModeSchema.optional(),
  location: optionalSanitizedString,
  notes: optionalSanitizedString
});
var patchCancelInterviewSchema = z3.object({
  notes: optionalSanitizedString
});
var patchSyncGradesSchema = z3.object({
  grades: z3.array(z3.object({
    subject_id: nonEmptySanitizedString,
    grade: eczGradeSchema
  }))
});
var patchSaveDraftSchema = z3.object({
  version: z3.number().int().positive("Version must be a positive integer"),
  data: z3.record(z3.string(), z3.unknown())
});

// lib/validation/common.ts
import { z as z4 } from "zod";
var uuidParamSchema = z4.string().uuid("Must be a valid UUID");
var paginationQuerySchema = z4.object({
  page: z4.coerce.number().int().positive("Page must be a positive integer").default(1),
  pageSize: z4.coerce.number().int().positive("Page size must be a positive integer").max(100, "Page size must not exceed 100").default(20)
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

// lib/idempotency.ts
init_db();
var IDEMPOTENCY_KEY_MAX_LENGTH = 128;
var IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_-]+$/;
function normalizeIdempotencyKey(rawHeader) {
  if (!rawHeader)
    return "";
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const normalized = value.trim();
  if (!normalized)
    return "";
  if (normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH)
    return "";
  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized))
    return "";
  return normalized;
}
function scopeIdempotencyKey(userId, endpoint, key) {
  return `${userId}:${endpoint}:${key}`;
}
async function checkIdempotencyKey(userId, key, endpoint) {
  if (!key)
    return null;
  const scopedKey = scopeIdempotencyKey(userId, endpoint, key);
  try {
    const result = await query(`SELECT response_json FROM idempotency_keys
       WHERE key = $1 AND endpoint = $2
       AND created_at > NOW() - INTERVAL '24 hours'`, [scopedKey, endpoint]);
    if (result.rowCount > 0) {
      return result.rows[0].response_json;
    }
    return null;
  } catch (err) {
    console.error("[idempotency] Error checking key:", err);
    return null;
  }
}
async function storeIdempotencyKey(userId, key, endpoint, responseData) {
  if (!key)
    return;
  const scopedKey = scopeIdempotencyKey(userId, endpoint, key);
  try {
    await query(`INSERT INTO idempotency_keys (key, endpoint, response_json, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET response_json = $3, created_at = NOW()`, [scopedKey, endpoint, JSON.stringify(responseData)]);
    query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`).catch((err) => console.error("[idempotency] Cleanup error:", err));
  } catch (err) {
    console.error("[idempotency] Error storing key:", err);
  }
}

// api-src/applications.ts
var VALID_ACTIONS = [
  "details",
  "documents",
  "grades",
  "summary",
  "review",
  "interviews",
  "schedule-interview",
  "stats",
  "export",
  "email-slip",
  "versions",
  "track"
];
async function handler(req, res) {
  if (handleCors(req, res))
    return;
  setSecurityHeaders(res);
  const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
  if (!ALLOWED_METHODS.includes(req.method || "")) {
    res.setHeader("Allow", ALLOWED_METHODS.join(", "));
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join("; ");
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE");
  }
  const action = req.query.action;
  if (req.method === "HEAD") {
    return res.status(200).end();
  }
  if (req.method === "GET" && action === "track") {
    return await handlePublicTracking(req, res);
  }
  const id = req.query.id;
  if (action && !VALID_ACTIONS.includes(action)) {
    return sendError(res, `Invalid action '${action}'. Valid actions: ${VALID_ACTIONS.join(", ")}`, HttpStatus.BAD_REQUEST);
  }
  if (id) {
    const uuidResult = uuidParamSchema.safeParse(id);
    if (!uuidResult.success) {
      return sendError(res, "Invalid id parameter: must be a valid UUID", HttpStatus.BAD_REQUEST);
    }
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
  const isAdmin2 = isAdmin(user.role) || user.role === "admissions_officer";
  const isReviewer2 = isReviewer(user.role);
  const canReadAllApplications = isAdmin2 || user.permissions.includes("applications:read") || user.permissions.includes("applications:review");
  const canReviewApplications = user.permissions.includes("applications:review");
  const canVerifyPayments = user.permissions.includes("payments:verify");
  const isReviewerOnly = user.role === "reviewer";
  try {
    if (action === "details")
      return await handleDetails(req, res, user.userId, canReadAllApplications);
    if (action === "documents")
      return await handleDocuments(res);
    if (action === "grades")
      return await handleGrades(res);
    if (action === "summary")
      return await handleSummary(res);
    if (action === "review")
      return await handleReview(req, res, user.userId, canReviewApplications, isReviewerOnly);
    if (action === "interviews")
      return await handleInterviews(req, res, user.userId);
    if (action === "schedule-interview")
      return await handleScheduleInterview(req, res, user.userId, isAdmin2);
    if (action === "stats")
      return await handleStats(req, res, user.userId);
    if (action === "export")
      return await handleExport(req, res, isAdmin2);
    if (action === "email-slip")
      return await handleEmailSlip(req, res, user.userId, isAdmin2);
    if (action === "versions")
      return await handleVersions(req, res, user.userId);
    if (id)
      return await handleById(req, res, user.userId, isAdmin2, canReadAllApplications, canReviewApplications, canVerifyPayments, id, isReviewerOnly);
    if (req.method === "GET")
      return await handleDetails(req, res, user.userId, canReadAllApplications);
    if (req.method === "POST") {
      if (isReviewerOnly) {
        return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
      }
      return await handleCreate(req, res, user.userId);
    }
    return sendError(res, "Invalid request", HttpStatus.BAD_REQUEST);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    if (error instanceof AuthorizationError) {
      return sendError(res, error.message, error.statusCode, error.code);
    }
    return handleError(res, error, "applications");
  }
}
function validatePatchPayload(schema, payload, res) {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  const fieldErrors = {};
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".") || "_root";
    fieldErrors[path] = issue.message;
  }
  sendValidationError(res, fieldErrors);
  return null;
}
var APPLICATION_PAYMENT_METADATA_SELECT = `
  a.*,
  NULLIF(TRIM(CONCAT_WS(' ', verifier.first_name, verifier.last_name)), '') AS payment_verified_by_name,
  verifier.email AS payment_verified_by_email,
  payment_audit.id AS last_payment_audit_id,
  payment_audit.created_at AS last_payment_audit_at,
  payment_audit.actor_name AS last_payment_audit_by_name,
  payment_audit.actor_email AS last_payment_audit_by_email,
  payment_audit.notes AS last_payment_audit_notes,
  COALESCE(NULLIF(a.momo_ref, ''), NULLIF(a.pop_url, '')) AS last_payment_reference
`;
var APPLICATION_PAYMENT_METADATA_JOINS = `
  LEFT JOIN profiles verifier
    ON verifier.id = a.payment_verified_by
  LEFT JOIN LATERAL (
    SELECT
      al.id::text AS id,
      al.created_at::text AS created_at,
      NULLIF(TRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), '') AS actor_name,
      actor.email AS actor_email,
      COALESCE(
        NULLIF(TRIM(al.changes->>'notes'), ''),
        NULLIF(TRIM(al.changes->>'verification_notes'), ''),
        NULLIF(TRIM(al.changes->>'reason'), '')
      ) AS notes
    FROM audit_logs al
    LEFT JOIN profiles actor
      ON actor.id = al.actor_id
    WHERE al.entity_type = 'payment'
      AND al.entity_id = a.id
      AND al.action IN ('payment_verified', 'payment_rejected', 'payment_status_updated')
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT 1
  ) payment_audit ON true
`;
function isValidTrackingCode(code) {
  const value = code.trim();
  if (!value || value.length > 50)
    return false;
  const appNumberPattern = /^(KATC|MIHAS)\d{6}$/;
  if (appNumberPattern.test(value))
    return true;
  return /^[a-zA-Z0-9\-_]+$/.test(value);
}
async function handlePublicTracking(req, res) {
  const code = req.query.code?.trim() || "";
  if (!isValidTrackingCode(code)) {
    return sendError(res, "Invalid tracking code format", HttpStatus.BAD_REQUEST);
  }
  try {
    const rateLimitDecision = await arcjetProtect(req, "session");
    if (!rateLimitDecision.allowed) {
      return sendError(res, "Too many tracking requests. Please try again later.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const result = await query(`SELECT
        application_number,
        status,
        program AS program_name,
        intake AS intake_name,
        submitted_at,
        updated_at,
        LEFT(NULLIF(TRIM(admin_feedback), ''), 240) AS feedback_summary
      FROM applications
      WHERE public_tracking_code = $1 OR application_number = $1
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1`, [code]);
    if (result.rowCount === 0) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    return sendSuccess(res, {
      application: result.rows[0]
    });
  } catch (error) {
    return handleError(res, error, "applications/track");
  }
}
async function handleCreate(req, res, userId) {
  const parsed = validateBody(createApplicationBodySchema, req, res);
  if (!parsed)
    return;
  const body = parsed;
  try {
    const catalogValidationResult = await query(`SELECT
        p.id AS program_id,
        p.name AS program_name,
        p.institution_id AS program_institution_id,
        i.id AS institution_id,
        i.name AS institution_name,
        i.full_name AS institution_full_name,
        i.code AS institution_code,
        EXISTS (
          SELECT 1
          FROM intakes active_intake
          WHERE active_intake.id = $2
            AND active_intake.is_active = true
        ) AS intake_exists,
        EXISTS (
          SELECT 1
          FROM program_intakes pi
          WHERE pi.program_id = p.id
            AND pi.intake_id = $2
        ) AS intake_program_exists
      FROM programs p
      LEFT JOIN institutions i ON i.id = p.institution_id
      WHERE p.id = $1
        AND p.is_active = true`, [body.program, body.intake]);
    if (catalogValidationResult.rowCount === 0) {
      return sendValidationError(res, {
        program: "Please select a valid program from the current catalog."
      });
    }
    const catalog = catalogValidationResult.rows[0];
    const submittedInstitution = String(body.institution || "").trim();
    const normalizedSubmittedInstitution = submittedInstitution.toLowerCase();
    const institutionCandidates = [
      catalog.institution_id,
      catalog.institution_name,
      catalog.institution_full_name,
      catalog.institution_code
    ].map((value) => value?.trim().toLowerCase()).filter(Boolean);
    if (!normalizedSubmittedInstitution || !institutionCandidates.includes(normalizedSubmittedInstitution)) {
      return sendValidationError(res, {
        institution: "Please select a valid institution for the selected program."
      });
    }
    if (!catalog.intake_exists) {
      return sendValidationError(res, {
        program: "Please select a valid intake from the current catalog."
      });
    }
    if (!catalog.intake_program_exists) {
      return sendValidationError(res, {
        program: "Selected program is not available for the chosen intake."
      });
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
      catalog.program_id,
      body.intake,
      catalog.institution_id || body.institution,
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
  } catch (error) {
    return handleError(res, error, "applications/create");
  }
}
async function handleDetails(req, res, userId, canReadAllApplications) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  try {
    const paginationResult = paginationQuerySchema.safeParse({
      page: req.query.page,
      pageSize: req.query.pageSize
    });
    const page = paginationResult.success ? paginationResult.data.page : 1;
    const pageSize = paginationResult.success ? paginationResult.data.pageSize : 50;
    const status = req.query.status;
    const search = req.query.search;
    const payment = req.query.payment;
    const program = req.query.program;
    const institution = req.query.institution;
    const sortBy = req.query.sortBy || "date";
    const sortOrder = (req.query.sortOrder || "desc").toUpperCase() === "ASC" ? "ASC" : "DESC";
    const mine = req.query.mine;
    const conditions = [];
    const values = [];
    let paramIndex = 1;
    if (!canReadAllApplications || mine === "true") {
      conditions.push(`a.user_id = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }
    if (status) {
      conditions.push(`a.status = $${paramIndex}`);
      values.push(status);
      paramIndex++;
    }
    if (search) {
      const searchPattern = `%${search.replace(/[%_]/g, "\\$&")}%`;
      conditions.push(`(a.full_name ILIKE $${paramIndex} OR a.email ILIKE $${paramIndex} OR a.application_number ILIKE $${paramIndex})`);
      values.push(searchPattern);
      paramIndex++;
    }
    if (payment) {
      if (payment === "not_paid") {
        conditions.push(`a.payment_status IS NULL`);
      } else {
        conditions.push(`a.payment_status = $${paramIndex}`);
        values.push(payment);
        paramIndex++;
      }
    }
    if (program) {
      conditions.push(`a.program = $${paramIndex}`);
      values.push(program);
      paramIndex++;
    }
    if (institution) {
      conditions.push(`a.institution = $${paramIndex}`);
      values.push(institution);
      paramIndex++;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortColumn = sortBy === "date" ? "a.created_at" : sortBy === "name" ? "a.full_name" : "a.created_at";
    const countResult = await query(`SELECT COUNT(*) as count FROM applications a ${whereClause}`, values);
    const totalCount = parseInt(countResult.rows[0]?.count || "0", 10);
    const offset = (page - 1) * pageSize;
    const dataValues = [...values, pageSize, offset];
    const result = await query(`SELECT ${APPLICATION_PAYMENT_METADATA_SELECT}
       FROM applications a
       ${APPLICATION_PAYMENT_METADATA_JOINS}
       ${whereClause}
       ORDER BY ${sortColumn} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, dataValues);
    return sendSuccess(res, {
      applications: result.rows,
      totalCount,
      page,
      pageSize
    });
  } catch (error) {
    return handleError(res, error, "applications/details");
  }
}
async function handleDocuments(res) {
  try {
    const q = DocumentQueries.findAll();
    const result = await query(q.text, q.values);
    return sendSuccess(res, result.rows);
  } catch (error) {
    return handleError(res, error, "applications/documents");
  }
}
async function handleGrades(res) {
  try {
    const q = GradeQueries.findAll();
    const result = await query(q.text, q.values);
    return sendSuccess(res, result.rows);
  } catch (error) {
    return handleError(res, error, "applications/grades");
  }
}
async function handleSummary(res) {
  try {
    const q = ApplicationQueries.getSummary();
    const result = await query(q.text, q.values);
    return sendSuccess(res, result.rows);
  } catch (error) {
    return handleError(res, error, "applications/summary");
  }
}
async function handleInterviews(req, res, userId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  try {
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
  } catch (error) {
    return handleError(res, error, "applications/interviews");
  }
}
async function handleScheduleInterview(req, res, userId, isAdmin2) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  if (!isAdmin2) {
    return sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
  }
  const parsed = validateBody(scheduleInterviewBodySchema, req, res);
  if (!parsed)
    return;
  const { application_id: applicationId, interview_date: scheduled_at, interview_time, location, notes } = parsed;
  const mode = req.body?.mode || "in_person";
  const normalizedMode = mode === "in-person" ? "in_person" : mode;
  if (!["in_person", "virtual", "phone"].includes(normalizedMode)) {
    return sendError(res, "Invalid mode. Use: in-person, in_person, virtual, or phone", HttpStatus.BAD_REQUEST);
  }
  try {
    const applicationResult = await query("SELECT id FROM applications WHERE id = $1 LIMIT 1", [applicationId]);
    if (applicationResult.rowCount === 0) {
      return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
    }
    const interviewResult = await query(`INSERT INTO application_interviews (
        application_id, scheduled_at, mode, location, notes, status, created_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, NOW(), NOW())
      RETURNING id, application_id, scheduled_at, mode, location, notes, status`, [applicationId, scheduled_at, normalizedMode, location, notes || null, userId]);
    try {
      await logAuditEvent({
        actor_id: userId,
        action: "interview_scheduled",
        entity_type: "application",
        entity_id: applicationId,
        changes: { scheduled_at, mode: normalizedMode, interview_id: interviewResult.rows[0]?.id }
      });
    } catch (auditError) {
      console.error("[applications] Failed to create interview audit log:", auditError);
    }
    try {
      const appOwner = await query("SELECT user_id FROM applications WHERE id = $1", [applicationId]);
      if (appOwner.rows[0]?.user_id) {
        const now = new Date().toISOString();
        const version = Date.now();
        publishRealtimeEvent(appOwner.rows[0].user_id, {
          event_id: `interview_scheduled:${applicationId}:${version}`,
          event_type: "interview_scheduled",
          entity_id: applicationId,
          version,
          created_at: now,
          payload: {
            application_id: applicationId,
            interview_id: interviewResult.rows[0]?.id,
            scheduled_at,
            mode: normalizedMode,
            location
          }
        });
      }
    } catch (realtimeError) {
      console.error("[applications] Failed to publish interview realtime event:", realtimeError);
    }
    console.log("[applications] Interview scheduled:", applicationId, interviewResult.rows[0]?.id);
    return sendSuccess(res, { interview: interviewResult.rows[0] }, HttpStatus.CREATED);
  } catch (error) {
    return handleError(res, error, "applications/schedule-interview");
  }
}
async function handleStats(req, res, userId) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  try {
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
  } catch (error) {
    return handleError(res, error, "applications/stats");
  }
}
async function handleReview(req, res, userId, canReviewApplications, isReviewerOnly) {
  if (!canReviewApplications) {
    return sendError(res, "Review permission required", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
  }
  try {
    if (req.method === "GET") {
      const q = ApplicationQueries.findPendingReview();
      const result = await query(q.text, q.values);
      return sendSuccess(res, result.rows);
    }
    if (req.method === "POST") {
      if (isReviewerOnly) {
        return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
      }
      const parsed = validateBody(reviewApplicationBodySchema, req, res);
      if (!parsed)
        return;
      const { application_id, status, notes } = parsed;
      const force = req.body?.force === true;
      const validStatuses = ["draft", "submitted", "under_review", "approved", "rejected", "pending_documents"];
      if (!validStatuses.includes(status)) {
        return sendError(res, `Invalid status. Must be one of: ${validStatuses.join(", ")}`, HttpStatus.BAD_REQUEST);
      }
      const existingAppQ = ApplicationQueries.findById(application_id);
      const existingAppResult = await query(existingAppQ.text, existingAppQ.values);
      const existingApp = existingAppResult.rows[0];
      if (!existingApp) {
        return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
      }
      if (status === "approved" && existingApp.payment_status !== "verified" && !force) {
        return sendSuccess(res, {
          warning: true,
          message: "Payment has not been verified for this application. You can still approve by confirming the override.",
          application_id,
          requested_status: status
        });
      }
      const updateQ = ApplicationQueries.updateStatus(application_id, status, userId, notes);
      const historyQ = StatusHistoryQueries.create(application_id, status, userId, notes, existingApp.status);
      const [updateResult] = await transaction([
        { text: updateQ.text, values: updateQ.values },
        { text: historyQ.text, values: historyQ.values }
      ]);
      if (updateResult.rowCount === 0) {
        return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
      }
      try {
        await logAuditEvent({
          actor_id: userId,
          action: "application_status_changed",
          entity_type: "application",
          entity_id: application_id,
          changes: { new_status: status, review_action: true }
        });
      } catch (auditError) {
        console.error("[applications/review] Failed to create audit log:", auditError);
      }
      if (existingApp.email) {
        try {
          const statusDisplay = status.replace(/[_\s]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const actionUrl = `/student/application/${application_id}`;
          const htmlBody = renderEmailTemplate("status-change", {
            recipientName: existingApp.full_name || undefined,
            applicationNumber: existingApp.application_number || undefined,
            programName: existingApp.program || undefined,
            status,
            actionUrl
          });
          await query(`INSERT INTO email_queue (
               recipient_email, recipient_name, subject, body, html_body,
               template_name, template_data, status, priority
             ) VALUES ($1, $2, $3, $4, $5, 'status-change', $6, 'pending', 3)`, [
            existingApp.email,
            existingApp.full_name || null,
            `Application Status Update: ${statusDisplay}`,
            `Your application status has been updated to: ${statusDisplay}`,
            htmlBody,
            JSON.stringify({
              recipientName: existingApp.full_name || null,
              applicationNumber: existingApp.application_number || null,
              programName: existingApp.program || null,
              status,
              actionUrl
            })
          ]);
        } catch (emailError) {
          console.error("[applications/review] Failed to queue status change email:", emailError);
        }
      }
      console.log("[applications/review] Application reviewed:", application_id, status);
      return sendSuccess(res, { application: updateResult.rows[0] });
    }
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, "applications/review");
  }
}
async function handleById(req, res, userId, isAdmin2, canReadAllApplications, canReviewApplications, canVerifyPayments, applicationId, isReviewerOnly) {
  try {
    if (req.method === "GET") {
      if (!canReadAllApplications) {
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
      const {
        grades = [],
        documents = [],
        statusHistory = [],
        interview = null,
        ...application
      } = data;
      return sendSuccess(res, {
        application,
        grades,
        documents,
        statusHistory,
        interview
      });
    }
    if (req.method === "DELETE") {
      if (isReviewerOnly) {
        return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
      }
      const appQ = ApplicationQueries.findById(applicationId);
      const appResult = await query(appQ.text, appQ.values);
      if (appResult.rowCount === 0) {
        return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
      }
      const app = appResult.rows[0];
      if (app.user_id !== userId && !isAdmin2) {
        return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
      }
      const deleteQ = ApplicationQueries.delete(applicationId);
      await query(deleteQ.text, deleteQ.values);
      console.log("[applications] Deleted application:", applicationId);
      return sendSuccess(res, { deleted: true });
    }
    if (req.method === "PUT" || req.method === "PATCH") {
      if (isReviewerOnly) {
        return sendError(res, "Insufficient permissions", HttpStatus.FORBIDDEN, "INSUFFICIENT_PERMISSIONS");
      }
      const appQ = ApplicationQueries.findById(applicationId);
      const appResult = await query(appQ.text, appQ.values);
      if (appResult.rowCount === 0) {
        return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
      }
      const app = appResult.rows[0];
      if (app.user_id !== userId && !isAdmin2) {
        return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
      }
      const body = req.body;
      if (req.method === "PATCH" && body.action) {
        const { action, ...payload } = body;
        if (action === "update_status") {
          if (!canReviewApplications) {
            return sendError(res, "Review permission required", HttpStatus.FORBIDDEN);
          }
          const parsedPayload = validatePatchPayload(patchUpdateStatusSchema, payload, res);
          if (!parsedPayload)
            return;
          const { status, notes } = parsedPayload;
          const force = payload.force === true;
          if (status === "approved" && app.payment_status !== "verified" && !force) {
            return sendSuccess(res, {
              warning: true,
              message: "Payment has not been verified for this application. You can still approve by confirming the override.",
              application_id: applicationId,
              requested_status: status
            });
          }
          let updateResult2;
          try {
            const updateQ2 = ApplicationQueries.updateStatus(applicationId, status, userId, notes);
            const historyQ = StatusHistoryQueries.create(applicationId, status, userId, notes, app.status);
            const [txUpdateResult] = await transaction([
              { text: updateQ2.text, values: updateQ2.values },
              { text: historyQ.text, values: historyQ.values }
            ]);
            updateResult2 = txUpdateResult;
          } catch (error) {
            const message = error.message?.toLowerCase() || "";
            if (message.includes("application_status_history") || message.includes("status_history")) {
              return sendError(res, "Status update failed during history persistence; no changes were applied.", HttpStatus.CONFLICT);
            }
            throw error;
          }
          if (!updateResult2 || updateResult2.rowCount === 0) {
            return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
          }
          if (status === "approved") {
            try {
              const notificationTitle = "Application approved";
              const notificationMessage = `Your application ${app.application_number || applicationId} has been approved.`;
              const actionUrl = `/student/application/${applicationId}`;
              await query(`INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
               VALUES ($1, $2, $3, 'success', $4, false, NOW())`, [app.user_id, notificationTitle, notificationMessage, actionUrl]);
            } catch (notifError) {
              console.error("[applications] Non-blocking notification insert failed:", notifError);
            }
          }
          try {
            await logAuditEvent({
              actor_id: userId,
              action: "application_status_changed",
              entity_type: "application",
              entity_id: applicationId,
              changes: { new_status: status }
            });
          } catch (auditError) {
            console.error("[applications] Failed to create status change audit log:", auditError);
          }
          if (app.email) {
            try {
              const statusDisplay = status.replace(/[_\s]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const actionUrl = `/student/application/${applicationId}`;
              const htmlBody = renderEmailTemplate("status-change", {
                recipientName: app.full_name || undefined,
                applicationNumber: app.application_number || undefined,
                programName: app.program || undefined,
                status,
                actionUrl
              });
              await query(`INSERT INTO email_queue (
                 recipient_email, recipient_name, subject, body, html_body,
                 template_name, template_data, status, priority
               ) VALUES ($1, $2, $3, $4, $5, 'status-change', $6, 'pending', 3)`, [
                app.email,
                app.full_name || null,
                `Application Status Update: ${statusDisplay}`,
                `Your application status has been updated to: ${statusDisplay}`,
                htmlBody,
                JSON.stringify({
                  recipientName: app.full_name || null,
                  applicationNumber: app.application_number || null,
                  programName: app.program || null,
                  status,
                  actionUrl
                })
              ]);
            } catch (emailError) {
              console.error("[applications] Failed to queue status change email:", emailError);
            }
          }
          const now = new Date().toISOString();
          const version = Date.now();
          const baseEvent = {
            entity_id: applicationId,
            version,
            created_at: now
          };
          publishRealtimeEvent(app.user_id, {
            ...baseEvent,
            event_id: `application_update:${applicationId}:${version}`,
            event_type: "application_update",
            payload: {
              application_id: applicationId,
              status,
              approved: status === "approved"
            }
          });
          publishRealtimeEvent(app.user_id, {
            ...baseEvent,
            event_id: `dashboard_refresh:${applicationId}:${version}`,
            event_type: "dashboard_refresh",
            payload: {
              reason: "application_status_changed",
              application_id: applicationId
            }
          });
          if (status === "approved") {
            publishRealtimeEvent(app.user_id, {
              ...baseEvent,
              event_id: `notification:${applicationId}:${version}`,
              event_type: "notification",
              payload: {
                title: "Application approved",
                message: `Your application ${app.application_number || applicationId} has been approved.`
              }
            });
          }
          console.log("[applications] Status updated:", applicationId, status);
          return sendSuccess(res, updateResult2.rows[0]);
        }
        if (action === "update_payment_status") {
          if (!canVerifyPayments) {
            return sendError(res, "Payment verification permission required", HttpStatus.FORBIDDEN);
          }
          const parsedPayload = validatePatchPayload(patchUpdatePaymentStatusSchema, payload, res);
          if (!parsedPayload)
            return;
          const { paymentStatus, verificationNotes } = parsedPayload;
          const normalizedVerificationNotes = typeof verificationNotes === "string" ? verificationNotes.trim().slice(0, 1000) : "";
          if (paymentStatus === "rejected" && !normalizedVerificationNotes) {
            return sendError(res, "Rejection notes are required when rejecting a payment.", HttpStatus.BAD_REQUEST);
          }
          if ((paymentStatus === "verified" || paymentStatus === "rejected") && !app.pop_url && !payload.force) {
            return sendSuccess(res, {
              warning: true,
              message: "No payment proof has been uploaded for this application. You can still proceed by confirming the override.",
              application_id: applicationId,
              requested_payment_status: paymentStatus
            });
          }
          const notificationTitle = paymentStatus === "verified" ? "Payment Verified" : paymentStatus === "rejected" ? "Payment Rejected" : app.payment_status === "rejected" ? "Payment Resubmission Reopened" : "Payment Under Review";
          const notificationMessage = paymentStatus === "verified" ? `Your payment for application ${app.application_number || applicationId} has been verified.` : paymentStatus === "rejected" ? `Your payment for application ${app.application_number || applicationId} was rejected. Please resubmit your payment proof.` : app.payment_status === "rejected" ? `Your payment for application ${app.application_number || applicationId} is back under review.` : `Your payment for application ${app.application_number || applicationId} is currently under review.`;
          const actionUrl = `/student/application/${applicationId}`;
          let updateResult2;
          try {
            const isVerified = paymentStatus === "verified";
            updateResult2 = await query(`UPDATE applications
             SET
               payment_status = $2,
               payment_verified_by = $3,
               payment_verified_at = $4,
               updated_at = NOW()
             WHERE id = $1
             RETURNING *`, [
              applicationId,
              paymentStatus,
              isVerified ? userId : null,
              isVerified ? new Date().toISOString() : null
            ]);
          } catch (error) {
            throw error;
          }
          if (!updateResult2 || updateResult2.rowCount === 0) {
            return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
          }
          try {
            await query(`INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
             VALUES ($1, $2, $3, $4, $5, false, NOW())`, [
              app.user_id,
              notificationTitle,
              notificationMessage,
              paymentStatus === "verified" ? "success" : paymentStatus === "rejected" ? "warning" : "info",
              actionUrl
            ]);
          } catch (notifError) {
            console.error("[applications] Non-blocking payment notification insert failed:", notifError);
          }
          try {
            await logAuditEvent({
              actor_id: userId,
              action: paymentStatus === "verified" ? "payment_verified" : paymentStatus === "rejected" ? "payment_rejected" : "payment_status_updated",
              entity_type: "payment",
              entity_id: applicationId,
              changes: {
                payment_status: paymentStatus,
                previous_payment_status: app.payment_status,
                notes: normalizedVerificationNotes || null
              }
            });
          } catch (auditError) {
            console.error("[applications] Failed to create payment audit log:", auditError);
          }
          const now = new Date().toISOString();
          const version = Date.now();
          publishRealtimeEvent(app.user_id, {
            event_id: `payment_update:${applicationId}:${version}`,
            event_type: "payment_update",
            entity_id: applicationId,
            version,
            created_at: now,
            payload: {
              application_id: applicationId,
              payment_status: paymentStatus,
              review_notes: normalizedVerificationNotes || null
            }
          });
          publishRealtimeEvent(app.user_id, {
            event_id: `dashboard_refresh:${applicationId}:${version}`,
            event_type: "dashboard_refresh",
            entity_id: applicationId,
            version,
            created_at: now,
            payload: {
              reason: "payment_status_changed",
              application_id: applicationId
            }
          });
          publishRealtimeEvent(app.user_id, {
            event_id: `notification:${applicationId}:${version}`,
            event_type: "notification",
            entity_id: applicationId,
            version,
            created_at: now,
            payload: {
              title: notificationTitle,
              content: notificationMessage,
              action_url: actionUrl
            }
          });
          console.log("[applications] Payment status updated:", applicationId, paymentStatus);
          return sendSuccess(res, updateResult2.rows[0]);
        }
        if (action === "send_notification") {
          if (!isAdmin2) {
            return sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
          }
          const parsedPayload = validatePatchPayload(patchSendNotificationSchema, payload, res);
          if (!parsedPayload)
            return;
          const { title, message } = parsedPayload;
          const actionUrl = `/student/application/${applicationId}`;
          const notificationResult = await query(`INSERT INTO notifications (user_id, title, message, type, action_url, is_read, created_at)
           VALUES ($1, $2, $3, 'info', $4, false, NOW())
           RETURNING *`, [app.user_id, title.trim(), message.trim(), actionUrl]);
          let emailQueued = false;
          if (app.email) {
            try {
              const htmlBody = renderEmailTemplate("generic", {
                recipientName: app.full_name || undefined,
                message: message.trim(),
                actionUrl
              });
              await query(`INSERT INTO email_queue (
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
               VALUES ($1, $2, $3, $4, $5, 'generic', $6, 'pending', 5)`, [
                app.email,
                app.full_name || null,
                title.trim(),
                message.trim(),
                htmlBody,
                JSON.stringify({
                  recipientName: app.full_name || null,
                  message: message.trim(),
                  actionUrl,
                  applicationNumber: app.application_number || null
                })
              ]);
              emailQueued = true;
            } catch (emailQueueError) {
              console.error("[applications] Failed to queue notification email:", emailQueueError);
            }
          }
          try {
            await logAuditEvent({
              actor_id: userId,
              action: "application_notification_sent",
              entity_type: "notification",
              entity_id: notificationResult.rows[0]?.id || null,
              changes: {
                application_id: applicationId,
                target_user_id: app.user_id,
                email_queued: emailQueued
              }
            });
          } catch (auditError) {
            console.error("[applications] Failed to create notification audit log:", auditError);
          }
          const now = new Date().toISOString();
          const version = Date.now();
          publishRealtimeEvent(app.user_id, {
            event_id: `notification:${applicationId}:${version}`,
            event_type: "notification",
            entity_id: applicationId,
            version,
            created_at: now,
            payload: {
              title: title.trim(),
              content: message.trim(),
              action_url: actionUrl
            }
          });
          publishRealtimeEvent(app.user_id, {
            event_id: `dashboard_refresh:${applicationId}:${version}`,
            event_type: "dashboard_refresh",
            entity_id: applicationId,
            version,
            created_at: now,
            payload: {
              reason: "admin_notification_sent",
              application_id: applicationId
            }
          });
          return sendSuccess(res, {
            notification: notificationResult.rows[0],
            email_queued: emailQueued
          });
        }
        if (action === "schedule_interview") {
          if (!isAdmin2) {
            return sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
          }
          const parsedPayload = validatePatchPayload(patchScheduleInterviewSchema, payload, res);
          if (!parsedPayload)
            return;
          const { scheduledAt, mode: interviewMode, location: interviewLocation, notes: interviewNotes } = parsedPayload;
          const normalizedMode = interviewMode === "in-person" ? "in_person" : interviewMode;
          const interviewResult = await query(`INSERT INTO application_interviews (
            application_id, scheduled_at, mode, location, notes, status, created_by, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, NOW(), NOW())
          RETURNING id, application_id, scheduled_at, mode, location, notes, status`, [applicationId, scheduledAt, normalizedMode, interviewLocation, interviewNotes || null, userId]);
          try {
            await logAuditEvent({
              actor_id: userId,
              action: "interview_scheduled",
              entity_type: "application",
              entity_id: applicationId,
              changes: { scheduled_at: scheduledAt, mode: normalizedMode, interview_id: interviewResult.rows[0]?.id }
            });
          } catch (auditError) {
            console.error("[applications] Failed to create interview audit log:", auditError);
          }
          try {
            const now = new Date().toISOString();
            const version = Date.now();
            publishRealtimeEvent(app.user_id, {
              event_id: `interview_scheduled:${applicationId}:${version}`,
              event_type: "interview_scheduled",
              entity_id: applicationId,
              version,
              created_at: now,
              payload: { application_id: applicationId, interview_id: interviewResult.rows[0]?.id, scheduled_at: scheduledAt, mode: normalizedMode, location: interviewLocation }
            });
          } catch (realtimeError) {
            console.error("[applications] Failed to publish interview realtime event:", realtimeError);
          }
          console.log("[applications] Interview scheduled via PATCH:", applicationId);
          return sendSuccess(res, { interview: interviewResult.rows[0] }, HttpStatus.CREATED);
        }
        if (action === "reschedule_interview") {
          if (!isAdmin2) {
            return sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
          }
          const parsedPayload = validatePatchPayload(patchRescheduleInterviewSchema, payload, res);
          if (!parsedPayload)
            return;
          const { scheduledAt, mode: reschedMode, location: reschedLocation, notes: reschedNotes } = parsedPayload;
          const existingInterview = await query(`SELECT id FROM application_interviews WHERE application_id = $1 AND status IN ('scheduled', 'rescheduled')
           ORDER BY created_at DESC LIMIT 1`, [applicationId]);
          if (existingInterview.rowCount === 0) {
            return sendError(res, "No active interview found to reschedule", HttpStatus.NOT_FOUND);
          }
          const interviewId = existingInterview.rows[0].id;
          const normalizedMode = reschedMode ? reschedMode === "in-person" ? "in_person" : reschedMode : null;
          const reschedResult = await query(`UPDATE application_interviews SET
             scheduled_at = $1,
             status = 'rescheduled',
             mode = COALESCE($2, mode),
             location = COALESCE($3, location),
             notes = COALESCE($4, notes),
             updated_at = NOW()
           WHERE id = $5
           RETURNING id, application_id, scheduled_at, mode, location, notes, status`, [scheduledAt, normalizedMode, reschedLocation || null, reschedNotes ?? null, interviewId]);
          try {
            await logAuditEvent({
              actor_id: userId,
              action: "interview_rescheduled",
              entity_type: "application",
              entity_id: applicationId,
              changes: { interview_id: interviewId, scheduled_at: scheduledAt }
            });
          } catch (auditError) {
            console.error("[applications] Failed to create reschedule audit log:", auditError);
          }
          console.log("[applications] Interview rescheduled:", applicationId, interviewId);
          return sendSuccess(res, { interview: reschedResult.rows[0] });
        }
        if (action === "cancel_interview") {
          if (!isAdmin2) {
            return sendError(res, "Forbidden: admin access required", HttpStatus.FORBIDDEN);
          }
          const parsedPayload = validatePatchPayload(patchCancelInterviewSchema, payload, res);
          if (!parsedPayload)
            return;
          const { notes: cancelNotes } = parsedPayload;
          const existingInterview = await query(`SELECT id FROM application_interviews WHERE application_id = $1 AND status IN ('scheduled', 'rescheduled')
           ORDER BY created_at DESC LIMIT 1`, [applicationId]);
          if (existingInterview.rowCount === 0) {
            return sendError(res, "No active interview found to cancel", HttpStatus.NOT_FOUND);
          }
          const interviewId = existingInterview.rows[0].id;
          const cancelResult = await query(`UPDATE application_interviews SET status = 'cancelled', notes = COALESCE($1, notes), updated_at = NOW()
           WHERE id = $2
           RETURNING id, application_id, scheduled_at, mode, location, notes, status`, [cancelNotes || null, interviewId]);
          try {
            await logAuditEvent({
              actor_id: userId,
              action: "interview_cancelled",
              entity_type: "application",
              entity_id: applicationId,
              changes: { interview_id: interviewId }
            });
          } catch (auditError) {
            console.error("[applications] Failed to create cancel interview audit log:", auditError);
          }
          console.log("[applications] Interview cancelled:", applicationId, interviewId);
          return sendSuccess(res, { interview: cancelResult.rows[0] });
        }
        if (action === "save_draft") {
          if (app.status !== "draft") {
            return sendError(res, "Can only save drafts for applications in draft status", HttpStatus.BAD_REQUEST, "INVALID_STATUS");
          }
          const parsedPayload = validatePatchPayload(patchSaveDraftSchema, payload, res);
          if (!parsedPayload)
            return;
          const { version: newVersion, data: draftData } = parsedPayload;
          const allowedFields = [
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
            "result_slip_url",
            "extra_kyc_url",
            "payment_method",
            "payer_name",
            "payer_phone",
            "amount",
            "paid_at",
            "momo_ref",
            "pop_url"
          ];
          const setClauses = [];
          const values = [applicationId, newVersion];
          let paramIdx = 3;
          for (const field of allowedFields) {
            if (field in draftData) {
              setClauses.push(`${field} = $${paramIdx}`);
              values.push(draftData[field]);
              paramIdx++;
            }
          }
          setClauses.push(`version = $2`);
          setClauses.push(`updated_at = NOW()`);
          const updateResult2 = await query(`UPDATE applications
           SET ${setClauses.join(", ")}
           WHERE id = $1 AND version < $2
           RETURNING *`, values);
          if (updateResult2.rowCount === 0) {
            const currentApp = await query(`SELECT version FROM applications WHERE id = $1`, [applicationId]);
            if (currentApp.rowCount === 0) {
              return sendError(res, "Application not found", HttpStatus.NOT_FOUND, "NOT_FOUND");
            }
            return sendError(res, "Version conflict: a newer version already exists on the server", HttpStatus.CONFLICT, "VERSION_CONFLICT");
          }
          return sendSuccess(res, {
            ...updateResult2.rows[0],
            version: newVersion
          });
        }
        if (action === "sync_grades") {
          const parsedPayload = validatePatchPayload(patchSyncGradesSchema, payload, res);
          if (!parsedPayload)
            return;
          const { grades } = parsedPayload;
          const deleteQ = GradeQueries.deleteByApplication(applicationId);
          const ops = [{ text: deleteQ.text, values: deleteQ.values }];
          if (grades.length > 0) {
            const values = [];
            const placeholders = [];
            grades.forEach((g, i) => {
              const offset = i * 3;
              placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
              values.push(applicationId, g.subject_id, g.grade);
            });
            ops.push({
              text: `INSERT INTO application_grades (application_id, subject_id, grade)
             VALUES ${placeholders.join(", ")}
             ON CONFLICT (application_id, subject_id) DO UPDATE SET grade = EXCLUDED.grade`,
              values
            });
          }
          await transaction(ops);
          console.log("[applications] Grades synced:", applicationId);
          return sendSuccess(res, { synced: true });
        }
      }
      const idempotencyKey = normalizeIdempotencyKey(req.headers["x-idempotency-key"]);
      const isSubmission = body.status === "submitted";
      if (isSubmission && idempotencyKey) {
        const cachedResponse = await checkIdempotencyKey(userId, idempotencyKey, `applications/${applicationId}/submit`);
        if (cachedResponse) {
          return sendSuccess(res, cachedResponse);
        }
      }
      const updateQ = ApplicationQueries.update(applicationId, body);
      const updateResult = await query(updateQ.text, updateQ.values);
      if (updateResult.rowCount === 0) {
        return sendError(res, "Update failed", HttpStatus.BAD_REQUEST);
      }
      const responseData = updateResult.rows[0];
      if (isSubmission && idempotencyKey) {
        await storeIdempotencyKey(userId, idempotencyKey, `applications/${applicationId}/submit`, responseData);
      }
      return sendSuccess(res, responseData);
    }
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  } catch (error) {
    return handleError(res, error, "applications/by-id");
  }
}
async function fetchApplicationDetails(id, include) {
  const appResult = await query(`SELECT ${APPLICATION_PAYMENT_METADATA_SELECT}
     FROM applications a
     ${APPLICATION_PAYMENT_METADATA_JOINS}
     WHERE a.id = $1
     LIMIT 1`, [id]);
  if (appResult.rowCount === 0) {
    return null;
  }
  const application = appResult.rows[0];
  const result = { ...application };
  const includes = include ? include.split(",") : ["grades", "documents", "statusHistory", "interview"];
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
  if (includes.includes("interview")) {
    const interviewResult = await query(`SELECT
        id,
        application_id,
        scheduled_at,
        mode,
        location,
        status,
        notes,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM application_interviews
      WHERE application_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1`, [id]);
    result.interview = interviewResult.rows[0] || null;
  }
  return result;
}
async function handleExport(req, res, isAdmin2) {
  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  if (!isAdmin2) {
    return sendError(res, "Admin access required", HttpStatus.FORBIDDEN);
  }
  try {
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
      if (payment === "not_paid") {
        conditions.push(`payment_status IS NULL`);
      } else {
        conditions.push(`payment_status = $${paramIndex}`);
        values.push(payment);
        paramIndex++;
      }
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
      applications.id,
      applications.application_number,
      applications.full_name,
      applications.email,
      applications.phone,
      applications.program,
      applications.intake,
      applications.institution,
      applications.status,
      applications.payment_status,
      COALESCE(applications.application_fee, 0) as application_fee,
      COALESCE(applications.amount, 0) as paid_amount,
      applications.submitted_at,
      applications.created_at,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'subject', COALESCE(s.name, g.subject_id),
            'grade', g.grade
          )
          ORDER BY COALESCE(s.name, g.subject_id)
        )::text
        FROM application_grades g
        LEFT JOIN subjects s ON s.id = g.subject_id
        WHERE g.application_id = applications.id
      ), '[]') as grades_summary,
      COALESCE((
        SELECT COUNT(*)::int
        FROM application_grades g
        WHERE g.application_id = applications.id
      ), 0) as total_subjects,
      COALESCE((
        SELECT SUM(best_five.grade)::int
        FROM (
          SELECT g.grade::int as grade
          FROM application_grades g
          WHERE g.application_id = applications.id
            AND g.grade BETWEEN 1 AND 9
          ORDER BY g.grade ASC
          LIMIT 5
        ) as best_five
      ), 0) as points,
      COALESCE(EXTRACT(YEAR FROM AGE(applications.date_of_birth))::int, 0) as age,
      COALESCE(EXTRACT(DAY FROM NOW() - COALESCE(applications.submitted_at, applications.created_at))::int, 0) as days_since_submission,
      applications.payment_verified_at,
      NULLIF(TRIM(CONCAT_WS(' ', verifier.first_name, verifier.last_name)), '') AS payment_verified_by_name,
      verifier.email AS payment_verified_by_email,
      payment_audit.created_at AS last_payment_audit_at,
      payment_audit.actor_name AS last_payment_audit_by_name,
      payment_audit.actor_email AS last_payment_audit_by_email,
      payment_audit.notes AS last_payment_audit_notes,
      COALESCE(NULLIF(applications.momo_ref, ''), NULLIF(applications.pop_url, '')) AS last_payment_reference
    FROM applications
    LEFT JOIN profiles verifier
      ON verifier.id = applications.payment_verified_by
    LEFT JOIN LATERAL (
      SELECT
        al.created_at::text AS created_at,
        NULLIF(TRIM(CONCAT_WS(' ', actor.first_name, actor.last_name)), '') AS actor_name,
        actor.email AS actor_email,
        COALESCE(
          NULLIF(TRIM(al.changes->>'notes'), ''),
          NULLIF(TRIM(al.changes->>'verification_notes'), ''),
          NULLIF(TRIM(al.changes->>'reason'), '')
        ) AS notes
      FROM audit_logs al
      LEFT JOIN profiles actor
        ON actor.id = al.actor_id
      WHERE al.entity_type = 'payment'
        AND al.entity_id = applications.id
        AND al.action IN ('payment_verified', 'payment_rejected', 'payment_status_updated')
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT 1
    ) payment_audit ON true
    ${whereClause}
    ORDER BY applications.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, values);
    return sendSuccess(res, {
      applications: result.rows,
      page,
      limit,
      hasMore: result.rows.length === limit
    });
  } catch (error) {
    return handleError(res, error, "applications/export");
  }
}
async function handleEmailSlip(req, res, userId, isAdmin2) {
  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
  }
  const {
    applicationId: rawApplicationId,
    application_id: legacyApplicationId,
    recipientEmail,
    email: legacyEmail,
    slipUrl,
    slip_url: legacySlipUrl,
    slipDocumentReference,
    slip_document_reference: legacySlipDocumentReference
  } = req.body || {};
  const applicationId = String(rawApplicationId || legacyApplicationId || "").trim();
  const recipientEmailRaw = String(recipientEmail || legacyEmail || "").trim();
  const normalizedRecipientEmail = recipientEmailRaw.toLowerCase();
  const resolvedSlipUrl = typeof (slipUrl || legacySlipUrl) === "string" ? String(slipUrl || legacySlipUrl).trim() : null;
  const resolvedSlipDocumentReference = typeof (slipDocumentReference || legacySlipDocumentReference) === "string" ? String(slipDocumentReference || legacySlipDocumentReference).trim() : null;
  if (!applicationId || !recipientEmailRaw) {
    return sendError(res, "Missing required fields: applicationId, recipientEmail", HttpStatus.BAD_REQUEST);
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(recipientEmailRaw)) {
    return sendError(res, "Invalid recipient email address", HttpStatus.BAD_REQUEST);
  }
  const appQ = ApplicationQueries.findById(applicationId);
  const appResult = await query(appQ.text, appQ.values);
  if (appResult.rowCount === 0) {
    return sendError(res, "Application not found", HttpStatus.NOT_FOUND);
  }
  const app = appResult.rows[0];
  if (app.user_id !== userId && !isAdmin2) {
    return sendError(res, "Access denied", HttpStatus.FORBIDDEN);
  }
  try {
    if (!isAdmin2) {
      const profileResult = await query(`SELECT email FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
      const accountEmail = profileResult.rows[0]?.email?.trim().toLowerCase() || null;
      const applicationEmail = app.email?.trim().toLowerCase() || null;
      const allowedRecipientEmails = new Set([accountEmail, applicationEmail].filter(Boolean));
      if (!allowedRecipientEmails.has(normalizedRecipientEmail)) {
        return sendError(res, "Recipient email must match your account email", HttpStatus.FORBIDDEN);
      }
    }
    const fallbackDownloadUrl = resolvedSlipUrl || `***REMOVED***/student/application/${applicationId}`;
    const templateData = {
      recipientName: app.full_name || null,
      applicationNumber: app.application_number || null,
      programName: app.program || null,
      actionUrl: fallbackDownloadUrl,
      slipDocumentReference: resolvedSlipDocumentReference || null
    };
    const subject = `Application Slip - ${app.application_number || applicationId}`;
    const body = `Your application slip for ${app.application_number || applicationId} is ready.`;
    const queueResult = await query(`INSERT INTO email_queue (
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
       VALUES ($1, $2, $3, $4, NULL, 'application-slip', $5, 'pending', 5)
       RETURNING id`, [
      recipientEmailRaw,
      app.full_name || null,
      subject,
      body,
      JSON.stringify(templateData)
    ]);
    try {
      await logAuditEvent({
        actor_id: userId,
        action: "application_slip_emailed",
        entity_type: "application",
        entity_id: applicationId,
        changes: {
          recipient: recipientEmailRaw.substring(0, 3) + "***",
          queuedId: queueResult.rows[0]?.id || null
        }
      });
    } catch {}
    return sendSuccess(res, {
      emailed: true,
      queuedId: queueResult.rows[0]?.id || null,
      fallbackDownloadUrl
    });
  } catch (error) {
    return handleError(res, error, "applications/email-slip");
  }
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
