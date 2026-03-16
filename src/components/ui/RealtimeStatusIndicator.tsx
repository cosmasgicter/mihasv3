/**
 * RealtimeStatusIndicator Component
 * 
 * Visual indicator showing realtime connection status in dashboard headers.
 * Uses CSS-only animations for performance.
 * 
 * @requirements 3.4, 4.4 - Connection status indicators
 */

import { useRealtimeStatus } from '@/contexts/RealtimeStatusContext'

export interface RealtimeStatusIndicatorProps {
  /** Show "Live" label next to indicator */
  showLabel?: boolean
  /** Size of the indicator */
  size?: 'sm' | 'md'
  /** Additional CSS classes */
  className?: string
}

/**
 * Realtime connection status indicator
 * 
 * @example
 * ```tsx
 * // In dashboard header
 * <RealtimeStatusIndicator showLabel size="sm" />
 * ```
 */
export function RealtimeStatusIndicator({ 
  showLabel = false, 
  size = 'sm',
  className = ''
}: RealtimeStatusIndicatorProps) {
  const { isConnected, isReconnecting, lastConnectedAt } = useRealtimeStatus()

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3'
  }

  const getStatusColor = () => {
    if (isReconnecting) return 'bg-warning'
    if (isConnected) return 'bg-success'
    return 'bg-muted-foreground'
  }

  const getStatusLabel = () => {
    if (isReconnecting) return 'Reconnecting...'
    if (isConnected) return 'Live'
    return 'Offline'
  }

  const getAriaLabel = () => {
    if (isReconnecting) return 'Reconnecting to live updates'
    if (isConnected) {
      const timeAgo = lastConnectedAt 
        ? `Connected since ${lastConnectedAt.toLocaleTimeString()}`
        : 'Connected'
      return `Live updates active. ${timeAgo}`
    }
    return 'Live updates disconnected'
  }

  const getTooltip = () => {
    if (isReconnecting) return 'Attempting to reconnect...'
    if (isConnected) {
      return lastConnectedAt 
        ? `Live updates active\nConnected: ${lastConnectedAt.toLocaleTimeString()}`
        : 'Live updates active'
    }
    return 'Live updates disconnected. Changes may require refresh.'
  }

  return (
    <div 
      className={`inline-flex items-center gap-1.5 ${className}`}
      role="status"
      aria-label={getAriaLabel()}
      title={getTooltip()}
    >
      <span className="relative flex">
        <span 
          className={`
            ${sizeClasses[size]} 
            ${getStatusColor()} 
            rounded-full
            ${isConnected && !isReconnecting ? 'animate-pulse' : ''}
            ${isReconnecting ? 'animate-spin' : ''}
          `}
        />
        {/* Ping animation for connected state */}
        {isConnected && !isReconnecting && (
          <span 
            className={`
              absolute inline-flex h-full w-full rounded-full 
              bg-success opacity-75 animate-ping
            `}
            style={{ animationDuration: '2s' }}
          />
        )}
      </span>
      
      {showLabel && (
        <span className={`
          text-xs font-medium
          ${isConnected ? 'text-success dark:text-success' : ''}
          ${isReconnecting ? 'text-warning dark:text-warning' : ''}
          ${!isConnected && !isReconnecting ? 'text-muted-foreground dark:text-muted-foreground' : ''}
        `}>
          {getStatusLabel()}
        </span>
      )}
    </div>
  )
}

export default RealtimeStatusIndicator
