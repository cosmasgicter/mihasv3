/**
 * Sessions API Endpoint
 * 
 * GET/POST /api/sessions?action=list|track|revoke|revoke-all
 * 
 * Manages user device sessions for security and multi-device support.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "../lib/cors";
import { withArcjetProtection } from "../lib/arcjet";
import { handleError, sendSuccess, sendError, HttpStatus } from "../lib/errorHandler";
import { verifyAccessToken } from "../lib/auth/jwt";
import { extractAccessTokenFromCookie, extractBearerToken } from "../lib/auth/cookies";
import {
  getActiveSessions, 
  deactivateSession, 
  deactivateAllSessions,
  deactivateOtherSessions,
  updateActivity,
  parseDeviceInfo,
  createSession
} from "../lib/sessions";
import { pollRealtimeEvents, recordDeliveryLatency } from '../lib/realtimeBroker';
import { requireCsrf } from '../lib/csrf';
import { validateServerEnv } from '../lib/envValidator';
import { validateBody } from '../lib/validation/middleware';
import { revokeSessionBodySchema, revokeAllSessionsBodySchema } from '../lib/validation/sessions';
import { logAuditEvent } from '../lib/auditLogger';

/**
 * Get user ID from request (cookie or bearer token)
 */
async function getUserFromRequest(req: VercelRequest): Promise<{ userId: string; sessionId?: string } | null> {
  // Try cookie first, then Bearer token
  const token = extractAccessTokenFromCookie(req) || extractBearerToken(req);
  if (!token) return null;

  try {
    const payload = await verifyAccessToken(token);
    return { userId: payload.sub, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/**
 * Sessions API Handler
 */
async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCors(req, res)) return;

  // Validate required environment variables (Req 25.3)
  const envResult = validateServerEnv();
  if (!envResult.valid) {
    const details = envResult.errors.map((e) => e.message).join('; ');
    return sendError(res, `Server misconfiguration: ${details}`, HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE');
  }

  // CSRF validation for state-changing requests
  if (await requireCsrf(req, res)) return;

  const action = req.query.action as string;

  try {
    // All session actions require authentication
    const auth = await getUserFromRequest(req);
    if (!auth) {
      return sendError(res, 'Authentication required', HttpStatus.UNAUTHORIZED);
    }

    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    switch (action) {
      case 'list':
        return await handleList(req, res, auth.userId, auth.sessionId);
      case 'track':
        return await handleTrack(req, res, auth.userId, ipAddress, userAgent);
      case 'revoke':
        return await handleRevoke(req, res, auth.userId, ipAddress, userAgent);
      case 'revoke-all':
        return await handleRevokeAll(req, res, auth.userId, auth.sessionId, ipAddress, userAgent);
      case 'connect':
        return await handleConnect(req, res, auth.userId);
      case 'poll':
        return await handlePoll(req, res, auth.userId);
      default:
        return sendError(res, 'Invalid action. Use: list, track, revoke, revoke-all, connect, poll', HttpStatus.BAD_REQUEST);
    }
  } catch (error) {
    return handleError(res, error, 'sessions');
  }
}

async function handleConnect(req: VercelRequest, res: VercelResponse, userId: string) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const events = pollRealtimeEvents(userId);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    for (const event of events) {
      recordDeliveryLatency(event.created_at);
      res.write(`id: ${event.event_id}\n`);
      res.write(`event: ${event.event_type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    res.write(`event: ping\ndata: ${JSON.stringify({ created_at: new Date().toISOString() })}\n\n`);
    res.end();
  } catch (error) {
    return handleError(res, error, 'sessions/connect');
  }
}

async function handlePoll(req: VercelRequest, res: VercelResponse, userId: string) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const lastEventId = req.query.lastEventId as string | undefined;
  const events = pollRealtimeEvents(userId, lastEventId);
  events.forEach((event) => recordDeliveryLatency(event.created_at));

  return sendSuccess(res, { events });
}

/**
 * List active sessions for the user
 * GET /api/sessions?action=list
 */
async function handleList(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  currentSessionId?: string
) {
  if (req.method !== 'GET') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const result = await getActiveSessions(userId, currentSessionId);
    return sendSuccess(res, { sessions: result.sessions, count: result.count });
  } catch (error) {
    return handleError(res, error, 'sessions/list');
  }
}

/**
 * Track/create a new session
 * POST /api/sessions?action=track
 */
async function handleTrack(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  try {
    const deviceInfo = parseDeviceInfo(userAgent);
    const session = await createSession({
      userId,
      deviceInfo,
      ipAddress,
      userAgent,
    });

    return sendSuccess(res, { session }, HttpStatus.CREATED);
  } catch (error) {
    return handleError(res, error, 'sessions/track');
  }
}

/**
 * Revoke a specific session
 * POST /api/sessions?action=revoke
 * Body: { sessionId: string }
 */
async function handleRevoke(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  ipAddress: string | null,
  userAgent: string | null
) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(revokeSessionBodySchema, req, res);
  if (!parsed) return;

  const { sessionId } = parsed;

  try {
    const result = await deactivateSession(sessionId, userId, ipAddress, userAgent);

    await logAuditEvent({
      actor_id: userId,
      action: 'session_revoke',
      entity_type: 'session',
      entity_id: sessionId,
      changes: { revoked: result.success },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return sendSuccess(res, { revoked: result.success, sessionId: result.sessionId });
  } catch (error) {
    return handleError(res, error, 'sessions/revoke');
  }
}

/**
 * Revoke all sessions (or all except current)
 * POST /api/sessions?action=revoke-all
 * Body: { keepCurrent?: boolean }
 */
async function handleRevokeAll(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
  currentSessionId: string | undefined,
  ipAddress: string | null,
  userAgent: string | null
) {
  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', HttpStatus.METHOD_NOT_ALLOWED);
  }

  const parsed = validateBody(revokeAllSessionsBodySchema, req, res);
  if (!parsed) return;

  const { keepCurrent } = parsed;

  try {
    let result;
    if (keepCurrent && currentSessionId) {
      result = await deactivateOtherSessions(userId, currentSessionId, ipAddress, userAgent);
    } else {
      result = await deactivateAllSessions(userId, ipAddress, userAgent);
    }

    await logAuditEvent({
      actor_id: userId,
      action: keepCurrent ? 'session_revoke_others' : 'session_revoke_all',
      entity_type: 'session',
      entity_id: userId,
      changes: { revoked_count: result.deactivatedCount, keep_current: !!keepCurrent },
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return sendSuccess(res, {
      revoked: result.success,
      count: result.deactivatedCount,
      sessionIds: result.sessionIds
    });
  } catch (error) {
    return handleError(res, error, 'sessions/revoke-all');
  }
}

// Export with Arcjet protection (session rate limit: 30 requests per 10 minutes)
export default withArcjetProtection(handler, 'session');
