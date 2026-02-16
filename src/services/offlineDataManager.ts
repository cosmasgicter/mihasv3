/**
 * Comprehensive Offline Data Manager
 * Handles critical data caching, offline form completion, and sync mechanisms
 * Requirements: 9.2 - Cache critical data for offline access, enable offline form completion, implement sync mechanisms
 */

import { apiClient } from '@/services/client'
import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { ApplicationFormData } from '@/forms/applicationSchema'

export interface OfflineDataCache {
  programs: any[]
  institutions: any[]
  subjects: any[]
  userProfile: any
  applicationDraft?: Partial<ApplicationFormData>
  lastUpdated: string
  version: number
}

export interface OfflineFormData {
  formId: string
  data: any
  step: number
  timestamp: string
  isComplete: boolean
  needsSync: boolean
}

export interface SyncResult {
  success: boolean
  synced: number
  failed: number
  errors: string[]
}

class OfflineDataManager {
  private readonly CACHE_KEY = 'mihas_offline_cache'
  private readonly FORMS_KEY = 'mihas_offline_forms'
  private readonly SYNC_QUEUE_KEY = 'mihas_sync_queue'
  private readonly CACHE_VERSION = 1
  private readonly MAX_CACHE_AGE = 24 * 60 * 60 * 1000 // 24 hours

  /**
   * Initialize offline data cache with critical application data
   */
  async initializeOfflineCache(userId: string): Promise<boolean> {
    try {
      // Check if we already have fresh cache
      const existingCache = this.getCachedData()
      if (existingCache && !this.isCacheStale(existingCache)) {
        return true
      }

      // Fetch critical data for offline use via API services
      const [programsResult, institutionsResult, subjectsResult, profileResult] = await Promise.allSettled([
        catalogService.getPrograms(),
        catalogService.getInstitutions(),
        catalogService.getSubjects(),
        apiClient.request<{ user: any }>('/auth?action=session')
      ])

      const cache: OfflineDataCache = {
        programs: programsResult.status === 'fulfilled' ? programsResult.value.data || [] : [],
        institutions: institutionsResult.status === 'fulfilled' ? institutionsResult.value.data || [] : [],
        subjects: subjectsResult.status === 'fulfilled' ? subjectsResult.value.data || [] : [],
        userProfile: profileResult.status === 'fulfilled' ? (profileResult.value as any)?.user ?? profileResult.value : null,
        lastUpdated: new Date().toISOString(),
        version: this.CACHE_VERSION
      }

      // Also cache any existing application draft
      try {
        const draftResult = await applicationService.list({ mine: 'true', status: 'draft', pageSize: '1' })
        const drafts = draftResult?.applications ?? []
        if (drafts.length > 0) {
          cache.applicationDraft = drafts[0] as Partial<ApplicationFormData>
        }
      } catch {
        // Draft fetch is non-critical, continue without it
      }

      this.saveCachedData(cache)
      return true
    } catch (error) {
      console.error('Failed to initialize offline cache:', error)
      return false
    }
  }

  /**
   * Get cached data for offline use
   */
  getCachedData(): OfflineDataCache | null {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY)
      if (!cached) return null

      const data = JSON.parse(cached) as OfflineDataCache
      
      // Check version compatibility
      if (data.version !== this.CACHE_VERSION) {
        this.clearCache()
        return null
      }

      return data
    } catch (error) {
      console.error('Failed to get cached data:', error)
      this.clearCache()
      return null
    }
  }

  /**
   * Save data to offline cache
   */
  private saveCachedData(data: OfflineDataCache): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save cached data:', error)
      // If storage is full, clear old data and try again
      this.clearOldData()
      try {
        localStorage.setItem(this.CACHE_KEY, JSON.stringify(data))
      } catch (retryError) {
        console.error('Failed to save cached data after cleanup:', retryError)
      }
    }
  }

  /**
   * Check if cache is stale and needs refresh
   */
  isCacheStale(cache: OfflineDataCache): boolean {
    const cacheAge = Date.now() - new Date(cache.lastUpdated).getTime()
    return cacheAge > this.MAX_CACHE_AGE
  }

  /**
   * Save form data for offline completion
   */
  saveOfflineForm(formId: string, data: any, step: number = 1): boolean {
    try {
      const forms = this.getOfflineForms()
      const formData: OfflineFormData = {
        formId,
        data,
        step,
        timestamp: new Date().toISOString(),
        isComplete: false,
        needsSync: true
      }

      forms[formId] = formData
      localStorage.setItem(this.FORMS_KEY, JSON.stringify(forms))
      return true
    } catch (error) {
      console.error('Failed to save offline form:', error)
      return false
    }
  }

  /**
   * Get offline form data
   */
  getOfflineForm(formId: string): OfflineFormData | null {
    const forms = this.getOfflineForms()
    return forms[formId] || null
  }

  /**
   * Get all offline forms
   */
  getOfflineForms(): Record<string, OfflineFormData> {
    try {
      const stored = localStorage.getItem(this.FORMS_KEY)
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.error('Failed to get offline forms:', error)
      return {}
    }
  }

  /**
   * Mark form as complete
   */
  markFormComplete(formId: string): void {
    const forms = this.getOfflineForms()
    if (forms[formId]) {
      forms[formId].isComplete = true
      forms[formId].needsSync = true
      localStorage.setItem(this.FORMS_KEY, JSON.stringify(forms))
    }
  }

  /**
   * Add item to sync queue
   */
  addToSyncQueue(item: {
    type: 'form_submission' | 'profile_update' | 'file_upload'
    data: any
    endpoint: string
    method: string
  }): void {
    try {
      const queue = this.getSyncQueue()
      const queueItem = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...item,
        timestamp: new Date().toISOString(),
        retryCount: 0,
        maxRetries: 3
      }
      
      queue.push(queueItem)
      localStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(queue))
    } catch (error) {
      console.error('Failed to add to sync queue:', error)
    }
  }

  /**
   * Get sync queue
   */
  getSyncQueue(): any[] {
    try {
      const stored = localStorage.getItem(this.SYNC_QUEUE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Failed to get sync queue:', error)
      return []
    }
  }

  /**
   * Sync offline data when connectivity returns
   */
  async syncOfflineData(userId: string): Promise<SyncResult> {
    const result: SyncResult = {
      success: true,
      synced: 0,
      failed: 0,
      errors: []
    }

    try {
      // Sync offline forms
      const forms = this.getOfflineForms()
      for (const [formId, formData] of Object.entries(forms)) {
        if (formData.needsSync) {
          try {
            await this.syncForm(userId, formId, formData)
            result.synced++
            
            // Mark as synced
            formData.needsSync = false
            forms[formId] = formData
          } catch (error) {
            result.failed++
            result.errors.push(`Form ${formId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        }
      }

      // Update forms storage
      localStorage.setItem(this.FORMS_KEY, JSON.stringify(forms))

      // Sync queue items
      const queue = this.getSyncQueue()
      const remainingQueue = []

      for (const item of queue) {
        try {
          await this.syncQueueItem(item)
          result.synced++
        } catch (error) {
          if (item.retryCount < item.maxRetries) {
            item.retryCount++
            remainingQueue.push(item)
          } else {
            result.failed++
            result.errors.push(`Queue item ${item.id}: Max retries exceeded`)
          }
        }
      }

      // Update sync queue
      localStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(remainingQueue))

      // Refresh cache after successful sync
      if (result.synced > 0) {
        await this.initializeOfflineCache(userId)
      }

      result.success = result.failed === 0
    } catch (error) {
      result.success = false
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    return result
  }

  /**
   * Sync individual form via applicationService
   */
  private async syncForm(userId: string, formId: string, formData: OfflineFormData): Promise<void> {
    const payload = {
      user_id: userId,
      ...formData.data,
    }

    if (formData.isComplete) {
      // Submit complete application
      payload.status = 'submitted'
      payload.submitted_at = new Date().toISOString()
    } else {
      // Save as draft
      payload.status = 'draft'
      payload.updated_at = new Date().toISOString()
    }

    // If formData has an existing application id, update; otherwise create
    if (formData.data?.id) {
      const result = await applicationService.update(formData.data.id, payload)
      if (!result) throw new Error('Failed to update application')
    } else {
      const result = await applicationService.create(payload)
      if (!result) throw new Error('Failed to create application')
    }
  }

  /**
   * Sync individual queue item via fetch (uses existing endpoint/method from queue)
   */
  private async syncQueueItem(item: any): Promise<void> {
    const response = await fetch(item.endpoint, {
      method: item.method,
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(item.data)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  /**
   * Check if offline mode is available
   */
  isOfflineModeAvailable(): boolean {
    const cache = this.getCachedData()
    return cache !== null && !this.isCacheStale(cache)
  }

  /**
   * Get offline capabilities status
   */
  getOfflineStatus(): {
    cacheAvailable: boolean
    cacheAge: number
    formsCount: number
    syncQueueCount: number
    lastSync: string | null
  } {
    const cache = this.getCachedData()
    const forms = this.getOfflineForms()
    const queue = this.getSyncQueue()

    return {
      cacheAvailable: cache !== null,
      cacheAge: cache ? Date.now() - new Date(cache.lastUpdated).getTime() : 0,
      formsCount: Object.keys(forms).length,
      syncQueueCount: queue.length,
      lastSync: cache?.lastUpdated || null
    }
  }

  /**
   * Clear all offline data
   */
  clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY)
    localStorage.removeItem(this.FORMS_KEY)
    localStorage.removeItem(this.SYNC_QUEUE_KEY)
  }

  /**
   * Clear old data to free up storage space
   */
  private clearOldData(): void {
    const keysToCheck = [
      'mihas_offline_cache',
      'mihas_offline_forms',
      'mihas_sync_queue',
      'applicationDraft',
      'applicationWizardDraft'
    ]

    keysToCheck.forEach(key => {
      try {
        const data = localStorage.getItem(key)
        if (data) {
          const parsed = JSON.parse(data)
          const timestamp = parsed.timestamp || parsed.lastUpdated
          if (timestamp) {
            const age = Date.now() - new Date(timestamp).getTime()
            // Remove data older than 7 days
            if (age > 7 * 24 * 60 * 60 * 1000) {
              localStorage.removeItem(key)
            }
          }
        }
      } catch (error) {
        // Remove corrupted data
        localStorage.removeItem(key)
      }
    })
  }

  /**
   * Estimate storage usage
   */
  getStorageUsage(): {
    used: number
    available: number
    percentage: number
  } {
    try {
      let used = 0
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += localStorage[key].length + key.length
        }
      }

      // Estimate available storage (5MB typical limit)
      const available = 5 * 1024 * 1024 // 5MB in bytes
      const percentage = (used / available) * 100

      return { used, available, percentage }
    } catch (error) {
      return { used: 0, available: 0, percentage: 0 }
    }
  }
}

export const offlineDataManager = new OfflineDataManager()
