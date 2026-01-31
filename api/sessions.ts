/**
 * Sessions API
 * 
 * Provides session management and realtime endpoints for users.
 * Protected by Arcjet with 30 requests per 10 minutes rate limit.
 * 
 * Endpoints:
 * - POST /api/sessions?action=track - Track device session activity
 * - GET /api/sessions?action=list - List user's active sessions
 * - POST /api/sessions?action=revoke - Revoke a specific session
 * - POST /api/sessions?action=revoke-all - Revoke all sessions except current
 * - GET /api/sessions?action=connect - SSE connection for real-time updates
 * - GET /api/sessions?action=poll - Polling fallback for real-time updates
 * 
 * Requirements:
 * - 5.6: THE Session_Manager SHALL allow users to view their active sessions
 * - 5.7: THE Session_Manager SHALL allow users to deactivate sessions on other devices
 * - 7.1: SSE for server-to-client streaming
 * - 7.2: Polling fallback for graceful degradation
 * - 7.10: Zero Supabase Realtime dependencies
 * 
 * Security:
 * - All endpoints require authentication
 * - Arcjet protection with 30/10min rate limit
 * - Users can only manage their own sessions
 * - All session events are logged to audit_logs
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withArcjetProtection } from "./_lib/arcjet";
import { requireAuth, getAuthUser, AuthenticationError, AuthorizationError } from "./_lib/auth/middleware";
import { handleCors } from "./_lib/cors";
import { sendSuccess, sendError, HttpStatus } from "./_lib/errorHandler";
import { handleSSEConnection, getEventsForPolling } from "./_lib/realtime";
import {
  getActiveSessions,
  deactivateSession,
  deactivateOtherSessions,
  deactivateAllSessions,
  updateActivity,
  getSessionById,
  parseDeviceInfo,
  createSession,
} from "./_lib/sessions";

/**
 * Request validation schemas
 */
const revokeSchema = z.object({
  sessionId: z.string().min(36).max(36),
});

/**
 * UUID regex pattern for validation
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Extract IP address from request
 */
function extractIpAddress(req: VercelRequest): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  const realIp = req.headers["x-real-ip"];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }
  return req.socket?.remoteAddress || null;
}

/**
 * Extract user agent from request
 */
function extractUserAgent(req: VercelRequest): string | null {
  const userAgent = req.headers["user-agent"];
  return userAgent ? (Array.isArray(userAgent) ? userAgent[0] : userAgent) : null;
}

/**
 * Mask IP address for privacy
 */
function maskIpAddress(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`;
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:****`;
    }
  }
  return "x.x.x.x";
}

/**
 * Main handler with Arcjet protection
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (handleCors(req, res)) return;

  if (req.method === "HEAD") {
    res.status(200).end();
    return;
  }

  const action = req.query.action as string;

  try {
    switch (action) {
      case "track":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleTrack(req, res);
        return;

      case "list":
        if (req.method !== "GET") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleList(req, res);
        return;

      case "revoke":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleRevoke(req, res);
        return;

      case "revoke-all":
        if (req.method !== "POST") {
          sendError(res, "Method not allowed", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleRevokeAll(req, res);
        return;

      case "connect":
        if (req.method !== "GET") {
          sendError(res, "SSE connections require GET method", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handleConnect(req, res);
        return;

      case "poll":
        if (req.method !== "GET") {
          sendError(res, "Polling requires GET method", HttpStatus.METHOD_NOT_ALLOWED);
          return;
        }
        await handlePoll(req, res);
        return;

      default:
        sendError(res, "Invalid action. Valid actions: track, list, revoke, revoke-all, connect, poll", HttpStatus.BAD_REQUEST);
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
    console.error("[sessions] Unhandled error:", error);
    sendError(res, "Internal server error", HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

/**
 * Track session activity handler
 */
async function handleTrack(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requireAuth(req);
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  
  try {
    const sessionId = req.body?.sessionId;
    
    if (sessionId) {
      if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) {
        sendError(res, "Invalid session ID format", HttpStatus.BAD_REQUEST, "INVALID_SESSION_ID");
        return;
      }
      
      const session = await getSessionById(sessionId);
      
      if (!session) {
        sendError(res, "Session not found", HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND");
        return;
      }
      
      if (session.user_id !== user.userId) {
        sendError(res, "Session not found", HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND");
        return;
      }
      
      if (!session.is_active) {
        sendError(res, "Session is no longer active", 410, "SESSION_INACTIVE");
        return;
      }
      
      const updated = await updateActivity(sessionId);
      
      if (!updated) {
        sendError(res, "Failed to update session activity", HttpStatus.INTERNAL_SERVER_ERROR, "UPDATE_FAILED");
        return;
      }
      
      console.log("[sessions] Session activity updated:", sessionId.substring(0, 8) + "...");
      sendSuccess(res, { sessionId, message: "Session activity updated" });
    } else {
      const deviceInfo = parseDeviceInfo(userAgent);
      const newSession = await createSession({
        userId: user.userId,
        deviceInfo,
        ipAddress,
        userAgent,
      });
      
      console.log("[sessions] New session created:", newSession.id.substring(0, 8) + "...");
      sendSuccess(res, { sessionId: newSession.id, message: "Session created", isNew: true }, HttpStatus.CREATED);
    }
  } catch (error) {
    console.error("[sessions] Track error:", error);
    sendError(res, "Failed to track session", HttpStatus.INTERNAL_SERVER_ERROR, "TRACK_FAILED");
  }
}

/**
 * List active sessions handler
 * Requirement 5.6: Allow users to view their active sessions
 */
async function handleList(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requireAuth(req);
  
  try {
    const currentSessionId = req.query.currentSessionId as string | undefined;
    const result = await getActiveSessions(user.userId, currentSessionId);
    
    const sessions = result.sessions.map((session) => ({
      id: session.id,
      deviceInfo: {
        browser: session.device_info.browser || "Unknown",
        browserVersion: session.device_info.browser_version,
        os: session.device_info.os || "Unknown",
        osVersion: session.device_info.os_version,
        deviceType: session.device_info.device_type || "unknown",
        isMobile: session.device_info.is_mobile || false,
      },
      ipAddress: session.ip_address ? maskIpAddress(session.ip_address) : null,
      lastActivity: session.last_activity.toISOString(),
      createdAt: session.created_at.toISOString(),
      isCurrent: session.is_current || false,
    }));
    
    console.log("[sessions] Listed", result.count, "active sessions for user:", user.userId.substring(0, 8) + "...");
    sendSuccess(res, { sessions, count: result.count });
  } catch (error) {
    console.error("[sessions] List error:", error);
    sendError(res, "Failed to list sessions", HttpStatus.INTERNAL_SERVER_ERROR, "LIST_FAILED");
  }
}

/**
 * Revoke specific session handler
 * Requirement 5.7: Allow users to deactivate sessions on other devices
 */
async function handleRevoke(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requireAuth(req);
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  
  try {
    const parseResult = revokeSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendError(res, "Invalid session ID format", HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
      return;
    }
    
    const { sessionId } = parseResult.data;
    
    if (!UUID_PATTERN.test(sessionId)) {
      sendError(res, "Invalid session ID format", HttpStatus.BAD_REQUEST, "INVALID_SESSION_ID");
      return;
    }
    
    const session = await getSessionById(sessionId);
    
    if (!session) {
      sendError(res, "Session not found", HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND");
      return;
    }
    
    if (session.user_id !== user.userId) {
      sendError(res, "Session not found", HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND");
      return;
    }
    
    if (!session.is_active) {
      sendError(res, "Session is already inactive", HttpStatus.CONFLICT, "SESSION_ALREADY_INACTIVE");
      return;
    }
    
    const result = await deactivateSession(sessionId, user.userId, ipAddress, userAgent);
    
    if (!result.success) {
      sendError(res, "Failed to revoke session", HttpStatus.INTERNAL_SERVER_ERROR, "REVOKE_FAILED");
      return;
    }
    
    console.log("[sessions] Session revoked:", sessionId.substring(0, 8) + "... by user:", user.userId.substring(0, 8) + "...");
    sendSuccess(res, { sessionId, message: "Session revoked successfully" });
  } catch (error) {
    console.error("[sessions] Revoke error:", error);
    sendError(res, "Failed to revoke session", HttpStatus.INTERNAL_SERVER_ERROR, "REVOKE_FAILED");
  }
}

/**
 * Revoke all sessions handler
 * Requirement 5.7: Allow users to deactivate sessions on other devices
 */
async function handleRevokeAll(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await requireAuth(req);
  const ipAddress = extractIpAddress(req);
  const userAgent = extractUserAgent(req);
  
  try {
    const currentSessionId = req.body?.currentSessionId;
    
    if (currentSessionId) {
      if (typeof currentSessionId !== "string" || !UUID_PATTERN.test(currentSessionId)) {
        sendError(res, "Invalid current session ID format", HttpStatus.BAD_REQUEST, "INVALID_SESSION_ID");
        return;
      }
      
      const currentSession = await getSessionById(currentSessionId);
      
      if (!currentSession || currentSession.user_id !== user.userId) {
        sendError(res, "Current session not found", HttpStatus.NOT_FOUND, "SESSION_NOT_FOUND");
        return;
      }
      
      const result = await deactivateOtherSessions(user.userId, currentSessionId, ipAddress, userAgent);
      
      console.log(
        "[sessions] Revoked", result.deactivatedCount, "sessions for user:",
        user.userId.substring(0, 8) + "..., kept session:", currentSessionId.substring(0, 8) + "..."
      );
      
      sendSuccess(res, {
        deactivatedCount: result.deactivatedCount,
        keptSessionId: currentSessionId,
        message: `Revoked ${result.deactivatedCount} session(s), kept current session`,
      });
    } else {
      const result = await deactivateAllSessions(user.userId, ipAddress, userAgent);
      
      console.log(
        "[sessions] Revoked ALL", result.deactivatedCount, "sessions for user:",
        user.userId.substring(0, 8) + "..."
      );
      
      sendSuccess(res, {
        deactivatedCount: result.deactivatedCount,
        message: `Revoked all ${result.deactivatedCount} session(s)`,
      });
    }
  } catch (error) {
    console.error("[sessions] Revoke-all error:", error);
    sendError(res, "Failed to revoke sessions", HttpStatus.INTERNAL_SERVER_ERROR, "REVOKE_ALL_FAILED");
  }
}

/**
 * Export handler with Arcjet protection
 * Rate limit: 30 requests per 10 minutes (session route type)
 * Requirement 2.2: Arcjet protection on /api/sessions/*
 */
export default withArcjetProtection(handler, "session");

/**
 * Handle SSE connection request
 * Requirement 7.1: SSE for server-to-client streaming
 * 
 * Establishes a Server-Sent Events connection for real-time updates.
 * Client should use EventSource API which handles automatic reconnection.
 * 
 * @example
 * // Client-side usage
 * const eventSource = new EventSource('/api/sessions?action=connect');
 * eventSource.onmessage = (event) => console.log(event.data);
 */
async function handleConnect(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await getAuthUser(req);
  if (!user) {
    sendError(res, "Authentication required for realtime access", HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED");
    return;
  }

  // Check Accept header
  const accept = req.headers.accept || '';
  if (!accept.includes('text/event-stream')) {
    sendError(res, "Client must accept text/event-stream for SSE connections", HttpStatus.NOT_ACCEPTABLE, "INVALID_ACCEPT_HEADER");
    return;
  }

  // Establish SSE connection
  await handleSSEConnection(req, res, user.id);
}

/**
 * Handle polling request
 * Requirement 7.2: Polling fallback for graceful degradation
 * 
 * Returns events since the last received event ID.
 * Use this as a fallback when SSE is not available.
 * 
 * @example
 * // Client-side usage
 * const response = await fetch('/api/sessions?action=poll&lastEventId=123');
 * const { data: { events } } = await response.json();
 */
async function handlePoll(req: VercelRequest, res: VercelResponse): Promise<void> {
  const user = await getAuthUser(req);
  if (!user) {
    sendError(res, "Authentication required for realtime access", HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED");
    return;
  }

  const lastEventId = req.query.lastEventId as string | undefined;

  // Get events since lastEventId
  const events = getEventsForPolling(user.id, lastEventId);

  sendSuccess(res, {
    events,
    count: events.length,
    lastEventId: events.length > 0 ? events[events.length - 1].id : lastEventId,
  });
}
