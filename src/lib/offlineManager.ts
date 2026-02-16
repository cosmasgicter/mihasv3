// @ts-nocheck
/**
 * Offline Manager for MIHAS Application System
 * Handles offline data caching, form completion, and sync mechanisms
 * Requirements: 9.2 - Cache critical data for offline access, enable offline form completion, implement sync mechanisms
 * 
 * @deprecated This module uses the deprecated Supabase stub.
 * TODO: Migrate to API endpoints when offline manager is reactivated.
 */

import { apiClient } from '@/services/client'

export interface OfflineData {
  id: string
  type: 'application' | 'profile' | 'documents' | 'eligibility'
  data: any
  timestamp: number
  userId?: string
  syncStatus: 'pending' | 'synced' | 'error'
  lastModified: number
}

export interface SyncResult {
  success: boolean
  synced: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

class OfflineManager {
  private readonly STORAGE_KEY = 'mihas_offline_data'
  private readonly CACHE_KEY = 'mihas_cache'
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024 // 50MB
  private readonly SYNC_RETRY_DELAY = 5000 // 5 seconds
  private syncInProgress = false
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Cache critical data for offline access
   */
  async cacheData(type: string, data: any, userId?: string): Promise<void> {
    try {
      const cacheData = this.getCachedData()
      const id = `${type}_${userId || 'anonymous'}_${Date.now()}`
      
      cacheData[id] = {
        id,
        type: type as any,
        data,
        timestamp: Date.now(),
        userId,
        syncStatus: 'synced',
        lastModified: Date.now()
      }

      // Check cache size and cleanup if needed
      await this.cleanupCache(cacheData)
      
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(cacheData))
    } catch (error) {
      console.error('Failed to cache data:', error)
    }
  }

  /**
   * Get cached data by type
   */
  getCachedDataByType(type: string, userId?: string): any[] {
    try {
      const cacheData = this.getCachedData()
      return Object.values(cacheData)
        .filter(item => item.type === type && (!userId || item.userId === userId))
        .map(item => item.data)
    } catch (error) {
      console.error('Failed to get cached data:', error)
      return []
    }
  }

  /**
   * Save form data for offline completion
   */
  async saveOfflineForm(formId: string, formData: any, userId?: string): Promise<void> {
    try {
      const offlineData = this.getOfflineData()
      const id = `form_${formId}_${userId || 'anonymous'}`
      
      offlineData[id] = {
        id,
        type: 'application',
        data: {
          formId,
          formData,
          completedAt: Date.now()
        },
        timestamp: Date.now(),
        userId,
        syncStatus: 'pending',
        lastModified: Date.now()
      }

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(offlineData))
      
      // Attempt to sync if online
      if (navigator.onLine) {
        this.syncPendingData()
      }
    } catch (error) {
      console.error('Failed to save offline form:', error)
      throw error
    }
  }

  /**
   * Get offline form data
   */
  getOfflineForm(formId: string, userId?: string): any | null {
    try {
      const offlineData = this.getOfflineData()
      const id = `form_${formId}_${userId || 'anonymous'}`
      const item = offlineData[id]
      
      return item ? item.data.formData : null
    } catch (error) {
      console.error('Failed to get offline form:', error)
      return null
    }
  }

  /**
   * Sync pending data when connectivity returns
   */
  async syncPendingData(): Promise<SyncResult> {
    if (this.syncInProgress) {
      return { success: false, synced: 0, failed: 0, errors: [{ id: 'sync', error: 'Sync already in progress' }] }
    }

    this.syncInProgress = true
    const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] }

    try {
      const offlineData = this.getOfflineData()
      const pendingItems = Object.values(offlineData).filter(item => item.syncStatus === 'pending')

      for (const item of pendingItems) {
        try {
          await this.syncItem(item)
          item.syncStatus = 'synced'
          result.synced++
        } catch (error) {
          item.syncStatus = 'error'
          result.failed++
          result.errors.push({
            id: item.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          
          // Schedule retry
          this.scheduleRetry(item.id)
        }
      }

      // Update storage with sync results
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(offlineData))
      
      result.success = result.failed === 0
    } catch (error) {
      result.success = false
      result.errors.push({
        id: 'sync_general',
        error: error instanceof Error ? error.message : 'Sync failed'
      })
    } finally {
      this.syncInProgress = false
    }

    return result
  }

  /**
   * Check if device is online and sync if needed
   */
  async checkAndSync(): Promise<void> {
    if (navigator.onLine && this.hasPendingData()) {
      await this.syncPendingData()
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus(): { pending: number; synced: number; errors: number } {
    try {
      const offlineData = this.getOfflineData()
      const items = Object.values(offlineData)
      
      return {
        pending: items.filter(item => item.syncStatus === 'pending').length,
        synced: items.filter(item => item.syncStatus === 'synced').length,
        errors: items.filter(item => item.syncStatus === 'error').length
      }
    } catch (error) {
      return { pending: 0, synced: 0, errors: 0 }
    }
  }

  /**
   * Clear synced data to free up space
   */
  clearSyncedData(): void {
    try {
      const offlineData = this.getOfflineData()
      const filteredData: Record<string, OfflineData> = {}
      
      Object.values(offlineData).forEach(item => {
        if (item.syncStatus !== 'synced') {
          filteredData[item.id] = item
        }
      })
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredData))
    } catch (error) {
      console.error('Failed to clear synced data:', error)
    }
  }

  /**
   * Get all offline data
   */
  private getOfflineData(): Record<string, OfflineData> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('Failed to parse offline data:', error)
      return {}
    }
  }

  /**
   * Get all cached data
   */
  private getCachedData(): Record<string, OfflineData> {
    try {
      const data = localStorage.getItem(this.CACHE_KEY)
      return data ? JSON.parse(data) : {}
    } catch (error) {
      console.error('Failed to parse cached data:', error)
      return {}
    }
  }

  /**
   * Sync individual item to server
   */
  private async syncItem(item: OfflineData): Promise<void> {
    switch (item.type) {
      case 'application':
        await this.syncApplication(item)
        break
      case 'profile':
        await this.syncProfile(item)
        break
      case 'documents':
        await this.syncDocuments(item)
        break
      default:
        throw new Error(`Unknown sync type: ${item.type}`)
    }
  }

  /**
   * Sync application data
   */
  private async syncApplication(item: OfflineData): Promise<void> {
    const { formId, formData } = item.data
    
    // Check if this is a new application or update
    const { data: existingApp, error: fetchError } = await supabase
      .from('applications')
      .select('id')
      .eq('user_id', item.userId)
      .eq('id', formId)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError
    }

    if (existingApp) {
      // Update existing application
      const { error } = await supabase
        .from('applications')
        .update({
          ...formData,
          updated_at: new Date().toISOString()
        })
        .eq('id', formId)

      if (error) throw error
    } else {
      // Create new application
      const { error } = await supabase
        .from('applications')
        .insert({
          ...formData,
          user_id: item.userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })

      if (error) throw error
    }
  }

  /**
   * Sync profile data
   */
  private async syncProfile(item: OfflineData): Promise<void> {
    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        ...item.data,
        user_id: item.userId,
        updated_at: new Date().toISOString()
      })

    if (error) throw error
  }

  /**
   * Sync document data
   */
  private async syncDocuments(item: OfflineData): Promise<void> {
    // Documents require special handling for file uploads
    // This would need to be implemented based on the specific document structure
    console.log('Document sync not yet implemented:', item)
  }

  /**
   * Schedule retry for failed sync
   */
  private scheduleRetry(itemId: string): void {
    // Clear existing timeout
    const existingTimeout = this.retryTimeouts.get(itemId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Schedule new retry
    const timeout = setTimeout(() => {
      this.retrySync(itemId)
      this.retryTimeouts.delete(itemId)
    }, this.SYNC_RETRY_DELAY)

    this.retryTimeouts.set(itemId, timeout)
  }

  /**
   * Retry sync for specific item
   */
  private async retrySync(itemId: string): Promise<void> {
    try {
      const offlineData = this.getOfflineData()
      const item = offlineData[itemId]
      
      if (item && item.syncStatus === 'error') {
        await this.syncItem(item)
        item.syncStatus = 'synced'
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(offlineData))
      }
    } catch (error) {
      console.error(`Retry sync failed for ${itemId}:`, error)
      // Will be retried again on next sync attempt
    }
  }

  /**
   * Check if there's pending data to sync
   */
  private hasPendingData(): boolean {
    const offlineData = this.getOfflineData()
    return Object.values(offlineData).some(item => item.syncStatus === 'pending')
  }

  /**
   * Cleanup cache to maintain size limits
   */
  private async cleanupCache(cacheData: Record<string, OfflineData>): Promise<void> {
    const cacheSize = JSON.stringify(cacheData).length
    
    if (cacheSize > this.MAX_CACHE_SIZE) {
      // Remove oldest entries until under limit
      const sortedEntries = Object.values(cacheData)
        .sort((a, b) => a.timestamp - b.timestamp)
      
      while (JSON.stringify(cacheData).length > this.MAX_CACHE_SIZE * 0.8 && sortedEntries.length > 0) {
        const oldest = sortedEntries.shift()
        if (oldest) {
          delete cacheData[oldest.id]
        }
      }
    }
  }

  /**
   * Initialize offline manager
   */
  init(): void {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      console.log('Connection restored, syncing pending data...')
      this.checkAndSync()
    })

    window.addEventListener('offline', () => {
      console.log('Connection lost, switching to offline mode')
    })

    // Initial sync check
    if (navigator.onLine) {
      this.checkAndSync()
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Clear all retry timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout))
    this.retryTimeouts.clear()
  }
}

// Export singleton instance
export const offlineManager = new OfflineManager()