// React Hook for Error Handling and Recovery
import { useState, useCallback } from 'react'
import { ErrorLogger, TransactionManager, handleDatabaseError, safeDbOperation } from '@/lib/errorHandling'
import { supabase } from '@/lib/supabase'
import { sanitizeForLog } from '@/lib/security'

interface ErrorState {
  hasError: boolean
  error: Error | null
  errorCode?: string
  operation?: string
  canRetry: boolean
  retryCount: number
}

interface UseErrorHandlingReturn {
  errorState: ErrorState
  clearError: () => void
  executeWithErrorHandling: <T>(
    operation: () => Promise<T>,
    operationName: string,
    options?: {
      maxRetries?: number
      showUserError?: boolean
      rollbackOperation?: () => Promise<void>
    }
  ) => Promise<T | null>
  retryLastOperation: () => Promise<void>
  checkDataIntegrity: () => Promise<any>
  getErrorLogs: () => Promise<any[]>
}

export function useErrorHandling(): UseErrorHandlingReturn {
  const [errorState, setErrorState] = useState<ErrorState>({
    hasError: false,
    error: null,
    canRetry: false,
    retryCount: 0
  })
  
  const [lastOperation, setLastOperation] = useState<{
    operation: () => Promise<any>
    operationName: string
    options?: any
  } | null>(null)

  const clearError = useCallback(() => {
    setErrorState({
      hasError: false,
      error: null,
      canRetry: false,
      retryCount: 0
    })
  }, [])

  const executeWithErrorHandling = useCallback(async <T>(
    operation: () => Promise<T>,
    operationName: string,
    options: {
      maxRetries?: number
      showUserError?: boolean
      rollbackOperation?: () => Promise<void>
    } = {}
  ): Promise<T | null> => {
    const { maxRetries = 3, showUserError = true, rollbackOperation } = options
    
    // Store operation for potential retry
    setLastOperation({ operation, operationName, options })
    
    try {
      clearError()
      
      let result: T
      
      if (rollbackOperation) {
        result = await TransactionManager.executeWithRollback(
          operation,
          rollbackOperation
        )
      } else {
        result = await safeDbOperation(operation, operationName)
      }
      
      return result
    } catch (error: any) {
      const newErrorState: ErrorState = {
        hasError: true,
        error: error as Error,
        errorCode: error.code,
        operation: operationName,
        canRetry: errorState.retryCount < maxRetries,
        retryCount: errorState.retryCount + 1
      }
      
      setErrorState(newErrorState)
      
      // Show user-friendly error message if enabled
      if (showUserError) {
        console.error('Operation error:', { 
          operation: sanitizeForLog(operationName), 
          error: sanitizeForLog(error?.message || 'Unknown error') 
        })
      }
      
      return null
    }
  }, [errorState.retryCount, clearError])

  const retryLastOperation = useCallback(async () => {
    if (!lastOperation || !errorState.canRetry) {
      throw new Error('No operation to retry or max retries exceeded')
    }
    
    return executeWithErrorHandling(
      lastOperation.operation,
      lastOperation.operationName,
      lastOperation.options
    )
  }, [lastOperation, errorState.canRetry, executeWithErrorHandling])

  const checkDataIntegrity = useCallback(async () => {
    return executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase.rpc('check_data_integrity')
        if (error) throw error
        return data
      },
      'check_data_integrity',
      { showUserError: false }
    )
  }, [executeWithErrorHandling])

  const getErrorLogs = useCallback(async () => {
    return executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase
          .from('error_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50)
        
        if (error) throw error
        return data || []
      },
      'get_error_logs',
      { showUserError: false }
    )
  }, [executeWithErrorHandling])

  return {
    errorState,
    clearError,
    executeWithErrorHandling,
    retryLastOperation,
    checkDataIntegrity,
    getErrorLogs
  }
}