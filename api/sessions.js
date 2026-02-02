import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

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
var SessionQueries = {
  create: (id, userId, deviceInfo, ipAddress, userAgent) => ({
    text: `
      INSERT INTO device_sessions (
        id, user_id, device_info, ip_address, user_agent,
        is_active, last_activity, created_at, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        true, NOW(), NOW(), NOW() + INTERVAL '30 days'
      )
      RETURNING id, user_id, is_active, last_activity, created_at, expires_at
    `,
    values: [id, userId, JSON.stringify(deviceInfo), ipAddress, userAgent]
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
      WHERE user_id = $1 AND is_active = true
      ORDER BY last_activity DESC
    `,
    values: [userId]
  }),
  countActiveForUser: (userId) => ({
    text: `
      SELECT COUNT(*) as count
      FROM device_sessions
      WHERE user_id = $1 AND is_active = true
    `,
    values: [userId]
  }),
  deactivateExpired: () => ({
    text: `
      UPDATE device_sessions
      SET is_active = false
      WHERE is_active = true 
        AND (expires_at < NOW() OR last_activity < NOW() - INTERVAL '30 days')
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
var AuditQueries = {
  log: (input) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id, created_at
    `,
    values: [
      input.actor_id,
      input.action,
      input.entity_type,
      input.entity_id,
      input.changes ? JSON.stringify(input.changes) : null,
      input.ip_address || null,
      input.user_agent || null
    ]
  }),
  logAuthEvent: (actorId, action, success, ipAddress, userAgent, additionalInfo) => ({
    text: `
      INSERT INTO audit_logs (
        actor_id, action, entity_type, entity_id,
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'user', $1, $3, $4, $5, NOW())
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
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, 'authorization_failure', $2, $3, $4, $5, $6, NOW())
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
        changes, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, 'session', $3, $4, $5, $6, NOW())
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
      WHERE created_at < NOW() - INTERVAL '1 day' * $1
      RETURNING id
    `,
    values: [daysOld]
  })
};

// api-src/sessions.ts
function generateSessionId() {
  return crypto.randomUUID();
}
function parseDeviceInfo(userAgent) {
  if (!userAgent) {
    return {
      browser: "Unknown",
      os: "Unknown",
      device_type: "unknown",
      is_mobile: false
    };
  }
  const ua = userAgent.toLowerCase();
  let browser = "Unknown";
  let browser_version = "";
  if (ua.includes("firefox")) {
    browser = "Firefox";
    const match = userAgent.match(/Firefox\/(\d+)/i);
    browser_version = match ? match[1] : "";
  } else if (ua.includes("edg/")) {
    browser = "Edge";
    const match = userAgent.match(/Edg\/(\d+)/i);
    browser_version = match ? match[1] : "";
  } else if (ua.includes("chrome")) {
    browser = "Chrome";
    const match = userAgent.match(/Chrome\/(\d+)/i);
    browser_version = match ? match[1] : "";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browser = "Safari";
    const match = userAgent.match(/Version\/(\d+)/i);
    browser_version = match ? match[1] : "";
  } else if (ua.includes("opera") || ua.includes("opr/")) {
    browser = "Opera";
    const match = userAgent.match(/(?:Opera|OPR)\/(\d+)/i);
    browser_version = match ? match[1] : "";
  }
  let os = "Unknown";
  let os_version = "";
  if (ua.includes("windows")) {
    os = "Windows";
    if (ua.includes("windows nt 10"))
      os_version = "10";
    else if (ua.includes("windows nt 11"))
      os_version = "11";
    else if (ua.includes("windows nt 6.3"))
      os_version = "8.1";
    else if (ua.includes("windows nt 6.2"))
      os_version = "8";
    else if (ua.includes("windows nt 6.1"))
      os_version = "7";
  } else if (ua.includes("mac os x")) {
    os = "macOS";
    const match = userAgent.match(/Mac OS X (\d+[._]\d+)/i);
    os_version = match ? match[1].replace("_", ".") : "";
  } else if (ua.includes("linux")) {
    os = "Linux";
    if (ua.includes("ubuntu"))
      os_version = "Ubuntu";
    else if (ua.includes("fedora"))
      os_version = "Fedora";
    else if (ua.includes("debian"))
      os_version = "Debian";
  } else if (ua.includes("android")) {
    os = "Android";
    const match = userAgent.match(/Android (\d+)/i);
    os_version = match ? match[1] : "";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
    const match = userAgent.match(/OS (\d+)/i);
    os_version = match ? match[1] : "";
  }
  let device_type = "desktop";
  const is_mobile = ua.includes("mobile") || ua.includes("android") || ua.includes("iphone") || ua.includes("ipod");
  const is_tablet = ua.includes("tablet") || ua.includes("ipad");
  if (is_tablet) {
    device_type = "tablet";
  } else if (is_mobile) {
    device_type = "mobile";
  }
  return {
    browser,
    browser_version,
    os,
    os_version,
    device_type,
    is_mobile: is_mobile || is_tablet
  };
}
async function createSession(input) {
  const { userId, deviceInfo, ipAddress, userAgent } = input;
  const sessionId = generateSessionId();
  const createQuery = SessionQueries.create(sessionId, userId, deviceInfo, ipAddress, userAgent);
  const result = await query(createQuery.text, createQuery.values);
  if (result.rows.length === 0) {
    throw new Error("Failed to create session");
  }
  const session = result.rows[0];
  const auditQuery = AuditQueries.logSessionEvent(userId, "session_create", sessionId, ipAddress, userAgent, {
    device_type: deviceInfo.device_type,
    browser: deviceInfo.browser,
    os: deviceInfo.os
  });
  query(auditQuery.text, auditQuery.values).catch((err) => {
    console.error("[SessionManager] Failed to log session creation:", err.message);
  });
  return {
    id: session.id,
    userId: session.user_id,
    isActive: session.is_active,
    lastActivity: new Date(session.last_activity),
    createdAt: new Date(session.created_at),
    expiresAt: new Date(session.expires_at)
  };
}
async function updateActivity(sessionId) {
  const updateQuery = SessionQueries.updateActivity(sessionId);
  const result = await query(updateQuery.text, updateQuery.values);
  return result.rowCount > 0;
}
async function deactivateSession(sessionId, userId, ipAddress = null, userAgent = null) {
  const deactivateQuery = SessionQueries.deactivate(sessionId);
  const result = await query(deactivateQuery.text, deactivateQuery.values);
  const success = result.rowCount > 0;
  if (success) {
    const auditQuery = AuditQueries.logSessionEvent(userId, "session_revoke", sessionId, ipAddress, userAgent);
    query(auditQuery.text, auditQuery.values).catch((err) => {
      console.error("[SessionManager] Failed to log session deactivation:", err.message);
    });
  }
  return {
    success,
    sessionId
  };
}
async function deactivateAllSessions(userId, ipAddress = null, userAgent = null) {
  const deactivateQuery = SessionQueries.deactivateAllForUser(userId);
  const result = await query(deactivateQuery.text, deactivateQuery.values);
  const sessionIds = result.rows.map((row) => row.id);
  const deactivatedCount = result.rowCount;
  if (deactivatedCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(userId, "session_revoke_all", null, ipAddress, userAgent, { deactivated_count: deactivatedCount });
    query(auditQuery.text, auditQuery.values).catch((err) => {
      console.error("[SessionManager] Failed to log session revoke-all:", err.message);
    });
  }
  return {
    success: true,
    deactivatedCount,
    sessionIds
  };
}
async function getActiveSessions(userId, currentSessionId) {
  const getQuery = SessionQueries.getActiveForUser(userId);
  const result = await query(getQuery.text, getQuery.values);
  const sessions = result.rows.map((row) => {
    let deviceInfo;
    if (typeof row.device_info === "string") {
      try {
        deviceInfo = JSON.parse(row.device_info);
      } catch {
        deviceInfo = { browser: "Unknown", os: "Unknown", device_type: "unknown" };
      }
    } else {
      deviceInfo = row.device_info || { browser: "Unknown", os: "Unknown", device_type: "unknown" };
    }
    return {
      id: row.id,
      user_id: row.user_id,
      device_info: deviceInfo,
      ip_address: row.ip_address,
      last_activity: new Date(row.last_activity),
      created_at: new Date(row.created_at),
      is_current: currentSessionId ? row.id === currentSessionId : undefined
    };
  });
  return {
    sessions,
    count: sessions.length
  };
}
async function deactivateOtherSessions(userId, currentSessionId, ipAddress = null, userAgent = null) {
  const deactivateQuery = SessionQueries.deactivateAllExcept(userId, currentSessionId);
  const result = await query(deactivateQuery.text, deactivateQuery.values);
  const sessionIds = result.rows.map((row) => row.id);
  const deactivatedCount = result.rowCount;
  if (deactivatedCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(userId, "session_revoke_all", currentSessionId, ipAddress, userAgent, {
      deactivated_count: deactivatedCount,
      kept_session: currentSessionId
    });
    query(auditQuery.text, auditQuery.values).catch((err) => {
      console.error("[SessionManager] Failed to log session revoke-others:", err.message);
    });
  }
  return {
    success: true,
    deactivatedCount,
    sessionIds
  };
}
async function cleanupExpiredSessions() {
  const cleanupQuery = SessionQueries.deactivateExpired();
  const result = await query(cleanupQuery.text, cleanupQuery.values);
  const sessionIds = result.rows.map((row) => row.id);
  const deactivatedCount = result.rowCount;
  if (deactivatedCount > 0) {
    console.log(`[SessionManager] Cleaned up ${deactivatedCount} expired sessions`);
  }
  return {
    success: true,
    deactivatedCount,
    sessionIds
  };
}
async function isSessionValid(sessionId) {
  const checkQuery = SessionQueries.isValid(sessionId);
  const result = await query(checkQuery.text, checkQuery.values);
  return result.rows.length > 0 && result.rows[0].is_valid === true;
}
async function getSessionById(sessionId) {
  const getQuery = SessionQueries.findById(sessionId);
  const result = await query(getQuery.text, getQuery.values);
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  let deviceInfo;
  if (typeof row.device_info === "string") {
    try {
      deviceInfo = JSON.parse(row.device_info);
    } catch {
      deviceInfo = { browser: "Unknown", os: "Unknown", device_type: "unknown" };
    }
  } else {
    deviceInfo = row.device_info || { browser: "Unknown", os: "Unknown", device_type: "unknown" };
  }
  return {
    id: row.id,
    user_id: row.user_id,
    device_info: deviceInfo,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    is_active: row.is_active,
    last_activity: new Date(row.last_activity),
    created_at: new Date(row.created_at),
    expires_at: new Date(row.expires_at)
  };
}
async function countActiveSessions(userId) {
  const countQuery = SessionQueries.countActiveForUser(userId);
  const result = await query(countQuery.text, countQuery.values);
  if (result.rows.length === 0) {
    return 0;
  }
  const count = result.rows[0].count;
  return typeof count === "string" ? parseInt(count, 10) : count;
}
async function extendSessionExpiration(sessionId, days = 30) {
  const extendQuery = SessionQueries.extendExpiration(sessionId, days);
  const result = await query(extendQuery.text, extendQuery.values);
  return result.rowCount > 0;
}
var sessions_default = {
  createSession,
  updateActivity,
  deactivateSession,
  deactivateAllSessions,
  getActiveSessions,
  deactivateOtherSessions,
  cleanupExpiredSessions,
  isSessionValid,
  getSessionById,
  countActiveSessions,
  extendSessionExpiration,
  parseDeviceInfo
};
export {
  updateActivity,
  parseDeviceInfo,
  isSessionValid,
  getSessionById,
  getActiveSessions,
  extendSessionExpiration,
  sessions_default as default,
  deactivateSession,
  deactivateOtherSessions,
  deactivateAllSessions,
  createSession,
  countActiveSessions,
  cleanupExpiredSessions
};
