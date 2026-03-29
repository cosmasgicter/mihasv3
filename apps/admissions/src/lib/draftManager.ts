import { applicationSessionManager } from './applicationSession'
import { sanitizeForLog, safeJsonParse } from './sanitize'

export class DraftManager {
  private static instance: DraftManager
  private clearPromise: Promise<{ success: boolean; error?: string }> | null = null

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

  async clearAllDrafts(userId: string): Promise<{ success: boolean; error?: string }> {
    // Return existing promise if already clearing (prevents race condition)
    if (this.clearPromise) {
      return this.clearPromise
    }

    this.clearPromise = (async () => {
      const removeRefreshHandler = this.preventRefresh()

      try {
        // Invalidate cache BEFORE clearing to prevent stale reads
        this.draftKeysCache.clear()
        
        // Clear all possible draft storage locations
        const deleteResult = await applicationSessionManager.deleteDraft(userId)
        
        // Additional cleanup for any missed items
        try {
          // Clear all localStorage keys that might contain draft data
          this.getDraftKeys(localStorage).forEach(key => {
            localStorage.removeItem(key)
          })

          // Clear sessionStorage as well
          this.getDraftKeys(sessionStorage).forEach(key => {
            sessionStorage.removeItem(key)
          })
        } catch (storageError) {
        }

        return deleteResult
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
    return key.includes('draft') || key.includes('wizard') || key.includes('application')
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

  // Check if any drafts exist
  hasDrafts(): boolean {
    try {
      // Quick check for specific keys first
      if (localStorage.getItem('applicationWizardDraft') || 
          sessionStorage.getItem('applicationWizardDraft')) {
        return true
      }

      // Check for any other draft-related keys
      return this.getDraftKeys(localStorage).length > 0 || 
             this.getDraftKeys(sessionStorage).length > 0
    } catch (error) {
      console.error('Error checking for drafts:', sanitizeForLog(error))
      return false
    }
  }

  // Force clear all browser storage
  forceCleanBrowserStorage(): void {
    try {
      // Clear all localStorage
      localStorage.clear()
      
      // Clear all sessionStorage
      sessionStorage.clear()
      
      // Clear any IndexedDB if used
      if ('indexedDB' in window) {
        // Note: This is a more aggressive approach
        // In production, you might want to be more selective
      }
    } catch (error) {
      console.error('Force clean failed:', sanitizeForLog(error))
    }
  }
}

export const draftManager = DraftManager.getInstance()


// ─── Standalone Draft Cleanup Functions (merged from src/lib/draftCleanup.ts) ───

const DRAFT_KEYS = [
  'applicationDraft',
  'applicationWizardDraft',
  'applicationDraftOffline',
  'draftFormData',
  'wizardFormData',
  'applicationFormData',
  'wizardState',
  'applicationState',
] as const;

/**
 * Clear all draft data from localStorage and sessionStorage.
 * Sets a 'draftDeleted' flag in sessionStorage and dispatches a 'draftCleared' event.
 */
export const clearAllDraftData = (): boolean => {
  try {
    DRAFT_KEYS.forEach(key => {
      try { localStorage.removeItem(key); } catch {}
      try { sessionStorage.removeItem(key); } catch {}
    });

    // Clear any other keys that might contain draft data
    [localStorage, sessionStorage].forEach(storage => {
      try {
        Object.keys(storage)
          .filter(key => key.includes('draft') || key.includes('wizard') || key.includes('application') || key.includes('form') || key.includes('step'))
          .forEach(key => { try { storage.removeItem(key); } catch {} });
      } catch {}
    });

    try { sessionStorage.setItem('draftDeleted', 'true'); } catch {}
    try { window.dispatchEvent(new CustomEvent('draftCleared')); } catch {}

    return true;
  } catch (error) {
    console.error('Error clearing draft data:', error);
    return false;
  }
};

export const isDraftDeleted = (): boolean => {
  try { return sessionStorage.getItem('draftDeleted') === 'true'; } catch { return false; }
};

export const clearDraftDeletedFlag = (): void => {
  try { sessionStorage.removeItem('draftDeleted'); } catch {}
};

export const hasDraftData = (): boolean => {
  try {
    for (const key of DRAFT_KEYS) {
      if (localStorage.getItem(key) || sessionStorage.getItem(key)) return true;
    }
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (key.includes('draft') || key.includes('wizard') || key.includes('application')) return true;
      }
    }
    return false;
  } catch { return false; }
};
