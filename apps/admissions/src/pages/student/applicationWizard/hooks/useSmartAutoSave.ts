import { useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useAutoSave } from '@/hooks/useAutoSave'
import { AuthenticationError } from '@/services/client'
import { logger } from '@/lib/logger'
import { BROWSER_EVENTS, LEGACY_BROWSER_EVENTS, listenWithLegacyEventFallback } from '@/lib/browserNamespace'

interface UseSmartAutoSaveProps {
  onSave: (context?: { isManual: boolean }) => Promise<void>
  watchValues: () => Record<string, unknown>
  enabled?: boolean
  interval?: number
}

/**
 * Enhanced smart auto-save hook with 8-second intervals and network resilience
 * Requirements: 9.3 - Implement reliable 8-second auto-save intervals
 */
export const useSmartAutoSave = ({ 
  onSave, 
  watchValues, 
  enabled = true,
  interval = 8000 // 8 seconds as per requirements
}: UseSmartAutoSaveProps) => {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [changedFields, setChangedFields] = useState<string[]>([])
  const [isAuthExpired, setIsAuthExpired] = useState(false)
  const previousValues = useRef<Record<string, unknown> | null>(null)
  const currentValues = watchValues()
  const debouncedValues = useDebounce(currentValues, 2000)

  // Use enhanced auto-save hook
  const autoSave = useAutoSave(currentValues, {
    interval,
    key: 'wizard_autosave',
    enabled,
    onSave: async (_data, context) => {
      await onSave(context)
      setLastSaved(new Date())
    },
    onError: (error) => {
      if (error instanceof AuthenticationError) {
        setIsAuthExpired(true)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(BROWSER_EVENTS.authExpired))
        }
        logger.error('Auto-save auth expired:', error.message)
        return
      }
      logger.error('Auto-save error:', error)
    }
  })

  // Propagate session-expired state from useAutoSave's saveError
  useEffect(() => {
    if (autoSave.saveError?.includes('Session expired')) {
      setIsAuthExpired(true)
    }
  }, [autoSave.saveError])

  // Reset auth-expired state when session recovers
  useEffect(() => {
    const handleRecovered = () => { setIsAuthExpired(false) }
    return listenWithLegacyEventFallback(
      window,
      BROWSER_EVENTS.authRecovered,
      [LEGACY_BROWSER_EVENTS.authRecovered],
      handleRecovered,
    )
  }, [])

  // Track changed fields for user feedback
  useEffect(() => {
    if (!enabled || !previousValues.current) {
      previousValues.current = currentValues
      return
    }

    const changed: string[] = []
    const previousValuesSnapshot = previousValues.current
    Object.keys(currentValues).forEach(key => {
      if (JSON.stringify(currentValues[key]) !== JSON.stringify(previousValuesSnapshot?.[key])) {
        changed.push(key)
      }
    })

    if (changed.length > 0) {
      setChangedFields(changed)
    } else {
      setChangedFields([])
    }
  }, [currentValues, enabled])

  // Update previous values when auto-save completes
  useEffect(() => {
    if (autoSave.saveStatus === 'saved') {
      previousValues.current = currentValues
      setChangedFields([])
    }
  }, [autoSave.saveStatus, currentValues])

  const getTimeSinceLastSave = () => {
    const savedTime = autoSave.lastSaved || lastSaved
    if (!savedTime) return null
    
    const seconds = Math.floor((Date.now() - savedTime.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  }

  return {
    // Legacy compatibility
    lastSaved: autoSave.lastSaved || lastSaved,
    changedFields,
    timeSinceLastSave: getTimeSinceLastSave(),
    
    // Enhanced auto-save features
    isDirty: autoSave.isDirty,
    isSaving: autoSave.isSaving,
    hasUnsavedChanges: autoSave.hasUnsavedChanges || changedFields.length > 0,
    saveStatus: autoSave.saveStatus,
    isOnline: autoSave.isOnline,
    saveError: autoSave.saveError,
    saveAttempts: autoSave.saveAttempts,
    nextSaveTime: autoSave.nextSaveTime,
    saveQueue: autoSave.saveQueue,
    timeUntilNextSave: autoSave.timeUntilNextSave,
    isAuthExpired,
    
    // Actions
    forceSave: autoSave.saveData,
    restoreData: autoSave.restoreData,
    clearSavedData: autoSave.clearSavedData,
    resolveConflict: autoSave.resolveConflict
  }
}
