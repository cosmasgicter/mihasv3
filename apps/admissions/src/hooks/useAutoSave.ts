import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { stripPiiFields } from '@/lib/secureStorage'
import { cachedGetItem, cachedSetItem, cachedRemoveItem } from '@/lib/localStorageCache'
import { AuthenticationError } from '@/services/client'

export interface AutoSaveData {
  [key: string]: any
}

export interface AutoSaveOptions {
  interval?: number // Auto-save interval in milliseconds (default: 8000 = 8 seconds)
  key?: string // Storage key prefix (default: 'autosave')
  onSave?: (data: AutoSaveData, context: { isManual: boolean }) => void | Promise<void> // Callback when data is saved
  onRestore?: (data: AutoSaveData) => void // Callback when data is restored
  onError?: (error: Error) => void // Callback when error occurs
  enabled?: boolean // Enable/disable auto-save (default: true)
  clearOnSubmit?: boolean // Clear saved data on explicit form submission (default: false)
}

const SESSION_EXPIRED_SAVE_MESSAGE = 'Your progress is saved on this device while we reconnect.'

function isAuthenticationFailure(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError ||
    (error instanceof Error && error.name === 'AuthenticationError')
}

/**
 * Hook for auto-saving form data every 8 seconds
 * Handles session recovery and draft management
 * Requirements: 9.3 - Implement reliable 8-second auto-save intervals
 */
export function useAutoSave(
  data: AutoSaveData,
  options: AutoSaveOptions = {}
) {
  const {
    interval = 8000, // 8 seconds as per requirements
    key = 'autosave',
    onSave,
    onRestore,
    onError,
    enabled = true,
  } = options

  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline' | 'conflict'>('idle')
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveAttempts, setSaveAttempts] = useState(0)
  const [nextSaveTime, setNextSaveTime] = useState<Date | null>(null)
  const [saveQueue, setSaveQueue] = useState<AutoSaveData[]>([])
  
  const location = useLocation()
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const previousDataRef = useRef<string>('')
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const saveCountdownRef = useRef<NodeJS.Timeout | null>(null)
  const inFlightSaveRef = useRef(false)
  const latestDataRef = useRef<AutoSaveData>(data)
  const saveAttemptsRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const versionRef = useRef(0)
  const pendingManualSaveRef = useRef(false)
  const mountedRef = useRef(true)
  const authExpiredRef = useRef(false)

  useEffect(() => {
    latestDataRef.current = data
  }, [data])
  
  // Generate unique storage key based on location and custom key
  const storageKey = `${key}_${location.pathname}_${location.search}`

  // Save data to localStorage with network interruption handling and retry logic
  const saveData = useCallback(async (isManual = false) => {
    const currentData = latestDataRef.current
    if (!enabled || !currentData || Object.keys(currentData).length === 0) return

    // If auth has expired, skip cloud saves entirely (localStorage saves still work below)
    // but only block the cloud portion — we still want local persistence
    const skipCloudSave = authExpiredRef.current
    
    // If a save is already in-flight, queue manual saves for later
    if (inFlightSaveRef.current) {
      if (isManual) {
        pendingManualSaveRef.current = true
      }
      return
    }

    inFlightSaveRef.current = true
    
    // Create a new AbortController for this save
    const abortController = new AbortController()
    abortControllerRef.current = abortController
    
    // Increment monotonic version
    versionRef.current += 1
    const currentVersion = versionRef.current
    
    try {
      if (mountedRef.current) {
        setIsSaving(true)
        setSaveStatus('saving')
        setSaveError(null)
      }
      
      const dataString = JSON.stringify(currentData)
      
      // Only save if data has changed (skip for manual saves to ensure latest is persisted)
      if (!isManual && dataString === previousDataRef.current) {
        if (mountedRef.current) {
          setIsSaving(false)
          if (authExpiredRef.current) {
            setSaveStatus('error')
            setSaveError(SESSION_EXPIRED_SAVE_MESSAGE)
            setHasUnsavedChanges(true)
          } else {
            setSaveStatus('saved')
          }
        }
        return
      }
      
      // Check if aborted before proceeding
      if (abortController.signal.aborted) return

      const savePayload = {
        data: stripPiiFields(currentData as Record<string, unknown>),
        timestamp: new Date().toISOString(),
        url: location.pathname + location.search,
        userAgent: navigator.userAgent,
        isOnline: navigator.onLine,
        saveAttempt: saveAttemptsRef.current + 1,
        version: currentVersion
      }

      // Always save to localStorage first (works offline) — PII stripped
      cachedSetItem(storageKey, JSON.stringify(savePayload))

      // Track whether cloud save succeeded (or was skipped)
      let cloudSaveFailed = false

      // If online, attempt cloud save with retry logic
      if (navigator.onLine && onSave && !skipCloudSave) {
        try {
          if (abortController.signal.aborted) return
          await onSave(currentData, { isManual })
          if (mountedRef.current) {
            setSaveQueue([])
            setSaveAttempts(0)
          }
          saveAttemptsRef.current = 0
        } catch (cloudError) {
          // If aborted (unmount), don't update state
          if (abortController.signal.aborted) return

          // Auth failure is unrecoverable — stop retries immediately
          if (isAuthenticationFailure(cloudError)) {
            authExpiredRef.current = true
            saveAttemptsRef.current = 0
            if (mountedRef.current) {
              setSaveQueue([])
              setSaveAttempts(0)
              setSaveStatus('error')
              setSaveError(SESSION_EXPIRED_SAVE_MESSAGE)
              setHasUnsavedChanges(true)
            }
            onError?.(cloudError as Error)
            return
          }
          
          cloudSaveFailed = true
          console.warn('Cloud save failed, data saved locally:', cloudError)
          const nextAttempts = saveAttemptsRef.current + 1
          saveAttemptsRef.current = nextAttempts
          if (mountedRef.current) {
            setSaveAttempts(nextAttempts)
            setSaveQueue(prev => [...prev, currentData])
          }
          
          // Implement exponential backoff for retries
          const retryDelay = Math.min(1000 * Math.pow(2, nextAttempts - 1), 30000) // Max 30 seconds
          
          if (nextAttempts < 5) { // Max 5 retry attempts
            retryTimeoutRef.current = setTimeout(() => {
              void saveData() // Retry save
            }, retryDelay)
          } else if (mountedRef.current) {
            setSaveStatus('error')
            setSaveError('Failed to sync with server after multiple attempts')
            onError?.(new Error('Max retry attempts exceeded'))
          }
          
          // Don't throw - local save succeeded
        }
      }
      
      // If aborted, don't update state
      if (abortController.signal.aborted) return

      previousDataRef.current = dataString
      if (mountedRef.current) {
        // Only update lastSaved and show success when cloud save didn't fail.
        // When cloud save fails, keep the previous lastSaved timestamp so the
        // UI doesn't show contradictory "Save failed" + "Last saved: Just now".
        if (!cloudSaveFailed && !skipCloudSave) {
          setLastSaved(new Date())
          setIsDirty(false)
          setHasUnsavedChanges(false)
          setSaveStatus(navigator.onLine ? 'saved' : 'offline')
        } else if (skipCloudSave) {
          // Auth expired — data saved locally but cloud is blocked
          // Keep the error status set when AuthenticationError was caught
          setSaveStatus('error')
          setSaveError(SESSION_EXPIRED_SAVE_MESSAGE)
          setHasUnsavedChanges(true)
        } else if (mountedRef.current) {
          // Cloud failed but local succeeded — show offline status, not error,
          // unless max retries were already exhausted (handled above).
          if (saveAttemptsRef.current < 5) {
            setSaveStatus('offline')
            setSaveError('Saved locally — waiting to sync')
          }
        }
        
        // Schedule next save
        const nextSave = new Date(Date.now() + interval)
        setNextSaveTime(nextSave)
      }
      
    } catch (error) {
      if (abortController.signal.aborted) return
      
      console.error('Auto-save failed:', error)
      if (mountedRef.current) {
        setSaveStatus('error')
        setSaveError(error instanceof Error ? error.message : 'Save failed')
        const nextAttempts = saveAttemptsRef.current + 1
        saveAttemptsRef.current = nextAttempts
        setSaveAttempts(nextAttempts)
      }
      onError?.(error as Error)
    } finally {
      inFlightSaveRef.current = false
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null
      }
      if (mountedRef.current) {
        setIsSaving(false)
      }
      
      // Process pending manual save if one was queued
      if (pendingManualSaveRef.current && !abortController.signal.aborted) {
        pendingManualSaveRef.current = false
        void saveData(true)
      }
    }
  }, [enabled, storageKey, location.pathname, location.search, onSave, onError, interval])

  // Process save queue when coming back online
  const processSaveQueue = useCallback(async () => {
    if (!navigator.onLine || saveQueue.length === 0 || !onSave || inFlightSaveRef.current) return
    
    inFlightSaveRef.current = true
    try {
      setSaveStatus('saving')
      
      // Process queued saves in order
      for (let index = 0; index < saveQueue.length; index += 1) {
        const queuedData = saveQueue[index]!
        try {
          await onSave(queuedData, { isManual: false })
        } catch (error) {
          if (isAuthenticationFailure(error)) {
            authExpiredRef.current = true
            setSaveQueue([])
            setSaveAttempts(0)
            saveAttemptsRef.current = 0
            setSaveStatus('error')
            setSaveError(SESSION_EXPIRED_SAVE_MESSAGE)
            onError?.(error as Error)
            return
          }
          setSaveQueue(saveQueue.slice(index))
          setSaveStatus('error')
          setSaveError('Failed to sync queued changes')
          return
        }
      }
      
      setSaveQueue([])
      setSaveAttempts(0)
      saveAttemptsRef.current = 0
      setSaveStatus('saved')
      
    } catch (error) {
      console.error('Failed to process save queue:', error)
      setSaveStatus('error')
      setSaveError('Failed to sync queued changes')
    } finally {
      inFlightSaveRef.current = false
    }
  }, [saveQueue, onSave, onError])

  // Countdown timer for next save
  const updateSaveCountdown = useCallback(() => {
    if (!nextSaveTime) return
    
    const now = Date.now()
    const timeUntilSave = nextSaveTime.getTime() - now
    
    if (timeUntilSave <= 0) {
      setNextSaveTime(null)
      return
    }
    
    saveCountdownRef.current = setTimeout(updateSaveCountdown, 1000)
  }, [nextSaveTime])

  // Get time until next save
  const getTimeUntilNextSave = useCallback(() => {
    if (!nextSaveTime) return null
    
    const timeUntilSave = Math.max(0, nextSaveTime.getTime() - Date.now())
    const seconds = Math.ceil(timeUntilSave / 1000)
    
    if (seconds <= 0) return null
    if (seconds < 60) return `${seconds}s`
    
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }, [nextSaveTime])

  // Detect data conflicts
  const detectConflict = useCallback(() => {
    try {
      const saved = cachedGetItem(storageKey)
      if (!saved) return false
      
      const parsed = JSON.parse(saved)
      const currentDataString = JSON.stringify(data)
      const savedDataString = JSON.stringify(parsed.data)
      
      // Check if current data differs from saved data in a way that suggests conflict
      return currentDataString !== savedDataString && 
             parsed.version && 
             Date.now() - new Date(parsed.timestamp).getTime() < 60000 // Within last minute
    } catch {
      return false
    }
  }, [data, storageKey])

  // Handle conflict resolution
  const resolveConflict = useCallback((useLocal: boolean) => {
    if (useLocal) {
      // Keep current data, update saved version
      forceSave()
    } else {
      // Restore from saved data
      const restored = restoreData()
      if (restored && onRestore) {
        onRestore(restored.data)
      }
    }
    setSaveStatus('saved')
  }, [])

  // Check for conflicts
  useEffect(() => {
    if (detectConflict()) {
      setSaveStatus('conflict')
    }
  }, [detectConflict])

  // Update countdown timer
  useEffect(() => {
    updateSaveCountdown()
    return () => {
      if (saveCountdownRef.current) {
        clearTimeout(saveCountdownRef.current)
      }
    }
  }, [updateSaveCountdown])

  // Restore data from localStorage
  const restoreData = useCallback(() => {
    try {
      const saved = cachedGetItem(storageKey)
      if (!saved) return null

      const parsed = JSON.parse(saved)
      const savedData = parsed.data
      const savedTimestamp = new Date(parsed.timestamp)
      
      // Check if saved data is not too old (24 hours)
      const maxAge = 24 * 60 * 60 * 1000 // 24 hours
      if (Date.now() - savedTimestamp.getTime() > maxAge) {
        cachedRemoveItem(storageKey)
        return null
      }

      onRestore?.(savedData)
      setLastSaved(savedTimestamp)
      return { data: savedData, timestamp: savedTimestamp }
    } catch (error) {
      console.error('Failed to restore auto-saved data:', error)
      cachedRemoveItem(storageKey) // Remove corrupted data
      onError?.(error as Error)
      return null
    }
  }, [storageKey, onRestore, onError])

  // Clear saved data
  const clearSavedData = useCallback(() => {
    cachedRemoveItem(storageKey)
    setLastSaved(null)
    setIsDirty(false)
    setHasUnsavedChanges(false)
  }, [storageKey])

  // Force save immediately (manual trigger)
  const forceSave = useCallback(() => {
    void saveData(true)
  }, [saveData])

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      if (!authExpiredRef.current) {
        setSaveStatus('saved')
      }
      // Process queued saves when coming back online
      void processSaveQueue()
    }
    
    const handleOffline = () => {
      setIsOnline(false)
      setSaveStatus('offline')
    }

    const handleAuthExpired = () => {
      authExpiredRef.current = true
      if (mountedRef.current) {
        setSaveStatus('error')
        setSaveError(SESSION_EXPIRED_SAVE_MESSAGE)
        setHasUnsavedChanges(true)
      }
    }

    const handleAuthRecovered = () => {
      if (authExpiredRef.current) {
        authExpiredRef.current = false
        if (mountedRef.current) {
          setSaveError(null)
          setSaveStatus('idle')
          // Immediately sync current dirty data to the server
          void saveData()
          // Also process any queued saves (belt-and-suspenders)
          void processSaveQueue()
        }
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('mihas:auth-expired', handleAuthExpired)
    window.addEventListener('mihas:auth-recovered', handleAuthRecovered)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('mihas:auth-expired', handleAuthExpired)
      window.removeEventListener('mihas:auth-recovered', handleAuthRecovered)
    }
  }, [saveData, processSaveQueue])

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

    intervalRef.current = setInterval(() => {
      void saveData()
    }, interval)

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
        void saveData()
        
        // Show warning dialog
        const message = 'You have unsaved changes. Are you sure you want to leave?'
        e.preventDefault()
        e.returnValue = message
        return message
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && hasUnsavedChanges) {
        void saveData()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, hasUnsavedChanges, saveData])

  // Cleanup timeouts and abort in-flight saves on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Abort any in-flight save request
      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
      }
      if (saveCountdownRef.current) {
        clearTimeout(saveCountdownRef.current)
      }
    }
  }, [])

  return {
    lastSaved,
    isDirty,
    isSaving,
    hasUnsavedChanges,
    saveStatus,
    isOnline,
    saveError,
    saveAttempts,
    nextSaveTime,
    saveQueue: saveQueue.length,
    timeUntilNextSave: getTimeUntilNextSave(),
    saveData: forceSave,
    restoreData,
    clearSavedData,
    resolveConflict,
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
        const draft = cachedGetItem(draftKey)
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
            cachedRemoveItem(draftKey)
          }
        }
      } catch (error) {
        console.error('Failed to check for draft:', error)
        cachedRemoveItem(draftKey)
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
      
      cachedSetItem(draftKey, JSON.stringify(draftPayload))
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
    cachedRemoveItem(draftKey)
    setHasDraft(false)
    setDraftData(null)
  }, [draftKey])

  // Clear draft
  const clearDraft = useCallback(() => {
    cachedRemoveItem(draftKey)
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
