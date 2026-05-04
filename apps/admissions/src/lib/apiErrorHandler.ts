/**
 * Enhanced API Error Handler
 * Provides better error messages and recovery strategies
 */

export interface ApiErrorContext {
  endpoint: string
  method: string
  statusCode?: number
  originalError: unknown
}

export class ApiErrorHandler {
  static enhanceError(context: ApiErrorContext): Error {
    const { endpoint, method, statusCode, originalError } = context
    const originalMessage = originalError instanceof Error ? originalError.message?.trim() : ''
    const hasActionableValidationMessage = Boolean(
      originalMessage &&
      !/^api error:/i.test(originalMessage) &&
      !/^bad request$/i.test(originalMessage) &&
      !/^invalid request/i.test(originalMessage)
    )

    const buildError = (message: string): Error => {
      const error = new Error(message) as Error & {
        status?: number
        endpoint?: string
        method?: string
        fieldErrors?: Record<string, string>
        data?: Record<string, unknown>
        code?: string
      }

      if (statusCode) {
        error.status = statusCode
      }

      error.endpoint = endpoint
      error.method = method

      // Preserve field-level validation errors from the original error so that
      // upstream callers (e.g. the application wizard) can map them to form fields.
      const orig = originalError as { fieldErrors?: Record<string, string>; data?: Record<string, unknown>; code?: string } | null
      if (orig?.fieldErrors && typeof orig.fieldErrors === 'object') {
        error.fieldErrors = orig.fieldErrors
      }
      if (orig?.data && typeof orig.data === 'object') {
        error.data = orig.data
      }
      if (orig?.code) {
        error.code = orig.code
      } else if (orig?.data && typeof orig.data.code === 'string') {
        error.code = orig.data.code
      }

      return error
    }
    
    // Handle specific HTTP status codes
    if (statusCode) {
      switch (statusCode) {
        case 400:
          if (hasActionableValidationMessage) {
            return buildError(originalMessage)
          }
          return buildError('Invalid request. Please check your input and try again.')
        case 401:
          if (hasActionableValidationMessage) {
            return buildError(originalMessage)
          }
          return buildError('Authentication required. Please sign in again.')
        case 403:
          if (hasActionableValidationMessage) {
            return buildError(originalMessage)
          }
          return buildError('Access denied. You do not have permission for this action.')
        case 404:
          return buildError('Resource not found. The requested item may have been deleted.')
        case 409:
          return buildError('Conflict detected. The resource may have been modified by another user.')
        case 422:
          if (hasActionableValidationMessage) {
            return buildError(originalMessage)
          }
          return buildError('Validation failed. Please check your input data.')
        case 429:
          if (hasActionableValidationMessage) {
            return buildError(originalMessage)
          }
          return buildError('Too many requests. Please wait a moment and try again.')
        case 500:
          return buildError('Server error. Please try again later.')
        case 502:
          return buildError('Service temporarily unavailable. Please try again in a moment.')
        case 503:
          return buildError('Service maintenance in progress. Please try again later.')
        case 504:
          return buildError('Request timeout. Please check your connection and try again.')
      }
    }

    // Handle network errors
    if (originalError instanceof Error) {
      const message = originalError.message.toLowerCase()
      
      if (message.includes('network') || message.includes('fetch')) {
        return buildError('Network connection issue. Please check your internet and try again.')
      }
      
      if (message.includes('timeout')) {
        return buildError('Request timed out. Please try again.')
      }
      
      if (message.includes('cors')) {
        return buildError('Cross-origin request blocked. Please refresh the page.')
      }
      
      if (message.includes('abort')) {
        return buildError('Request was cancelled. Please try again.')
      }
    }

    // Handle specific endpoint errors
    if (endpoint.includes('/applications/')) {
      if (method === 'PATCH' && endpoint.includes('sync_grades')) {
        return buildError('Failed to save grades. Your other data has been saved. You can continue and add grades later.')
      }
      
      if (method === 'POST') {
        return buildError('Failed to create application. Please check your information and try again.')
      }
      
      if (method === 'PUT') {
        return buildError('Failed to update application. Please try again.')
      }
    }

    // Default error message
    return buildError('An unexpected error occurred. Please try again.')
  }

  static isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        message.includes('temporarily unavailable') ||
        message.includes('service maintenance')
      )
    }
    return false
  }

  static getRetryDelay(attemptNumber: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000 // 1 second
    const maxDelay = 10000 // 10 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber), maxDelay)
    const jitter = Math.random() * 0.1 * delay
    return delay + jitter
  }
}
