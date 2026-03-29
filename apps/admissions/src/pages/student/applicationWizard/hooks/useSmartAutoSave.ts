import { useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import { useAutoSave } from '@/hooks/useAutoSave'

interface UseSmartAutoSaveProps {
  onSave: () => Promise<void>
  watchValues: () => any
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
  const previousValues = useRef<any>(null)
  const currentValues = watchValues()
  const debouncedValues = useDebounce(currentValues, 2000)

  // Use enhanced auto-save hook
  const autoSave = useAutoSave(currentValues, {
    interval,
    key: 'wizard_autosave',
    enabled,
    onSave: async (data) => {
      await onSave()
      setLastSaved(new Date())
    },
    onError: (error) => {
      console.error('Auto-save error:', error)
    }
  })

  // Track changed fields for user feedback
  useEffect(() => {
    if (!enabled || !previousValues.current) {
      previousValues.current = currentValues
      return
    }

    const changed: string[] = []
    Object.keys(currentValues).forEach(key => {
      if (JSON.stringify(currentValues[key]) !== JSON.stringify(previousValues.current[key])) {
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
    
    // Actions
    forceSave: autoSave.saveData,
    restoreData: autoSave.restoreData,
    clearSavedData: autoSave.clearSavedData,
    resolveConflict: autoSave.resolveConflict
  }
}
