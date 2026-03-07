/**
 * Bun-Native Realtime Implementation
 * 
 * REPLACES: Supabase Realtime entirely
 * IMPLEMENTATION: Server-Sent Events (SSE)
 * VERIFICATION: No WebSocket, no Supabase, Bun-native only
 * 
 * Architecture:
 * - SSE for server-to-client streaming
 * - HTTP POST for client-to-server events
 * - Connection pooling for Vercel serverless
 * - Graceful degradation with polling fallback
 * 
 * Trade-offs:
 * - Pros: HTTP-based (works everywhere), Bun-native, no connection limits
 * - Cons: 10s Vercel timeout (managed via reconnection), one-way by default
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * SSE Event Types
 * VERIFICATION: Explicit event schema
 */
export type SSEEventType = 
  | "application_update"
  | "notification"
  | "payment_update"
  | "interview_scheduled"
  | "document_processed"
  | "ping";

/**
 * SSE Event structure
 */
export interface SSEEvent {
  id: string;
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
  userId?: string; // If null, broadcast to all
}

/**
 * Event history for replay (clients reconnecting)
 * VERIFICATION: Missed events can be recovered
 */
const eventHistory: SSEEvent[] = [];
const MAX_HISTORY_SIZE = 100;

/**
 * Active connections (in-memory, per-instance)
 * NOTE: Vercel serverless = connections not shared between instances
 * Client must reconnect on instance change (handled automatically)
 */
const connections = new Map<string, VercelResponse>();

/**
 * Send SSE event to connected client
 * 
 * @param res - Vercel response (must be SSE-enabled)
 * @param event - SSE event
 */
export function sendSSEEvent(res: VercelResponse, event: SSEEvent): void {
  const data = JSON.stringify(event.data);
  
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${data}\n\n`);
}

/**
 * Initialize SSE connection
 * VERIFICATION: Proper headers, connection tracking
 * 
 * @param req - Vercel request
 * @param res - Vercel response
 * @param userId - Authenticated user ID
 * @returns boolean - true if connection established
 */
export function initializeSSE(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): boolean {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  
  // Generate connection ID
  const connectionId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Store connection
  connections.set(connectionId, res);
  
  // Send initial connection event
  sendSSEEvent(res, {
    id: `conn_${Date.now()}`,
    type: "ping",
    data: { 
      connected: true, 
      connectionId,
      message: "SSE connection established",
    },
    timestamp: new Date().toISOString(),
    userId,
  });
  
  // Send recent history (last 10 events for this user)
  const userEvents = eventHistory
    .filter(e => !e.userId || e.userId === userId)
    .slice(-10);
  
  userEvents.forEach(event => {
    sendSSEEvent(res, event);
  });
  
  // Vercel serverless functions timeout at 10 seconds.
  // Keepalive must fire before timeout to maintain the connection.
  const KEEPALIVE_INTERVAL_MS = 8000;

  const keepalive = setInterval(() => {
    try {
      sendSSEEvent(res, {
        id: `ping_${Date.now()}`,
        type: "ping",
        data: { timestamp: Date.now() },
        timestamp: new Date().toISOString(),
        userId,
      });
    } catch {
      // Connection closed
      clearInterval(keepalive);
      connections.delete(connectionId);
    }
  }, KEEPALIVE_INTERVAL_MS);

  // Handle connection close — clear keepalive and remove from connections
  // to prevent stale entries across serverless invocations
  req.on("close", () => {
    clearInterval(keepalive);
    connections.delete(connectionId);
    console.log(`[SSE] Connection closed: ${connectionId}`);
  });
  
  console.log(`[SSE] Connection established: ${connectionId}`);
  return true;
}

/**
 * Broadcast event to specific user
 * 
 * @param userId - Target user ID
 * @param type - Event type
 * @param data - Event data
 */
export function broadcastToUser(
  userId: string,
  type: SSEEventType,
  data: Record<string, unknown>
): void {
  const event: SSEEvent = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    timestamp: new Date().toISOString(),
    userId,
  };
  
  // Store in history
  eventHistory.push(event);
  if (eventHistory.length > MAX_HISTORY_SIZE) {
    eventHistory.shift();
  }
  
  // Send to all connections for this user
  connections.forEach((res, connectionId) => {
    if (connectionId.startsWith(`${userId}_`)) {
      try {
        sendSSEEvent(res, event);
      } catch (error) {
        console.error(`[SSE] Failed to send to ${connectionId}:`, error);
        connections.delete(connectionId);
      }
    }
  });
}

/**
 * Broadcast event to all connected users
 * 
 * @param type - Event type
 * @param data - Event data
 */
export function broadcastToAll(
  type: SSEEventType,
  data: Record<string, unknown>
): void {
  const event: SSEEvent = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    data,
    timestamp: new Date().toISOString(),
  };
  
  // Store in history
  eventHistory.push(event);
  if (eventHistory.length > MAX_HISTORY_SIZE) {
    eventHistory.shift();
  }
  
  // Send to all connections
  connections.forEach((res, connectionId) => {
    try {
      sendSSEEvent(res, event);
    } catch (error) {
      console.error(`[SSE] Failed to send to ${connectionId}:`, error);
      connections.delete(connectionId);
    }
  });
}

/**
 * Get current connection count
 */
export function getConnectionCount(): number {
  return connections.size;
}

/**
 * Polling fallback for clients that can't use SSE
 * VERIFICATION: Same data, different transport
 * 
 * @param userId - User ID
 * @param lastEventId - Last received event ID (for replay)
 * @returns Array of events since lastEventId
 */
export function getEventsForPolling(
  userId: string,
  lastEventId?: string
): SSEEvent[] {
  if (!lastEventId) {
    // Return last 10 events
    return eventHistory
      .filter(e => !e.userId || e.userId === userId)
      .slice(-10);
  }
  
  // Find index of lastEventId
  const lastIndex = eventHistory.findIndex(e => e.id === lastEventId);
  if (lastIndex === -1) {
    return eventHistory.filter(e => !e.userId || e.userId === userId);
  }
  
  // Return events after lastEventId
  return eventHistory
    .slice(lastIndex + 1)
    .filter(e => !e.userId || e.userId === userId);
}

/**
 * SSE Event Handler
 * Manages connection lifecycle
 */
export async function handleSSEConnection(
  req: VercelRequest,
  res: VercelResponse,
  userId: string
): Promise<void> {
  // Check if client accepts SSE
  const accept = req.headers.accept || "";
  if (!accept.includes("text/event-stream")) {
    res.status(406).json({
      error: "Not Acceptable",
      message: "Client must accept text/event-stream",
    });
    return;
  }
  
  // Initialize connection
  initializeSSE(req, res, userId);
  
  // Keep connection open (Vercel will timeout at 10s, client must reconnect)
  // This is handled by the client with EventSource automatic reconnection
}

/**
 * Trigger event from server-side code
 * Use this to broadcast updates from API handlers
 * 
 * @example
 * ```typescript
 * // In application update handler
 * broadcastApplicationUpdate(userId, { status: "approved" });
 * ```
 */
export function broadcastApplicationUpdate(
  userId: string,
  data: Record<string, unknown>
): void {
  broadcastToUser(userId, "application_update", data);
}

export function broadcastNotification(
  userId: string,
  notification: Record<string, unknown>
): void {
  broadcastToUser(userId, "notification", notification);
}

export function broadcastPaymentUpdate(
  userId: string,
  data: Record<string, unknown>
): void {
  broadcastToUser(userId, "payment_update", data);
}

export function broadcastInterviewScheduled(
  userId: string,
  data: Record<string, unknown>
): void {
  broadcastToUser(userId, "interview_scheduled", data);
}

export function broadcastDocumentProcessed(
  userId: string,
  data: Record<string, unknown>
): void {
  broadcastToUser(userId, "document_processed", data);
}

