import type { VercelResponse } from '@vercel/node';
import type { AuditLogInput } from './queries';

/**
 * Error Handler Module
 * 
 * Provides consistent error handling, PII sanitization, and response formatting
 * for the MIHAS authentication system.
 * 
 * REQUIREMENTS:
 * - 9.1: THE Auth_System SHALL never expose whether an email exists during login failures
 * - 9.2: THE Auth_System SHALL sanitize all error messages to remove PII (emails, IDs, tokens, paths)
 * - 9.3: THE Auth_System SHALL return consistent JSON error responses with success, error, and code fields
 * - 9.5: IF an unexpected error occurs, THEN THE Auth_System SHALL return a generic 500 response without stack traces
 * - 9.6: THE Auth_System SHALL use deterministic HTTP status codes: 400 (validation), 401 (auth), 403 (forbidden), 429 (rate limit), 500 (internal)
 * 
 * SECURITY NOTES:
 * - Never expose stack traces in responses
 * - Never reveal whether an email exists in the system
 * - Sanitize all error messages to remove PII before logging or responding
 * - Use deterministic HTTP status codes for consistent client handling
 */

/**
 * Standard error response format
 * Requirement 9.3: Consistent JSON error responses with success, error, and code fields
 */
export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  fieldErrors?: Record<string, string>;
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
 * HTTP status codes for deterministic error responses
 * Requirement 9.6: Deterministic HTTP status codes
 * 
 * - 400: Validation errors (bad request, invalid input)
 * - 401: Authentication errors (not authenticated, invalid credentials)
 * - 403: Authorization errors (forbidden, insufficient permissions)
 * - 429: Rate limiting (too many requests)
 * - 500: Internal server errors (unexpected errors)
 * - 503: Service unavailable (external service failures)
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

export type HttpStatusCode = typeof HttpStatus[keyof typeof HttpStatus];

/**
 * Error codes for categorizing errors
 * Used for consistent error classification across the API
 */
export const ErrorCode = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Authentication errors (401)
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  
  // Authorization errors (403)
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  SECURITY_VIOLATION: 'SECURITY_VIOLATION',
  
  // Resource errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // Rate limiting (429)
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  
  // Server errors (500, 503)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * AuthError class for typed authentication and authorization errors
 * 
 * Provides a consistent error type with:
 * - Sanitized message (no PII)
 * - Error code for client handling
 * - HTTP status code for response
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.5, 9.6
 * 
 * @example
 * throw new AuthError('Invalid credentials', 'INVALID_CREDENTIALS', 401);
 * 
 * @example
 * // For login failures - never reveal if email exists
 * throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
 */
export class AuthError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  /**
   * Create a new AuthError
   * 
   * @param message - Error message (will be sanitized)
   * @param code - Error code for client handling
   * @param statusCode - HTTP status code (default: 400)
   * @param isOperational - Whether this is an expected operational error (default: true)
   */
  constructor(
    message: string,
    code: string = ErrorCode.INTERNAL_ERROR,
    statusCode: number = HttpStatus.BAD_REQUEST,
    isOperational: boolean = true
  ) {
    // Sanitize the message before storing
    super(sanitizeError(message));
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }

  /**
   * Create an AuthError for validation failures
   */
  static validation(message: string): AuthError {
    return new AuthError(message, ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);
  }

  /**
   * Create an AuthError for authentication failures
   * Requirement 9.1: Never expose whether an email exists
   */
  static authentication(message: string = 'Authentication required'): AuthError {
    return new AuthError(message, ErrorCode.AUTHENTICATION_ERROR, HttpStatus.UNAUTHORIZED);
  }

  /**
   * Create an AuthError for invalid credentials
   * Requirement 9.1: Generic message that doesn't reveal email existence
   */
  static invalidCredentials(): AuthError {
    return new AuthError(
      'Invalid email or password',
      ErrorCode.INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED
    );
  }

  /**
   * Create an AuthError for expired tokens
   */
  static tokenExpired(): AuthError {
    return new AuthError(
      'Token has expired',
      ErrorCode.TOKEN_EXPIRED,
      HttpStatus.UNAUTHORIZED
    );
  }

  /**
   * Create an AuthError for invalid tokens
   */
  static invalidToken(): AuthError {
    return new AuthError(
      'Invalid token',
      ErrorCode.INVALID_TOKEN,
      HttpStatus.UNAUTHORIZED
    );
  }

  /**
   * Create an AuthError for authorization failures
   */
  static forbidden(message: string = 'Access denied'): AuthError {
    return new AuthError(message, ErrorCode.AUTHORIZATION_ERROR, HttpStatus.FORBIDDEN);
  }

  /**
   * Create an AuthError for insufficient permissions
   */
  static insufficientPermissions(): AuthError {
    return new AuthError(
      'Insufficient permissions',
      ErrorCode.INSUFFICIENT_PERMISSIONS,
      HttpStatus.FORBIDDEN
    );
  }

  /**
   * Create an AuthError for security violations (Arcjet blocks)
   */
  static securityViolation(): AuthError {
    return new AuthError(
      'Request blocked by security policy',
      ErrorCode.SECURITY_VIOLATION,
      HttpStatus.FORBIDDEN
    );
  }

  /**
   * Create an AuthError for rate limiting
   */
  static rateLimited(): AuthError {
    return new AuthError(
      'Too many requests. Please try again later.',
      ErrorCode.RATE_LIMITED,
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  /**
   * Create an AuthError for resource not found
   */
  static notFound(resource: string = 'Resource'): AuthError {
    return new AuthError(
      `${resource} not found`,
      ErrorCode.NOT_FOUND,
      HttpStatus.NOT_FOUND
    );
  }

  /**
   * Create an AuthError for internal server errors
   * Requirement 9.5: Generic message without stack traces
   */
  static internal(): AuthError {
    return new AuthError(
      'An unexpected error occurred',
      ErrorCode.INTERNAL_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      false // Not operational - unexpected error
    );
  }

  /**
   * Create an AuthError for service unavailable
   */
  static serviceUnavailable(): AuthError {
    return new AuthError(
      'Service temporarily unavailable',
      ErrorCode.SERVICE_UNAVAILABLE,
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  /**
   * Create an AuthError for database errors
   */
  static database(): AuthError {
    return new AuthError(
      'Database operation failed',
      ErrorCode.DATABASE_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      false
    );
  }

  /**
   * Convert error to JSON response format
   */
  toJSON(): ErrorResponse {
    return {
      success: false,
      error: this.message,
      code: this.code,
    };
  }
}

/**
 * Sanitize error message to remove any potential PII and sensitive data.
 * 
 * Requirement 9.2: THE Auth_System SHALL sanitize all error messages to remove PII
 * (emails, IDs, tokens, paths)
 * 
 * Never log or return user-specific data like emails, names, phone numbers.
 * Also removes database connection strings, file paths, and credentials.
 * 
 * Note: Order matters - UUIDs must be sanitized before phone numbers
 * because phone number regex can match parts of UUIDs.
 * IP addresses must be sanitized before phone numbers for the same reason.
 * 
 * @param message - Raw error message
 * @returns Sanitized message safe for logging/response
 * 
 * @example
 * sanitizeError('User john@example.com not found');
 * // Returns: 'User [EMAIL] not found'
 * 
 * @example
 * sanitizeError('Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U is invalid');
 * // Returns: 'Token [TOKEN] is invalid'
 */
export function sanitizeError(message: string): string {
  if (!message || typeof message !== 'string') {
    return 'An error occurred';
  }

  let sanitized = message;

  // Remove potential UUIDs (user IDs) FIRST - before phone numbers
  // Phone number regex can match parts of UUIDs if not done first
  sanitized = sanitized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]');
  
  // Remove potential email addresses
  sanitized = sanitized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove potential JWT tokens (three base64url segments separated by dots)
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[TOKEN]');
  
  // Remove database connection strings (PostgreSQL, MySQL, MongoDB, etc.)
  sanitized = sanitized.replace(/(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql):\/\/[^\s"']+/gi, '[CONNECTION_STRING]');
  
  // Remove database API and provider URLs
  sanitized = sanitized.replace(/https?:\/\/[^\s"']+(?:\/auth\/v1|\/rest\/v1)[^\s"']*/gi, '[DB_API_URL]');
  sanitized = sanitized.replace(/https?:\/\/[a-z0-9-]+\.neon\.tech[^\s"']*/gi, '[DB_URL]');
  
  // Remove API keys and secrets (common patterns) - must be before phone numbers
  sanitized = sanitized.replace(/(?:api[_-]?key|secret|password|token|auth|bearer)[=:]\s*["']?[a-zA-Z0-9_\-./+=]{16,}["']?/gi, '[CREDENTIAL]');
  
  // Remove service role keys (Supabase pattern - long base64 strings)
  sanitized = sanitized.replace(/eyJ[a-zA-Z0-9_-]{100,}/g, '[SERVICE_KEY]');
  
  // Remove bcrypt hashes
  sanitized = sanitized.replace(/\$2[aby]?\$\d{1,2}\$[./A-Za-z0-9]{53}/g, '[HASH]');
  
  // Remove SHA-256 hashes (64 hex characters)
  sanitized = sanitized.replace(/\b[a-f0-9]{64}\b/gi, '[HASH]');
  
  // Remove file paths (Unix and Windows)
  sanitized = sanitized.replace(/(?:\/(?:home|var|usr|etc|tmp|app|opt|srv)[^\s"']*|[A-Z]:\\[^\s"']*)/gi, '[PATH]');
  
  // Remove IP addresses BEFORE phone numbers (IP addresses look like phone numbers)
  sanitized = sanitized.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
  
  // Remove port numbers in connection contexts
  sanitized = sanitized.replace(/:\d{4,5}(?=\s|$|\/)/g, ':[PORT]');
  
  // Remove potential phone numbers (various formats) - AFTER IP addresses
  // Zambian format: +260 XXX XXXXXX
  // Use word boundaries and stricter length to avoid matching ISO timestamps
  sanitized = sanitized.replace(/(?<!\d)(?:\+260|0)\d{9}(?!\d)/g, '[PHONE]');
  sanitized = sanitized.replace(/(?<!\d)\+?\d{1,3}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?!\d)/g, '[PHONE]');
  
  // Remove potential names in common error patterns
  sanitized = sanitized.replace(/(?:user|profile|account)\s+['"]?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?['"]?/gi, '[USER]');
  
  return sanitized;
}

// Alias for backward compatibility
const sanitizeErrorMessage = sanitizeError;

/**
 * Log error safely without PII.
 * 
 * Requirement 9.2: Sanitize all error messages to remove PII
 * Requirement 9.5: Never expose stack traces
 * 
 * @param context - Context string for the error (e.g., function name)
 * @param error - The error object
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = sanitizeError(message);
  
  // Log sanitized error - never include stack traces in production
  // Only log the error code if it's an AuthError
  if (error instanceof AuthError) {
    console.error(`[${context}] Error (${error.code}):`, sanitized);
  } else {
    console.error(`[${context}] Error:`, sanitized);
  }
}

/**
 * Log an error to the audit trail with sanitized context.
 * 
 * Requirement 21.5: All caught errors in API endpoints are logged via logAuditEvent.
 * CRITICAL: Never logs PII, stack traces, or sensitive data.
 * Fire-and-forget — failures are swallowed to avoid breaking the error response.
 *
 * @param context - Endpoint/action context (e.g. 'auth/login', 'applications/create')
 * @param error - The caught error
 */
export async function logErrorAuditEvent(context: string, error: unknown): Promise<void> {
  try {
    // Lazy import to avoid circular dependency (auditLogger imports from errorHandler)
    const { logAuditEvent } = await import('./auditLogger');

    const errorCode = error instanceof AuthError ? error.code : 'INTERNAL_ERROR';
    const errorType = error instanceof AuthError
      ? 'auth_error'
      : error instanceof Error
        ? error.constructor.name
        : 'unknown';

    const message = error instanceof Error ? error.message : String(error);
    const sanitizedMessage = sanitizeError(message);

    const input: AuditLogInput = {
      actor_id: null,
      action: 'api_error',
      entity_type: 'system',
      entity_id: null,
      changes: {
        endpoint: context,
        error_code: errorCode,
        error_type: errorType,
        error_message: sanitizedMessage,
        timestamp: new Date().toISOString(),
      },
    };

    await logAuditEvent(input);
  } catch {
    // Swallow — audit logging must never break the main flow
  }
}

/**
 * Handle error and send appropriate response.
 * 
 * Ensures no PII is leaked in error responses.
 * Requirement 9.3: Consistent JSON error responses
 * Requirement 9.5: Generic 500 response without stack traces
 * Requirement 9.6: Deterministic HTTP status codes
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

  // Audit log the error with sanitized context (Requirement 21.5)
  // Fire-and-forget — audit logging must never break the error response
  logErrorAuditEvent(context, error).catch(() => {});

  // Ensure Content-Type is always JSON
  res.setHeader('Content-Type', 'application/json');

  // Handle AuthError instances directly
  if (error instanceof AuthError) {
    return res.status(error.statusCode).json(error.toJSON());
  }

  // Determine appropriate status and message for other errors
  let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
  let message: string = 'An unexpected error occurred';
  let code: string = ErrorCode.INTERNAL_ERROR;

  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes('unauthorized') || errorMessage.includes('no authorization') || errorMessage.includes('authentication')) {
      status = HttpStatus.UNAUTHORIZED;
      message = 'Authentication required';
      code = ErrorCode.AUTHENTICATION_ERROR;
    } else if (errorMessage.includes('forbidden') || errorMessage.includes('access denied') || errorMessage.includes('permission') || errorMessage.includes('insufficient')) {
      status = HttpStatus.FORBIDDEN;
      message = 'Access denied';
      code = ErrorCode.AUTHORIZATION_ERROR;
    } else if (errorMessage.includes('not found')) {
      status = HttpStatus.NOT_FOUND;
      message = 'Resource not found';
      code = ErrorCode.NOT_FOUND;
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      status = HttpStatus.BAD_REQUEST;
      // Sanitize validation messages as they might contain user input
      message = sanitizeError(error.message);
      code = ErrorCode.VALIDATION_ERROR;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = 'Too many requests. Please try again later.';
      code = ErrorCode.RATE_LIMITED;
    } else if (errorMessage.includes('unavailable') || errorMessage.includes('timeout')) {
      status = HttpStatus.SERVICE_UNAVAILABLE;
      message = 'Service temporarily unavailable';
      code = ErrorCode.SERVICE_UNAVAILABLE;
    } else if (errorMessage.includes('expired')) {
      status = HttpStatus.UNAUTHORIZED;
      message = 'Token has expired';
      code = ErrorCode.TOKEN_EXPIRED;
    }
    // For all other errors, use the default 500 response
    // Requirement 9.5: Generic 500 response without stack traces
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
 * Requirement 9.3: Consistent JSON responses with success field
 * 
 * @param res - Vercel response object
 * @param data - Response data
 * @param status - HTTP status code (default 200)
 * @returns The response object
 * 
 * @example
 * return sendSuccess(res, { user: { id: '123', email: 'user@example.com' } });
 * // Returns: { success: true, data: { user: { id: '123', email: 'user@example.com' } } }
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
 * Requirement 9.2: Sanitize all error messages to remove PII
 * Requirement 9.3: Consistent JSON error responses with success, error, and code fields
 * Requirement 9.6: Deterministic HTTP status codes
 * 
 * @param res - Vercel response object
 * @param message - Error message (will be sanitized)
 * @param status - HTTP status code (default 400)
 * @param code - Error code (default VALIDATION_ERROR)
 * @returns The response object
 * 
 * @example
 * return sendError(res, 'Invalid email format', 400, 'VALIDATION_ERROR');
 * // Returns: { success: false, error: 'Invalid email format', code: 'VALIDATION_ERROR' }
 * 
 * @example
 * // PII is automatically sanitized
 * return sendError(res, 'User john@example.com not found', 404, 'NOT_FOUND');
 * // Returns: { success: false, error: 'User [EMAIL] not found', code: 'NOT_FOUND' }
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
    error: sanitizeError(message),
    code,
  };

  return res.status(status).json(response);
}

/**
 * Send a validation error response with field-level errors.
 * 
 * Used when Zod schema validation fails and field-level error details are needed.
 * Produces: { success: false, error: 'Validation failed', code: 'VALIDATION_ERROR', fieldErrors: { ... } }
 * 
 * @param res - Vercel response object
 * @param fieldErrors - Map of field paths to error messages
 * @param message - Error message (default: 'Validation failed')
 * @returns The response object
 */
export function sendValidationError(
  res: VercelResponse,
  fieldErrors: Record<string, string>,
  message: string = 'Validation failed'
): VercelResponse {
  res.setHeader('Content-Type', 'application/json');
  
  const response: ErrorResponse = {
    success: false,
    error: sanitizeError(message),
    code: ErrorCode.VALIDATION_ERROR,
    fieldErrors,
  };

  return res.status(HttpStatus.BAD_REQUEST).json(response);
}

/**
 * Send an AuthError as a response
 * 
 * Convenience function for sending AuthError instances as responses.
 * 
 * @param res - Vercel response object
 * @param error - AuthError instance
 * @returns The response object
 * 
 * @example
 * return sendAuthError(res, AuthError.invalidCredentials());
 */
export function sendAuthError(
  res: VercelResponse,
  error: AuthError
): VercelResponse {
  res.setHeader('Content-Type', 'application/json');
  return res.status(error.statusCode).json(error.toJSON());
}

/**
 * Check if an error is an AuthError
 * 
 * Type guard for AuthError instances.
 * 
 * @param error - Unknown error to check
 * @returns true if error is an AuthError
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Convert any error to an AuthError
 * 
 * Useful for wrapping unknown errors in a consistent format.
 * Requirement 9.5: Generic 500 response without stack traces for unexpected errors
 * 
 * @param error - Unknown error to convert
 * @param defaultCode - Default error code if not an AuthError
 * @param defaultStatus - Default HTTP status if not an AuthError
 * @returns AuthError instance
 */
export function toAuthError(
  error: unknown,
  defaultCode: string = ErrorCode.INTERNAL_ERROR,
  defaultStatus: number = HttpStatus.INTERNAL_SERVER_ERROR
): AuthError {
  if (error instanceof AuthError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error patterns and convert appropriately
    const message = error.message.toLowerCase();
    
    if (message.includes('expired')) {
      return AuthError.tokenExpired();
    }
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return AuthError.authentication();
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return AuthError.forbidden();
    }
    if (message.includes('not found')) {
      return AuthError.notFound();
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return AuthError.rateLimited();
    }
    if (message.includes('validation') || message.includes('invalid')) {
      return AuthError.validation(error.message);
    }
    
    // For unexpected errors, return a generic internal error
    // Never expose the original error message as it might contain sensitive info
    return new AuthError(
      'An unexpected error occurred',
      defaultCode,
      defaultStatus,
      false
    );
  }

  // For non-Error objects, return a generic internal error
  return AuthError.internal();
}
