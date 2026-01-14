import { useState, useEffect, useCallback } from 'react'
import { offlineManager } from '@/services/offlineManager'

/**
 * Hook for managing offline state and sync
 * Requirements: 9.5 - Add offline-first architecture improvements
 */
export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState(offlineManager.getSyncStatus())

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      updateSyncStatus()
    }

    const handleOffline = () => {
      setIsOnline(false)
      updateSyncStatus()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Update sync status periodically
    const interval = setInterval(updateSyncStatus, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [])

  const updateSyncStatus = useCallback(() => {
    setSyncStatus(offlineManager.getSyncStatus())
  }, [])

  const queueRequest = useCallback((
    url: string,
    method: string,
    headers: Record<string, string> = {},
    body?: any
  ): string => {
    const requestId = offlineManager.queueRequest(url, method, headers, body)
    updateSyncStatus()
    return requestId
  }, [updateSyncStatus])

  const syncNow = useCallback(async () => {
    await offlineManager.syncQueue()
    updateSyncStatus()
  }, [updateSyncStatus])

  const clearFailed = useCallback(() => {
    offlineManager.clearFailedRequests()
    updateSyncStatus()
  }, [updateSyncStatus])

  const cacheData = useCallback(async (key: string, data: any, ttl?: number) => {
    await offlineManager.cacheData(key, data, ttl)
  }, [])

  const getCachedData = useCallback(<T,>(key: string): T | null => {
    return offlineManager.getCachedData<T>(key)
  }, [])

  const clearCache = useCallback(() => {
    offlineManager.clearCache()
  }, [])

  const prefetchResources = useCallback(async (urls: string[]) => {
    await offlineManager.prefetchResources(urls)
  }, [])

  return {
    isOnline,
    syncStatus,
    queueRequest,
    syncNow,
    clearFailed,
    cacheData,
    getCachedData,
    clearCache,
    prefetchResources
  }
}

export default useOffline
