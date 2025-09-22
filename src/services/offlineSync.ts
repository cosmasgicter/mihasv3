import { offlineStorage } from '@/lib/offlineStorage'
import { sanitizeForLog } from '@/lib/security'
import { supabase } from '@/lib/supabase'
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

class OfflineSyncService {
  private isProcessing = false
  private retryAttempts = new Map<string, number>()
  private maxRetries = 3

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
      console.log('Data stored offline successfully')
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const offlineData = await offlineStorage.getAll(user.id)

      for (const item of offlineData) {
        try {
          await this.syncToServer(item)
          await offlineStorage.remove(item.id)
          this.retryAttempts.delete(item.id)
        } catch (error) {
          console.error('Failed to sync offline data:', error)
          
          const attempts = this.retryAttempts.get(item.id) || 0
          if (attempts >= this.maxRetries) {
            console.error('Max retries reached for item', sanitizeForLog(String(item.id)), 'removing from queue')
            await offlineStorage.remove(item.id)
            this.retryAttempts.delete(item.id)
          } else {
            this.retryAttempts.set(item.id, attempts + 1)
          }
        }
      }

      // Also process localStorage fallback data
      await this.processLocalStorageData(user.id)
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

        await this.syncToServer({
          id: key,
          type,
          data: payload,
          timestamp: parsedEntry.timestamp,
          userId
        })

        localStorage.removeItem(key)
      } catch (error) {
        console.error(`Failed to sync localStorage data ${key}:`, error)
        localStorage.removeItem(key) // Remove corrupted data
      }
    }
  }

  // Sync data to server
  private async syncToServer(item: OfflineQueueItem) {
    switch (item.type) {
      case 'application_draft': {
        const { error: draftError } = await supabase
          .from('application_drafts')
          .upsert({
            user_id: item.userId,
            form_data: item.data.form_data,
            uploaded_files: item.data.uploaded_files,
            current_step: item.data.current_step,
            is_offline_sync: true,
            updated_at: new Date().toISOString()
          })
        if (draftError) throw draftError
        break
      }

      case 'form_submission': {
        const { error: submissionError } = await supabase
          .from('applications_new')
          .insert({
            ...item.data,
            user_id: item.userId,
            is_offline_sync: true,
            created_at: new Date(item.timestamp).toISOString()
          })
        if (submissionError) throw submissionError
        break
      }

      case 'document_upload':
        // Handle document uploads - would need to re-upload files
        console.log('Document upload sync not yet implemented')
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
    try {
      await offlineStorage.init()
    } catch {
      // Silently handle initialization errors
    }

    // Listen for online events
    window.addEventListener('online', () => {
      console.log('Connection restored, syncing offline data...')
      this.processOfflineData()
    })

    // Listen for offline events
    window.addEventListener('offline', () => {
      console.log('Connection lost, enabling offline mode')
    })

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
}

export const offlineSyncService = new OfflineSyncService()