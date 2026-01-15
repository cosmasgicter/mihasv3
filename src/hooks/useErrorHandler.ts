/**
 * Error Handler Hook
 * 
 * Provides consistent error handling across the application.
 * 
 * Requirements: 14.4 - Display helpful error messages
 * Task: 25.3 - Add comprehensive error messages
 */

import { useState, useCallback } from 'react';
import { useToastStore } from '@/components/ui/Toast';
import { formatError, isRetryableError, getRetryDelay } from '@/utils/errorMessages';

interface UseErrorHandlerOptions {
  showToast?: boolean;
  logError?: boolean;
  onError?: (error: any) => void;
}

interface ErrorState {
  error: any | null;
  isError: boolean;
  errorMessage: string | null;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const {
    showToast = true,
    logError = true,
    onError,
  } = options;
  
  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isError: false,
    errorMessage: null,
  });
  
  const { addToast } = useToastStore();
  
  /**
   * Handle an error
   */
  const handleError = useCallback((error: any) => {
    // Log error if enabled
    if (logError) {
      console.error('Error occurred:', error);
    }
    
    // Format error message
    const errorMessage = formatError(error);
    
    // Update error state
    setErrorState({
      error,
      isError: true,
      errorMessage: errorMessage.description,
    });
    
    // Show toast if enabled
    if (showToast) {
      addToast({
        type: 'error',
        title: errorMessage.title,
        message: errorMessage.description,
        duration: 5000,
      });
    }
    
    // Call custom error handler
    if (onError) {
      onError(error);
    }
  }, [logError, showToast, addToast, onError]);
  
  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isError: false,
      errorMessage: null,
    });
  }, []);
  
  /**
   * Retry with exponential backoff
   */
  const retryWithBackoff = useCallback(
    async <T,>(
      fn: () => Promise<T>,
      maxAttempts: number = 3
    ): Promise<T> => {
      let lastError: any;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await fn();
          clearError();
          return result;
        } catch (error) {
          lastError = error;
          
          // Check if error is retryable
          if (!isRetryableError(error)) {
            handleError(error);
            throw error;
          }
          
          // If this was the last attempt, throw
          if (attempt === maxAttempts) {
            handleError(error);
            throw error;
          }
          
          // Wait before retrying
          const delay = getRetryDelay(error, attempt);
          console.log(`Retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError;
    },
    [handleError, clearError]
  );
  
  /**
   * Wrap an async function with error handling
   */
  const withErrorHandling = useCallback(
    <T extends (...args: any[]) => Promise<any>>(fn: T): T => {
      return (async (...args: any[]) => {
        try {
          const result = await fn(...args);
          clearError();
          return result;
        } catch (error) {
          handleError(error);
          throw error;
        }
      }) as T;
    },
    [handleError, clearError]
  );
  
  return {
    ...errorState,
    handleError,
    clearError,
    retryWithBackoff,
    withErrorHandling,
  };
}

/**
 * Hook for form error handling
 */
export function useFormErrorHandler() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  /**
   * Set error for a specific field
   */
  const setFieldError = useCallback((field: string, message: string) => {
    setFieldErrors(prev => ({
      ...prev,
      [field]: message,
    }));
  }, []);
  
  /**
   * Clear error for a specific field
   */
  const clearFieldError = useCallback((field: string) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
  }, []);
  
  /**
   * Clear all field errors
   */
  const clearAllErrors = useCallback(() => {
    setFieldErrors({});
  }, []);
  
  /**
   * Set multiple field errors
   */
  const setFieldErrors = useCallback((errors: Record<string, string>) => {
    setFieldErrors(errors);
  }, []);
  
  /**
   * Get error for a specific field
   */
  const getFieldError = useCallback((field: string): string | undefined => {
    return fieldErrors[field];
  }, [fieldErrors]);
  
  /**
   * Check if a field has an error
   */
  const hasFieldError = useCallback((field: string): boolean => {
    return !!fieldErrors[field];
  }, [fieldErrors]);
  
  return {
    fieldErrors,
    setFieldError,
    clearFieldError,
    clearAllErrors,
    setFieldErrors,
    getFieldError,
    hasFieldError,
  };
}

/**
 * Hook for async operation error handling
 */
export function useAsyncError() {
  const [error, setError] = useState<any | null>(null);
  const [isError, setIsError] = useState(false);
  
  /**
   * Execute async operation with error handling
   */
  const execute = useCallback(async <T,>(
    fn: () => Promise<T>,
    onSuccess?: (result: T) => void,
    onError?: (error: any) => void
  ): Promise<T | null> => {
    try {
      setError(null);
      setIsError(false);
      
      const result = await fn();
      
      if (onSuccess) {
        onSuccess(result);
      }
      
      return result;
    } catch (err) {
      setError(err);
      setIsError(true);
      
      if (onError) {
        onError(err);
      }
      
      return null;
    }
  }, []);
  
  /**
   * Clear error
   */
  const clearError = useCallback(() => {
    setError(null);
    setIsError(false);
  }, []);
  
  return {
    error,
    isError,
    execute,
    clearError,
  };
}
