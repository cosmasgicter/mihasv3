/**
 * Connection and API Error Fix
 * Addresses browser extension conflicts and API gateway issues
 */

import { apiClient } from '@/services/client'

/** Simple connectivity check — replaces networkDiagnostics dependency */
async function testConnection(): Promise<{ status: 'online' | 'offline' }> {
  if (!navigator.onLine) return { status: 'offline' };
  try {
    await fetch('/api/health?action=ping', { method: 'HEAD', cache: 'no-store' });
    return { status: 'online' };
  } catch {
    return { status: 'offline' };
  }
}

export class ConnectionManager {
  private static instance: ConnectionManager
  private retryAttempts = new Map<string, number>()
  private maxRetries = 3
  private baseDelay = 1000

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager()
    }
    return ConnectionManager.instance
  }

  /**
   * Suppress browser extension errors that interfere with the application
   */
  suppressExtensionErrors(): void {
    // Override console.error to filter out extension-related errors
    const originalError = console.error
    console.error = (...args: any[]) => {
      const message = args.join(' ')
      
      // Filter out known extension errors
      if (
        message.includes('Could not establish connection') ||
        message.includes('Receiving end does not exist') ||
        message.includes('Extension context invalidated') ||
        message.includes('chrome-extension://') ||
        message.includes('moz-extension://')
      ) {
        return // Suppress these errors
      }
      
      originalError.apply(console, args)
    }

    // Handle unhandled promise rejections from extensions
    window.addEventListener('unhandledrejection', (event) => {
      const message = event.reason?.message || event.reason || ''
      if (
        message.includes('Could not establish connection') ||
        message.includes('Receiving end does not exist')
      ) {
        event.preventDefault() // Prevent the error from showing
      }
    })
  }

  /**
   * Enhanced API request with connection recovery
   */
  async makeRequest<T>(
    endpoint: string,
    options: RequestInit & { retryKey?: string } = {}
  ): Promise<T | null> {
    const { retryKey = endpoint, ...requestOptions } = options
    const attemptCount = this.retryAttempts.get(retryKey) || 0

    try {
      // Test connection first if this is a retry
      if (attemptCount > 0) {
        const connectionTest = await testConnection()
        if (connectionTest.status === 'offline') {
          throw new Error('Network connection unavailable')
        }
      }

      const response = await apiClient.request<T>(endpoint, requestOptions)
      
      // Reset retry count on success
      this.retryAttempts.delete(retryKey)
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Check if this is a retryable error
      if (this.isRetryableError(error) && attemptCount < this.maxRetries) {
        this.retryAttempts.set(retryKey, attemptCount + 1)
        
        // Calculate delay with exponential backoff
        const delay = this.baseDelay * Math.pow(2, attemptCount)
        
        
        await this.delay(delay)
        return this.makeRequest<T>(endpoint, { ...options, retryKey })
      }
      
      // Reset retry count and throw error
      this.retryAttempts.delete(retryKey)
      throw this.enhanceError(error, endpoint)
    }
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      return (
        message.includes('502') ||
        message.includes('503') ||
        message.includes('504') ||
        message.includes('bad gateway') ||
        message.includes('service unavailable') ||
        message.includes('gateway timeout') ||
        message.includes('network error') ||
        message.includes('fetch failed') ||
        message.includes('connection') ||
        message.includes('timeout')
      )
    }
    return false
  }

  /**
   * Enhance error messages for better user experience
   */
  private enhanceError(error: unknown, endpoint: string): Error {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      
      if (message.includes('502') || message.includes('bad gateway')) {
        return new Error('Server temporarily unavailable. Please try again in a moment.')
      }
      
      if (message.includes('503') || message.includes('service unavailable')) {
        return new Error('Service is temporarily down for maintenance. Please try again later.')
      }
      
      if (message.includes('network') || message.includes('fetch failed')) {
        return new Error('Network connection issue. Please check your internet connection and try again.')
      }
      
      if (message.includes('timeout')) {
        return new Error('Request timed out. Please try again.')
      }
      
      return error
    }
    
    return new Error('An unexpected error occurred. Please try again.')
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Clear all retry counters
   */
  clearRetries(): void {
    this.retryAttempts.clear()
  }
}

// Enhanced sync grades function with connection recovery
export async function syncGradesWithRecovery(
  applicationId: string,
  grades: Array<{ subject_id: string; grade: number }>
): Promise<any> {
  const connectionManager = ConnectionManager.getInstance()
  
  return connectionManager.makeRequest(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'sync_grades', grades }),
    retryKey: `sync_grades_${applicationId}`
  })
}

// Initialize connection manager
export const connectionManager = ConnectionManager.getInstance()