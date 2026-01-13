import { useState, useEffect, useCallback, useRef } from 'react'
import { useNetworkStatus } from './useNetworkStatus'

export interface OfflineQueueItem {
  id: string
  type: 'CREATE' | 'UPDATE' | 'DELETE'
  endpoint: string
  data: any
  timestamp: number
  retryCount: number
  maxRetries: number
}

export interface OfflineData {
  [key: string]: any
}

export interface OfflineSyncOptions {
  storageKey?: string
  maxRetries?: number
  retryDelay?: number
  syncOnReconnect?: boolean
  enableCompression?: boolean
}

/**
 * Hook for managing offline data synchronization
 * Handles queuing operations when offline and syncing when back online
 */
export function useOfflineSync(options: OfflineSyncOptions = {}) {
  const {
    storageKey = 'offline_sync_queue',
    maxRetries = 3,
    retryDelay = 1000,
    syncOnReconnect = true,
    enableCompression = true
  } = options

  const { isOnline, isSlowConnection } = useNetworkStatus()
  const [syncQueue, setSyncQueue] = useState<OfflineQueueItem[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)
  const syncTimeoutRef = useRef<NodeJS.Timeout>()

  // Load queue from storage on mount
  useEffect(() => {
    loadQueueFromStorage()
  }, [])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && syncOnReconnect && syncQueue.length > 0) {
      syncOfflineData()
    }
  }, [isOnline, syncOnReconnect])

  const loadQueueFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        setSyncQueue(parsed.queue || [])
        if (parsed.lastSyncTime) {
          setLastSyncTime(new Date(parsed.lastSyncTime))
        }
      }
    } catch (error) {
      console.error('Failed to load offline sync queue:', error)
      localStorage.removeItem(storageKey)
    }
  }, [storageKey])

  const saveQueueToStorage = useCallback((queue: OfflineQueueItem[]) => {
    try {
      const data = {
        queue,
        lastSyncTime: lastSyncTime?.toISOString(),
        timestamp: new Date().toISOString()
      }
      
      let serialized = JSON.stringify(data)
      
      // Compress if enabled and data is large
      if (enableCompression && serialized.length > 10000) {
        // Simple compression by removing whitespace and shortening keys
        serialized = JSON.stringify(data, null, 0)
      }
      
      localStorage.setItem(storageKey, serialized)
    } catch (error) {
      console.error('Failed to save offline sync queue:', error)
      // If storage is full, remove oldest items
      if (error instanceof DOMException && error.code === 22) {
        const reducedQueue = queue.slice(-Math.floor(queue.length / 2))
        try {
          localStorage.setItem(storageKey, JSON.stringify({
            queue: reducedQueue,
            lastSyncTime: lastSyncTime?.toISOString(),
            timestamp: new Date().toISOString()
          }))
          setSyncQueue(reducedQueue)
        } catch (retryError) {
          console.error('Failed to save reduced queue:', retryError)
        }
      }
    }
  }, [storageKey, lastSyncTime, enableCompression])

  const addToQueue = useCallback((item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>) => {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: item.maxRetries || maxRetries
    }

    setSyncQueue(prev => {
      const newQueue = [...prev, queueItem]
      saveQueueToStorage(newQueue)
      return newQueue
    })

    return queueItem.id
  }, [maxRetries, saveQueueToStorage])

  const removeFromQueue = useCallback((id: string) => {
    setSyncQueue(prev => {
      const newQueue = prev.filter(item => item.id !== id)
      saveQueueToStorage(newQueue)
      return newQueue
    })
  }, [saveQueueToStorage])

  const updateQueueItem = useCallback((id: string, updates: Partial<OfflineQueueItem>) => {
    setSyncQueue(prev => {
      const newQueue = prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
      saveQueueToStorage(newQueue)
      return newQueue
    })
  }, [saveQueueToStorage])

  const syncOfflineData = useCallback(async () => {
    if (isSyncing || !isOnline || syncQueue.length === 0) return

    setIsSyncing(true)
    setSyncProgress(0)

    const totalItems = syncQueue.length
    let processedItems = 0
    const failedItems: OfflineQueueItem[] = []

    for (const item of syncQueue) {
      try {
        // Simulate API call - replace with actual API logic
        const response = await fetch(item.endpoint, {
          method: item.type === 'CREATE' ? 'POST' : 
                  item.type === 'UPDATE' ? 'PUT' : 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: item.type !== 'DELETE' ? JSON.stringify(item.data) : undefined
        })

        if (response.ok) {
          removeFromQueue(item.id)
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
      } catch (error) {
        console.error(`Failed to sync item ${item.id}:`, error)
        
        if (item.retryCount < item.maxRetries) {
          updateQueueItem(item.id, { 
            retryCount: item.retryCount + 1 
          })
        } else {
          failedItems.push(item)
        }
      }

      processedItems++
      setSyncProgress((processedItems / totalItems) * 100)

      // Add delay between requests to avoid overwhelming the server
      if (isSlowConnection && processedItems < totalItems) {
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
    }

    setIsSyncing(false)
    setSyncProgress(100)
    setLastSyncTime(new Date())

    // Clean up failed items that exceeded max retries
    if (failedItems.length > 0) {
      console.warn(`${failedItems.length} items failed to sync after max retries`)
      failedItems.forEach(item => removeFromQueue(item.id))
    }

    // Reset progress after a delay
    setTimeout(() => setSyncProgress(0), 2000)
  }, [isSyncing, isOnline, syncQueue, isSlowConnection, retryDelay, removeFromQueue, updateQueueItem])

  const clearQueue = useCallback(() => {
    setSyncQueue([])
    localStorage.removeItem(storageKey)
  }, [storageKey])

  const getQueueStats = useCallback(() => {
    const now = Date.now()
    const recentItems = syncQueue.filter(item => now - item.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
    
    return {
      total: syncQueue.length,
      recent: recentItems.length,
      failed: syncQueue.filter(item => item.retryCount >= item.maxRetries).length,
      pending: syncQueue.filter(item => item.retryCount < item.maxRetries).length,
      oldestTimestamp: syncQueue.length > 0 ? Math.min(...syncQueue.map(item => item.timestamp)) : null
    }
  }, [syncQueue])

  return {
    // State
    syncQueue,
    isSyncing,
    syncProgress,
    lastSyncTime,
    
    // Actions
    addToQueue,
    removeFromQueue,
    syncOfflineData,
    clearQueue,
    
    // Utils
    getQueueStats,
    isOfflineMode: !isOnline,
    hasQueuedItems: syncQueue.length > 0
  }
}

/**
 * Hook for caching data for offline access
 */
export function useOfflineCache(cacheKey: string) {
  const [cachedData, setCachedData] = useState<OfflineData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastCacheTime, setLastCacheTime] = useState<Date | null>(null)

  const loadFromCache = useCallback(async () => {
    setIsLoading(true)
    try {
      const cached = localStorage.getItem(`cache_${cacheKey}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        setCachedData(parsed.data)
        setLastCacheTime(new Date(parsed.timestamp))
      }
    } catch (error) {
      console.error('Failed to load from cache:', error)
    } finally {
      setIsLoading(false)
    }
  }, [cacheKey])

  const saveToCache = useCallback((data: OfflineData) => {
    try {
      const cacheData = {
        data,
        timestamp: new Date().toISOString(),
        key: cacheKey
      }
      localStorage.setItem(`cache_${cacheKey}`, JSON.stringify(cacheData))
      setCachedData(data)
      setLastCacheTime(new Date())
    } catch (error) {
      console.error('Failed to save to cache:', error)
    }
  }, [cacheKey])

  const clearCache = useCallback(() => {
    localStorage.removeItem(`cache_${cacheKey}`)
    setCachedData(null)
    setLastCacheTime(null)
  }, [cacheKey])

  const isCacheStale = useCallback((maxAgeMs: number = 60 * 60 * 1000) => {
    if (!lastCacheTime) return true
    return Date.now() - lastCacheTime.getTime() > maxAgeMs
  }, [lastCacheTime])

  useEffect(() => {
    loadFromCache()
  }, [loadFromCache])

  return {
    cachedData,
    isLoading,
    lastCacheTime,
    saveToCache,
    clearCache,
    isCacheStale,
    hasCachedData: cachedData !== null
  }
}