/**
 * Robust SSE Client for MIHAS Application System
 * 
 * A production-ready Server-Sent Events client with:
 * - Auto-reconnect on connection loss
 * - Exponential backoff (1s, 2s, 4s, 8s, max 30s)
 * - Battery-friendly disconnect on visibility change
 * - Event subscription management
 * - Clean disconnect handling
 * 
 * @requirements
 * - 5.3: Auto-reconnect on connection loss
 * - 5.4: Exponential backoff strategy
 * - 5.5: Battery-friendly on mobile devices
 * - 12.1: SSE connects to /api/v1/events/stream/ on api.mihas.edu.zm
 * - 12.2: Cross-origin SSE with withCredentials: true
 */

import { getApiBaseUrl } from '@/lib/apiConfig'

/**
 * SSE Client Configuration
 */
export interface SSEClientConfig {
  /** SSE endpoint URL */
  endpoint: string;
  /** Maximum number of reconnection attempts (default: Infinity) */
  maxRetries?: number;
  /** Initial backoff delay in ms (default: 1000) */
  initialBackoff?: number;
  /** Maximum backoff delay in ms (default: 30000) */
  maxBackoff?: number;
  /** Callback when connection is established */
  onConnect?: () => void;
  /** Callback when connection is lost */
  onDisconnect?: () => void;
  /** Callback when an error occurs */
  onError?: (error: Error) => void;
  /** Whether to auto-disconnect when page is hidden (default: true) */
  batteryFriendly?: boolean;
  /** Whether to include credentials (default: true) */
  withCredentials?: boolean;
}

/**
 * Event handler callback type
 */
type EventHandler<T = unknown> = (data: T) => void;

/**
 * SSE Client Interface
 */
export interface SSEClient {
  /** Establish SSE connection */
  connect(): void;
  /** Close SSE connection */
  disconnect(): void;
  /** Subscribe to a specific event type */
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): () => void;
  /** Check if currently connected */
  isConnected(): boolean;
  /** Get current retry count */
  getRetryCount(): number;
  /** Reset retry count (useful after successful operations) */
  resetRetryCount(): void;
  /** Reset auth-failure state to allow fresh connection after re-auth */
  resetAuthFailure(): void;
  /** Check if the client is in auth-failed state */
  isAuthFailed(): boolean;
  /** Check if retries have been exhausted */
  isRetriesExhausted(): boolean;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<SSEClientConfig, 'endpoint' | 'onConnect' | 'onDisconnect' | 'onError'>> = {
  maxRetries: 5,
  initialBackoff: 1000,
  maxBackoff: 30000,
  batteryFriendly: true,
  withCredentials: true,
};

/**
 * Calculate exponential backoff delay
 * 
 * @param attempt - Current retry attempt (0-indexed)
 * @param initialBackoff - Initial backoff delay in ms
 * @param maxBackoff - Maximum backoff delay in ms
 * @returns Backoff delay in ms
 * 
 * @example
 * calculateBackoff(0, 1000, 30000) // 1000
 * calculateBackoff(1, 1000, 30000) // 2000
 * calculateBackoff(2, 1000, 30000) // 4000
 * calculateBackoff(3, 1000, 30000) // 8000
 * calculateBackoff(4, 1000, 30000) // 16000
 * calculateBackoff(5, 1000, 30000) // 30000 (capped)
 */
export function calculateBackoff(
  attempt: number,
  initialBackoff: number,
  maxBackoff: number
): number {
  // Exponential backoff: initialBackoff * 2^attempt
  const delay = initialBackoff * Math.pow(2, attempt);
  // Cap at maxBackoff
  return Math.min(delay, maxBackoff);
}

/**
 * Calculate progressive polling backoff interval.
 *
 * When SSE falls back to polling, idle polls (no new events) increase the
 * interval by a 1.5× multiplier, starting from `baseInterval` and capped at
 * `maxInterval`.
 *
 * Formula: min(baseInterval * 1.5^n, maxInterval)
 *
 * @param idlePolls - Number of consecutive idle polls (0-indexed)
 * @param baseInterval - Starting polling interval in ms (default 30000)
 * @param maxInterval - Maximum polling interval in ms (default 120000)
 * @returns Polling interval in ms
 *
 * @example
 * calculatePollingBackoff(0) // 30000
 * calculatePollingBackoff(1) // 45000
 * calculatePollingBackoff(2) // 67500
 * calculatePollingBackoff(3) // 101250
 * calculatePollingBackoff(4) // 120000 (capped)
 */
export function calculatePollingBackoff(
  idlePolls: number,
  baseInterval: number = 30000,
  maxInterval: number = 120000
): number {
  const interval = baseInterval * Math.pow(1.5, idlePolls);
  return Math.min(interval, maxInterval);
}

/**
 * Create a robust SSE client
 * 
 * @param config - SSE client configuration
 * @returns SSE client instance
 * 
 * @example
 * ```typescript
 * const client = createSSEClient({
 *   endpoint: `${getApiBaseUrl()}/api/v1/events/stream/`,
 *   onConnect: () => console.log('Connected'),
 *   onDisconnect: () => console.log('Disconnected'),
 *   onError: (err) => console.error('Error:', err),
 * });
 * 
 * // Subscribe to events
 * const unsubscribe = client.subscribe('notification', (data) => {
 *   console.log('Notification:', data);
 * });
 * 
 * // Connect
 * client.connect();
 * 
 * // Later: cleanup
 * unsubscribe();
 * client.disconnect();
 * ```
 */
export function createSSEClient(config: SSEClientConfig): SSEClient {
  const {
    endpoint,
    maxRetries = DEFAULT_CONFIG.maxRetries,
    initialBackoff = DEFAULT_CONFIG.initialBackoff,
    maxBackoff = DEFAULT_CONFIG.maxBackoff,
    onConnect,
    onDisconnect,
    onError,
    batteryFriendly = DEFAULT_CONFIG.batteryFriendly,
    withCredentials = DEFAULT_CONFIG.withCredentials,
  } = config;

  // Internal state
  let eventSource: EventSource | null = null;
  let connected = false;
  let retryCount = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let intentionalDisconnect = false;
  let wasConnectedBeforeHidden = false;
  let hasLoggedError = false;
  let authFailed = false;
  let retriesExhausted = false;

  // Rapid-failure detection: if connection dies within RAPID_FAILURE_THRESHOLD_MS
  // of opening, it's likely a transport-level issue (e.g. QUIC). After
  // MAX_RAPID_FAILURES in a row, stop SSE and fall back to polling.
  let rapidFailureCount = 0;
  let lastConnectTime = 0;
  const RAPID_FAILURE_THRESHOLD_MS = 5000;
  const MAX_RAPID_FAILURES = 3;

  // Track rapid failure timestamps for windowed detection
  const rapidFailureTimestamps: number[] = [];

  // Event handlers map: event type -> Set of handlers
  const handlers = new Map<string, Set<EventHandler>>();

  // Store visibility change handler reference for cleanup
  let visibilityChangeHandler: (() => void) | null = null;

  /**
   * Dispatch event data to all registered handlers
   */
  function dispatchEvent(eventType: string, data: unknown): void {
    const eventHandlers = handlers.get(eventType);
    if (eventHandlers) {
      eventHandlers.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[SSEClient] Handler error for event "${eventType}":`, err);
        }
      });
    }
  }

  /**
   * Parse SSE event data
   */
  function parseEventData(data: string): unknown {
    try {
      return JSON.parse(data);
    } catch {
      // Return raw string if not valid JSON
      return data;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  function scheduleReconnect(): void {
    if (intentionalDisconnect || authFailed) {
      return;
    }

    if (retryCount >= maxRetries) {
      if (!retriesExhausted) {
        retriesExhausted = true;
        console.debug(`[SSEClient] Max retries (${maxRetries}) reached, stopping reconnects`);
        onError?.(new Error(`Max reconnection attempts (${maxRetries}) reached`));
        dispatchEvent('error', { type: 'max_retries_exceeded' });
      }
      return;
    }

    const delay = calculateBackoff(retryCount, initialBackoff, maxBackoff);
    console.debug(`[SSEClient] Scheduling reconnect in ${delay}ms (attempt ${retryCount + 1})`);

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null;
      retryCount++;
      connect();
    }, delay);
  }

  /**
   * Clear any pending reconnection
   */
  function clearReconnectTimeout(): void {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
  }

  /**
   * Handle visibility change for battery-friendly behavior
   */
  function handleVisibilityChange(): void {
    if (!batteryFriendly) {
      return;
    }

    if (document.visibilityState === 'hidden') {
      // Page is hidden - disconnect to save battery
      if (connected) {
        console.log('[SSEClient] Page hidden, disconnecting to save battery');
        wasConnectedBeforeHidden = true;
        // Don't set intentionalDisconnect - we want to reconnect when visible
        closeConnection();
      }
    } else if (document.visibilityState === 'visible') {
      // Page is visible again - reconnect if we were connected before
      // Do NOT reconnect if auth has failed or retries are exhausted
      if (wasConnectedBeforeHidden && !connected && !intentionalDisconnect && !authFailed && !retriesExhausted) {
        console.log('[SSEClient] Page visible, reconnecting');
        wasConnectedBeforeHidden = false;
        retryCount = 0; // Reset retry count for fresh reconnection
        connect();
      }
    }
  }

  /**
   * Close the EventSource connection without triggering reconnect
   */
  function closeConnection(): void {
    clearReconnectTimeout();

    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    if (connected) {
      connected = false;
      onDisconnect?.();
    }
  }

  // Probe cooldown: don't fire HEAD probes more than once every 10 seconds
  let lastProbeTime = 0;
  const PROBE_COOLDOWN_MS = 10_000;
  const PROBE_TIMEOUT_MS = 5_000;

  /**
   * Probe the SSE endpoint with a HEAD request to detect auth failures.
   * EventSource.onerror does not expose HTTP status codes, so we use
   * a lightweight fetch probe to distinguish 401/403 from network errors.
   * Transport errors (ERR_QUIC_PROTOCOL_ERROR, etc.) are treated as network errors.
   *
   * Debounced: skips if called within PROBE_COOLDOWN_MS of the last probe.
   * Aborts after PROBE_TIMEOUT_MS to prevent hanging requests.
   *
   * @returns The HTTP status code, or -1 if the probe is skipped/fails
   */
  async function probeEndpointForAuth(): Promise<number> {
    const now = Date.now();
    if (now - lastProbeTime < PROBE_COOLDOWN_MS) {
      return -1; // Cooldown active, skip probe
    }
    lastProbeTime = now;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const response = await fetch(endpoint, {
        method: 'HEAD',
        credentials: withCredentials ? 'include' : 'same-origin',
        signal: controller.signal,
      });
      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Connect to SSE endpoint
   */
  function connect(): void {
    // Don't connect if intentionally disconnected or auth has failed
    if (intentionalDisconnect || authFailed) {
      return;
    }

    // Don't connect if page is hidden and battery-friendly mode is on
    if (batteryFriendly && document.visibilityState === 'hidden') {
      wasConnectedBeforeHidden = true;
      return;
    }

    // Close existing connection if any
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    console.log(`[SSEClient] Connecting to ${endpoint}...`);

    try {
      // Create EventSource with credentials if needed
      // Note: EventSource doesn't support withCredentials in constructor in all browsers
      // We rely on cookies being sent automatically for same-origin requests
      eventSource = new EventSource(endpoint, {
        withCredentials,
      } as EventSourceInit);

      // Handle connection open
      eventSource.onopen = () => {
        console.log('[SSEClient] Connected');
        connected = true;
        lastConnectTime = Date.now();
        if (hasLoggedError) {
          console.log('[SSEClient] Connection recovered');
          hasLoggedError = false;
        }
        retryCount = 0; // Reset retry count on successful connection
        onConnect?.();
      };

      // Handle generic messages (no event type specified)
      eventSource.onmessage = (event) => {
        const data = parseEventData(event.data);
        dispatchEvent('message', data);
      };

      // Handle errors
      eventSource.onerror = (_event) => {
        if (!hasLoggedError) {
          console.debug('[SSEClient] Connection error');
          hasLoggedError = true;
        } else {
          console.debug('[SSEClient] Connection error');
        }
        
        // EventSource automatically closes on error
        const wasConnected = connected;
        connected = false;
        eventSource = null;

        if (wasConnected) {
          onDisconnect?.();
        }

        // Rapid-failure detection: if connection died very quickly after opening,
        // it's likely a transport issue (QUIC, HTTP/3) not a normal timeout.
        const now = Date.now();
        if (lastConnectTime > 0) {
          const connectionDuration = now - lastConnectTime;
          if (connectionDuration < RAPID_FAILURE_THRESHOLD_MS) {
            rapidFailureCount++;
            rapidFailureTimestamps.push(now);

            // Windowed check: 3 failures within 5 seconds → skip probe, go straight to polling
            const recentFailures = rapidFailureTimestamps.filter(t => now - t < RAPID_FAILURE_THRESHOLD_MS);
            if (recentFailures.length >= MAX_RAPID_FAILURES) {
              console.warn(`[SSEClient] Rapid failure detected (${rapidFailureCount} failures in ${RAPID_FAILURE_THRESHOLD_MS}ms window, likely QUIC issue), skipping probe and falling back to polling`);
              retriesExhausted = true;
              onError?.(new Error('rapid_failure_fallback'));
              dispatchEvent('error', { type: 'rapid_failure_fallback' });
              // Trim timestamps array to prevent unbounded growth
              rapidFailureTimestamps.length = 0;
              return;
            }
          } else {
            // Connection lasted long enough — reset rapid failure counter
            rapidFailureCount = 0;
            rapidFailureTimestamps.length = 0;
          }
        }

        // Only report error and schedule reconnect if not intentional
        if (!intentionalDisconnect && !authFailed) {
          onError?.(new Error('SSE connection error'));

          // Skip the HEAD probe if we're in rapid-failure territory (avoids request spam)
          if (rapidFailureCount >= 2) {
            scheduleReconnect();
          } else {
            // Guard: a concurrent probe callback may have set authFailed
            // between the outer check and this point — bail out early.
            if (authFailed) return;
            // Probe the endpoint with a HEAD request to detect auth failures
            // EventSource.onerror does not expose HTTP status codes
            probeEndpointForAuth().then((probeStatus) => {
              if (probeStatus === -1) {
                // Probe was skipped (cooldown) or timed out — just reconnect
                scheduleReconnect();
              } else if (probeStatus === 401 || probeStatus === 403) {
                // Auth failure detected — stop reconnecting
                authFailed = true;
                clearReconnectTimeout();
                console.warn(`[SSEClient] Auth failure (${probeStatus}), stopping reconnect`);
                dispatchEvent('auth_failure', { status: probeStatus });
              } else {
                // Network or other error — apply normal backoff
                scheduleReconnect();
              }
            }).catch(() => {
              // Probe itself failed (network error, QUIC error, etc.) — treat as network error
              scheduleReconnect();
            });
          }
        }
      };

      // Set up listeners for all registered event types
      handlers.forEach((_, eventType) => {
        if (eventType !== 'message' && eventSource) {
          eventSource.addEventListener(eventType, (event: Event) => {
            const messageEvent = event as MessageEvent;
            const data = parseEventData(messageEvent.data);
            dispatchEvent(eventType, data);
          });
        }
      });

    } catch (err) {
      console.error('[SSEClient] Failed to create EventSource:', err);
      onError?.(err instanceof Error ? err : new Error(String(err)));
      scheduleReconnect();
    }
  }

  /**
   * Disconnect from SSE endpoint
   */
  function disconnect(): void {
    console.log('[SSEClient] Disconnecting');
    intentionalDisconnect = true;
    wasConnectedBeforeHidden = false;
    closeConnection();

    // Remove visibilitychange listener to prevent memory leaks
    if (visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityChangeHandler);
      visibilityChangeHandler = null;
    }

    // Clear all event handlers to prevent memory accumulation
    handlers.clear();
  }

  /**
   * Subscribe to a specific event type
   */
  function subscribe<T = unknown>(event: string, handler: EventHandler<T>): () => void {
    // Get or create handler set for this event type
    if (!handlers.has(event)) {
      handlers.set(event, new Set());

      // If already connected, add listener to EventSource
      if (eventSource && event !== 'message') {
        eventSource.addEventListener(event, (e: Event) => {
          const messageEvent = e as MessageEvent;
          const data = parseEventData(messageEvent.data);
          dispatchEvent(event, data);
        });
      }
    }

    // Add handler
    handlers.get(event)!.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      const eventHandlers = handlers.get(event);
      if (eventHandlers) {
        eventHandlers.delete(handler as EventHandler);
        // Clean up empty handler sets
        if (eventHandlers.size === 0) {
          handlers.delete(event);
        }
      }
    };
  }

  /**
   * Check if currently connected
   */
  function isConnectedFn(): boolean {
    return connected;
  }

  /**
   * Get current retry count
   */
  function getRetryCount(): number {
    return retryCount;
  }

  /**
   * Reset retry count and retries-exhausted state
   */
  function resetRetryCount(): void {
    retryCount = 0;
    retriesExhausted = false;
  }

  /**
   * Reset auth-failure state to allow fresh connection after re-auth
   */
  function resetAuthFailure(): void {
    authFailed = false;
    retriesExhausted = false;
  }

  /**
   * Check if the client is in auth-failed state
   */
  function isAuthFailedFn(): boolean {
    return authFailed;
  }

  /**
   * Check if retries have been exhausted
   */
  function isRetriesExhaustedFn(): boolean {
    return retriesExhausted;
  }

  // Set up visibility change listener for battery-friendly behavior
  if (batteryFriendly && typeof document !== 'undefined') {
    visibilityChangeHandler = handleVisibilityChange;
    document.addEventListener('visibilitychange', visibilityChangeHandler);
  }

  // Return SSE client interface
  return {
    connect,
    disconnect,
    subscribe,
    isConnected: isConnectedFn,
    getRetryCount,
    resetRetryCount,
    resetAuthFailure,
    isAuthFailed: isAuthFailedFn,
    isRetriesExhausted: isRetriesExhaustedFn,
  };
}

/**
 * Singleton SSE client instance for the application
 * 
 * Use this for the main application SSE connection.
 * For multiple connections, use createSSEClient directly.
 */
let defaultClient: SSEClient | null = null;

/**
 * Get or create the default SSE client
 * 
 * @param config - Optional configuration (only used on first call)
 * @returns Default SSE client instance
 */
export function getDefaultSSEClient(config?: Partial<SSEClientConfig>): SSEClient {
  if (!defaultClient) {
    defaultClient = createSSEClient({
      endpoint: `${getApiBaseUrl()}/api/v1/events/stream/`,
      ...config,
    });
  }
  return defaultClient;
}

/**
 * Reset the default SSE client (useful for testing)
 */
export function resetDefaultSSEClient(): void {
  if (defaultClient) {
    defaultClient.disconnect();
    defaultClient = null;
  }
}

export default createSSEClient;
