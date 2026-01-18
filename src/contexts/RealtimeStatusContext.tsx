/**
 * RealtimeStatusContext
 * 
 * Provides centralized realtime connection status tracking across the application.
 * Components can use this to show connection indicators and trigger reconnection.
 * 
 * @requirements 1.4, 3.4, 4.4 - Connection status indicators
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { 
  REALTIME_STATUS_EVENT, 
  REALTIME_RECONNECT_EVENT, 
  reconnectRealtime,
  type RealtimeStatusDetail 
} from '@/lib/supabase'

export interface RealtimeStatusContextValue {
  /** Whether realtime is currently connected */
  isConnected: boolean
  /** Whether a reconnection is in progress */
  isReconnecting: boolean
  /** Number of active channels */
  channelCount: number
  /** Current status string */
  status: string
  /** Timestamp of last successful connection */
  lastConnectedAt: Date | null
  /** Trigger a manual reconnection */
  reconnect: () => void
}

const RealtimeStatusContext = createContext<RealtimeStatusContextValue | null>(null)

interface RealtimeStatusProviderProps {
  children: ReactNode
}

const DEBOUNCE_MS = 300

export function RealtimeStatusProvider({ children }: RealtimeStatusProviderProps) {
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [channelCount, setChannelCount] = useState(0)
  const [status, setStatus] = useState('CLOSED')
  const [lastConnectedAt, setLastConnectedAt] = useState<Date | null>(null)
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Handle status updates with debouncing
  const handleStatusUpdate = useCallback((detail: RealtimeStatusDetail) => {
    // Clear existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Debounce rapid status updates
    debounceTimerRef.current = setTimeout(() => {
      setStatus(detail.status)
      setChannelCount(detail.channelCount)
      
      if (detail.connected) {
        setIsConnected(true)
        setIsReconnecting(false)
        setLastConnectedAt(new Date())
      } else {
        setIsConnected(false)
      }
    }, DEBOUNCE_MS)
  }, [])

  // Handle reconnect events
  const handleReconnectEvent = useCallback(() => {
    setIsReconnecting(true)
    
    // Reset reconnecting state after timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      setIsReconnecting(false)
    }, 10000) // 10 second timeout for reconnection
  }, [])

  // Manual reconnect function
  const reconnect = useCallback(() => {
    setIsReconnecting(true)
    reconnectRealtime()
  }, [])

  // Set up event listeners
  useEffect(() => {
    const handleStatus = (event: CustomEvent<RealtimeStatusDetail>) => {
      handleStatusUpdate(event.detail)
    }

    const handleReconnect = () => {
      handleReconnectEvent()
    }

    window.addEventListener(REALTIME_STATUS_EVENT, handleStatus as EventListener)
    window.addEventListener(REALTIME_RECONNECT_EVENT, handleReconnect)

    return () => {
      window.removeEventListener(REALTIME_STATUS_EVENT, handleStatus as EventListener)
      window.removeEventListener(REALTIME_RECONNECT_EVENT, handleReconnect)
      
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [handleStatusUpdate, handleReconnectEvent])

  const value: RealtimeStatusContextValue = {
    isConnected,
    isReconnecting,
    channelCount,
    status,
    lastConnectedAt,
    reconnect
  }

  return (
    <RealtimeStatusContext.Provider value={value}>
      {children}
    </RealtimeStatusContext.Provider>
  )
}

/**
 * Hook to access realtime connection status
 * 
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { isConnected, reconnect } = useRealtimeStatus()
 *   
 *   return (
 *     <div>
 *       {isConnected ? 'Live' : 'Offline'}
 *       <button onClick={reconnect}>Reconnect</button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useRealtimeStatus(): RealtimeStatusContextValue {
  const context = useContext(RealtimeStatusContext)
  
  if (!context) {
    // Return default values if used outside provider (graceful degradation)
    return {
      isConnected: false,
      isReconnecting: false,
      channelCount: 0,
      status: 'CLOSED',
      lastConnectedAt: null,
      reconnect: () => {}
    }
  }
  
  return context
}

export default RealtimeStatusContext
