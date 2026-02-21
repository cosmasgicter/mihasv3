import { useState, useEffect, useCallback } from 'react'
import { offlineSyncService, OfflineSyncStatus } from '@/services/offlineSync'

/**
 * Hook for managing offline state and sync
 * Requirements: 9.5 - Add offline-first architecture improvements
 */
const emptyStatus: OfflineSyncStatus = {
  isPending: false,
  pendingRequests: 0,
  failedRequests: 0
}

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<OfflineSyncStatus>(emptyStatus)

  const updateSyncStatus = useCallback(async () => {
    const status = await offlineSyncService.getSyncStatus()
    setSyncStatus(status)
  }, [])

  useEffect(() => {
    offlineSyncService.init()
    updateSyncStatus()

    const handleOnline = async () => {
      setIsOnline(true)
      await offlineSyncService.syncQueue()
      await updateSyncStatus()
    }

    const handleOffline = () => {
      setIsOnline(false)
      updateSyncStatus()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const interval = setInterval(() => {
      updateSyncStatus()
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [updateSyncStatus])

  const queueRequest = useCallback(async (
    url: string,
    method: string,
    headers: Record<string, string> = {},
    body?: Record<string, unknown>
  ): Promise<string> => {
    const requestId = await offlineSyncService.queueRequest(url, method, headers, body)
    await updateSyncStatus()
    return requestId
  }, [updateSyncStatus])

  const syncNow = useCallback(async () => {
    await offlineSyncService.syncQueue()
    await updateSyncStatus()
  }, [updateSyncStatus])

  const clearFailed = useCallback(async () => {
    await offlineSyncService.clearFailedRequests()
    await updateSyncStatus()
  }, [updateSyncStatus])

  return {
    isOnline,
    syncStatus,
    queueRequest,
    syncNow,
    clearFailed,
  }
}

export default useOffline
