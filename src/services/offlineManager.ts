/**
 * Offline Manager Service
 * Handles offline-first architecture with intelligent caching and sync
 * Requirements: 9.5 - Add offline-first architecture improvements
 */

interface QueuedRequest {
  id: string
  url: string
  method: string
  headers: Record<string, string>
  body?: any
  timestamp: number
  retryCount: number
  maxRetries: number
}

interface SyncStatus {
  isPending: boolean
  lastSyncAt?: Date
  pendingRequests: number
  failedRequests: number
}

class OfflineManager {
  private requestQueue: Map<string, QueuedRequest> = new Map()
  private syncInProgress = false
  private readonly STORAGE_KEY = 'offline_request_queue'
  private readonly MAX_RETRIES = 3
  private readonly SYNC_INTERVAL = 30000 // 30 seconds

  constructor() {
    this.loadQueue()
    this.setupEventListeners()
    this.startPeriodicSync()
  }

  /**
   * Check if the app is online
   */
  isOnline(): boolean {
    return navigator.onLine
  }

  /**
   * Queue a request for later execution when online
   */
  queueRequest(
    url: string,
    method: string,
    headers: Record<string, string> = {},
    body?: any
  ): string {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const queuedRequest: QueuedRequest = {
      id: requestId,
      url,
      method,
      headers,
      body,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: this.MAX_RETRIES
    }

    this.requestQueue.set(requestId, queuedRequest)
    this.saveQueue()

    // Try to sync immediately if online
    if (this.isOnline()) {
      this.syncQueue()
    }

    return requestId
  }

  /**
   * Get sync status
   */
  getSyncStatus(): SyncStatus {
    const pending = Array.from(this.requestQueue.values())
    const failed = pending.filter(r => r.retryCount >= r.maxRetries)

    return {
      isPending: this.syncInProgress,
      lastSyncAt: this.getLastSyncTime(),
      pendingRequests: pending.length - failed.length,
      failedRequests: failed.length
    }
  }

  /**
   * Manually trigger sync
   */
  async syncQueue(): Promise<void> {
    if (this.syncInProgress || !this.isOnline()) {
      return
    }

    this.syncInProgress = true

    try {
      const requests = Array.from(this.requestQueue.values())
        .filter(r => r.retryCount < r.maxRetries)
        .sort((a, b) => a.timestamp - b.timestamp)

      for (const request of requests) {
        try {
          await this.executeRequest(request)
          this.requestQueue.delete(request.id)
        } catch (error) {
          request.retryCount++
          if (request.retryCount >= request.maxRetries) {
            console.error('Request failed after max retries:', request.id, error)
          }
          this.requestQueue.set(request.id, request)
        }
      }

      this.saveQueue()
      this.setLastSyncTime(new Date())
    } finally {
      this.syncInProgress = false
    }
  }

  /**
   * Clear failed requests
   */
  clearFailedRequests(): void {
    const failed = Array.from(this.requestQueue.entries())
      .filter(([_, r]) => r.retryCount >= r.maxRetries)
      .map(([id]) => id)

    failed.forEach(id => this.requestQueue.delete(id))
    this.saveQueue()
  }

  /**
   * Get pending request count
   */
  getPendingCount(): number {
    return Array.from(this.requestQueue.values())
      .filter(r => r.retryCount < r.maxRetries)
      .length
  }

  /**
   * Execute a queued request
   */
  private async executeRequest(request: QueuedRequest): Promise<void> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? JSON.stringify(request.body) : undefined
    })

    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Setup event listeners for online/offline events
   */
  private setupEventListeners(): void {
    window.addEventListener('online', () => {
      console.log('Connection restored, syncing queued requests...')
      this.syncQueue()
    })

    window.addEventListener('offline', () => {
      console.log('Connection lost, requests will be queued')
    })

    // Listen for visibility change to sync when app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isOnline()) {
        this.syncQueue()
      }
    })
  }

  /**
   * Start periodic sync
   */
  private startPeriodicSync(): void {
    setInterval(() => {
      if (this.isOnline() && this.requestQueue.size > 0) {
        this.syncQueue()
      }
    }, this.SYNC_INTERVAL)
  }

  /**
   * Load queue from storage
   */
  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        this.requestQueue = new Map(Object.entries(data))
      }
    } catch (error) {
      console.error('Failed to load request queue:', error)
    }
  }

  /**
   * Save queue to storage
   */
  private saveQueue(): void {
    try {
      const data = Object.fromEntries(this.requestQueue)
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save request queue:', error)
    }
  }

  /**
   * Get last sync time
   */
  private getLastSyncTime(): Date | undefined {
    try {
      const stored = localStorage.getItem('offline_last_sync')
      return stored ? new Date(stored) : undefined
    } catch (error) {
      return undefined
    }
  }

  /**
   * Set last sync time
   */
  private setLastSyncTime(date: Date): void {
    try {
      localStorage.setItem('offline_last_sync', date.toISOString())
    } catch (error) {
      console.error('Failed to save last sync time:', error)
    }
  }

  /**
   * Cache critical data for offline access
   */
  async cacheData(key: string, data: any, ttl: number = 3600000): Promise<void> {
    try {
      const cacheEntry = {
        data,
        timestamp: Date.now(),
        ttl
      }
      localStorage.setItem(`cache_${key}`, JSON.stringify(cacheEntry))
    } catch (error) {
      console.error('Failed to cache data:', error)
    }
  }

  /**
   * Get cached data
   */
  getCachedData<T>(key: string): T | null {
    try {
      const stored = localStorage.getItem(`cache_${key}`)
      if (!stored) return null

      const cacheEntry = JSON.parse(stored)
      const age = Date.now() - cacheEntry.timestamp

      if (age > cacheEntry.ttl) {
        localStorage.removeItem(`cache_${key}`)
        return null
      }

      return cacheEntry.data as T
    } catch (error) {
      console.error('Failed to get cached data:', error)
      return null
    }
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('cache_')) {
          localStorage.removeItem(key)
        }
      })
    } catch (error) {
      console.error('Failed to clear cache:', error)
    }
  }

  /**
   * Prefetch critical resources
   */
  async prefetchResources(urls: string[]): Promise<void> {
    if (!('caches' in window)) {
      return
    }

    try {
      const cache = await caches.open('prefetch-cache')
      await Promise.all(
        urls.map(url => 
          cache.add(url).catch(err => 
            console.warn(`Failed to prefetch ${url}:`, err)
          )
        )
      )
    } catch (error) {
      console.error('Failed to prefetch resources:', error)
    }
  }
}

export const offlineManager = new OfflineManager()
