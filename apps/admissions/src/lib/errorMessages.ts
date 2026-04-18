/**
 * Error Code → User-Friendly Message Map
 *
 * Maps API error codes to clear, actionable messages for students.
 * Translates raw error codes into human-readable text.
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


// ─── Rich Error Message System (merged from src/utils/errorMessages.ts) ───

export interface ErrorMessage {
  title: string;
  description: string;
  action?: string;
  actionLabel?: string;
  technicalDetails?: string;
}

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  SERVER = 'server',
  CLIENT = 'client',
  TIMEOUT = 'timeout',
  RATE_LIMIT = 'rate_limit',
  FILE_UPLOAD = 'file_upload',
  PAYMENT = 'payment',
  DATABASE = 'database',
  UNKNOWN = 'unknown',
}

export function getErrorMessage(error: any): ErrorMessage {
  if (error.message?.includes('fetch') || error.message?.includes('network')) {
    return { title: 'Connection Problem', description: 'We couldn\'t connect to the server.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message };
  }
  if (error.status === 401 || error.message?.includes('unauthorized')) {
    return { title: 'Session Expired', description: 'Your session has expired. Please sign in again.', action: '/auth/signin', actionLabel: 'Sign In', technicalDetails: error.message };
  }
  if (error.status === 403 || error.message?.includes('forbidden')) {
    return { title: 'Access Denied', description: 'You don\'t have permission to access this resource.', action: '/contact', actionLabel: 'Contact Support', technicalDetails: error.message };
  }
  if (error.status === 400 || error.message?.includes('validation')) {
    return { title: 'Invalid Information', description: error.details || 'Some information is invalid. Please check and try again.', action: 'review', actionLabel: 'Review Form', technicalDetails: error.message };
  }
  if (error.status === 404) {
    return { title: 'Not Found', description: 'The resource you\'re looking for doesn\'t exist.', action: '/', actionLabel: 'Go Home', technicalDetails: error.message };
  }
  if (error.status >= 500) {
    return { title: 'Server Error', description: 'Something went wrong on our end.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message };
  }
  if (error.message?.includes('timeout')) {
    return { title: 'Request Timeout', description: 'The request took too long.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message };
  }
  if (error.status === 429) {
    return { title: 'Too Many Requests', description: 'Please wait a moment and try again.', action: 'wait', actionLabel: 'Wait and Retry', technicalDetails: error.message };
  }
  return { title: 'Something Went Wrong', description: 'An unexpected error occurred.', action: 'retry', actionLabel: 'Try Again', technicalDetails: error.message || JSON.stringify(error) };
}

export function getErrorCategory(error: any): ErrorCategory {
  if (error.message?.includes('fetch') || error.message?.includes('network')) return ErrorCategory.NETWORK;
  if (error.status === 401) return ErrorCategory.AUTHENTICATION;
  if (error.status === 403) return ErrorCategory.AUTHORIZATION;
  if (error.status === 400) return ErrorCategory.VALIDATION;
  if (error.status === 404) return ErrorCategory.NOT_FOUND;
  if (error.status === 429) return ErrorCategory.RATE_LIMIT;
  if (error.status >= 500) return ErrorCategory.SERVER;
  if (error.message?.includes('timeout')) return ErrorCategory.TIMEOUT;
  return ErrorCategory.UNKNOWN;
}

export function formatError(error: any): ErrorMessage {
  return getErrorMessage(error);
}

export function isRetryableError(error: any): boolean {
  const category = getErrorCategory(error);
  return [ErrorCategory.NETWORK, ErrorCategory.TIMEOUT, ErrorCategory.SERVER, ErrorCategory.RATE_LIMIT].includes(category);
}

export function getRetryDelay(error: any, attempt: number): number {
  const category = getErrorCategory(error);
  const baseDelay = 1000;
  const maxDelay = 30000;
  let delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
  delay = Math.min(delay, maxDelay);
  if (category === ErrorCategory.RATE_LIMIT) delay = Math.max(delay, 60000);
  return delay;
}
