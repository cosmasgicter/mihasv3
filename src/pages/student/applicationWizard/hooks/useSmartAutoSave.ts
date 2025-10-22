import { useEffect, useRef, useState } from 'react'
import { useDebounce } from '@/hooks/useDebounce'

interface UseSmartAutoSaveProps {
  onSave: () => Promise<void>
  watchValues: () => any
  enabled?: boolean
}

export const useSmartAutoSave = ({ onSave, watchValues, enabled = true }: UseSmartAutoSaveProps) => {
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [changedFields, setChangedFields] = useState<string[]>([])
  const previousValues = useRef<any>(null)
  const currentValues = watchValues()
  const debouncedValues = useDebounce(currentValues, 2000)

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
    }
  }, [currentValues, enabled])

  useEffect(() => {
    if (!enabled || changedFields.length === 0) return

    const save = async () => {
      await onSave()
      setLastSaved(new Date())
      setChangedFields([])
      previousValues.current = currentValues
    }

    save()
  }, [debouncedValues, enabled])

  const getTimeSinceLastSave = () => {
    if (!lastSaved) return null
    const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    return `${minutes}m ago`
  }

  return {
    lastSaved,
    changedFields,
    timeSinceLastSave: getTimeSinceLastSave()
  }
}
