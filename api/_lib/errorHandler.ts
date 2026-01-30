import type { VercelResponse } from '@vercel/node';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
}

/**
 * Standard success response format
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * API response type
 */
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * HTTP status codes for common errors
 */
export const HttpStatus = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/**
 * Error codes for categorizing errors
 */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/**
 * Sanitize error message to remove any potential PII.
 * Never log or return user-specific data like emails, names, phone numbers.
 * 
 * @param message - Raw error message
 * @returns Sanitized message safe for logging/response
 */
function sanitizeErrorMessage(message: string): string {
  // Remove potential email addresses
  let sanitized = message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove potential phone numbers (various formats)
  sanitized = sanitized.replace(/\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '[PHONE]');
  
  // Remove potential UUIDs (user IDs)
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]');
  
  // Remove potential JWT tokens
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[TOKEN]');
  
  return sanitized;
}

/**
 * Log error safely without PII.
 * 
 * @param context - Context string for the error (e.g., function name)
 * @param error - The error object
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = sanitizeErrorMessage(message);
  
  // Log sanitized error - never include stack traces in production
  console.error(`[${context}] Error:`, sanitized);
}

/**
 * Handle error and send appropriate response.
 * Ensures no PII is leaked in error responses.
 * 
 * @param res - Vercel response object
 * @param error - The error that occurred
 * @param context - Context string for logging
 * @returns The response object
 */
export function handleError(
  res: VercelResponse,
  error: unknown,
  context: string = 'API'
): VercelResponse {
  logError(context, error);

  // Determine appropriate status and message
  let status = HttpStatus.INTERNAL_SERVER_ERROR;
  let message = 'An unexpected error occurred';
  let code = ErrorCode.INTERNAL_ERROR;

  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('unauthorized') || errorMessage.includes('no authorization')) {
      status = HttpStatus.UNAUTHORIZED as number;
      message = 'Authentication required';
      code = ErrorCode.AUTHENTICATION_ERROR as string;
    } else if (errorMessage.includes('forbidden') || errorMessage.includes('access denied') || errorMessage.includes('permission')) {
      status = HttpStatus.FORBIDDEN as number;
      message = 'Access denied';
      code = ErrorCode.AUTHORIZATION_ERROR as string;
    } else if (errorMessage.includes('not found')) {
      status = HttpStatus.NOT_FOUND as number;
      message = 'Resource not found';
      code = ErrorCode.NOT_FOUND as string;
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      status = HttpStatus.BAD_REQUEST as number;
      message = sanitizeErrorMessage(error.message);
      code = ErrorCode.VALIDATION_ERROR as string;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      status = HttpStatus.TOO_MANY_REQUESTS as number;
      message = 'Too many requests. Please try again later.';
      code = ErrorCode.RATE_LIMITED as string;
    } else if (errorMessage.includes('unavailable') || errorMessage.includes('timeout')) {
      status = HttpStatus.SERVICE_UNAVAILABLE as number;
      message = 'Service temporarily unavailable';
      code = ErrorCode.SERVICE_UNAVAILABLE as string;
    }
  }

  const response: ErrorResponse = {
    success: false,
    error: message,
    code,
  };

  return res.status(status).json(response);
}

/**
 * Send success response with consistent format.
 * 
 * @param res - Vercel response object
 * @param data - Response data
 * @param status - HTTP status code (default 200)
 * @returns The response object
 */
export function sendSuccess<T>(
  res: VercelResponse,
  data: T,
  status: number = HttpStatus.OK
): VercelResponse {
  const response: SuccessResponse<T> = {
    success: true,
    data,
  };

  return res.status(status).json(response);
}

/**
 * Send error response with consistent format.
 * 
 * @param res - Vercel response object
 * @param message - Error message
 * @param status - HTTP status code (default 400)
 * @param code - Error code
 * @returns The response object
 */
export function sendError(
  res: VercelResponse,
  message: string,
  status: number = HttpStatus.BAD_REQUEST,
  code: string = ErrorCode.VALIDATION_ERROR
): VercelResponse {
  const response: ErrorResponse = {
    success: false,
    error: sanitizeErrorMessage(message),
    code,
  };

  return res.status(status).json(response);
}
