import { useState, useCallback, useRef } from 'react'
import { createUserFriendlyError } from '@/lib/utils'

interface AsyncOperationState<T> {
  data: T | null
  loading: boolean
  error: string | null
  success: boolean
}

interface UseAsyncOperationOptions {
  showUserFriendlyErrors?: boolean
  retryCount?: number
  retryDelay?: number
  onSuccess?: (data: any) => void
  onError?: (error: string) => void
}

export function useAsyncOperation<T = any>(
  operation: (...args: any[]) => Promise<T>,
  options: UseAsyncOperationOptions = {}
) {
  const {
    showUserFriendlyErrors = true,
    retryCount = 0,
    retryDelay = 1000,
    onSuccess,
    onError
  } = options

  const [state, setState] = useState<AsyncOperationState<T>>({
    data: null,
    loading: false,
    error: null,
    success: false
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentRetryRef = useRef(0)

  const execute = useCallback(async (...args: any[]): Promise<T | null> => {
    // Cancel any ongoing operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController()
    currentRetryRef.current = 0

    const executeWithRetry = async (attempt: number = 0): Promise<T | null> => {
      setState(prev => ({
        ...prev,
        loading: true,
        error: null,
        success: false
      }))

      try {
        const result = await operation(...args)
        
        // Check if operation was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return null
        }

        setState({
          data: result,
          loading: false,
          error: null,
          success: true
        })

        onSuccess?.(result)
        return result
      } catch (error: any) {
        // Check if operation was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return null
        }

        const shouldRetry = attempt < retryCount && !error.name?.includes('Abort')
        
        if (shouldRetry) {
          currentRetryRef.current = attempt + 1
          
          return new Promise((resolve) => {
            retryTimeoutRef.current = setTimeout(async () => {
              const result = await executeWithRetry(attempt + 1)
              resolve(result)
            }, retryDelay * Math.pow(2, attempt)) // Exponential backoff
          })
        }

        const errorMessage = showUserFriendlyErrors 
          ? createUserFriendlyError(error)
          : error.message || 'Operation failed'

        setState({
          data: null,
          loading: false,
          error: errorMessage,
          success: false
        })

        onError?.(errorMessage)
        return null
      }
    }

    return executeWithRetry()
  }, [operation, retryCount, retryDelay, showUserFriendlyErrors, onSuccess, onError])

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
    }

    setState(prev => ({
      ...prev,
      loading: false
    }))
  }, [])

  const reset = useCallback(() => {
    cancel()
    setState({
      data: null,
      loading: false,
      error: null,
      success: false
    })
  }, [cancel])

  const retry = useCallback(() => {
    if (currentRetryRef.current < retryCount) {
      execute()
    }
  }, [execute, retryCount])

  return {
    ...state,
    execute,
    cancel,
    reset,
    retry,
    canRetry: currentRetryRef.current < retryCount
  }
}