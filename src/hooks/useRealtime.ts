/**
 * useRealtime Hook - SSE/Polling for Real-time Updates
 * 
 * Replaces Supabase Realtime with Bun-native SSE implementation.
 * Uses the robust SSE client with automatic reconnection, exponential backoff,
 * and polling fallback.
 * 
 * @requirements
 * - 5.7: SSE wired to application status updates
 * - 5.10: Polling fallback for graceful degradation
 * - 7.1: SSE for server-to-client streaming
 * - 7.2: Polling fallback for graceful degradation
 * - 7.10: Zero Supabase Realtime dependencies
 * 
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { isConnected, events, subscribe } = useRealtime()
 *   
 *   useEffect(() => {
 *     const unsubscribe = subscribe('application_update', (data) => {
 *       console.log('Application updated:', data)
 *     })
 *     return unsubscribe
 *   }, [subscribe])
 *   
 *   return <div>{isConnected ? 'Live' : 'Offline'}</div>
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { dispatchSSEStatus, triggerSSEReconnect, SSE_RECONNECT_EVENT } from '@/contexts/RealtimeStatusContext'
import { createSSEClient, type SSEClient } from '@/lib/sseClient'
import { useRealtimeStore, type RealtimeEventEnvelope } from '@/stores/realtimeStore'

/**
 * SSE Event Types (matches backend api/_lib/realtime.ts)
 */
export type SSEEventType = 
  | 'application_update'
  | 'notification'
  | 'payment_update'
  | 'interview_scheduled'
  | 'document_processed'
  | 'dashboard_refresh'
  | 'ping'

/**
 * SSE Event structure
 */
export interface SSEEvent {
  id: string
  type: SSEEventType
  data: Record<string, unknown>
  timestamp: string
  userId?: string
  event_id?: string
  entity_id?: string
  version?: number
  created_at?: string
}

/**
 * Event handler callback type
 */
type EventHandler = (data: Record<string, unknown>, event: SSEEvent) => void

/**
 * Hook configuration options
 */
interface UseRealtimeOptions {
  /** Enable SSE connection (default: true) */
  enabled?: boolean
  /** Polling interval in ms when SSE fails (default: 30000) */
  pollingInterval?: number
  /** Max reconnection attempts before falling back to polling (default: 3) */
  maxReconnectAttempts?: number
  /** Initial backoff delay in ms (default: 1000) */
  initialBackoff?: number
  /** Maximum backoff delay in ms (default: 30000) */
  maxBackoff?: number
  /** Enable polling fallback (default: true) */
  pollingEnabled?: boolean
  /** Enable battery-friendly mode (default: true) */
  batteryFriendly?: boolean
}

/**
 * Hook return type
 */
interface UseRealtimeReturn {
  /** Whether SSE is currently connected */
  isConnected: boolean
  /** Whether using polling fallback */
  isPolling: boolean
  /** Whether reconnection is in progress */
  isReconnecting: boolean
  /** Current connection status */
  status: 'connecting' | 'connected' | 'disconnected' | 'polling' | 'error'
  /** Recent events received */
  events: SSEEvent[]
  /** Subscribe to specific event type */
  subscribe: (eventType: SSEEventType, handler: EventHandler) => () => void
  /** Manually trigger reconnection */
  reconnect: () => void
  /** Last error message */
  error: string | null
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<UseRealtimeOptions> = {
  enabled: false, // SSE disabled - Vercel Hobby has 10s function timeout, SSE requires persistent connections
  pollingInterval: 30000,
  maxReconnectAttempts: 3,
  initialBackoff: 1000,
  maxBackoff: 30000,
  pollingEnabled: true, // Polling enabled - backend endpoint exists at /api/sessions?action=poll
  batteryFriendly: true,
}

/**
 * SSE endpoint for realtime connections
 */
const SSE_ENDPOINT = '/api/sessions?action=connect'

/**
 * Polling endpoint for fallback
 */
const POLLING_ENDPOINT = '/api/sessions?action=poll'

/**
 * useRealtime Hook
 * 
 * Establishes SSE connection for real-time updates with automatic
 * reconnection, exponential backoff, and polling fallback.
 * 
 * Uses the robust SSE client from src/lib/sseClient.ts
 */
export function useRealtime(options: UseRealtimeOptions = {}): UseRealtimeReturn {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  
  // State
  const [isConnected, setIsConnected] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [status, setStatus] = useState<UseRealtimeReturn['status']>('disconnected')
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // Refs for cleanup and state management
  const sseClientRef = useRef<SSEClient | null>(null)
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const handlersRef = useRef<Map<SSEEventType, Set<EventHandler>>>(new Map())
  const mountedRef = useRef(true)
  const sseFailedRef = useRef(false)
  const unsubscribersRef = useRef<Array<() => void>>([])
  const progressiveIntervalRef = useRef(opts.pollingInterval)

  /**
   * Dispatch event to registered handlers
   */
  const dispatchEvent = useCallback((event: SSEEvent) => {
    if (event.event_id && event.entity_id && typeof event.version === 'number' && event.created_at) {
      const accepted = useRealtimeStore.getState().ingestEvent(event as RealtimeEventEnvelope)
      if (!accepted) return
    }

    const handlers = handlersRef.current.get(event.type)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event.data, event)
        } catch (err) {
          console.error('[useRealtime] Handler error:', err)
        }
      })
    }
    
    // Store event (keep last 50)
    setEvents(prev => [...prev.slice(-49), event])
    
    // Update last event ID for polling
    lastEventIdRef.current = event.id
  }, [])

  /**
   * Create SSE event from raw data
   */
  const createSSEEvent = useCallback((eventType: SSEEventType, data: unknown): SSEEvent => {
    const eventData = typeof data === 'object' && data !== null 
      ? data as Record<string, unknown>
      : { value: data }

    const envelope = eventData as Partial<RealtimeEventEnvelope>
    
    return {
      id: `${eventType}_${Date.now()}`,
      type: eventType,
      data: eventData,
      timestamp: new Date().toISOString(),
      event_id: envelope.event_id,
      entity_id: envelope.entity_id,
      version: envelope.version,
      created_at: envelope.created_at,
    }
  }, [])

  /**
   * Start polling fallback
   */
  const startPolling = useCallback(() => {
    if (!opts.pollingEnabled || pollingIntervalRef.current) return
    
    console.log('[useRealtime] Starting polling fallback')
    setIsPolling(true)
    setStatus('polling')
    
    const poll = async () => {
      if (!mountedRef.current) return
      if (document.visibilityState === 'hidden') return
      
      try {
        const url = lastEventIdRef.current
          ? `${POLLING_ENDPOINT}&lastEventId=${lastEventIdRef.current}`
          : POLLING_ENDPOINT
        
        const response = await fetch(url, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        
        if (!response.ok) {
          throw new Error(`Polling failed: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (data.success && data.data?.events) {
          const hasEvents = data.data.events.length > 0
          data.data.events.forEach((event: SSEEvent) => {
            dispatchEvent(event)
          })
          progressiveIntervalRef.current = hasEvents
            ? opts.pollingInterval
            : Math.min(progressiveIntervalRef.current * 1.5, 120000)
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = setInterval(poll, progressiveIntervalRef.current)
          }
        }
      } catch (err) {
        console.error('[useRealtime] Polling error:', err)
      }
    }
    
    // Initial poll
    poll()
    
    // Set up interval
    pollingIntervalRef.current = setInterval(poll, progressiveIntervalRef.current)
  }, [opts.pollingEnabled, opts.pollingInterval, dispatchEvent])

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
  }, [])

  /**
   * Initialize SSE connection using the robust SSE client
   */
  const initializeSSE = useCallback(() => {
    if (!opts.enabled || !mountedRef.current || sseClientRef.current) return

    console.log('[useRealtime] Initializing SSE connection with robust client')
    setStatus('connecting')
    setError(null)
    
    dispatchSSEStatus({
      connected: false,
      status: 'connecting',
    })

    const client = createSSEClient({
      endpoint: SSE_ENDPOINT,
      maxRetries: opts.maxReconnectAttempts,
      initialBackoff: opts.initialBackoff,
      maxBackoff: opts.maxBackoff,
      batteryFriendly: opts.batteryFriendly,
      withCredentials: true,
      
      onConnect: () => {
        if (!mountedRef.current) return
        
        console.log('[useRealtime] SSE connected')
        setIsConnected(true)
        setIsReconnecting(false)
        setStatus('connected')
        setError(null)
        sseFailedRef.current = false
        
        // Stop polling when SSE connects
        stopPolling()
        
        dispatchSSEStatus({
          connected: true,
          status: 'connected',
          lastConnectedAt: new Date(),
        })
      },
      
      onDisconnect: () => {
        if (!mountedRef.current) return
        
        console.log('[useRealtime] SSE disconnected')
        setIsConnected(false)
        setIsReconnecting(true)
        
        dispatchSSEStatus({
          connected: false,
          status: 'disconnected',
        })
      },
      
      onError: (err) => {
        if (!mountedRef.current) return
        
        console.error('[useRealtime] SSE error:', err.message)
        setError(err.message)
        
        // If SSE fails after max retries, fall back to polling
        if (err.message.includes('Max reconnection attempts')) {
          console.log('[useRealtime] SSE failed, falling back to polling')
          setStatus('error')
          setIsReconnecting(false)
          sseFailedRef.current = true
          startPolling()
        }
      },
    })

    sseClientRef.current = client

    // Subscribe to all event types
    const eventTypes: SSEEventType[] = [
      'application_update',
      'notification',
      'payment_update',
      'interview_scheduled',
      'document_processed',
      'dashboard_refresh',
      'ping',
    ]

    // Clear previous unsubscribers
    unsubscribersRef.current.forEach(unsub => unsub())
    unsubscribersRef.current = []

    // Subscribe to each event type
    eventTypes.forEach(eventType => {
      const unsubscribe = client.subscribe(eventType, (data: unknown) => {
        if (!mountedRef.current) return
        
        const sseEvent = createSSEEvent(eventType, data)
        dispatchEvent(sseEvent)
      })
      unsubscribersRef.current.push(unsubscribe)
    })

    // Also subscribe to generic 'message' events
    const messageUnsub = client.subscribe('message', (data: unknown) => {
      if (!mountedRef.current) return
      
      // Try to determine event type from data
      const eventData = typeof data === 'object' && data !== null 
        ? data as Record<string, unknown>
        : { value: data }
      
      const eventType = (eventData.type as SSEEventType) || 'notification'
      const sseEvent = createSSEEvent(eventType, eventData)
      dispatchEvent(sseEvent)
    })
    unsubscribersRef.current.push(messageUnsub)

    // Connect
    client.connect()

    // Return cleanup function
    return () => {
      unsubscribersRef.current.forEach(unsub => unsub())
      unsubscribersRef.current = []
      client.disconnect()
      sseClientRef.current = null
    }
  }, [
    opts.enabled, 
    opts.maxReconnectAttempts, 
    opts.initialBackoff, 
    opts.maxBackoff, 
    opts.batteryFriendly,
    createSSEEvent, 
    dispatchEvent, 
    stopPolling, 
    startPolling
  ])

  /**
   * Disconnect from SSE
   */
  const disconnect = useCallback(() => {
    // Clean up SSE client
    if (sseClientRef.current) {
      sseClientRef.current.disconnect()
      sseClientRef.current = null
    }
    
    // Clean up unsubscribers
    unsubscribersRef.current.forEach(unsub => unsub())
    unsubscribersRef.current = []
    
    // Stop polling
    stopPolling()
    
    setIsConnected(false)
    setIsReconnecting(false)
    setStatus('disconnected')
    
    dispatchSSEStatus({
      connected: false,
      status: 'disconnected',
    })
  }, [stopPolling])

  /**
   * Manual reconnect
   */
  const reconnect = useCallback(() => {
    console.log('[useRealtime] Manual reconnect triggered')
    sseFailedRef.current = false
    disconnect()
    
    // Small delay before reconnecting
    setTimeout(() => {
      if (mountedRef.current) {
        initializeSSE()
      }
    }, 100)
  }, [disconnect, initializeSSE])

  /**
   * Subscribe to event type
   */
  const subscribe = useCallback((eventType: SSEEventType, handler: EventHandler): (() => void) => {
    if (!handlersRef.current.has(eventType)) {
      handlersRef.current.set(eventType, new Set())
    }
    
    handlersRef.current.get(eventType)!.add(handler)
    
    // Return unsubscribe function
    return () => {
      const handlers = handlersRef.current.get(eventType)
      if (handlers) {
        handlers.delete(handler)
        if (handlers.size === 0) {
          handlersRef.current.delete(eventType)
        }
      }
    }
  }, [])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true
    
    if (opts.enabled && !sseFailedRef.current) {
      const cleanup = initializeSSE()
      return () => {
        mountedRef.current = false
        cleanup?.()
        disconnect()
      }
    } else if (opts.pollingEnabled) {
      // SSE disabled or failed, use polling
      startPolling()
      return () => {
        mountedRef.current = false
        stopPolling()
      }
    }
    
    return () => {
      mountedRef.current = false
    }
  }, [opts.enabled, opts.pollingEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for external reconnect events
  useEffect(() => {
    const handleReconnectEvent = () => {
      reconnect()
    }
    
    window.addEventListener(SSE_RECONNECT_EVENT, handleReconnectEvent)
    
    return () => {
      window.removeEventListener(SSE_RECONNECT_EVENT, handleReconnectEvent)
    }
  }, [reconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    isConnected,
    isPolling,
    isReconnecting,
    status,
    events,
    subscribe,
    reconnect,
    error,
  }
}

/**
 * Hook for subscribing to specific event types
 * 
 * @example
 * ```tsx
 * function ApplicationStatus() {
 *   useRealtimeEvent('application_update', (data) => {
 *     console.log('Application updated:', data)
 *   })
 * }
 * ```
 */
export function useRealtimeEvent(
  eventType: SSEEventType,
  handler: EventHandler,
  deps: React.DependencyList = []
): void {
  const { subscribe } = useRealtime()
  
  useEffect(() => {
    const unsubscribe = subscribe(eventType, handler)
    return unsubscribe
  }, [eventType, subscribe, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Hook for application status updates
 * 
 * Provides real-time application status updates via SSE with polling fallback.
 * 
 * @requirements
 * - 5.7: SSE wired to application status updates
 * 
 * @example
 * ```tsx
 * function ApplicationTracker() {
 *   const { isConnected } = useApplicationUpdates((data) => {
 *     console.log('Application status changed:', data)
 *     // data may contain: applicationId, status, updatedAt, etc.
 *   })
 *   
 *   return <div>{isConnected ? 'Live updates' : 'Checking for updates...'}</div>
 * }
 * ```
 */
export function useApplicationUpdates(
  onUpdate: (data: Record<string, unknown>) => void
): { isConnected: boolean; isPolling: boolean; error: string | null } {
  const { isConnected, isPolling, error, subscribe } = useRealtime()
  
  useEffect(() => {
    const unsubscribe = subscribe('application_update', onUpdate)
    return unsubscribe
  }, [subscribe, onUpdate])
  
  return { isConnected, isPolling, error }
}

/**
 * Hook for notification updates
 */
export function useNotificationUpdates(
  onNotification: (data: Record<string, unknown>) => void
): { isConnected: boolean } {
  const { isConnected, subscribe } = useRealtime()
  
  useEffect(() => {
    const unsubscribe = subscribe('notification', onNotification)
    return unsubscribe
  }, [subscribe, onNotification])
  
  return { isConnected }
}

/**
 * Hook for payment updates
 */
export function usePaymentUpdates(
  onUpdate: (data: Record<string, unknown>) => void
): { isConnected: boolean } {
  const { isConnected, subscribe } = useRealtime()
  
  useEffect(() => {
    const unsubscribe = subscribe('payment_update', onUpdate)
    return unsubscribe
  }, [subscribe, onUpdate])
  
  return { isConnected }
}

export default useRealtime
