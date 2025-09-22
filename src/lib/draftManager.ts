import { applicationSessionManager } from './applicationSession'
import { sanitizeForLog, safeJsonParse } from './sanitize'

export class DraftManager {
  private static instance: DraftManager
  private isClearing = false

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
    if (this.isClearing) {
      return { success: false, error: 'Clear operation already in progress' }
    }

    this.isClearing = true
    const removeRefreshHandler = this.preventRefresh()

    try {
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
        console.warn('Additional storage cleanup failed:', sanitizeForLog(storageError))
      }

      return deleteResult
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? sanitizeForLog(error.message) : 'Unknown error occurred'
      }
    } finally {
      this.isClearing = false
      removeRefreshHandler()
    }
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