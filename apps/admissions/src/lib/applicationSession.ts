/**
 * Application Session Manager
 * 
 * Manages application drafts via API client and localStorage.
 */
import { applicationService } from '@/services/applications'
import { ApplicationFormData } from '@/forms/applicationSchema'
import {
  isDraftStorageKey,
  listWizardDraftStorageKeys,
  removeDraftStorageEntries,
} from './draftStorageKeys'
import { sanitizeForLog, safeJsonParse } from './sanitize'
import { generateSecureToken } from './security'
import { logger } from '@/lib/logger'
import { cachedGetItem, cachedSetItem, cachedRemoveItem } from './localStorageCache'
import { useDraftStore } from '@/stores/draftStore'

export interface ApplicationDraft {
  id?: string
  user_id: string
  form_data: Partial<ApplicationFormData>
  current_step: number
  uploaded_files: Array<{ name: string; url: string; type?: string }>
  selected_subjects?: Array<{ subject_id: string; grade: number }>
  version: number
  expires_at: string
  last_saved_at: string
  session_id: string
}

export interface SessionWarning {
  type: 'timeout' | 'expiry'
  message: string
  timeRemaining: number
  canExtend: boolean
}

export interface DraftDeleteResult {
  success: boolean
  error?: string
  code?: string
  deletedIds?: string[]
  blockedIds?: string[]
  failedIds?: string[]
}

type StoredDraftRecord = Record<string, unknown> & {
  id?: string
  applicationId?: string
  application_id?: string
  userId?: string
  user_id?: string
  savedAt?: string
  last_saved_at?: string
  currentStep?: number
  expired?: boolean
}

// Constants for configuration
const AUTO_SAVE_INTERVAL = 8000 // 8 seconds
const SESSION_WARNING_TIME = 25 * 60 * 1000 // 25 minutes
const SESSION_EXPIRY_TIME = 30 * 60 * 1000 // 30 minutes
const DRAFT_STORAGE_KEYS = [
  'applicationDraft',
  'applicationWizardDraft',
  'applicationDraftOffline',
  'draftFormData',
  'wizardFormData'
]
const SESSION_STORAGE_KEYS = [
  'applicationDraft',
  'applicationWizardDraft'
]

export function isApplicationMissingError(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  if (status === 404) {
    return true
  }

  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return (
    message.includes('resource not found') ||
    message.includes('application not found') ||
    message.includes('not found or access denied')
  )
}

function getApiErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const directCode = (error as { code?: unknown }).code
  if (typeof directCode === 'string') {
    return directCode
  }

  const dataCode = (error as { data?: { code?: unknown } }).data?.code
  return typeof dataCode === 'string' ? dataCode : undefined
}

export function isProtectedDraftPaymentError(error: unknown): boolean {
  return getApiErrorCode(error) === 'DRAFT_HAS_PAYMENT_ACTIVITY'
}

function clearStorageDraftApplicationId(storage: Storage, key: string, staleApplicationId?: string | null) {
  const raw = storage === localStorage ? cachedGetItem(key) : storage.getItem(key)
  if (!raw) {
    return
  }

  const draft = safeJsonParse<StoredDraftRecord | null>(raw, null)
  if (!draft) {
    if (storage === localStorage) {
      cachedRemoveItem(key)
    } else {
      storage.removeItem(key)
    }
    return
  }

  const storedIds = [
    typeof draft.applicationId === 'string' ? draft.applicationId : null,
    typeof draft.application_id === 'string' ? draft.application_id : null,
    typeof draft.id === 'string' ? draft.id : null,
  ].filter(Boolean)

  if (staleApplicationId && !storedIds.includes(staleApplicationId)) {
    return
  }

  delete draft.applicationId
  delete draft.application_id
  if (!staleApplicationId || draft.id === staleApplicationId) {
    delete draft.id
  }

  const timestamp = new Date().toISOString()
  draft.savedAt = draft.savedAt || timestamp
  draft.last_saved_at = timestamp

  if (storage === localStorage) {
    cachedSetItem(key, JSON.stringify(draft))
  } else {
    storage.setItem(key, JSON.stringify(draft))
  }
}

export function clearStaleApplicationDraftReference(staleApplicationId?: string | null): void {
  if (typeof window === 'undefined') {
    return
  }

  const keys = new Set([...DRAFT_STORAGE_KEYS, ...SESSION_STORAGE_KEYS])

  keys.forEach((key) => {
    try {
      clearStorageDraftApplicationId(localStorage, key, staleApplicationId)
    } catch {
      // best effort local cleanup
    }

    try {
      clearStorageDraftApplicationId(sessionStorage, key, staleApplicationId)
    } catch {
      // best effort session cleanup
    }
  })
}

class ApplicationSessionManager {
  private sessionId: string
  private saveInterval: NodeJS.Timeout | null = null
  private warningTimeout: NodeJS.Timeout | null = null
  private expiryTimeout: NodeJS.Timeout | null = null
  private deleteDraftPromises = new Map<string, Promise<DraftDeleteResult>>()
  private onWarning?: (warning: SessionWarning) => void
  private onExpiry?: () => void

  constructor() {
    this.sessionId = generateSecureToken(16)
  }

  private getStoredWizardDraft(userId?: string | null, applicationId?: string | null): StoredDraftRecord | null {
    const candidateKeys = listWizardDraftStorageKeys(localStorage, userId, applicationId)
    for (const key of candidateKeys) {
      const savedDraft = cachedGetItem(key)
      if (!savedDraft) {
        continue
      }

      const draft = safeJsonParse<StoredDraftRecord | null>(savedDraft, null)
      if (!draft) {
        cachedRemoveItem(key)
        continue
      }

      const draftOwnerId = typeof draft.userId === 'string'
        ? draft.userId
        : typeof draft.user_id === 'string'
          ? draft.user_id
          : null
      const draftApplicationId = typeof draft.applicationId === 'string'
        ? draft.applicationId
        : typeof draft.application_id === 'string'
          ? draft.application_id
          : null

      if (userId && draftOwnerId && draftOwnerId !== userId) {
        continue
      }
      if (applicationId && draftApplicationId && draftApplicationId !== applicationId) {
        continue
      }

      return draft
    }

    return null
  }

  getStoredDraft(): StoredDraftRecord | null {
    return this.getStoredWizardDraft()
  }

  private removeStoredWizardDraft(userId?: string | null, applicationId?: string | null): void {
    listWizardDraftStorageKeys(localStorage, userId, applicationId).forEach((key) => {
      cachedRemoveItem(key)
    })
    listWizardDraftStorageKeys(sessionStorage, userId, applicationId).forEach((key) => {
      sessionStorage.removeItem(key)
    })
  }

  private async resolveDraftApplicationId(userId: string): Promise<string | null> {
    const wizardDraft = this.getStoredWizardDraft(userId)
    const wizardDraftId =
      typeof wizardDraft?.applicationId === 'string'
        ? wizardDraft.applicationId
        : typeof wizardDraft?.application_id === 'string'
          ? wizardDraft.application_id
          : null

    if (wizardDraftId) {
      return wizardDraftId
    }

    const savedDraft = safeJsonParse<StoredDraftRecord | null>(
      cachedGetItem('applicationDraft') ?? '',
      null,
    )
    const savedDraftId =
      typeof savedDraft?.applicationId === 'string'
        ? savedDraft.applicationId
        : typeof savedDraft?.application_id === 'string'
          ? savedDraft.application_id
          : null

    if (savedDraftId) {
      return savedDraftId
    }

    try {
      const result = await applicationService.list(
        { mine: true, status: 'draft', pageSize: 1 },
        {}
      )
      const applications = result?.applications ?? []
      return applications[0]?.id ?? null
    } catch {
      return null
    }
  }

  private shouldDiscardLocalDraft(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false
    }

    const message = error.message.toLowerCase()
    return (
      message.includes('access denied') ||
      message.includes('authentication required') ||
      message.includes('permission')
    )
  }

  async getLocalWizardDraft(userId?: string): Promise<StoredDraftRecord | null> {
    const draft = this.getStoredWizardDraft(userId)
    if (!draft) {
      return null
    }

    const draftOwnerId = typeof draft.userId === 'string'
      ? draft.userId
      : typeof draft.user_id === 'string'
        ? draft.user_id
        : null

    if (userId && draftOwnerId && draftOwnerId !== userId) {
      this.clearAllLocalStorage()
      return null
    }

    if (draft.applicationId) {
      try {
        const application = await applicationService.getById(String(draft.applicationId))
        const status = application?.application?.status
        if (status && status !== 'draft') {
          this.clearAllLocalStorage()
          return null
        }
      } catch (error) {
        if (isApplicationMissingError(error)) {
          clearStaleApplicationDraftReference(String(draft.applicationId))
          // Server draft is gone — clear the orphaned local draft entirely
          this.clearAllLocalStorage()
          return null
        }

        if (this.shouldDiscardLocalDraft(error)) {
          this.clearAllLocalStorage()
          return null
        }
      }
    }

    return draft
  }

  private buildLocalDraftInfo(draft: StoredDraftRecord) {
    const steps = ['Basic KYC', 'Education', 'Payment', 'Submit']
    const step = Math.min(Math.max(Number(draft.currentStep) || 1, 1), steps.length)
    const savedTime = draft.savedAt ? new Date(draft.savedAt).getTime() : Date.now()
    const expiresAt = new Date(savedTime + 24 * 60 * 60 * 1000).toISOString()

    return {
      exists: true,
      step,
      lastSaved: draft.savedAt,
      progress: `Step ${step}/4: ${steps[step - 1]}`,
      expiresAt
    }
  }

  // Initialize session management
  initialize(onWarning?: (warning: SessionWarning) => void, onExpiry?: () => void) {
    this.onWarning = onWarning
    this.onExpiry = onExpiry
    this.setupAutoSave()
    this.setupSessionWarnings()
  }

  // Setup automatic saving every 8 seconds
  private setupAutoSave() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
    }
    
    this.saveInterval = setInterval(() => {
      this.autoSaveDraft()
    }, AUTO_SAVE_INTERVAL)
  }

  // Setup session timeout warnings
  private setupSessionWarnings() {
    // Warning at 5 minutes before expiry
    this.warningTimeout = setTimeout(() => {
      this.onWarning?.({
        type: 'timeout',
        message: 'Your session will expire in 5 minutes. Save your progress to avoid losing data.',
        timeRemaining: 5 * 60 * 1000,
        canExtend: true
      })
    }, SESSION_WARNING_TIME)

    // Expiry at 30 minutes
    this.expiryTimeout = setTimeout(() => {
      this.handleSessionExpiry()
    }, SESSION_EXPIRY_TIME)
  }

  // Save draft to both localStorage and database
  async saveDraft(
    userId: string,
    formData: Partial<ApplicationFormData>,
    currentStep: number,
    uploadedFiles: Array<{ name: string; url: string; type?: string }> = [],
    selectedSubjects: Array<{ subject_id: string; grade: number }> = []
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const draftApplicationId = await this.resolveDraftApplicationId(userId)
      const draft = {
        application_id: draftApplicationId,
        user_id: userId,
        form_data: formData,
        current_step: currentStep,
        uploaded_files: uploadedFiles,
        selected_subjects: selectedSubjects,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        last_saved_at: new Date().toISOString(),
        session_id: this.sessionId
      }

      // Save to localStorage for immediate recovery
      try {
        cachedSetItem('applicationDraft', JSON.stringify(draft))
      } catch (error) {
        return { success: false, error: 'Storage quota exceeded' }
      }

      // Try to save to database via API
      if (draftApplicationId) {
        try {
          await applicationService.update(draftApplicationId, {
            ...formData,
            uploaded_files: uploadedFiles,
            selected_subjects: selectedSubjects,
            step_completed: currentStep
          })
        } catch (dbError) {
          if (isApplicationMissingError(dbError)) {
            clearStaleApplicationDraftReference(draftApplicationId)
            draft.application_id = null
            try {
              cachedSetItem('applicationDraft', JSON.stringify(draft))
            } catch {
              // best effort local cleanup
            }
          }
        }
      }

      return { success: true }
    } catch (error) {
      logger.error('Error saving draft:', sanitizeForLog(error))
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Failed to save draft'
      }
    }
  }

  // Auto-save current form state
  private async autoSaveDraft() {
    try {
      const savedDraft = cachedGetItem('applicationDraft')
      if (savedDraft) {
        const draft = safeJsonParse<StoredDraftRecord | null>(savedDraft, null)
        if (!draft) return
        // Update last saved timestamp
        draft.last_saved_at = new Date().toISOString()
        cachedSetItem('applicationDraft', JSON.stringify(draft))
        
        const draftApplicationId =
          typeof draft.application_id === 'string'
            ? draft.application_id
            : typeof draft.applicationId === 'string'
              ? draft.applicationId
              : await this.resolveDraftApplicationId(String(draft.user_id))

        if (!draftApplicationId) {
          return
        }

        // Also update the real draft application via API when one exists.
        try {
          await applicationService.update(draftApplicationId, {
            updated_at: new Date().toISOString()
          })
        } catch (error) {
          if (isApplicationMissingError(error)) {
            clearStaleApplicationDraftReference(draftApplicationId)
            delete draft.application_id
            delete draft.applicationId
            cachedSetItem('applicationDraft', JSON.stringify(draft))
            return
          }
          throw error
        }
      }
    } catch (error) {
      logger.error('Auto-save failed:', sanitizeForLog(error))
    }
  }

  // Load draft from database or localStorage
  async loadDraft(userId: string): Promise<ApplicationDraft | null> {
    try {
      // First try database via API
      try {
        const result = await applicationService.list(
          { mine: true, status: 'draft', pageSize: 1 },
          {}
        )
        const apps = result?.applications ?? []

        if (apps.length > 0) {
          const data = apps[0]!
          return {
            id: data.id,
            user_id: (data.user_id as string) || userId,
            form_data: data as Partial<ApplicationFormData> || {},
            current_step: (data.step_completed as number) || 1,
            uploaded_files: [],
            selected_subjects: [],
            version: 1,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            last_saved_at: data.updated_at || '',
            session_id: this.sessionId
          }
        }
      } catch (dbError) {
      }

      // Fallback to localStorage
      const localDraft = await this.getLocalWizardDraft(userId)
      if (localDraft) {
        if (!localDraft.user_id || localDraft.user_id === userId) {
          return localDraft as unknown as ApplicationDraft
        }

        this.removeStoredWizardDraft(userId)
      }

      return null
    } catch (error) {
      logger.error('Error loading draft:', sanitizeForLog(error))
      return null
    }
  }

  // Delete draft with comprehensive cleanup
  async deleteDraft(userId: string): Promise<DraftDeleteResult> {
    const existingDelete = this.deleteDraftPromises.get(userId)
    if (existingDelete) {
      return existingDelete
    }

    const deletePromise = this.performDeleteDraft(userId)
    this.deleteDraftPromises.set(userId, deletePromise)

    try {
      return await deletePromise
    } finally {
      this.deleteDraftPromises.delete(userId)
    }
  }

  private async performDeleteDraft(userId: string): Promise<DraftDeleteResult> {
    try {
      // Step 1: Clear intervals to stop auto-save before server deletion.
      this.cleanup()

      const deletedIds: string[] = []
      const blockedIds: string[] = []
      const failedIds: string[] = []

      // Step 2: Database cleanup via API (delete actual draft application ids, not the user id)
      try {
        const draftList = await applicationService.list({
          mine: true,
          status: 'draft',
          pageSize: 100
        }, {})
        const draftIds = (draftList?.applications ?? [])
          .map(application => application?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)

        if (draftIds.length > 0) {
          for (const id of draftIds) {
            try {
              await applicationService.delete(id)
            } catch (deleteError) {
              if (isProtectedDraftPaymentError(deleteError)) {
                blockedIds.push(id)
                continue
              }

              if (!isApplicationMissingError(deleteError)) {
                failedIds.push(id)
                continue
              }
            }
            deletedIds.push(id)
            clearStaleApplicationDraftReference(id)
          }

          if (failedIds.length > 0) {
            return {
              success: false,
              code: 'DRAFT_DELETE_PARTIAL_FAILURE',
              deletedIds,
              blockedIds,
              failedIds,
              error: `Failed to delete ${failedIds.length} draft${failedIds.length > 1 ? 's' : ''} from the server`
            }
          }

          if (blockedIds.length > 0) {
            this.clearAllLocalStorage()
            try {
              useDraftStore.getState().markCleared()
            } catch {
              // best effort store sync
            }
            try {
              window.dispatchEvent(new CustomEvent('draftCleared', {
                detail: { deletedIds, blockedIds }
              }))
            } catch {
              // best effort UI sync
            }

            return {
              success: false,
              code: 'DRAFT_HAS_PAYMENT_ACTIVITY',
              deletedIds,
              blockedIds,
              failedIds,
              error: 'Some drafts have payment activity and cannot be deleted.'
            }
          }
        }
      } catch (cleanupError) {
        return {
          success: false,
          error: cleanupError instanceof Error ? sanitizeForLog(cleanupError.message) : 'Failed to delete drafts from the server'
        }
      }

      // Step 3: Clear browser storage only after server cleanup succeeds.
      this.clearAllLocalStorage()

      // Step 4: Set deletion flag for other components.
      try {
        sessionStorage.setItem('draftDeleted', 'true')
      } catch (storageError) {
      }

      try {
        useDraftStore.getState().markCleared()
      } catch {
        // best effort store sync
      }

      try {
        window.dispatchEvent(new CustomEvent('draftCleared', {
          detail: { deletedIds, blockedIds }
        }))
      } catch {
        // best effort UI sync
      }

      return { success: true, deletedIds, blockedIds, failedIds }
    } catch (error) {
      logger.error('Draft deletion failed:', sanitizeForLog(error))
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Failed to delete draft'
      }
    }
  }

  // Helper method to clear all local storage
  private clearAllLocalStorage(): void {
    try {
      // Clear known draft keys
      [...DRAFT_STORAGE_KEYS, ...SESSION_STORAGE_KEYS].forEach(key => {
        cachedRemoveItem(key)
        sessionStorage.removeItem(key)
      })
      
      const storages = [localStorage, sessionStorage]
      storages.forEach(storage => {
        if (storage === localStorage) {
          Object.keys(localStorage).forEach((key) => {
            if (isDraftStorageKey(key)) {
              cachedRemoveItem(key)
            }
          })
        } else {
          removeDraftStorageEntries(storage)
        }
      })
    } catch (error) {
    }
  }

  // Extend session
  async extendSession(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const newExpiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      
      // Update localStorage
      const localDraft = cachedGetItem('applicationDraft')
      if (localDraft) {
        const draft = JSON.parse(localDraft)
        draft.expires_at = newExpiryTime
        cachedSetItem('applicationDraft', JSON.stringify(draft))
      }

      // Reset session timers
      this.resetSessionTimers()

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Failed to extend session'
      }
    }
  }

  // Get next version number
  private async getNextVersion(userId: string): Promise<number> {
    try {
      const result = await applicationService.list(
        { mine: true, status: 'draft', pageSize: 1 },
        {}
      )
      const apps = result?.applications ?? []
      return apps.length > 0 ? (((apps[0] as Record<string, unknown>).version as number) || 0) + 1 : 1
    } catch {
      return 1
    }
  }

  // Handle session expiry
  private handleSessionExpiry() {
    this.onExpiry?.()
    // Keep data but mark as expired
    const localDraft = cachedGetItem('applicationDraft')
    if (localDraft) {
      const draft = safeJsonParse<StoredDraftRecord | null>(localDraft, null)
      if (draft) {
        draft.expired = true
        try {
          cachedSetItem('applicationDraft', JSON.stringify(draft))
        } catch (error) {
        }
      }
    }
  }

  // Reset session timers
  private resetSessionTimers() {
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout)
    }
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout)
    }
    this.setupSessionWarnings()
  }

  // Check if draft exists
  async hasDraft(userId: string): Promise<boolean> {
    const draft = await this.loadDraft(userId)
    return draft !== null
  }

  // Get draft info for dashboard
  async getDraftInfo(userId: string): Promise<{
    exists: boolean
    step?: number
    lastSaved?: string
    progress?: string
    expiresAt?: string
  }> {
    try {
      const localDraft = await this.getLocalWizardDraft(userId)
      if (localDraft) {
        return this.buildLocalDraftInfo(localDraft)
      }

      // Check database for draft applications via API
      const result = await applicationService.list(
        { mine: true, status: 'draft', pageSize: 1 },
        {}
      )
      const draftApps = result?.applications ?? []

      if (draftApps.length > 0) {
        const app = draftApps[0]!
        const steps = ['Basic KYC', 'Education', 'Payment', 'Submit']
        let currentStep = 1
        
        // Determine step based on what's filled
        if (app.result_slip_url) currentStep = 3
        else if (app.program && app.full_name) currentStep = 2
        else if (app.full_name) currentStep = 2
        
        const createdTime = new Date(app.created_at || Date.now()).getTime()
        const expiresAt = new Date(createdTime + 24 * 60 * 60 * 1000).toISOString()
        
        return {
          exists: true,
          step: currentStep,
          lastSaved: app.updated_at,
          progress: `Step ${currentStep}/4: ${steps[currentStep - 1]!}`,
          expiresAt
        }
      }

      return { exists: false }
    } catch (error) {
      logger.error('Error getting draft info:', sanitizeForLog(error))
      return { exists: false }
    }
  }

  // Cleanup on component unmount or draft deletion
  cleanup() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval)
      this.saveInterval = null
    }
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout)
      this.warningTimeout = null
    }
    if (this.expiryTimeout) {
      clearTimeout(this.expiryTimeout)
      this.expiryTimeout = null
    }
  }
}

export const applicationSessionManager = new ApplicationSessionManager()
