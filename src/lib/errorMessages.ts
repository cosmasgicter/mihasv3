/**
 * Error Code → User-Friendly Message Map
 *
 * Maps API error codes to clear, actionable messages for students.
 * Used by showApiErrorToast() to translate raw error codes into
 * human-readable text.
 *
 * Requirements: 16.1, 16.2, 16.3
 */

/** Map of API error codes to user-friendly messages */
export const ERROR_CODE_MESSAGES: Record<string, string> = {
  CSRF_VALIDATION_FAILED: 'Your session has expired. Please try again.',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait a moment.',
  INSUFFICIENT_PERMISSIONS: "You don't have permission for this action.",
  AUTHENTICATION_REQUIRED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_LOCKED: 'Account temporarily locked. Try again in 30 minutes.',
  VERSION_CONFLICT: 'Your changes conflict with a newer version.',
  FILE_TYPE_NOT_ALLOWED: 'Only PDF, JPEG, and PNG files are accepted.',
  FILE_TOO_LARGE: 'File must be smaller than 10MB.',
  FILE_CONTENT_MISMATCH: 'File content does not match the declared type.',
  SECURITY_VIOLATION: 'Request blocked for security reasons. Please try again.',
  INVALID_INPUT: 'Invalid input. Please check your data and try again.',
  RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Something went wrong. Please try again.',
}

/** Default message for network errors (no server response) */
export const NETWORK_ERROR_MESSAGE =
  'Connection error. Please check your internet and try again.'

/** Default message for request timeout */
export const TIMEOUT_ERROR_MESSAGE =
  'Request timed out. Please try again.'

/** Default message for unknown error codes */
export const DEFAULT_ERROR_MESSAGE =
  'An unexpected error occurred. Please try again.'

/**
 * Resolve an API error code to a user-friendly message.
 * Falls back to the raw message or a generic default.
 */
export function getErrorMessageForCode(
  code: string | undefined,
  fallbackMessage?: string
): string {
  if (code && ERROR_CODE_MESSAGES[code]) {
    return ERROR_CODE_MESSAGES[code]
  }
  return fallbackMessage || DEFAULT_ERROR_MESSAGE
}

/**
 * Determine if an error represents a network failure (no server response).
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return true
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('load failed') ||
      msg.includes('net::err')
    )
  }
  return false
}
