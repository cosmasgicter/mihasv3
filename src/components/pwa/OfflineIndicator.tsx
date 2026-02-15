import React, { useState, useEffect } from 'react'
import { WifiOff, Wifi, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { offlineManager } from '@/services/offlineManager'

/**
 * Offline Indicator Component
 * Shows connection status and pending sync operations
 * Requirements: 9.5 - Add offline-first architecture improvements
 */
export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState(offlineManager.getSyncStatus())
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Update sync status periodically
    const interval = setInterval(() => {
      setSyncStatus(offlineManager.getSyncStatus())
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  const handleSync = async () => {
    await offlineManager.syncQueue()
    setSyncStatus(offlineManager.getSyncStatus())
  }

  const handleClearFailed = () => {
    offlineManager.clearFailedRequests()
    setSyncStatus(offlineManager.getSyncStatus())
  }

  // Don't show anything if online and no pending requests
  if (isOnline && syncStatus.pendingRequests === 0 && syncStatus.failedRequests === 0) {
    return null
  }

  return (
    <div className="fixed top-16 right-4 z-40 animate-slide-up">
      <div className="bg-background border rounded-lg shadow-lg p-3 min-w-[280px]">
        {/* Status Header */}
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowDetails(!showDetails)}
        >
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-success" />
            ) : (
              <WifiOff className="h-4 w-4 text-warning" />
            )}
            <span className="text-sm font-medium">
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {(syncStatus.pendingRequests > 0 || syncStatus.failedRequests > 0) && (
            <div className="flex items-center gap-2">
              {syncStatus.isPending && (
                <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {syncStatus.pendingRequests > 0 && `${syncStatus.pendingRequests} pending`}
                {syncStatus.failedRequests > 0 && ` • ${syncStatus.failedRequests} failed`}
              </span>
            </div>
          )}
        </div>

        {/* Details Panel */}
        {showDetails && (
          <div className="mt-3 pt-3 border-t space-y-2 animate-fade-in">
            {!isOnline && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <WifiOff className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <p>
                  You're offline. Changes will be saved locally and synced when you're back online.
                </p>
              </div>
            )}

            {syncStatus.pendingRequests > 0 && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <p>
                  {syncStatus.pendingRequests} {syncStatus.pendingRequests === 1 ? 'change' : 'changes'} waiting to sync
                </p>
              </div>
            )}

            {syncStatus.failedRequests > 0 && (
              <div className="flex items-start gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <p>
                  {syncStatus.failedRequests} {syncStatus.failedRequests === 1 ? 'change' : 'changes'} failed to sync
                </p>
              </div>
            )}

            {syncStatus.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(syncStatus.lastSyncAt).toLocaleTimeString()}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              {isOnline && syncStatus.pendingRequests > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncStatus.isPending}
                  className="flex-1 text-xs"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${syncStatus.isPending ? 'animate-spin' : ''}`} />
                  Sync Now
                </Button>
              )}

              {syncStatus.failedRequests > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleClearFailed}
                  className="flex-1 text-xs"
                >
                  Clear Failed
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OfflineIndicator
