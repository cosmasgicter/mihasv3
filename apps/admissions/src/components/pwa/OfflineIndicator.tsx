import React, { useState, useEffect, useCallback } from 'react'
import { WifiOff, Wifi, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { offlineSyncService, type OfflineSyncStatus } from '@/services/offlineSync'

/**
 * Offline Indicator Component
 * Shows connection status and pending sync operations
 * Requirements: 9.5 - Add offline-first architecture improvements
 */
const emptyStatus: OfflineSyncStatus = {
  isPending: false,
  pendingRequests: 0,
  failedRequests: 0,
  failedItems: []
}

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>(emptyStatus)
  const [showDetails, setShowDetails] = useState(false)

  const refreshSyncStatus = useCallback(async () => {
    setSyncStatus(await offlineSyncService.getSyncStatus())
  }, [])

  useEffect(() => {
    offlineSyncService.init()
    refreshSyncStatus()

    const handleOnline = async () => {
      setIsOnline(true)
      await offlineSyncService.syncQueue()
      await refreshSyncStatus()
    }

    const handleOffline = () => {
      setIsOnline(false)
      refreshSyncStatus()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const interval = setInterval(() => {
      refreshSyncStatus()
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [refreshSyncStatus])

  const handleSync = async () => {
    await offlineSyncService.syncQueue()
    await refreshSyncStatus()
  }

  const handleClearFailed = async () => {
    await offlineSyncService.clearFailedRequests()
    await refreshSyncStatus()
  }

  if (isOnline && syncStatus.pendingRequests === 0 && syncStatus.failedRequests === 0) {
    return null
  }

  return (
    <div className="fixed top-16 left-4 right-4 md:left-auto md:right-4 z-40 animate-slide-up">
      <div className="bg-background border rounded-lg shadow-lg p-3 w-full md:min-w-[280px] md:w-auto">
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
                <RefreshCw className="h-3 w-3 animate-pulse text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {syncStatus.pendingRequests > 0 && `${syncStatus.pendingRequests} pending`}
                {syncStatus.failedRequests > 0 && ` • ${syncStatus.failedRequests} failed`}
              </span>
            </div>
          )}
        </div>

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
                <div>
                  <p>
                    {syncStatus.failedRequests} {syncStatus.failedRequests === 1 ? 'change' : 'changes'} failed to sync
                  </p>
                  {syncStatus.failedItems.length > 0 && (
                    <ul className="mt-1 space-y-1">
                      {syncStatus.failedItems.map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {item.type === 'application_draft' ? 'Draft save' :
                             item.type === 'form_submission' ? 'Form submission' :
                             'Document upload'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async (e) => {
                              e.stopPropagation()
                              await offlineSyncService.retryFailedItem(item.id)
                              await refreshSyncStatus()
                            }}
                            className="h-5 px-1.5 text-[10px] shrink-0"
                          >
                            Retry
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}

            {syncStatus.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(syncStatus.lastSyncAt).toLocaleTimeString()}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              {isOnline && syncStatus.pendingRequests > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSync}
                  disabled={syncStatus.isPending}
                  className="flex-1 text-xs"
                  loading={syncStatus.isPending}
                >
                  {!syncStatus.isPending && <RefreshCw className="h-3 w-3 mr-1" />}
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
