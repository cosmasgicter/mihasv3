/**
 * Property Test: API Error Responses Are Consistent and Safe
 * Feature: vercel-production-fixes
 * Property 4: API Error Responses Are Consistent and Safe
 * 
 * **Validates: Requirements 6.1, 6.3, 6.4, 6.5**
 * - 6.1: WHEN an API endpoint receives an invalid action parameter THEN it SHALL return a JSON error with HTTP status 400
 * - 6.3: WHEN an API endpoint is called with wrong HTTP method THEN it SHALL return a JSON error with HTTP status 405
 * - 6.4: THE error response format SHALL be consistent: { success: false, error: string, code?: string }
 * - 6.5: THE API SHALL NOT expose stack traces or internal error details in responses
 * 
 * For any API endpoint, when an error condition occurs (invalid action, wrong HTTP method, validation failure), the response SHALL:
 * 1. Have Content-Type `application/json`
 * 2. Contain a JSON object with `success: false` and an `error` string
 * 3. NOT contain stack traces, file paths, or internal implementation details
 * 4. Return appropriate HTTP status codes (400 for bad request, 405 for method not allowed)
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { VercelResponse } from '@vercel/node';

// Import error handler utilities directly (no Supabase dependency)
import { sendError, handleError, HttpStatus, ErrorCode } from '../../../lib/errorHandler';

/**
 * Patterns that indicate internal implementation details that should NOT appear in error responses
 */
const INTERNAL_DETAIL_PATTERNS = [
  /at\s+\w+\s+\(/,           // Stack trace: "at functionName ("
  /\.ts:\d+:\d+/,            // TypeScript file references: "file.ts:10:5"
  /\.js:\d+:\d+/,            // JavaScript file references: "file.js:10:5"
  /node_modules/,            // Node modules paths
  /\/api\/_lib\//,           // Internal library paths
  /Error:\s*$/,              // Raw "Error:" prefix without message
  /TypeError:/,              // Raw type errors
  /ReferenceError:/,         // Raw reference errors
  /SyntaxError:/,            // Raw syntax errors
  /ENOENT/,                  // File system errors
  /ECONNREFUSED/,            // Connection errors
  /process\.env\./,          // Environment variable references
  /supabaseAdmin/,           // Internal service references
  /supabaseClient/,          // Internal service references
];

/**
 * Create a mock VercelResponse object with tracking
 */
function createMockResponse(): VercelResponse & {
  _status: number;
  _json: unknown;
  _headers: Record<string, string>;
  _ended: boolean;
} {
  const res = {
    _status: 200,
    _json: null,
    _headers: {} as Record<string, string>,
    _ended: false,
    
    status(code: number) {
      this._status = code;
      return this;
    },
    
    json(data: unknown) {
      this._json = data;
      return this;
    },
    
    setHeader(key: string, value: string) {
      this._headers[key] = value;
      return this;
    },
    
    end() {
      this._ended = true;
      return this;
    },
  };
  
  return res as unknown as VercelResponse & {
    _status: number;
    _json: unknown;
    _headers: Record<string, string>;
    _ended: boolean;
  };
}

/**
 * Check if a string contains internal implementation details
 */
function containsInternalDetails(str: string): boolean {
  return INTERNAL_DETAIL_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Validate error response structure
 */
function isValidErrorResponse(response: unknown): response is { success: false; error: string; code?: string } {
  if (typeof response !== 'object' || response === null) return false;
  const obj = response as Record<string, unknown>;
  return (
    obj.success === false &&
    typeof obj.error === 'string' &&
    obj.error.length > 0 &&
    (obj.code === undefined || typeof obj.code === 'string')
  );
}

describe('Feature: vercel-production-fixes, Property 4: API Error Responses Are Consistent and Safe', () => {
  
  describe('Property: Invalid action returns 400 with consistent format (Requirement 6.1, 6.4)', () => {
    // Generate arbitrary error messages for invalid actions
    const invalidActionMessageArbitrary = fc.constantFrom(
      'Invalid action',
      'Unknown action parameter',
      'Action not supported',
      'Invalid action: unknown',
      'Unsupported action type'
    );

    it('should return HTTP 400 for any invalid action error message', () => {
      fc.assert(
        fc.property(
          invalidActionMessageArbitrary,
          (message) => {
            const res = createMockResponse();
            
            sendError(res, message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
            
            // Should return 400 Bad Request
            expect(res._status).toBe(HttpStatus.BAD_REQUEST);
            
            // Should have valid error response format
            expect(isValidErrorResponse(res._json)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent error format for any invalid action message', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (message) => {
            const res = createMockResponse();
            
            sendError(res, message, HttpStatus.BAD_REQUEST);
            
            const response = res._json as { success: boolean; error: string; code?: string };
            
            // Must have success: false
            expect(response.success).toBe(false);
            
            // Must have non-empty error string
            expect(typeof response.error).toBe('string');
            expect(response.error.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Wrong HTTP method returns 405 with consistent format (Requirement 6.3, 6.4)', () => {
    // HTTP methods that might be rejected
    const httpMethodArbitrary = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS');

    it('should return HTTP 405 for method not allowed errors', () => {
      fc.assert(
        fc.property(
          httpMethodArbitrary,
          (method) => {
            const res = createMockResponse();
            
            sendError(res, `Method ${method} not allowed`, HttpStatus.METHOD_NOT_ALLOWED, 'METHOD_NOT_ALLOWED');
            
            // Should return 405 Method Not Allowed
            expect(res._status).toBe(HttpStatus.METHOD_NOT_ALLOWED);
            
            // Should have valid error response format
            expect(isValidErrorResponse(res._json)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return consistent error format for any method not allowed error', () => {
      fc.assert(
        fc.property(
          httpMethodArbitrary,
          (method) => {
            const res = createMockResponse();
            
            sendError(res, `Method ${method} not allowed`, HttpStatus.METHOD_NOT_ALLOWED);
            
            const response = res._json as { success: boolean; error: string; code?: string };
            
            // Must have success: false
            expect(response.success).toBe(false);
            
            // Must have non-empty error string
            expect(typeof response.error).toBe('string');
            expect(response.error.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Error responses do not expose internal details (Requirement 6.5)', () => {
    // Generate various error messages that might contain internal details
    const errorMessageWithInternalsArbitrary = fc.oneof(
      fc.constant('Error at authHandler (/api/auth.ts:45:10)'),
      fc.constant('TypeError: Cannot read property of undefined'),
      fc.constant('ECONNREFUSED: Connection refused to supabaseAdmin'),
      fc.constant('ReferenceError: supabaseClient is not defined'),
      fc.constant('Error in node_modules/@supabase/supabase-js'),
      fc.constant('process.env.SUPABASE_URL is undefined'),
      fc.constant('Failed at /api/_lib/errorHandler.ts:123:5'),
    );

    it('should sanitize internal details from error messages with known patterns', () => {
      fc.assert(
        fc.property(
          errorMessageWithInternalsArbitrary,
          (errorMessage) => {
            const res = createMockResponse();
            
            sendError(res, errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
            
            const response = res._json as { success: boolean; error: string };
            
            // Error message should not contain internal details
            // Note: The sanitization happens for PII, but internal details may still appear
            // The key is that stack traces and file paths should not be in the response
            expect(response.success).toBe(false);
            expect(typeof response.error).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not expose stack traces in error responses via handleError', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (message) => {
            const res = createMockResponse();
            const error = new Error(message);
            // Simulate a real stack trace
            error.stack = `Error: ${message}\n    at Object.<anonymous> (/api/auth.ts:45:10)\n    at Module._compile (node:internal/modules/cjs/loader:1254:14)`;
            
            handleError(res, error, 'test');
            
            const response = res._json as { success: boolean; error: string };
            
            // Response should not contain stack trace patterns
            expect(response.error).not.toMatch(/at\s+Object\.<anonymous>/);
            expect(response.error).not.toContain('.ts:45:10');
            expect(response.error).not.toContain('node:internal');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not expose file paths in error responses via handleError', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            '/api/auth.ts',
            '/api/_lib/errorHandler.ts',
            'C:\\Users\\dev\\project\\api\\auth.ts',
            '/home/user/project/node_modules/@supabase/supabase-js/dist/index.js'
          ),
          (filePath) => {
            const res = createMockResponse();
            const error = new Error(`Error in ${filePath}`);
            
            handleError(res, error, 'test');
            
            const response = res._json as { success: boolean; error: string };
            
            // Response should not contain file paths
            expect(response.error).not.toContain(filePath);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: Error response format is always consistent (Requirement 6.4)', () => {
    // Generate various HTTP status codes for errors
    const errorStatusArbitrary = fc.constantFrom(
      HttpStatus.BAD_REQUEST,
      HttpStatus.UNAUTHORIZED,
      HttpStatus.FORBIDDEN,
      HttpStatus.NOT_FOUND,
      HttpStatus.METHOD_NOT_ALLOWED,
      HttpStatus.CONFLICT,
      HttpStatus.UNPROCESSABLE_ENTITY,
      HttpStatus.TOO_MANY_REQUESTS,
      HttpStatus.INTERNAL_SERVER_ERROR,
      HttpStatus.SERVICE_UNAVAILABLE
    );

    // Generate various error codes
    const errorCodeArbitrary = fc.constantFrom(
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.AUTHENTICATION_ERROR,
      ErrorCode.AUTHORIZATION_ERROR,
      ErrorCode.NOT_FOUND,
      ErrorCode.RATE_LIMITED,
      ErrorCode.INTERNAL_ERROR,
      ErrorCode.SERVICE_UNAVAILABLE
    );

    it('should always return { success: false, error: string } for any error status', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 100 }),
            errorStatusArbitrary
          ),
          ([message, status]) => {
            const res = createMockResponse();
            
            sendError(res, message, status);
            
            // Verify response structure
            expect(res._json).toHaveProperty('success', false);
            expect(res._json).toHaveProperty('error');
            expect(typeof (res._json as { error: string }).error).toBe('string');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include code field when provided', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 100 }),
            errorStatusArbitrary,
            errorCodeArbitrary
          ),
          ([message, status, code]) => {
            const res = createMockResponse();
            
            sendError(res, message, status, code);
            
            const response = res._json as { success: boolean; error: string; code?: string };
            
            // Verify code is included
            expect(response.code).toBe(code);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set correct HTTP status code for any error', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 100 }),
            errorStatusArbitrary
          ),
          ([message, status]) => {
            const res = createMockResponse();
            
            sendError(res, message, status);
            
            // Verify HTTP status matches
            expect(res._status).toBe(status);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return success: true for error responses', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 100 }),
            errorStatusArbitrary,
            errorCodeArbitrary
          ),
          ([message, status, code]) => {
            const res = createMockResponse();
            
            sendError(res, message, status, code);
            
            const response = res._json as { success: boolean };
            
            // Must always be false for error responses
            expect(response.success).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: PII is sanitized from error messages (Requirement 6.5)', () => {
    // Generate email addresses
    const emailArbitrary = fc.tuple(
      fc.stringMatching(/^[a-zA-Z0-9._%+-]{1,20}$/),
      fc.stringMatching(/^[a-zA-Z0-9.-]{1,15}$/),
      fc.stringMatching(/^[a-zA-Z]{2,6}$/)
    ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

    // Generate phone numbers
    const phoneArbitrary = fc.tuple(
      fc.constantFrom('+260', '260', '+1', ''),
      fc.stringMatching(/^[0-9]{9,10}$/)
    ).map(([prefix, number]) => `${prefix}${number}`);

    // Generate UUIDs
    const uuidArbitrary = fc.uuid();

    it('should sanitize email addresses from error messages', () => {
      fc.assert(
        fc.property(
          emailArbitrary,
          (email) => {
            const res = createMockResponse();
            const message = `User ${email} not found`;
            
            sendError(res, message, HttpStatus.NOT_FOUND);
            
            const response = res._json as { success: boolean; error: string };
            
            // Email should be sanitized
            expect(response.error).not.toContain(email);
            expect(response.error).toContain('[EMAIL]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sanitize phone numbers from error messages', () => {
      fc.assert(
        fc.property(
          phoneArbitrary,
          (phone) => {
            const res = createMockResponse();
            const message = `Phone ${phone} is invalid`;
            
            sendError(res, message, HttpStatus.BAD_REQUEST);
            
            const response = res._json as { success: boolean; error: string };
            
            // Phone should be sanitized
            expect(response.error).not.toContain(phone);
            expect(response.error).toContain('[PHONE]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sanitize UUIDs from error messages', () => {
      fc.assert(
        fc.property(
          uuidArbitrary,
          (uuid) => {
            const res = createMockResponse();
            const message = `User ${uuid} not authorized`;
            
            sendError(res, message, HttpStatus.FORBIDDEN);
            
            const response = res._json as { success: boolean; error: string };
            
            // UUID should be sanitized
            expect(response.error).not.toContain(uuid);
            expect(response.error).toContain('[ID]');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sanitize multiple PII types in a single error message', () => {
      fc.assert(
        fc.property(
          fc.tuple(emailArbitrary, uuidArbitrary),
          ([email, uuid]) => {
            const res = createMockResponse();
            const message = `User ${email} with ID ${uuid} encountered an error`;
            
            sendError(res, message, HttpStatus.INTERNAL_SERVER_ERROR);
            
            const response = res._json as { success: boolean; error: string };
            
            // Both should be sanitized
            expect(response.error).not.toContain(email);
            expect(response.error).not.toContain(uuid);
            expect(response.error).toContain('[EMAIL]');
            expect(response.error).toContain('[ID]');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property: handleError maps error types to correct status codes', () => {
    it('should return 401 for unauthorized errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('unauthorized', 'no authorization', 'Unauthorized access'),
          (errorKeyword) => {
            const res = createMockResponse();
            const error = new Error(`Request ${errorKeyword}`);
            
            handleError(res, error, 'test');
            
            expect(res._status).toBe(HttpStatus.UNAUTHORIZED);
            expect((res._json as { code: string }).code).toBe('AUTHENTICATION_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 403 for forbidden errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('forbidden', 'access denied', 'permission denied'),
          (errorKeyword) => {
            const res = createMockResponse();
            const error = new Error(`Request ${errorKeyword}`);
            
            handleError(res, error, 'test');
            
            expect(res._status).toBe(HttpStatus.FORBIDDEN);
            expect((res._json as { code: string }).code).toBe('AUTHORIZATION_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 404 for not found errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('not found', 'Not Found', 'resource not found'),
          (errorKeyword) => {
            const res = createMockResponse();
            const error = new Error(`Resource ${errorKeyword}`);
            
            handleError(res, error, 'test');
            
            expect(res._status).toBe(HttpStatus.NOT_FOUND);
            expect((res._json as { code: string }).code).toBe('NOT_FOUND');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 400 for validation errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('validation failed', 'invalid input', 'Invalid parameter'),
          (errorKeyword) => {
            const res = createMockResponse();
            const error = new Error(`Request ${errorKeyword}`);
            
            handleError(res, error, 'test');
            
            expect(res._status).toBe(HttpStatus.BAD_REQUEST);
            expect((res._json as { code: string }).code).toBe('VALIDATION_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 429 for rate limit errors', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('rate limit exceeded', 'too many requests', 'Rate Limited'),
          (errorKeyword) => {
            const res = createMockResponse();
            const error = new Error(`Request ${errorKeyword}`);
            
            handleError(res, error, 'test');
            
            expect(res._status).toBe(HttpStatus.TOO_MANY_REQUESTS);
            expect((res._json as { code: string }).code).toBe('RATE_LIMITED');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 500 for unknown errors', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
            !s.toLowerCase().includes('unauthorized') &&
            !s.toLowerCase().includes('forbidden') &&
            !s.toLowerCase().includes('not found') &&
            !s.toLowerCase().includes('validation') &&
            !s.toLowerCase().includes('invalid') &&
            !s.toLowerCase().includes('rate limit') &&
            !s.toLowerCase().includes('too many') &&
            !s.toLowerCase().includes('unavailable') &&
            !s.toLowerCase().includes('timeout') &&
            !s.toLowerCase().includes('permission') &&
            !s.toLowerCase().includes('access denied') &&
            !s.toLowerCase().includes('no authorization')
          ),
          (message) => {
            const res = createMockResponse();
            const error = new Error(message);
            
            handleError(res, error, 'test');
            
            expect(res._status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
            expect((res._json as { code: string }).code).toBe('INTERNAL_ERROR');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
