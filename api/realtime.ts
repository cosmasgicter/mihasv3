/**
 * Realtime API Endpoint
 * 
 * Provides Server-Sent Events (SSE) and polling fallback for real-time updates.
 * Zero Supabase Realtime dependencies - uses Bun-native SSE implementation.
 * 
 * Actions:
 * - connect: Establish SSE connection for real-time updates
 * - poll: Polling fallback for clients that can't use SSE
 * 
 * Requirements:
 * - 7.10: Zero Supabase Realtime dependencies
 * - 7.1: SSE for server-to-client streaming
 * - 7.2: Polling fallback for graceful degradation
 * 
 * Security:
 * - All actions require authentication
 * - Events are filtered by user ID
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCors } from './_lib/cors';
import { getAuthUser } from './_lib/auth/middleware';
import { handleSSEConnection, getEventsForPolling } from './_lib/realtime';
import { handleError, sendSuccess, sendError, AuthError, HttpStatus, ErrorCode } from './_lib/errorHandler';

/**
 * Realtime API Handler
 * 
 * Query Parameters:
 * - action: 'connect' | 'poll'
 * - lastEventId: (optional) Last received event ID for polling replay
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // Handle CORS preflight
  if (handleCors(req, res)) return;

  const action = req.query.action as string;

  try {
    // All realtime actions require authentication
    const user = await getAuthUser(req);
    if (!user) {
      throw AuthError.authentication('Authentication required for realtime access');
    }

    switch (action) {
      case 'connect':
        await handleConnect(req, res, user.id);
        break;

      case 'poll':
        await handlePoll(req, res, user.id);
        break;

      default:
        sendError(
          res,
          'Invalid action. Use: connect, poll',
          HttpStatus.BAD_REQUEST,
          ErrorCode.VALIDATION_ERROR
        );
    }
  } catch (error) {
    handleError(res, error, 'Realtime API');
  }
}

/**
 * Handle SSE connection request
 * 
 * Establishes a Server-Sent Events connection for real-time updates.
 * Client should use EventSource API which handles automatic reconnection.
 * 
 * @example
 * // Client-side usage
 * const eventSource = new EventSource('/api/realtime?action=connect');
 * eventSource.onmessage = (event) => console.log(event.data);
 */
async function handleConnect(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  // Only GET requests for SSE
  if (req.method !== 'GET') {
    sendError(
      res,
      'SSE connections require GET method',
      HttpStatus.METHOD_NOT_ALLOWED,
      ErrorCode.VALIDATION_ERROR
    );
    return;
  }

  // Check Accept header
  const accept = req.headers.accept || '';
  if (!accept.includes('text/event-stream')) {
    sendError(
      res,
      'Client must accept text/event-stream for SSE connections',
      HttpStatus.NOT_FOUND, // 406 Not Acceptable
      ErrorCode.VALIDATION_ERROR
    );
    return;
  }

  // Establish SSE connection
  await handleSSEConnection(req, res, userId);
}

/**
 * Handle polling request
 * 
 * Returns events since the last received event ID.
 * Use this as a fallback when SSE is not available.
 * 
 * @example
 * // Client-side usage
 * const response = await fetch('/api/realtime?action=poll&lastEventId=123');
 * const { data: { events } } = await response.json();
 */
async function handlePoll(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  // Only GET requests for polling
  if (req.method !== 'GET') {
    sendError(
      res,
      'Polling requires GET method',
      HttpStatus.METHOD_NOT_ALLOWED,
      ErrorCode.VALIDATION_ERROR
    );
    return;
  }

  const lastEventId = req.query.lastEventId as string | undefined;

  // Get events since lastEventId
  const events = getEventsForPolling(userId, lastEventId);

  sendSuccess(res, {
    events,
    count: events.length,
    lastEventId: events.length > 0 ? events[events.length - 1].id : lastEventId,
  });
}
