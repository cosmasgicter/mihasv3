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
      'wizardFormData'
    ]
    
    // Clear from both localStorage and sessionStorage
    draftKeys.forEach(key => {
      localStorage.removeItem(key)
      sessionStorage.removeItem(key)
    })
    
    // Clear any other keys that might contain draft data
    Object.keys(localStorage).forEach(key => {
      if (key.includes('draft') || key.includes('wizard') || key.includes('application')) {
        localStorage.removeItem(key)
      }
    })
    
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('draft') || key.includes('wizard') || key.includes('application')) {
        sessionStorage.removeItem(key)
      }
    })
    
    // Set flag to indicate draft was deleted
    sessionStorage.setItem('draftDeleted', 'true')
    
    console.log('All draft data cleared successfully')
    return true
  } catch (error) {
    console.error('Error clearing draft data:', error)
    return false
  }
}

export const isDraftDeleted = (): boolean => {
  return sessionStorage.getItem('draftDeleted') === 'true'
}

export const clearDraftDeletedFlag = () => {
  sessionStorage.removeItem('draftDeleted')
}