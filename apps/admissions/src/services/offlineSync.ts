import { offlineStorage } from '@/lib/offlineStorage'
import { getCsrfToken } from '@/lib/csrfToken'
import { sanitizeForLog } from '@/lib/security'
import { apiClient } from '@/services/client'
import type { QueryClient } from '@tanstack/react-query'
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
  /** Items that have permanently failed (maxRetries reached) — for UI surfacing */
  failedItems: Array<{ id: string; type: OfflineRecordType; timestamp: number }>
}

/**
 * Read current user from the React Query cache (single source of truth).
 * Requires setQueryClient() to have been called during app init.
 */
let _queryClient: QueryClient | null = null

export function setQueryClient(qc: QueryClient): void {
  _queryClient = qc
}

function getCurrentUser(): { id: string } | null {
  if (!_queryClient) return null
  const session = _queryClient.getQueryData<{ user?: { id: string } }>(['auth', 'session'])
  return session?.user ?? null
}

/**
 * Fetch the server version for a given application draft to handle 409 conflicts.
 * Returns the server-side form data and version, or null on failure.
 */
async function fetchServerVersion(userId: string): Promise<{
  form_data: Record<string, unknown>
  version: number
} | null> {
  try {
    const data = await apiClient.request<{
      draft_data?: Record<string, unknown>
      updated_at?: string
    }>(`/applications/${encodeURIComponent(userId)}/`)
    if (data) {
      return { form_data: data.draft_data || {}, version: 1 }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Merge local and server form data. Server wins for conflicting keys,
 * client wins for keys that only exist locally (new fields).
 */
function mergeFormData(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown>
): Record<string, unknown> {
  return { ...localData, ...serverData }
}

/** Error type with HTTP status code attached */
interface HttpError extends Error {
  status?: number
}

/**
 * Extract HTTP status code from an error thrown by apiClient or fetch.
 */
function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    return (error as HttpError).status
  }
  if (error instanceof Error) {
    // ApiErrorHandler produces messages like "Access denied..." for 403
    // and "Conflict detected..." for 409 — check message patterns
    if (error.message.includes('Access denied') || error.message.includes('CSRF')) return 403
    if (error.message.includes('Conflict detected')) return 409
  }
  return undefined
}

/**
 * Unified offline sync service using IndexedDB exclusively.
 *
 * All queued operations are stored in IndexedDB via offlineStorage.
 * Retry counts are persisted in the IndexedDB record itself.
 * Sync processes items in strict FIFO order (sorted by timestamp).
 * On first failure, processing stops — item N+1 is never processed until N succeeds or fails permanently.
 * Failed items (maxRetries reached) are marked with status: 'failed' for UI surfacing.
 */
class OfflineSyncService {
  private isProcessing = false
  private maxRetries = 3
  private initialized = false
  private periodicSyncInterval: number | null = null
  private onlineHandler: (() => void) | null = null

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

  /**
   * Process sync queue when online — strict FIFO order.
   * Breaks on first failure: item N+1 is never attempted until item N succeeds or is moved to failed.
   */
  async processOfflineData() {
    if (this.isProcessing || !navigator.onLine) {
      return
    }

    this.isProcessing = true

    try {
      const user = getCurrentUser()
      if (!user) return

      const offlineData = await offlineStorage.getAll(user.id)

      // Sort by timestamp for strict FIFO ordering
      const sorted = offlineData.sort((a, b) => a.timestamp - b.timestamp)

      for (const item of sorted) {
        // Skip items already permanently failed
        if (item.status === 'failed') {
          continue
        }

        // Check if item has exceeded max retries — mark as failed
        if ((item.retryCount ?? 0) >= this.maxRetries) {
          await offlineStorage.update(item.id, { status: 'failed' })
          console.error('Max retries reached for item', sanitizeForLog(String(item.id)), '— marked as failed')
          continue
        }

        try {
          await this.syncToServer(item)
          await offlineStorage.remove(item.id)
        } catch (error) {
          const status = getErrorStatus(error)

          // Handle CSRF 403: ApiClient handles CSRF token refresh internally,
          // so just retry the request if we have a token available
          if (status === 403) {
            const existingToken = getCsrfToken()
            if (existingToken) {
              try {
                await this.syncToServer(item)
                await offlineStorage.remove(item.id)
                continue // CSRF retry succeeded, move to next item
              } catch (retryError) {
                // CSRF retry also failed — fall through to increment retry count
                console.error('CSRF retry failed for item', sanitizeForLog(String(item.id)))
              }
            }
          }

          // Handle version conflict 409: fetch server version, merge, retry
          if (status === 409 && item.type === 'application_draft') {
            const serverVersion = await fetchServerVersion(item.userId)
            if (serverVersion) {
              try {
                const draftData = item.data as OfflineApplicationDraftData
                const mergedFormData = mergeFormData(
                  draftData.form_data as unknown as Record<string, unknown>,
                  serverVersion.form_data
                )
                // Retry with merged data and server's version + 1
                const mergedItem: OfflineQueueItem = {
                  ...item,
                  data: {
                    ...draftData,
                    form_data: mergedFormData,
                    version: serverVersion.version + 1
                  } as OfflineApplicationDraftData
                }
                await this.syncToServer(mergedItem)
                await offlineStorage.remove(item.id)
                continue // Merge retry succeeded, move to next item
              } catch (mergeRetryError) {
                console.error('Version conflict merge retry failed for item', sanitizeForLog(String(item.id)))
              }
            }
          }

          // Increment retry count
          const newRetryCount = (item.retryCount ?? 0) + 1
          const updates: { retryCount: number; status?: 'failed' } = { retryCount: newRetryCount }

          if (newRetryCount >= this.maxRetries) {
            updates.status = 'failed'
            console.error('Max retries reached for item', sanitizeForLog(String(item.id)), '— marked as failed')
          }

          await offlineStorage.update(item.id, updates)

          // Strict FIFO: break on first failure — do NOT continue to next item
          break
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
        await apiClient.request('/applications/draft/', {
          method: 'POST',
          body: JSON.stringify({
            user_id: item.userId,
            draft_data: {
              ...draftData.form_data,
              uploaded_files: draftData.uploaded_files,
              current_step: draftData.current_step,
              version: draftData.version,
              is_offline_sync: true,
              updated_at: new Date().toISOString()
            }
          })
        })
        break
      }

      case 'form_submission': {
        const submissionData = item.data as OfflineFormSubmissionData
        await apiClient.request('/applications/', {
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

  // Initialize service with event listeners — idempotent
  async init() {
    if (this.initialized) {
      return
    }

    try {
      await offlineStorage.init()
    } catch {
      // Silently handle initialization errors
    }

    // Store handler reference for cleanup
    this.onlineHandler = () => {
      this.processOfflineData()
    }

    // Listen for online events
    window.addEventListener('online', this.onlineHandler)

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

  // Destroy service — clears interval and removes all listeners
  destroy() {
    if (this.periodicSyncInterval !== null) {
      clearInterval(this.periodicSyncInterval)
      this.periodicSyncInterval = null
    }

    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler)
      this.onlineHandler = null
    }

    this.initialized = false
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
    const user = getCurrentUser()
    if (!user) {
      return {
        isPending: this.isProcessing,
        pendingRequests: 0,
        failedRequests: 0,
        failedItems: []
      }
    }

    const offlineData = await offlineStorage.getAll(user.id)
    const pendingItems = offlineData.filter(
      (item) => item.status !== 'failed' && (item.retryCount ?? 0) < this.maxRetries
    ).length
    const failed = offlineData.filter(
      (item) => item.status === 'failed' || (item.retryCount ?? 0) >= this.maxRetries
    )

    return {
      isPending: this.isProcessing,
      pendingRequests: pendingItems,
      failedRequests: failed.length,
      failedItems: failed.map((item) => ({
        id: item.id,
        type: item.type,
        timestamp: item.timestamp
      }))
    }
  }

  /**
   * Retry a specific failed item by resetting its retry count and status.
   * The item will be picked up on the next sync cycle.
   */
  async retryFailedItem(itemId: string): Promise<void> {
    await offlineStorage.update(itemId, { retryCount: 0, status: 'pending' })
    // Trigger a sync cycle immediately
    if (navigator.onLine) {
      this.processOfflineData()
    }
  }

  async clearFailedRequests(): Promise<void> {
    const user = getCurrentUser()
    if (!user) {
      return
    }

    const offlineData = await offlineStorage.getAll(user.id)
    for (const item of offlineData) {
      if (item.status === 'failed' || (item.retryCount ?? 0) >= this.maxRetries) {
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

    const user = getCurrentUser()
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
