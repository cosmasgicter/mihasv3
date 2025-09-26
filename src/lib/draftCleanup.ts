/**
 * Utility for complete draft cleanup when starting over
 */

export const clearAllDraftData = () => {
  try {
    // Clear all known draft keys
    const draftKeys = [
      'applicationDraft',
      'applicationWizardDraft',
      'applicationDraftOffline',
      'draftFormData',
      'wizardFormData',
      'applicationFormData',
      'wizardState',
      'applicationState'
    ]
    
    // Clear from both localStorage and sessionStorage
    draftKeys.forEach(key => {
      try {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      } catch (e) {
        console.warn(`Failed to remove ${key}:`, e)
      }
    })
    
    // Clear any other keys that might contain draft data
    const storages = [
      { storage: localStorage, name: 'localStorage' },
      { storage: sessionStorage, name: 'sessionStorage' }
    ]
    
    storages.forEach(({ storage, name }) => {
      try {
        const keysToRemove = Object.keys(storage).filter(key => 
          key.includes('draft') || 
          key.includes('wizard') || 
          key.includes('application') ||
          key.includes('form') ||
          key.includes('step')
        )
        
        keysToRemove.forEach(key => {
          try {
            storage.removeItem(key)
          } catch (e) {
            console.warn(`Failed to remove ${key} from ${name}:`, e)
          }
        })
      } catch (e) {
        console.warn(`Failed to access ${name}:`, e)
      }
    })
    
    // Set flag to indicate draft was deleted
    try {
      sessionStorage.setItem('draftDeleted', 'true')
    } catch (e) {
      console.warn('Failed to set draftDeleted flag:', e)
    }
    
    console.log('All draft data cleared successfully')
    
    // Dispatch a custom event to notify other components
    try {
      window.dispatchEvent(new CustomEvent('draftCleared'))
    } catch (e) {
      console.warn('Failed to dispatch draftCleared event:', e)
    }
    
    return true
  } catch (error) {
    console.error('Error clearing draft data:', error)
    return false
  }
}

export const isDraftDeleted = (): boolean => {
  try {
    return sessionStorage.getItem('draftDeleted') === 'true'
  } catch {
    return false
  }
}

export const clearDraftDeletedFlag = () => {
  try {
    sessionStorage.removeItem('draftDeleted')
  } catch (e) {
    console.warn('Failed to clear draftDeleted flag:', e)
  }
}

// Helper to check if any draft data exists
export const hasDraftData = (): boolean => {
  try {
    const draftKeys = [
      'applicationDraft',
      'applicationWizardDraft',
      'applicationDraftOffline',
      'draftFormData',
      'wizardFormData'
    ]
    
    // Check known keys first
    for (const key of draftKeys) {
      if (localStorage.getItem(key) || sessionStorage.getItem(key)) {
        return true
      }
    }
    
    // Check for any draft-related keys
    const storages = [localStorage, sessionStorage]
    for (const storage of storages) {
      for (const key of Object.keys(storage)) {
        if (key.includes('draft') || key.includes('wizard') || key.includes('application')) {
          return true
        }
      }
    }
    
    return false
  } catch {
    return false
  }
}