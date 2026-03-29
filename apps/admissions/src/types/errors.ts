export interface AppError {
  message: string
  code?: string
  details?: unknown
}

export class SafeError extends Error {
  public readonly code?: string
  public readonly details?: unknown

  constructor(message: string, code?: string, details?: unknown) {
    super(message)
    this.name = 'SafeError'
    this.code = code
    this.details = details
  }
}

export function isAppError(error: unknown): error is AppError {
  return typeof error === 'object' && 
         error !== null && 
         'message' in error && 
         typeof (error as AppError).message === 'string'
}

export function getErrorMessage(error: unknown): string {
  try {
    if (isAppError(error)) {
      return String(error.message).slice(0, 500) // Limit message length
    }
    if (error instanceof Error) {
      return String(error.message).slice(0, 500) // Limit message length
    }
    if (typeof error === 'string') {
      return error.slice(0, 500) // Handle string errors
    }
    return 'An unexpected error occurred'
  } catch {
    return 'An unexpected error occurred'
  }
}