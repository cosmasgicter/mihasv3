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
    
    // Handle specific HTTP status codes
    if (statusCode) {
      switch (statusCode) {
        case 400:
          if (hasActionableValidationMessage) {
            return new Error(originalMessage)
          }
          return new Error('Invalid request. Please check your input and try again.')
        case 401:
          return new Error('Authentication required. Please sign in again.')
        case 403:
          return new Error('Access denied. You do not have permission for this action.')
        case 404:
          return new Error('Resource not found. The requested item may have been deleted.')
        case 409:
          return new Error('Conflict detected. The resource may have been modified by another user.')
        case 422:
          if (hasActionableValidationMessage) {
            return new Error(originalMessage)
          }
          return new Error('Validation failed. Please check your input data.')
        case 429:
          return new Error('Too many requests. Please wait a moment and try again.')
        case 500:
          return new Error('Server error. Please try again later.')
        case 502:
          return new Error('Service temporarily unavailable. Please try again in a moment.')
        case 503:
          return new Error('Service maintenance in progress. Please try again later.')
        case 504:
          return new Error('Request timeout. Please check your connection and try again.')
      }
    }

    // Handle network errors
    if (originalError instanceof Error) {
      const message = originalError.message.toLowerCase()
      
      if (message.includes('network') || message.includes('fetch')) {
        return new Error('Network connection issue. Please check your internet and try again.')
      }
      
      if (message.includes('timeout')) {
        return new Error('Request timed out. Please try again.')
      }
      
      if (message.includes('cors')) {
        return new Error('Cross-origin request blocked. Please refresh the page.')
      }
      
      if (message.includes('abort')) {
        return new Error('Request was cancelled. Please try again.')
      }
    }

    // Handle specific endpoint errors
    if (endpoint.includes('/applications/')) {
      if (method === 'PATCH' && endpoint.includes('sync_grades')) {
        return new Error('Failed to save grades. Your other data has been saved. You can continue and add grades later.')
      }
      
      if (method === 'POST') {
        return new Error('Failed to create application. Please check your information and try again.')
      }
      
      if (method === 'PUT') {
        return new Error('Failed to update application. Please try again.')
      }
    }

    // Default error message
    return new Error('An unexpected error occurred. Please try again.')
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
