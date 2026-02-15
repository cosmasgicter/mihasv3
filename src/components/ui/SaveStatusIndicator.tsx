import React from 'react'
import { 
  CheckCircle, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  Clock, 
  RefreshCw,
  AlertTriangle,
  Save
} from 'lucide-react'
import { Button } from './Button'

export interface SaveStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict'
  lastSaved?: Date | null
  saveError?: string | null
  isOnline?: boolean
  saveAttempts?: number
  timeUntilNextSave?: string | null
  saveQueue?: number
  onForceSave?: () => void
  onResolveConflict?: (useLocal: boolean) => void
  className?: string
}

/**
 * Visual indicator for auto-save status with user feedback
 * Requirements: 9.3 - Provide user feedback on save status
 */
export const SaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status,
  lastSaved,
  saveError,
  isOnline = true,
  saveAttempts = 0,
  timeUntilNextSave,
  saveQueue = 0,
  onForceSave,
  onResolveConflict,
  className = ''
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'saving':
        return <RefreshCw className="h-4 w-4 animate-spin text-primary" />
      case 'saved':
        return <CheckCircle className="h-4 w-4 text-success" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />
      case 'offline':
        return <WifiOff className="h-4 w-4 text-warning" />
      case 'conflict':
        return <AlertTriangle className="h-4 w-4 text-warning" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'saving':
        return 'Saving...'
      case 'saved':
        return isOnline ? 'Saved' : 'Saved locally'
      case 'error':
        return saveAttempts > 0 ? `Save failed (${saveAttempts} attempts)` : 'Save failed'
      case 'offline':
        return 'Offline - saved locally'
      case 'conflict':
        return 'Conflict detected'
      default:
        return 'Ready to save'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'saving':
        return 'text-primary'
      case 'saved':
        return 'text-success'
      case 'error':
        return 'text-destructive'
      case 'offline':
        return 'text-warning'
      case 'conflict':
        return 'text-warning'
      default:
        return 'text-muted-foreground'
    }
  }

  const formatLastSaved = () => {
    if (!lastSaved) return null
    
    const now = Date.now()
    const diff = now - lastSaved.getTime()
    const seconds = Math.floor(diff / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex items-center gap-2 transition-all duration-200"
      >
        {getStatusIcon()}
        
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          
          {/* Additional status information */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {lastSaved && status === 'saved' && (
              <span>{formatLastSaved()}</span>
            )}
            
            {timeUntilNextSave && status !== 'saving' && (
              <span>Next save in {timeUntilNextSave}</span>
            )}
            
            {saveQueue > 0 && (
              <span className="text-warning">
                {saveQueue} queued
              </span>
            )}
            
            {!isOnline && (
              <div className="flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                <span>Offline</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {status === 'error' && onForceSave && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onForceSave}
            className="h-8 px-2 text-xs"
          >
            <Save className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
        
        {status === 'conflict' && onResolveConflict && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolveConflict(true)}
              className="h-8 px-2 text-xs text-primary"
            >
              Keep Local
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolveConflict(false)}
              className="h-8 px-2 text-xs text-muted-foreground"
            >
              Use Saved
            </Button>
          </div>
        )}
      </div>

      {/* Error details tooltip */}
      {saveError && status === 'error' && (
        <div
          className="absolute top-full left-0 mt-1 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive max-w-xs z-10 animate-fade-in"
        >
          {saveError}
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for mobile/small spaces
 */
export const CompactSaveStatusIndicator: React.FC<SaveStatusIndicatorProps> = ({
  status,
  isOnline = true,
  saveQueue = 0,
  onForceSave,
  className = ''
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case 'saving':
        return <RefreshCw className="h-3 w-3 animate-spin text-primary" />
      case 'saved':
        return <CheckCircle className="h-3 w-3 text-success" />
      case 'error':
        return <AlertCircle className="h-3 w-3 text-destructive" />
      case 'offline':
        return <WifiOff className="h-3 w-3 text-warning" />
      case 'conflict':
        return <AlertTriangle className="h-3 w-3 text-warning" />
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div
        className="flex items-center gap-1 transition-all duration-200"
      >
        {getStatusIcon()}
        
        {saveQueue > 0 && (
          <span className="text-xs text-warning font-medium">
            {saveQueue}
          </span>
        )}
        
        {!isOnline && (
          <WifiOff className="h-3 w-3 text-muted-foreground" />
        )}
      </div>

      {status === 'error' && onForceSave && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onForceSave}
          className="h-6 w-6 p-0"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

export default SaveStatusIndicator
