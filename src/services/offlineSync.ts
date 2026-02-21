// @ts-nocheck
import { offlineStorage } from '@/lib/offlineStorage'
import { sanitizeForLog } from '@/lib/security'
import { apiClient } from '@/services/client'
import {
  OfflineApplicationDraftData,
  OfflineDataPayloadMap,
  OfflineDocumentUploadData,
  OfflineFormSubmissionData,
  OfflineQueueItem,
  OfflineRecordType
} from '@/types/offline'

type LocalStorageOfflineEntry<TType extends OfflineRecordType> = {
  data: OfflineDataPayloadMap[TType]
  timestamp: number
}

export interface OfflineSyncStatus {
  isPending: boolean
  lastSyncAt?: Date
  pendingRequests: number
  failedRequests: number
}

function isOfflineDraftPayload(value: unknown): value is OfflineApplicationDraftData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<OfflineApplicationDraftData>
  return (
    typeof payload.current_step === 'number' &&
    typeof payload.version === 'number' &&
    Array.isArray(payload.uploaded_files) &&
    typeof payload.form_data === 'object'
  )
}

function isOfflineSubmissionPayload(value: unknown): value is OfflineFormSubmissionData {
  return typeof value === 'object' && value !== null
}

function isOfflineDocumentPayload(value: unknown): value is OfflineDocumentUploadData {
  if (!value || typeof value !== 'object') {
    return false
  }

  const payload = value as Partial<OfflineDocumentUploadData>
  return typeof payload.application_id === 'string' && Array.isArray(payload.files)
}

/**
 * Get current user from cookie-based session
 */
async function getCurrentUser(): Promise<{ id: string } | null> {
  try {
    const response = await fetch('/api/auth?action=session', {
      credentials: 'include',
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.user || null
  } catch {
    return null
  }
}

class OfflineSyncService {
  private readonly LAST_SYNC_KEY = 'offline_last_sync'
  private isProcessing = false
  private retryAttempts = new Map<string, number>()
  private maxRetries = 3
  private initialized = false
  private periodicSyncInterval: number | null = null

  /**
   * Retry rules:
   * - Each queued item gets up to `maxRetries` attempts.
   * - Retry attempts are tracked in-memory for IndexedDB records and in localStorage metadata for fallback records.
   * - Items that hit max retries are treated as failed and excluded from automatic processing until explicitly cleared.
   */
  private isFailed(itemId: string): boolean {
    return (this.retryAttempts.get(itemId) || 0) >= this.maxRetries
  }

  private markRetry(itemId: string): void {
    const attempts = this.retryAttempts.get(itemId) || 0
    this.retryAttempts.set(itemId, attempts + 1)
  }

  private clearRetry(itemId: string): void {
    this.retryAttempts.delete(itemId)
  }

  // Store data offline
  async storeOffline<TType extends OfflineRecordType>(
    userId: string,
    type: TType,
    data: OfflineDataPayloadMap[TType]
  ) {
    try {
      await offlineStorage.store({
        type,
        data,
        userId
      })
    } catch (error) {
      console.error('Failed to store data offline:', error)
      // Fallback to localStorage
      localStorage.setItem(`offline_${type}_${userId}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }))
    }
  }

  // Process sync queue when online
  async processOfflineData() {
    if (this.isProcessing || !navigator.onLine) {
      return
    }

    this.isProcessing = true

    try {
      const user = await getCurrentUser()
      if (!user) return

      const offlineData = await offlineStorage.getAll(user.id)

      for (const item of offlineData) {
        if (this.isFailed(item.id)) {
          continue
        }

        try {
          await this.syncToServer(item)
          await offlineStorage.remove(item.id)
          this.clearRetry(item.id)
        } catch (error) {
          console.error('Failed to sync offline data:', error)

          this.markRetry(item.id)
          if (this.isFailed(item.id)) {
            console.error('Max retries reached for item', sanitizeForLog(String(item.id)), 'keeping as failed')
          }
        }
      }

      // Also process localStorage fallback data
      await this.processLocalStorageData(user.id)
      this.setLastSyncTime(new Date())
    } catch (error) {
      console.error('Error processing offline data:', error)
    } finally {
      this.isProcessing = false
    }
  }

  // Process localStorage fallback data
  private async processLocalStorageData(userId: string) {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(`offline_`) && key.includes(userId))

    for (const key of keys) {
      try {
        const serializedEntry = localStorage.getItem(key)
        if (!serializedEntry) {
          continue
        }

        const type = key.split('_')[1] as OfflineRecordType
        const parsedEntry = JSON.parse(serializedEntry) as Partial<LocalStorageOfflineEntry<typeof type>>

        if (!parsedEntry || typeof parsedEntry.timestamp !== 'number') {
          localStorage.removeItem(key)
          continue
        }

        const payload = this.validateLocalStoragePayload(type, parsedEntry.data)
        if (!payload) {
          localStorage.removeItem(key)
          continue
        }

        const retryCount = Number(localStorage.getItem(`offline_retry_${key}`) || '0')
        if (retryCount >= this.maxRetries) {
          continue
        }

        await this.syncToServer({
          id: key,
          type,
          data: payload,
          timestamp: parsedEntry.timestamp,
          userId
        })

        localStorage.removeItem(key)
        localStorage.removeItem(`offline_retry_${key}`)
      } catch (error) {
        console.error(`Failed to sync localStorage data ${key}:`, error)

        const retryKey = `offline_retry_${key}`
        const currentRetryCount = Number(localStorage.getItem(retryKey) || '0')
        localStorage.setItem(retryKey, String(currentRetryCount + 1))
      }
    }
  }

  // Sync data to server
  private async syncToServer(item: OfflineQueueItem) {
    switch (item.type) {
      case 'application_draft': {
        await apiClient.request('/applications', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_draft',
            user_id: item.userId,
            form_data: item.data.form_data,
            uploaded_files: item.data.uploaded_files,
            current_step: item.data.current_step,
            is_offline_sync: true,
            updated_at: new Date().toISOString()
          })
        })
        break
      }

      case 'form_submission': {
        await apiClient.request('/applications', {
          method: 'POST',
          body: JSON.stringify({
            ...item.data,
            user_id: item.userId,
            is_offline_sync: true,
            created_at: new Date(item.timestamp).toISOString()
          })
        })
        break
      }

      case 'document_upload':
        // Handle document uploads - would need to re-upload files
        break
    }
  }

  private validateLocalStoragePayload<TType extends OfflineRecordType>(
    type: TType,
    payload: unknown
  ): OfflineDataPayloadMap[TType] | null {
    switch (type) {
      case 'application_draft':
        return isOfflineDraftPayload(payload) ? payload : null
      case 'form_submission':
        return isOfflineSubmissionPayload(payload) ? payload : null
      case 'document_upload':
        return isOfflineDocumentPayload(payload) ? payload : null
      default:
        return null
    }
  }

  // Initialize service with event listeners
  async init() {
    if (this.initialized) {
      return
    }

    try {
      await offlineStorage.init()
    } catch {
      // Silently handle initialization errors
    }

    // Listen for online events
    window.addEventListener('online', () => {
      this.processOfflineData()
    })

    this.periodicSyncInterval = window.setInterval(() => {
      if (navigator.onLine) {
        this.processOfflineData()
      }
    }, 30000)

    this.initialized = true

    // Process any existing offline data on startup
    if (navigator.onLine) {
      setTimeout(() => this.processOfflineData(), 1000)
    }
  }

  // Check if online
  isOnline(): boolean {
    return navigator.onLine
  }

  // Get offline data count for user
  async getOfflineDataCount(userId: string): Promise<number> {
    try {
      const data = await offlineStorage.getAll(userId)
      const localStorageCount = Object.keys(localStorage)
        .filter(key => key.startsWith(`offline_`) && key.includes(userId))
        .length
      return data.length + localStorageCount
    } catch (error) {
      console.error('Failed to get offline data count:', error)
      return 0
    }
  }

  async getSyncStatus(): Promise<OfflineSyncStatus> {
    const user = await getCurrentUser()
    if (!user) {
      return {
        isPending: this.isProcessing,
        lastSyncAt: this.getLastSyncTime(),
        pendingRequests: 0,
        failedRequests: 0
      }
    }

    const offlineData = await offlineStorage.getAll(user.id)
    const pendingIndexedDbItems = offlineData.filter((item) => !this.isFailed(item.id)).length
    const failedIndexedDbItems = offlineData.filter((item) => this.isFailed(item.id)).length

    const fallbackKeys = Object.keys(localStorage).filter(key => key.startsWith('offline_') && key.includes(user.id))

    const failedFallbackItems = fallbackKeys.filter((key) => {
      const retryCount = Number(localStorage.getItem(`offline_retry_${key}`) || '0')
      return retryCount >= this.maxRetries
    }).length

    return {
      isPending: this.isProcessing,
      lastSyncAt: this.getLastSyncTime(),
      pendingRequests: pendingIndexedDbItems + (fallbackKeys.length - failedFallbackItems),
      failedRequests: failedIndexedDbItems + failedFallbackItems
    }
  }

  async clearFailedRequests(): Promise<void> {
    const user = await getCurrentUser()
    if (!user) {
      return
    }

    const offlineData = await offlineStorage.getAll(user.id)
    for (const item of offlineData) {
      if (this.isFailed(item.id)) {
        await offlineStorage.remove(item.id)
        this.clearRetry(item.id)
      }
    }

    const fallbackKeys = Object.keys(localStorage).filter(key => key.startsWith('offline_') && key.includes(user.id))
    for (const key of fallbackKeys) {
      const retryKey = `offline_retry_${key}`
      const retryCount = Number(localStorage.getItem(retryKey) || '0')
      if (retryCount >= this.maxRetries) {
        localStorage.removeItem(key)
        localStorage.removeItem(retryKey)
      }
    }
  }

  async syncQueue(): Promise<void> {
    await this.processOfflineData()
  }

  async queueRequest(
    url: string,
    method: string,
    _headers: Record<string, string> = {},
    body?: Record<string, unknown>
  ): Promise<string> {
    if (method.toUpperCase() !== 'POST' || !url.includes('/applications') || !body) {
      throw new Error('Only POST /applications requests are supported by the offline sync pipeline.')
    }

    const user = await getCurrentUser()
    if (!user) {
      throw new Error('Cannot queue offline request without an authenticated user.')
    }

    await this.init()

    if (body.action === 'save_draft') {
      const id = await offlineStorage.store({
        type: 'application_draft',
        userId: user.id,
        data: {
          form_data: (body.form_data as OfflineApplicationDraftData['form_data']) || {},
          uploaded_files: (body.uploaded_files as OfflineApplicationDraftData['uploaded_files']) || [],
          current_step: Number(body.current_step || 0),
          version: Number(body.version || 1)
        }
      })

      if (navigator.onLine) {
        this.processOfflineData()
      }

      return id
    }

    const id = await offlineStorage.store({
      type: 'form_submission',
      userId: user.id,
      data: body as OfflineFormSubmissionData
    })

    if (navigator.onLine) {
      this.processOfflineData()
    }

    return id
  }

  private getLastSyncTime(): Date | undefined {
    const stored = localStorage.getItem(this.LAST_SYNC_KEY)
    return stored ? new Date(stored) : undefined
  }

  private setLastSyncTime(date: Date): void {
    localStorage.setItem(this.LAST_SYNC_KEY, date.toISOString())
  }
}

export const offlineSyncService = new OfflineSyncService()
