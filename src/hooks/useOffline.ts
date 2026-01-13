/**
 * React hook for offline functionality
 * Requirements: 9.2 - Enable offline form completion and data entry, implement sync mechanisms
 */

import { useState, useEffect, useCallback } from 'react'
import { offlineManager, SyncResult } from '@/lib/offlineManager'
import { useAuth } from '@/contexts/AuthContext'

export interface OfflineStatus {
  isOnline: boolean
  isOffline: boolean
  syncStatus: {
    pending: number
    synced: number
    errors: number
  }
  isSyncing: boolean
  lastSyncResult: SyncResult | null
}

export function useOffline() {
  const { user } = useAuth()
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState({ pending: 0, synced: 0, errors: 0 })
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null)

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Update sync status periodically
  useEffect(() => {
    const updateSyncStatus = () => {
      setSyncStatus(offlineManager.getSyncStatus())
    }

    updateSyncStatus()
    const interval = setInterval(updateSyncStatus, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  // Initialize offline manager
  useEffect(() => {
    offlineManager.init()
    return () => offlineManager.cleanup()
  }, [])

  /**
   * Save form data for offline completion
   */
  const saveOfflineForm = useCallback(async (formId: string, formData: any) => {
    try {
      await offlineManager.saveOfflineForm(formId, formData, user?.id)
      setSyncStatus(offlineManager.getSyncStatus())
    } catch (error) {
      console.error('Failed to save offline form:', error)
      throw error
    }
  }, [user?.id])

  /**
   * Get offline form data
   */
  const getOfflineForm = useCallback((formId: string) => {
    return offlineManager.getOfflineForm(formId, user?.id)
  }, [user?.id])

  /**
   * Cache data for offline access
   */
  const cacheData = useCallback(async (type: string, data: any) => {
    try {
      await offlineManager.cacheData(type, data, user?.id)
    } catch (error) {
      console.error('Failed to cache data:', error)
      throw error
    }
  }, [user?.id])

  /**
   * Get cached data by type
   */
  const getCachedData = useCallback((type: string) => {
    return offlineManager.getCachedDataByType(type, user?.id)
  }, [user?.id])

  /**
   * Manually trigger sync
   */
  const syncNow = useCallback(async () => {
    if (isSyncing || !isOnline) return

    setIsSyncing(true)
    try {
      const result = await offlineManager.syncPendingData()
      setLastSyncResult(result)
      setSyncStatus(offlineManager.getSyncStatus())
      return result
    } catch (error) {
      console.error('Sync failed:', error)
      throw error
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, isOnline])

  /**
   * Clear synced data to free up space
   */
  const clearSyncedData = useCallback(() => {
    offlineManager.clearSyncedData()
    setSyncStatus(offlineManager.getSyncStatus())
  }, [])

  const status: OfflineStatus = {
    isOnline,
    isOffline: !isOnline,
    syncStatus,
    isSyncing,
    lastSyncResult
  }

  return {
    ...status,
    saveOfflineForm,
    getOfflineForm,
    cacheData,
    getCachedData,
    syncNow,
    clearSyncedData
  }
}

/**
 * Hook for offline-first data fetching
 */
export function useOfflineData<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: {
    cacheFirst?: boolean
    maxAge?: number // in milliseconds
  } = {}
) {
  const { cacheData, getCachedData, isOnline } = useOffline()
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [fromCache, setFromCache] = useState(false)

  const { cacheFirst = true, maxAge = 5 * 60 * 1000 } = options // 5 minutes default

  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      setLoading(true)
      setError(null)

      try {
        // Try cache first if enabled
        if (cacheFirst) {
          const cachedData = getCachedData(key)
          if (cachedData.length > 0) {
            const cached = cachedData[0]
            const age = Date.now() - cached.timestamp
            
            if (age < maxAge) {
              if (mounted) {
                setData(cached)
                setFromCache(true)
                setLoading(false)
              }
              return
            }
          }
        }

        // Fetch fresh data if online
        if (isOnline) {
          const freshData = await fetchFn()
          
          if (mounted) {
            setData(freshData)
            setFromCache(false)
            setLoading(false)
            
            // Cache the fresh data
            await cacheData(key, freshData)
          }
        } else {
          // Offline: use cached data regardless of age
          const cachedData = getCachedData(key)
          if (cachedData.length > 0) {
            if (mounted) {
              setData(cachedData[0])
              setFromCache(true)
              setLoading(false)
            }
          } else {
            throw new Error('No cached data available offline')
          }
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Unknown error'))
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [key, isOnline, cacheFirst, maxAge, fetchFn, cacheData, getCachedData])

  return { data, loading, error, fromCache }
}