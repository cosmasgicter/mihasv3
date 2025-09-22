import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export interface AutoSaveData {
  [key: string]: any
}

export interface AutoSaveOptions {
  interval?: number // Auto-save interval in milliseconds (default: 30000 = 30 seconds)
  key?: string // Storage key prefix (default: 'autosave')
  onSave?: (data: AutoSaveData) => void // Callback when data is saved
  onRestore?: (data: AutoSaveData) => void // Callback when data is restored
  onError?: (error: Error) => void // Callback when error occurs
  enabled?: boolean // Enable/disable auto-save (default: true)
  clearOnSubmit?: boolean // Clear saved data on form submission (default: true)
}

/**
 * Hook for auto-saving form data every 30 seconds
 * Handles session recovery and draft management
 */
export function useAutoSave(
  data: AutoSaveData,
  options: AutoSaveOptions = {}
) {
  const {
    interval = 30000, // 30 seconds
    key = 'autosave',
    onSave,
    onRestore,
    onError,
    enabled = true,
    clearOnSubmit = true
  } = options

  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  const location = useLocation()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousDataRef = useRef<string>('')
  
  // Generate unique storage key based on location and custom key
  const storageKey = `${key}_${location.pathname}_${location.search}`

  // Save data to localStorage
  const saveData = useCallback(async () => {
    if (!enabled || !data || Object.keys(data).length === 0) return

    try {
      setIsSaving(true)
      const dataString = JSON.stringify(data)
      
      // Only save if data has changed
      if (dataString === previousDataRef.current) {
        setIsSaving(false)
        return
      }

      const savePayload = {
        data,
        timestamp: new Date().toISOString(),
        url: location.pathname + location.search,
        userAgent: navigator.userAgent
      }

      localStorage.setItem(storageKey, JSON.stringify(savePayload))
      previousDataRef.current = dataString
      setLastSaved(new Date())
      setIsDirty(false)
      setHasUnsavedChanges(false)
      
      onSave?.(data)
    } catch (error) {
      console.error('Auto-save failed:', error)
      onError?.(error as Error)
    } finally {
      setIsSaving(false)
    }
  }, [data, enabled, storageKey, location, onSave, onError])

  // Restore data from localStorage
  const restoreData = useCallback(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return null

      const parsed = JSON.parse(saved)
      const savedData = parsed.data
      const savedTimestamp = new Date(parsed.timestamp)
      
      // Check if saved data is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      if (Date.now() - savedTimestamp.getTime() > maxAge) {
        localStorage.removeItem(storageKey)
        return null
      }

      onRestore?.(savedData)
      setLastSaved(savedTimestamp)
      return { data: savedData, timestamp: savedTimestamp }
    } catch (error) {
      console.error('Failed to restore auto-saved data:', error)
      localStorage.removeItem(storageKey) // Remove corrupted data
      onError?.(error as Error)
      return null
    }
  }, [storageKey, onRestore, onError])

  // Clear saved data
  const clearSavedData = useCallback(() => {
    localStorage.removeItem(storageKey)
    setLastSaved(null)
    setIsDirty(false)
    setHasUnsavedChanges(false)
  }, [storageKey])

  // Force save immediately
  const forceSave = useCallback(() => {
    saveData()
  }, [saveData])

  // Check if there are unsaved changes
  useEffect(() => {
    const currentDataString = JSON.stringify(data)
    const hasChanges = currentDataString !== previousDataRef.current && 
                      Object.keys(data).length > 0
    
    setIsDirty(hasChanges)
    setHasUnsavedChanges(hasChanges)
  }, [data])

  // Set up auto-save interval
  useEffect(() => {
    if (!enabled) return

    intervalRef.current = setInterval(saveData, interval)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [enabled, interval, saveData])

  // Save on page unload
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Save before leaving
        saveData()
        
        // Show warning dialog
        const message = 'You have unsaved changes. Are you sure you want to leave?'
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
        saveData()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, hasUnsavedChanges, saveData])

  // Clear data when location changes (new form)
  useEffect(() => {
    return () => {
      if (clearOnSubmit) {
        clearSavedData()
      }
    }
  }, [location.pathname, clearOnSubmit, clearSavedData])

  return {
    lastSaved,
    isDirty,
    isSaving,
    hasUnsavedChanges,
    saveData: forceSave,
    restoreData,
    clearSavedData,
    storageKey
  }
}

/**
 * Hook for managing draft warnings and recovery
 */
export function useDraftManager(formId: string) {
  const [hasDraft, setHasDraft] = useState(false)
  const [draftData, setDraftData] = useState<AutoSaveData | null>(null)
  const [showDraftWarning, setShowDraftWarning] = useState(false)
  
  const location = useLocation()
  const draftKey = `draft_${formId}_${location.pathname}`

  // Check for existing draft on mount
  useEffect(() => {
    const checkForDraft = () => {
      try {
        const draft = localStorage.getItem(draftKey)
        if (draft) {
          const parsed = JSON.parse(draft)
          const draftTimestamp = new Date(parsed.timestamp)
          
          // Check if draft is not too old (7 days)
          const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
          if (Date.now() - draftTimestamp.getTime() <= maxAge) {
            setHasDraft(true)
            setDraftData(parsed)
            setShowDraftWarning(true)
          } else {
            // Remove old draft
            localStorage.removeItem(draftKey)
          }
        }
      } catch (error) {
        console.error('Failed to check for draft:', error)
        localStorage.removeItem(draftKey)
      }
    }

    checkForDraft()
  }, [draftKey])

  // Save draft
  const saveDraft = useCallback((data: AutoSaveData) => {
    try {
      const draftPayload = {
        data,
        timestamp: new Date().toISOString(),
        formId,
        url: location.pathname + location.search
      }
      
      localStorage.setItem(draftKey, JSON.stringify(draftPayload))
      setHasDraft(true)
      setDraftData(draftPayload)
    } catch (error) {
      console.error('Failed to save draft:', error)
    }
  }, [draftKey, formId, location])

  // Restore draft
  const restoreDraft = useCallback(() => {
    setShowDraftWarning(false)
    return draftData?.data || null
  }, [draftData])

  // Dismiss draft warning
  const dismissDraft = useCallback(() => {
    setShowDraftWarning(false)
    localStorage.removeItem(draftKey)
    setHasDraft(false)
    setDraftData(null)
  }, [draftKey])

  // Clear draft
  const clearDraft = useCallback(() => {
    localStorage.removeItem(draftKey)
    setHasDraft(false)
    setDraftData(null)
    setShowDraftWarning(false)
  }, [draftKey])

  return {
    hasDraft,
    draftData,
    showDraftWarning,
    saveDraft,
    restoreDraft,
    dismissDraft,
    clearDraft
  }
}

/**
 * Hook for session timeout warnings
 */
export function useSessionTimeout(timeoutMinutes: number = 30) {
  const [timeLeft, setTimeLeft] = useState(timeoutMinutes * 60) // in seconds
  const [showWarning, setShowWarning] = useState(false)
  const [isActive, setIsActive] = useState(true)
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const warningRef = useRef<NodeJS.Timeout | null>(null)
  
  const resetTimeout = useCallback(() => {
    setTimeLeft(timeoutMinutes * 60)
    setShowWarning(false)
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (warningRef.current) clearTimeout(warningRef.current)
    
    // Show warning 5 minutes before timeout
    warningRef.current = setTimeout(() => {
      setShowWarning(true)
    }, (timeoutMinutes - 5) * 60 * 1000)
    
    // Auto logout after timeout
    timeoutRef.current = setTimeout(() => {
      setIsActive(false)
      // Trigger logout logic here
    }, timeoutMinutes * 60 * 1000)
  }, [timeoutMinutes])

  // Track user activity
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    
    const handleActivity = () => {
      if (isActive) {
        resetTimeout()
      }
    }

    events.forEach(event => {
      document.addEventListener(event, handleActivity, true)
    })

    // Initial timeout
    resetTimeout()

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true)
      })
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (warningRef.current) clearTimeout(warningRef.current)
    }
  }, [resetTimeout, isActive])

  // Countdown timer when warning is shown
  useEffect(() => {
    if (!showWarning) return

    const countdown = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          setIsActive(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(countdown)
  }, [showWarning])

  const extendSession = useCallback(() => {
    setIsActive(true)
    resetTimeout()
  }, [resetTimeout])

  const formatTimeLeft = useCallback(() => {
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [timeLeft])

  return {
    timeLeft,
    showWarning,
    isActive,
    extendSession,
    resetTimeout,
    formatTimeLeft
  }
}
