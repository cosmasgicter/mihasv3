import { applicationSessionManager, type DraftDeleteResult } from './applicationSession'
import { sanitizeForLog } from './sanitize'
import { logger } from '@/lib/logger'

const DRAFT_CONTENT_KEYS = [
  'applicationDraft',
  'applicationWizardDraft',
  'applicationDraftOffline',
  'draftFormData',
  'wizardFormData',
  'applicationFormData',
  'wizardState',
  'applicationState',
] as const

function isDraftContentKey(key: string): boolean {
  return DRAFT_CONTENT_KEYS.includes(key as (typeof DRAFT_CONTENT_KEYS)[number])
}

export class DraftManager {
  private static instance: DraftManager
  private clearPromise: Promise<DraftDeleteResult> | null = null

  static getInstance(): DraftManager {
    if (!DraftManager.instance) {
      DraftManager.instance = new DraftManager()
    }
    return DraftManager.instance
  }

  // Prevent browser refresh during critical operations
  private preventRefresh() {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = 'Draft operation in progress. Are you sure you want to leave?'
      return e.returnValue
    }
    
    window.addEventListener('beforeunload', handler)
    
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }

  async clearAllDrafts(userId: string): Promise<DraftDeleteResult> {
    // Return existing promise if already clearing (prevents race condition)
    if (this.clearPromise) {
      return this.clearPromise
    }

    this.clearPromise = (async () => {
      const removeRefreshHandler = this.preventRefresh()

      try {
        // Invalidate cache BEFORE clearing to prevent stale reads
        this.draftKeysCache.clear()
        
        // The scoped bulk delete: each draft the server deleted loses its own
        // `(user, application)` records, and nothing else does. The sweep of
        // every legacy draft key that used to follow it erased records for
        // drafts the server had refused to delete (task 6.3, R10.10).
        return await applicationSessionManager.deleteDraft(userId)
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? sanitizeForLog(error.message) : 'Unknown error occurred'
        }
      } finally {
        removeRefreshHandler()
        this.clearPromise = null
      }
    })()

    return this.clearPromise
  }

  // Helper to check if key is draft-related
  private isDraftKey(key: string): boolean {
    return isDraftContentKey(key)
  }

  // Helper to get draft keys from storage with caching
  private draftKeysCache = new Map<Storage, { keys: string[], timestamp: number }>()
  
  private getDraftKeys(storage: Storage): string[] {
    const now = Date.now()
    const cached = this.draftKeysCache.get(storage)
    
    if (cached && now - cached.timestamp < 1000) { // Cache for 1 second
      return cached.keys
    }
    
    const keys = Object.keys(storage).filter(key => this.isDraftKey(key))
    this.draftKeysCache.set(storage, { keys, timestamp: now })
    return keys
  }

  // Check if any drafts exist (localStorage only — sessionStorage removed per Req 7.6)
  hasDrafts(): boolean {
    try {
      // Quick check for specific keys first
      if (localStorage.getItem('applicationWizardDraft') ||
          localStorage.getItem('applicationDraft') ||
          Object.keys(localStorage).some(key => key.startsWith('applicationWizardDraft:'))) {
        return true
      }

      // Check for any other draft-related keys
      return this.getDraftKeys(localStorage).length > 0
    } catch (error) {
      logger.error('Error checking for drafts:', sanitizeForLog(error))
      return false
    }
  }

  // `forceCleanBrowserStorage()` was REMOVED by admissions-v2 task 12.5
  // (R10.7-R10.10, findings STU-04 / STU-12). It swept every draft key in
  // `localStorage` plus every namespaced draft-storage entry — a whole-browser
  // wipe with no user and no application in its signature, the shape those
  // requirements forbid. Task 12.5 measured **zero** callers: its only mention
  // outside this class was `studentDashboardTaskFirst.test.tsx` asserting the
  // cleanup module does *not* reference it. An unreachable wipe primitive is
  // still a loaded gun, and unlike `clearAllDrafts` no numbered property was
  // over it. Scoped deletion is `clearWizardDraftCache` (task 6.3) reached
  // through `studentDraftCleanup.ts` (task 11.1).
}

export const draftManager = DraftManager.getInstance()


// ─── Standalone Draft Cleanup Functions (merged from src/lib/draftCleanup.ts) ───

// ── Single-application-addressed cleanup lives in `draftLocalCache.ts` (task
// 6.3, R10.10). The former `clearAllDraftData()` bulk wipe removed every draft
// key for every application AND deleted the entire payment-recovery store in
// one shot — the exact R10.10 violation. Cleanup must instead target one
// (user, application) and never erase another draft or any payment-recovery
// record, so callers now use `clearWizardDraftCache` / `clearNewWizardDraftCache`.

export const isDraftDeleted = (): boolean => {
  try { return localStorage.getItem('draftDeleted') === 'true'; } catch { return false; }
};

export const clearDraftDeletedFlag = (): void => {
  try { localStorage.removeItem('draftDeleted'); } catch {}
};

export const hasDraftData = (): boolean => {
  try {
    for (const key of DRAFT_CONTENT_KEYS) {
      if (localStorage.getItem(key)) return true;
    }
    // Only check localStorage — sessionStorage removed (Req 7.6)
    for (const key of Object.keys(localStorage)) {
      if (isDraftContentKey(key)) return true;
      if (key.toLowerCase().includes('draft') && key !== 'draftDeleted') return true;
    }
    return false;
  } catch { return false; }
};
