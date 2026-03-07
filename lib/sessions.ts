/**
 * Session Manager Module
 * 
 * Provides session management functionality for the custom auth system.
 * Handles device session tracking, activity updates, and session invalidation.
 * 
 * Requirements:
 * - 5.1: Create session record with device info and IP on login
 * - 5.2: Deactivate current session on logout
 * - 5.3: Invalidate all sessions when refresh token is revoked
 * - 5.4: Track last activity timestamp for each session
 * - 5.5: Auto-deactivate sessions inactive for 30 days
 * - 5.6: Allow users to view their active sessions
 * - 5.7: Allow users to deactivate sessions on other devices
 * - 5.8: Log all session events to audit_logs table
 */

import { query } from './db';
import { SessionQueries, AuditQueries, DeviceInfo, SessionRecord, SessionDisplayRecord } from './queries';

// Types
export interface CreateSessionInput {
  userId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface CreateSessionResult {
  id: string;
  userId: string;
  isActive: boolean;
  lastActivity: Date;
  createdAt: Date;
  expiresAt: Date;
}

export interface DeactivateSessionResult {
  success: boolean;
  sessionId: string;
}

export interface DeactivateAllSessionsResult {
  success: boolean;
  deactivatedCount: number;
  sessionIds: string[];
}

export interface GetActiveSessionsResult {
  sessions: SessionDisplayRecord[];
  count: number;
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

export function parseDeviceInfo(userAgent: string | null): DeviceInfo {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', device_type: 'unknown', is_mobile: false };
  }

  const ua = userAgent.toLowerCase();
  
  let browser = 'Unknown';
  if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';

  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac os x')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

  const is_mobile = ua.includes('mobile') || ua.includes('android') || ua.includes('iphone');
  const device_type: DeviceInfo['device_type'] = ua.includes('tablet') || ua.includes('ipad') ? 'tablet' : is_mobile ? 'mobile' : 'desktop';

  return { browser, os, device_type, is_mobile };
}

export async function createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
  const { userId, deviceInfo, ipAddress, userAgent } = input;
  const sessionId = generateSessionId();

  const createQuery = SessionQueries.create(sessionId, userId, deviceInfo, ipAddress, userAgent);
  const result = await query<{
    id: string; user_id: string; is_active: boolean;
    last_activity: Date; created_at: Date; expires_at: Date;
  }>(createQuery.text, createQuery.values);

  if (result.rows.length === 0) throw new Error('Failed to create session');

  const session = result.rows[0];
  
  // Fire and forget audit log
  const auditQuery = AuditQueries.logSessionEvent(userId, 'session_create', sessionId, ipAddress, userAgent, { device_type: deviceInfo.device_type, browser: deviceInfo.browser, os: deviceInfo.os });
  query(auditQuery.text, auditQuery.values).catch(() => {});

  return {
    id: session.id, userId: session.user_id, isActive: session.is_active,
    lastActivity: new Date(session.last_activity), createdAt: new Date(session.created_at), expiresAt: new Date(session.expires_at),
  };
}

export async function getActiveSessions(userId: string, currentSessionId?: string): Promise<GetActiveSessionsResult> {
  const getQuery = SessionQueries.getActiveForUser(userId);
  const result = await query<{
    id: string; user_id: string; device_info: string | DeviceInfo;
    ip_address: string | null; last_activity: Date; created_at: Date;
  }>(getQuery.text, getQuery.values);

  const sessions: SessionDisplayRecord[] = result.rows.map(row => {
    let deviceInfo: DeviceInfo;
    if (typeof row.device_info === 'string') {
      try { deviceInfo = JSON.parse(row.device_info); } catch { deviceInfo = { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' }; }
    } else {
      deviceInfo = row.device_info || { browser: 'Unknown', os: 'Unknown', device_type: 'unknown' };
    }
    return {
      id: row.id, user_id: row.user_id, device_info: deviceInfo, ip_address: row.ip_address,
      last_activity: new Date(row.last_activity), created_at: new Date(row.created_at),
      is_current: currentSessionId ? row.id === currentSessionId : undefined,
    };
  });

  return { sessions, count: sessions.length };
}

export async function deactivateSession(sessionId: string, userId: string, ipAddress: string | null = null, userAgent: string | null = null): Promise<DeactivateSessionResult> {
  const deactivateQuery = SessionQueries.deactivate(sessionId);
  const result = await query<{ id: string }>(deactivateQuery.text, deactivateQuery.values);
  const success = result.rowCount > 0;

  if (success) {
    const auditQuery = AuditQueries.logSessionEvent(userId, 'session_revoke', sessionId, ipAddress, userAgent);
    query(auditQuery.text, auditQuery.values).catch(() => {});
  }

  return { success, sessionId };
}

export async function deactivateAllSessions(userId: string, ipAddress: string | null = null, userAgent: string | null = null): Promise<DeactivateAllSessionsResult> {
  const deactivateQuery = SessionQueries.deactivateAllForUser(userId);
  const result = await query<{ id: string }>(deactivateQuery.text, deactivateQuery.values);
  const sessionIds = result.rows.map(row => row.id);

  if (result.rowCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(userId, 'session_revoke_all', null, ipAddress, userAgent, { deactivated_count: result.rowCount });
    query(auditQuery.text, auditQuery.values).catch(() => {});
  }

  return { success: true, deactivatedCount: result.rowCount, sessionIds };
}

export async function deactivateOtherSessions(userId: string, currentSessionId: string, ipAddress: string | null = null, userAgent: string | null = null): Promise<DeactivateAllSessionsResult> {
  const deactivateQuery = SessionQueries.deactivateAllExcept(userId, currentSessionId);
  const result = await query<{ id: string }>(deactivateQuery.text, deactivateQuery.values);
  const sessionIds = result.rows.map(row => row.id);

  if (result.rowCount > 0) {
    const auditQuery = AuditQueries.logSessionEvent(userId, 'session_revoke_all', currentSessionId, ipAddress, userAgent, { deactivated_count: result.rowCount, kept_session: currentSessionId });
    query(auditQuery.text, auditQuery.values).catch(() => {});
  }

  return { success: true, deactivatedCount: result.rowCount, sessionIds };
}

export async function updateActivity(sessionId: string): Promise<boolean> {
  const updateQuery = SessionQueries.updateActivity(sessionId);
  const result = await query<{ id: string }>(updateQuery.text, updateQuery.values);
  return result.rowCount > 0;
}

export async function isSessionActive(userId: string, sessionId: string): Promise<boolean> {
  const result = await query<{ id: string }>(
    `SELECT id
     FROM device_sessions
     WHERE id = $1
       AND user_id = $2
       AND is_active = true
       AND expires_at > NOW()
     LIMIT 1`,
    [sessionId, userId]
  );

  return result.rowCount > 0;
}
