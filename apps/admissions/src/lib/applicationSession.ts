/**
 * Application session manager — the local recovery-record READER.
 *
 * Admissions-v2 task 6.3 (R10.2, R10.4, R10.10; findings STU-02, STU-12) took
 * the draft lifecycle away from this module. It used to be a fourth cooperating
 * owner: an 8-second `setInterval` that rewrote a legacy `applicationDraft`
 * record, a `saveDraft` that wrote it, session timers, and a list-based
 * `loadDraft`/`hasDraft` — none of them reachable from production code any more,
 * all of them a second idea of what "the draft" is. Every draft write now
 * belongs to the draft machine (`lib/wizardDraftController.ts`).
 *
 * What remains is the read side the dashboard and the wizard loader use
 * (`getLocalWizardDraft`), and its cleanup is now scoped: a stale record for one
 * application removes that record only. It used to call a whole-browser draft
 * wipe, so a submitted application's leftover cache erased every other draft's
 * offline work on the next dashboard load (R10.10).
 *
 * The bulk `deleteDraft(userId)` command keeps its server contract (404 is
 * success, payment-linked drafts are refused), but its local cleanup is scoped
 * too: it clears the `(user, application)` record of each draft the server
 * actually deleted, and nothing else. It used to finish with a whole-browser
 * draft sweep (every user's records, every application's) even when a
 * payment-linked draft had been refused (task 6.3 completion pass).
 */
import { applicationService } from '@/services/applications'
import {
  getWizardDraftStorageKey,
  listWizardDraftStorageKeys,
} from './draftStorageKeys'
import { clearWizardDraftCache } from './draftLocalCache'
import { sanitizeForLog, safeJsonParse } from './sanitize'
import { logger } from '@/lib/logger'
import { cachedGetItem, cachedSetItem, cachedRemoveItem } from './localStorageCache'
import { useDraftStore } from '@/stores/draftStore'

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

/** Every application id a stored record names. */
function storedApplicationIds(draft: StoredDraftRecord): string[] {
  return [draft.applicationId, draft.application_id, draft.id].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
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

  const storedIds = storedApplicationIds(draft)

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

/**
 * Remove each legacy unscoped record that names `applicationId` — and only
 * those. Used when the server deleted that draft: its answers go with it, while
 * a legacy record for any other application (or for none) is left alone.
 */
function removeLegacyRecordsNaming(applicationId: string): void {
  const keys = new Set([...DRAFT_STORAGE_KEYS, ...SESSION_STORAGE_KEYS])
  keys.forEach((key) => {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const raw = storage === localStorage ? cachedGetItem(key) : storage.getItem(key)
        if (!raw) continue
        const draft = safeJsonParse<StoredDraftRecord | null>(raw, null)
        if (!draft || !storedApplicationIds(draft).includes(applicationId)) continue
        if (storage === localStorage) {
          cachedRemoveItem(key)
        } else {
          storage.removeItem(key)
        }
      } catch {
        // best effort local cleanup
      }
    }
  })
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
  private deleteDraftPromises = new Map<string, Promise<DraftDeleteResult>>()

  /** The first readable recovery record for the owner, with the key it lives under. */
  private findStoredWizardDraft(
    userId?: string | null,
    applicationId?: string | null,
  ): { key: string; draft: StoredDraftRecord } | null {
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

      return { key, draft }
    }

    return null
  }

  /**
   * Remove exactly one stale recovery record (R10.10): the key it was read from
   * and that application's canonical key. Never another application's record,
   * never the payment-recovery store.
   */
  private discardStoredWizardDraft(key: string, userId?: string | null, applicationId?: string | null): void {
    const keys = new Set([key])
    if (applicationId) keys.add(getWizardDraftStorageKey(userId, applicationId))
    keys.forEach((staleKey) => {
      try {
        cachedRemoveItem(staleKey)
      } catch {
        // best effort local cleanup
      }
      try {
        sessionStorage.removeItem(staleKey)
      } catch {
        // best effort session cleanup
      }
    })
  }

  // `getStoredDraft()` was removed by task 6.3 (R10.2, R10.4): it returned the
  // first stored record of ANY user and ANY application, and its one caller (the
  // wizard loader) used it to second-guess a record's own address.

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
    const found = this.findStoredWizardDraft(userId)
    if (!found) {
      return null
    }
    const { key, draft } = found

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
      // Another student's record under a shared key: drop that record only.
      this.discardStoredWizardDraft(key)
      return null
    }

    if (draftApplicationId) {
      try {
        const application = await applicationService.getById(draftApplicationId)
        const status = application?.application?.status
        if (status && status !== 'draft') {
          // Submitted (or otherwise past draft): this one record is stale.
          this.discardStoredWizardDraft(key, userId, draftApplicationId)
          return null
        }
      } catch (error) {
        if (isApplicationMissingError(error)) {
          clearStaleApplicationDraftReference(draftApplicationId)
          // The server draft is gone — drop its orphaned record, and only it.
          this.discardStoredWizardDraft(key, userId, draftApplicationId)
          return null
        }

        if (this.shouldDiscardLocalDraft(error)) {
          this.discardStoredWizardDraft(key, userId, draftApplicationId)
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
            // The server deleted this draft: its local records go with it, one
            // `(user, application)` identity at a time (R10.10). A refused or
            // failed sibling keeps its records.
            this.clearDeletedDraftRecords(userId, id)
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
            // A refused (payment-linked) draft kept its local record above;
            // only the drafts the server deleted lost theirs (R10.10).
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

      // Step 3: no browser-wide sweep. Each draft the server confirmed deleted
      // already had its own records cleared in the loop above; another user's
      // records, another application's, and the payment-recovery store are
      // never touched.

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

  /**
   * Clear the local records of one draft the server deleted: its
   * `(user, application)` record and any legacy unscoped record that names it
   * (R10.10). Nothing addressed to another application is touched.
   */
  private clearDeletedDraftRecords(userId: string, applicationId: string): void {
    try {
      clearWizardDraftCache({ userId, applicationId }, { notify: false })
    } catch {
      // best effort local cleanup
    }
    removeLegacyRecordsNaming(applicationId)
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

}

export const applicationSessionManager = new ApplicationSessionManager()
