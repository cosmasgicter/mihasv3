/**
 * useRealtime Hook - SSE/Polling for Real-time Updates
 * 
 * Replaces Supabase Realtime with Bun-native SSE implementation.
 * Provides automatic reconnection, polling fallback, and event handling.
 * 
 * @requirements
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

/**
 * SSE Event Types (matches backend api/_lib/realtime.ts)
 */
export type SSEEventType = 
  | 'application_update'
  | 'notification'
  | 'payment_update'
  | 'interview_scheduled'
  | 'document_processed'
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
  /** Reconnection delay in ms (default: 2000) */
  reconnectDelay?: number
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
  enabled: true,
  pollingInterval: 30000,
  maxReconnectAttempts: 3,
  reconnectDelay: 2000,
}

/**
 * useRealtime Hook
 * 
 * Establishes SSE connection for real-time updates with automatic
 * reconnection and polling fallback.
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
  const eventSourceRef = useRef<EventSource | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastEventIdRef = useRef<string | null>(null)
  const handlersRef = useRef<Map<SSEEventType, Set<EventHandler>>>(new Map())
  const mountedRef = useRef(true)

  /**
   * Dispatch event to registered handlers
   */
  const dispatchEvent = useCallback((event: SSEEvent) => {
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
   * Start polling fallback
   */
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return
    
    console.log('[useRealtime] Starting polling fallback')
    setIsPolling(true)
    setStatus('polling')
    
    const poll = async () => {
      try {
        const url = lastEventIdRef.current
          ? `/api/sessions?action=poll&lastEventId=${lastEventIdRef.current}`
          : '/api/sessions?action=poll'
        
        const response = await fetch(url, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
        
        if (!response.ok) {
          throw new Error(`Polling failed: ${response.status}`)
        }
        
        const data = await response.json()
        
        if (data.success && data.data?.events) {
          data.data.events.forEach((event: SSEEvent) => {
            dispatchEvent(event)
          })
        }
      } catch (err) {
        console.error('[useRealtime] Polling error:', err)
      }
    }
    
    // Initial poll
    poll()
    
    // Set up interval
    pollingIntervalRef.current = setInterval(poll, opts.pollingInterval)
  }, [opts.pollingInterval, dispatchEvent])

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
   * Connect to SSE endpoint
   */
  const connect = useCallback(() => {
    if (!opts.enabled || !mountedRef.current) return
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    console.log('[useRealtime] Connecting to SSE...')
    setStatus('connecting')
    setError(null)
    
    dispatchSSEStatus({
      connected: false,
      status: 'connecting',
    })
    
    try {
      const eventSource = new EventSource('/api/sessions?action=connect', {
        withCredentials: true,
      })
      
      eventSourceRef.current = eventSource
      
      // Handle connection open
      eventSource.onopen = () => {
        if (!mountedRef.current) return
        
        console.log('[useRealtime] SSE connected')
        setIsConnected(true)
        setIsReconnecting(false)
        setStatus('connected')
        setError(null)
        reconnectAttemptRef.current = 0
        
        // Stop polling if it was running
        stopPolling()
        
        dispatchSSEStatus({
          connected: true,
          status: 'connected',
          lastConnectedAt: new Date(),
        })
      }
      
      // Handle messages
      eventSource.onmessage = (event) => {
        if (!mountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          const sseEvent: SSEEvent = {
            id: event.lastEventId || `msg_${Date.now()}`,
            type: 'notification', // Default type for generic messages
            data,
            timestamp: new Date().toISOString(),
          }
          dispatchEvent(sseEvent)
        } catch (err) {
          console.error('[useRealtime] Failed to parse message:', err)
        }
      }
      
      // Handle specific event types
      const eventTypes: SSEEventType[] = [
        'application_update',
        'notification',
        'payment_update',
        'interview_scheduled',
        'document_processed',
        'ping',
      ]
      
      eventTypes.forEach(eventType => {
        eventSource.addEventListener(eventType, (event: MessageEvent) => {
          if (!mountedRef.current) return
          
          try {
            const data = JSON.parse(event.data)
            const sseEvent: SSEEvent = {
              id: event.lastEventId || `${eventType}_${Date.now()}`,
              type: eventType,
              data,
              timestamp: new Date().toISOString(),
            }
            dispatchEvent(sseEvent)
          } catch (err) {
            console.error(`[useRealtime] Failed to parse ${eventType} event:`, err)
          }
        })
      })
      
      // Handle errors
      eventSource.onerror = () => {
        if (!mountedRef.current) return
        
        console.log('[useRealtime] SSE error, attempting reconnect...')
        setIsConnected(false)
        
        eventSource.close()
        eventSourceRef.current = null
        
        dispatchSSEStatus({
          connected: false,
          status: 'disconnected',
        })
        
        // Attempt reconnection
        if (reconnectAttemptRef.current < opts.maxReconnectAttempts) {
          reconnectAttemptRef.current++
          setIsReconnecting(true)
          setStatus('disconnected')
          
          const delay = opts.reconnectDelay * Math.pow(2, reconnectAttemptRef.current - 1)
          console.log(`[useRealtime] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect()
            }
          }, delay)
        } else {
          // Fall back to polling
          console.log('[useRealtime] Max reconnect attempts reached, falling back to polling')
          setStatus('error')
          setError('SSE connection failed, using polling fallback')
          setIsReconnecting(false)
          startPolling()
        }
      }
    } catch (err) {
      console.error('[useRealtime] Failed to create EventSource:', err)
      setStatus('error')
      setError('Failed to establish SSE connection')
      startPolling()
    }
  }, [opts.enabled, opts.maxReconnectAttempts, opts.reconnectDelay, dispatchEvent, stopPolling, startPolling])

  /**
   * Disconnect from SSE
   */
  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
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
    reconnectAttemptRef.current = 0
    disconnect()
    connect()
  }, [disconnect, connect])

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
    
    if (opts.enabled) {
      connect()
    }
    
    return () => {
      mountedRef.current = false
      disconnect()
    }
  }, [opts.enabled]) // eslint-disable-line react-hooks/exhaustive-deps

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
 */
export function useApplicationUpdates(
  onUpdate: (data: Record<string, unknown>) => void
): { isConnected: boolean } {
  const { isConnected, subscribe } = useRealtime()
  
  useEffect(() => {
    const unsubscribe = subscribe('application_update', onUpdate)
    return unsubscribe
  }, [subscribe, onUpdate])
  
  return { isConnected }
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
