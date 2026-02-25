import { offlineStorage } from '@/lib/offlineStorage'
import { sanitizeForLog } from '@/lib/security'
import { apiClient } from '@/services/client'
import {
  OfflineApplicationDraftData,
  OfflineDataPayloadMap,
  OfflineFormSubmissionData,
  OfflineQueueItem,
  OfflineRecordType
} from '@/types/offline'

export interface OfflineSyncStatus {
  isPending: boolean
  lastSyncAt?: Date
  pendingRequests: number
  failedRequests: number
}

/**
 * Get current user from cookie-based session
 */
async function getCurrentUser(): Promise<{ id: string } | null> {
  try {
    const data = await apiClient.request<{ user?: { id: string } }>('/auth?action=session')
    return data?.user || null
  } catch {
    return null
  }
}

/**
 * Unified offline sync service using IndexedDB exclusively.
 *
 * All queued operations are stored in IndexedDB via offlineStorage.
 * Retry counts are persisted in the IndexedDB record itself.
 * Sync processes items in FIFO order (sorted by timestamp).
 * Failed items remain in the queue with an incremented retryCount (max 3).
 */
class OfflineSyncService {
  private isProcessing = false
  private maxRetries = 3
  private initialized = false
  private periodicSyncInterval: number | null = null

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
    }
  }

  // Process sync queue when online — FIFO order, retry with persisted count
  async processOfflineData() {
    if (this.isProcessing || !navigator.onLine) {
      return
    }

    this.isProcessing = true

    try {
      const user = await getCurrentUser()
      if (!user) return

      const offlineData = await offlineStorage.getAll(user.id)

      // Sort by timestamp for FIFO ordering
      const sorted = offlineData.sort((a, b) => a.timestamp - b.timestamp)

      for (const item of sorted) {
        // Skip items that have exceeded max retries
        if ((item.retryCount ?? 0) >= this.maxRetries) {
          continue
        }

        try {
          await this.syncToServer(item)
          await offlineStorage.remove(item.id)
        } catch (error) {
          console.error('Failed to sync offline data:', error)

          const newRetryCount = (item.retryCount ?? 0) + 1
          await offlineStorage.update(item.id, { retryCount: newRetryCount })

          if (newRetryCount >= this.maxRetries) {
            console.error('Max retries reached for item', sanitizeForLog(String(item.id)), 'keeping as failed')
          }
        }
      }
    } catch (error) {
      console.error('Error processing offline data:', error)
    } finally {
      this.isProcessing = false
    }
  }

  // Sync data to server
  private async syncToServer(item: OfflineQueueItem) {
    switch (item.type) {
      case 'application_draft': {
        const draftData = item.data as OfflineApplicationDraftData
        await apiClient.request('/applications', {
          method: 'POST',
          body: JSON.stringify({
            action: 'save_draft',
            user_id: item.userId,
            form_data: draftData.form_data,
            uploaded_files: draftData.uploaded_files,
            current_step: draftData.current_step,
            is_offline_sync: true,
            updated_at: new Date().toISOString()
          })
        })
        break
      }

      case 'form_submission': {
        const submissionData = item.data as OfflineFormSubmissionData
        await apiClient.request('/applications', {
          method: 'POST',
          body: JSON.stringify({
            ...submissionData,
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
      return data.length
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
        pendingRequests: 0,
        failedRequests: 0
      }
    }

    const offlineData = await offlineStorage.getAll(user.id)
    const pendingItems = offlineData.filter((item) => (item.retryCount ?? 0) < this.maxRetries).length
    const failedItems = offlineData.filter((item) => (item.retryCount ?? 0) >= this.maxRetries).length

    return {
      isPending: this.isProcessing,
      pendingRequests: pendingItems,
      failedRequests: failedItems
    }
  }

  async clearFailedRequests(): Promise<void> {
    const user = await getCurrentUser()
    if (!user) {
      return
    }

    const offlineData = await offlineStorage.getAll(user.id)
    for (const item of offlineData) {
      if ((item.retryCount ?? 0) >= this.maxRetries) {
        await offlineStorage.remove(item.id)
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
}

export const offlineSyncService = new OfflineSyncService()
