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
 * Sanitize error message to remove any potential PII and sensitive data.
 * Never log or return user-specific data like emails, names, phone numbers.
 * Also removes database connection strings, file paths, and credentials.
 * 
 * Note: Order matters - UUIDs must be sanitized before phone numbers
 * because phone number regex can match parts of UUIDs.
 * IP addresses must be sanitized before phone numbers for the same reason.
 * 
 * @param message - Raw error message
 * @returns Sanitized message safe for logging/response
 */
function sanitizeErrorMessage(message: string): string {
  // Remove potential UUIDs (user IDs) FIRST - before phone numbers
  // Phone number regex can match parts of UUIDs if not done first
  let sanitized = message.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]');
  
  // Remove potential email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove potential JWT tokens
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[TOKEN]');
  
  // Remove database connection strings (PostgreSQL, MySQL, MongoDB, etc.)
  sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s"']+/gi, '[CONNECTION_STRING]');
  
  // Remove Supabase URLs with keys
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.supabase\.co[^\s"']*/gi, '[SUPABASE_URL]');
  
  // Remove API keys and secrets (common patterns) - must be before phone numbers
  sanitized = sanitized.replace(/(?:api[_-]?key|secret|password|token|auth)[=:]\s*["']?[a-zA-Z0-9_\-./+=]{16,}["']?/gi, '[CREDENTIAL]');
  
  // Remove service role keys (Supabase pattern)
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{100,}/g, '[SERVICE_KEY]');
  
  // Remove file paths (Unix and Windows)
  sanitized = sanitized.replace(/(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)[^\s"']*|[A-Z]:\\[^\s"']*)/gi, '[PATH]');
  
  // Remove IP addresses BEFORE phone numbers (IP addresses look like phone numbers)
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
  
  // Remove port numbers in connection contexts
  sanitized = sanitized.replace(/:\d{4,5}(?=\s|$|\/)/g, ':[PORT]');
  
  // Remove potential phone numbers (various formats) - AFTER IP addresses
  sanitized = sanitized.replace(/\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g, '[PHONE]');
  
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

  // Determine appropriate status and message - use explicit number/string types
  let status: number = 500;
  let message: string = 'An unexpected error occurred';
  let code: string = 'INTERNAL_ERROR';

  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('unauthorized') || errorMessage.includes('no authorization')) {
      status = 401;
      message = 'Authentication required';
      code = 'AUTHENTICATION_ERROR';
    } else if (errorMessage.includes('forbidden') || errorMessage.includes('access denied') || errorMessage.includes('permission')) {
      status = 403;
      message = 'Access denied';
      code = 'AUTHORIZATION_ERROR';
    } else if (errorMessage.includes('not found')) {
      status = 404;
      message = 'Resource not found';
      code = 'NOT_FOUND';
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      status = 400;
      message = sanitizeErrorMessage(error.message);
      code = 'VALIDATION_ERROR';
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      status = 429;
      message = 'Too many requests. Please try again later.';
      code = 'RATE_LIMITED';
    } else if (errorMessage.includes('unavailable') || errorMessage.includes('timeout')) {
      status = 503;
      message = 'Service temporarily unavailable';
      code = 'SERVICE_UNAVAILABLE';
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
  // Ensure Content-Type is always JSON
  res.setHeader('Content-Type', 'application/json');
  
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
  // Ensure Content-Type is always JSON
  res.setHeader('Content-Type', 'application/json');
  
  const response: ErrorResponse = {
    success: false,
    error: sanitizeErrorMessage(message),
    code,
  };

  return res.status(status).json(response);
}
