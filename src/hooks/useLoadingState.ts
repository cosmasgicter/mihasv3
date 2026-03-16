/**
 * Loading State Hook — Component-Level Loading
 * 
 * Use this hook for component-scoped loading states with min-duration support.
 * 
 * Loading state strategy:
 * - Global loading state → `src/stores/loadingStore.ts` (Zustand)
 * - Component-level loading → this hook (`useLoadingState`)
 * - Server data loading → React Query (automatic via `useQuery`)
 * 
 * Provides consistent loading state management for async operations.
 * Ensures loading indicators appear within 100ms.
 */

import { useState, useCallback, useRef, useEffect } from 'react'

interface LoadingStateOptions {
  minDuration?: number // Minimum duration to show loading state (prevents flashing)
  onSuccess?: () => void
  onError?: (error: Error) => void
}

interface LoadingState {
  isLoading: boolean
  error: Error | null
  data: any | null
}

export function useLoadingState(options: LoadingStateOptions = {}) {
  const { minDuration = 300, onSuccess, onError } = options
  
  const [state, setState] = useState<LoadingState>({
    isLoading: false,
    error: null,
    data: null,
  })
  
  const startTimeRef = useRef<number>(0)
  const timeoutRef = useRef<NodeJS.Timeout>()

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const execute = useCallback(
    async <T,>(asyncFn: () => Promise<T>): Promise<T | null> => {
      setState({ isLoading: true, error: null, data: null })
      startTimeRef.current = Date.now()

      try {
        const result = await asyncFn()
        
        // Ensure minimum duration for loading state
        const elapsed = Date.now() - startTimeRef.current
        const remainingTime = Math.max(0, minDuration - elapsed)

        if (remainingTime > 0) {
          await new Promise(resolve => {
            timeoutRef.current = setTimeout(resolve, remainingTime)
          })
        }

        setState({ isLoading: false, error: null, data: result })
        onSuccess?.()
        return result
      } catch (error) {
        const err = error instanceof Error ? error : new Error('An error occurred')
        setState({ isLoading: false, error: err, data: null })
        onError?.(err)
        return null
      }
    },
    [minDuration, onSuccess, onError]
  )

  const reset = useCallback(() => {
    setState({ isLoading: false, error: null, data: null })
  }, [])

  return {
    ...state,
    execute,
    reset,
  }
}

/**
 * Hook for managing multiple loading states
 */
export function useMultipleLoadingStates() {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({})

  const setLoading = useCallback((key: string, isLoading: boolean) => {
    setLoadingStates(prev => ({ ...prev, [key]: isLoading }))
  }, [])

  const isAnyLoading = Object.values(loadingStates).some(Boolean)

  return {
    loadingStates,
    setLoading,
    isAnyLoading,
  }
}

/**
 * Hook for debounced loading state (prevents flashing for quick operations)
 */
export function useDebouncedLoading(isLoading: boolean, delay: number = 200) {
  const [debouncedLoading, setDebouncedLoading] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (isLoading) {
      // Show loading immediately if it takes longer than delay
      timeoutRef.current = setTimeout(() => {
        setDebouncedLoading(true)
      }, delay)
    } else {
      // Hide loading immediately when done
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      setDebouncedLoading(false)
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [isLoading, delay])

  return debouncedLoading
}

/**
 * Hook for progress tracking
 */
export function useProgress(total: number) {
  const [current, setCurrent] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const progress = total > 0 ? (current / total) * 100 : 0

  const increment = useCallback(() => {
    setCurrent(prev => {
      const next = Math.min(prev + 1, total)
      if (next === total) {
        setIsComplete(true)
      }
      return next
    })
  }, [total])

  const reset = useCallback(() => {
    setCurrent(0)
    setIsComplete(false)
  }, [])

  const setProgress = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(value, total))
    setCurrent(clamped)
    setIsComplete(clamped === total)
  }, [total])

  return {
    current,
    total,
    progress,
    isComplete,
    increment,
    reset,
    setProgress,
  }
}
