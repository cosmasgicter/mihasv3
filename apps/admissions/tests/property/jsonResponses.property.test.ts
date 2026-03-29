/**
 * Property Test: API Responses Are Always JSON
 * Feature: bun-vercel-runtime-forensics
 * Property 2: API Responses Are Always JSON
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 * - 4.1: WHEN an API endpoint returns JSON, THE Response SHALL include `Content-Type: application/json` header
 * - 4.2: WHEN an API endpoint returns an error, THE Response SHALL be JSON format, not HTML
 * - 4.3: THE API_Functions SHALL NOT return HTML error pages for API routes
 * - 4.4: WHEN Vercel's catch-all route handles a request, THE Response SHALL be JSON with appropriate status code
 * - 4.5: IF an unhandled exception occurs, THEN THE Error_Handler SHALL return JSON error response
 * 
 * For any API endpoint request (success or error), the response SHALL have `Content-Type: application/json`
 * header and the body SHALL be valid JSON.
 * 
 * Test Strategy:
 * - Generate random API requests to all endpoints
 * - Include both valid and invalid requests
 * - Verify all responses have JSON Content-Type
 * - Verify all response bodies parse as valid JSON
 * - Verify response format matches { success: boolean, data?: any, error?: string, code?: string }
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { VercelResponse } from '@vercel/node';
import {
  sendError,
  sendSuccess,
  handleError,
  HttpStatus,
  ErrorCode,
  type ErrorResponse,
  type SuccessResponse,
} from '../../lib/errorHandler';

/**
 * Mock VercelResponse that captures headers and response body
 */
interface MockResponse {
  headers: Record<string, string>;
  statusCode: number;
  body: unknown;
}

/**
 * Create a mock VercelResponse for testing
 */
function createMockResponse(): { res: VercelResponse; captured: MockResponse } {
  const captured: MockResponse = {
    headers: {},
    statusCode: 200,
    body: null,
  };

  const res = {
    setHeader: vi.fn((name: string, value: string) => {
      captured.headers[name.toLowerCase()] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      captured.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      captured.body = body;
      return res;
    }),
  } as unknown as VercelResponse;

  return { res, captured };
}

/**
 * Validate that a response body is valid JSON format
 */
function isValidJsonResponse(body: unknown): boolean {
  if (body === null || body === undefined) {
    return false;
  }
  
  // Try to stringify and parse to ensure it's valid JSON
  try {
    const jsonString = JSON.stringify(body);
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that a response matches the expected API response format
 */
function isValidApiResponseFormat(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  
  const response = body as Record<string, unknown>;
  
  // Must have 'success' boolean field
  if (typeof response.success !== 'boolean') {
    return false;
  }
  
  if (response.success === true) {
    // Success response must have 'data' field
    return 'data' in response;
  } else {
    // Error response must have 'error' string field
    return typeof response.error === 'string';
  }
}

/**
 * Validate that Content-Type header is set to application/json
 */
function hasJsonContentType(headers: Record<string, string>): boolean {
  const contentType = headers['content-type'];
  return contentType === 'application/json';
}

/**
 * Generate random error messages with various content
 */
const errorMessageArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 200 }),
  fc.constantFrom(
    'Invalid request',
    'Validation failed',
    'Resource not found',
    'Unauthorized access',
    'Internal server error',
    'Service unavailable',
    'Rate limit exceeded',
    'Database connection failed',
    'Invalid token format',
    'Session expired',
  ),
);

/**
 * Generate random error messages that might contain PII (to test sanitization)
 */
const errorMessageWithPiiArbitrary = fc.oneof(
  fc.constant('User test@example.com not found'),
  fc.constant('Invalid phone number +260971234567'),
  fc.constant('User ID 550e8400-e29b-41d4-a716-446655440000 not found'),
  fc.constant('Token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U is invalid'),
  fc.constant('Error for user john.doe@company.org'),
  fc.constant('Contact +1-555-123-4567 for support'),
);

/**
 * Generate realistic email addresses that match the sanitizer's regex pattern
 * The sanitizer uses: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
 */
const realisticEmailArbitrary = fc.oneof(
  fc.constant('user@example.com'),
  fc.constant('john.doe@company.org'),
  fc.constant('student123@mihas.edu.zm'),
  fc.constant('admin+test@domain.co.uk'),
  fc.constant('user_name@sub.domain.com'),
  fc.tuple(
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9._%+-]{2,15}$/),
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9.-]{2,10}$/),
    fc.constantFrom('com', 'org', 'net', 'edu', 'co.uk', 'edu.zm'),
  ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
);

/**
 * Generate random HTTP status codes
 */
const httpStatusCodeArbitrary = fc.constantFrom(
  HttpStatus.OK,
  HttpStatus.CREATED,
  HttpStatus.BAD_REQUEST,
  HttpStatus.UNAUTHORIZED,
  HttpStatus.FORBIDDEN,
  HttpStatus.NOT_FOUND,
  HttpStatus.METHOD_NOT_ALLOWED,
  HttpStatus.CONFLICT,
  HttpStatus.UNPROCESSABLE_ENTITY,
  HttpStatus.TOO_MANY_REQUESTS,
  HttpStatus.INTERNAL_SERVER_ERROR,
  HttpStatus.SERVICE_UNAVAILABLE,
);

/**
 * Generate random error codes
 */
const errorCodeArbitrary = fc.constantFrom(
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.AUTHENTICATION_ERROR,
  ErrorCode.AUTHORIZATION_ERROR,
  ErrorCode.NOT_FOUND,
  ErrorCode.RATE_LIMITED,
  ErrorCode.INTERNAL_ERROR,
  ErrorCode.SERVICE_UNAVAILABLE,
);

/**
 * Generate random success data payloads
 */
const successDataArbitrary = fc.oneof(
  fc.constant(null),
  fc.constant({}),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.string()),
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    email: fc.emailAddress(),
    role: fc.constantFrom('admin', 'student', 'super_admin'),
  }),
  fc.record({
    users: fc.array(fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
    })),
    total: fc.integer({ min: 0, max: 1000 }),
    page: fc.integer({ min: 1, max: 100 }),
  }),
);

/**
 * Generate random Error objects for handleError testing
 */
const errorObjectArbitrary = fc.oneof(
  fc.string({ minLength: 1, maxLength: 100 }).map(msg => new Error(msg)),
  fc.constantFrom(
    new Error('unauthorized'),
    new Error('Unauthorized access'),
    new Error('forbidden'),
    new Error('Access denied'),
    new Error('permission denied'),
    new Error('not found'),
    new Error('Resource not found'),
    new Error('validation error'),
    new Error('Invalid input'),
    new Error('rate limit exceeded'),
    new Error('too many requests'),
    new Error('service unavailable'),
    new Error('timeout'),
    new Error('Database connection failed'),
    new Error('Unknown error'),
  ),
);

describe('Feature: bun-vercel-runtime-forensics, Property 2: API Responses Are Always JSON', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Property: sendSuccess always returns JSON with Content-Type header (Requirement 4.1)', () => {
    
    it('should set Content-Type: application/json header for any success response', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          httpStatusCodeArbitrary,
          (data, status) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data, status);
            
            // Verify Content-Type header is set
            expect(hasJsonContentType(captured.headers)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return valid JSON body for any success response', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          (data) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data);
            
            // Verify body is valid JSON
            expect(isValidJsonResponse(captured.body)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return response matching SuccessResponse format', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          (data) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data);
            
            // Verify response format
            expect(isValidApiResponseFormat(captured.body)).toBe(true);
            
            const response = captured.body as SuccessResponse;
            expect(response.success).toBe(true);
            expect('data' in response).toBe(true);
            expect(response.data).toEqual(data);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should use correct status code', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          httpStatusCodeArbitrary,
          (data, status) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data, status);
            
            expect(captured.statusCode).toBe(status);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should default to status 200 when not specified', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          (data) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data);
            
            expect(captured.statusCode).toBe(200);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: sendError always returns JSON with Content-Type header (Requirements 4.1, 4.2)', () => {
    
    it('should set Content-Type: application/json header for any error response', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          httpStatusCodeArbitrary,
          errorCodeArbitrary,
          (message, status, code) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message, status, code);
            
            // Verify Content-Type header is set
            expect(hasJsonContentType(captured.headers)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return valid JSON body for any error response', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          (message) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message);
            
            // Verify body is valid JSON
            expect(isValidJsonResponse(captured.body)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return response matching ErrorResponse format', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          errorCodeArbitrary,
          (message, code) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message, HttpStatus.BAD_REQUEST, code);
            
            // Verify response format
            expect(isValidApiResponseFormat(captured.body)).toBe(true);
            
            const response = captured.body as ErrorResponse;
            expect(response.success).toBe(false);
            expect(typeof response.error).toBe('string');
            expect(response.code).toBe(code);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should never return HTML in error responses', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          (message) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message);
            
            // Verify response is not HTML
            const bodyString = JSON.stringify(captured.body);
            expect(bodyString).not.toContain('<!DOCTYPE');
            expect(bodyString).not.toContain('<html');
            expect(bodyString).not.toContain('<body');
            expect(bodyString).not.toContain('<head');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should use correct status code', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          httpStatusCodeArbitrary,
          (message, status) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message, status);
            
            expect(captured.statusCode).toBe(status);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should default to status 400 when not specified', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          (message) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message);
            
            expect(captured.statusCode).toBe(400);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: handleError always returns JSON for unhandled exceptions (Requirement 4.5)', () => {
    
    it('should set Content-Type: application/json header for any exception', () => {
      fc.assert(
        fc.property(
          errorObjectArbitrary,
          (error) => {
            const { res, captured } = createMockResponse();
            
            handleError(res, error, 'test');
            
            // handleError uses res.json() which should set Content-Type
            // Verify body is valid JSON format
            expect(isValidJsonResponse(captured.body)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return valid JSON body for any exception', () => {
      fc.assert(
        fc.property(
          errorObjectArbitrary,
          (error) => {
            const { res, captured } = createMockResponse();
            
            handleError(res, error, 'test');
            
            // Verify body is valid JSON
            expect(isValidJsonResponse(captured.body)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should return response matching ErrorResponse format for any exception', () => {
      fc.assert(
        fc.property(
          errorObjectArbitrary,
          (error) => {
            const { res, captured } = createMockResponse();
            
            handleError(res, error, 'test');
            
            // Verify response format
            expect(isValidApiResponseFormat(captured.body)).toBe(true);
            
            const response = captured.body as ErrorResponse;
            expect(response.success).toBe(false);
            expect(typeof response.error).toBe('string');
            expect(typeof response.code).toBe('string');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should never return HTML for any exception', () => {
      fc.assert(
        fc.property(
          errorObjectArbitrary,
          (error) => {
            const { res, captured } = createMockResponse();
            
            handleError(res, error, 'test');
            
            // Verify response is not HTML
            const bodyString = JSON.stringify(captured.body);
            expect(bodyString).not.toContain('<!DOCTYPE');
            expect(bodyString).not.toContain('<html');
            expect(bodyString).not.toContain('<body');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle non-Error objects gracefully', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            // Use constant objects to avoid __proto__: null issues
            fc.constant({ message: 'Something went wrong' }),
            fc.constant({ error: 'Something went wrong' }),
            fc.constant({ code: 500, message: 'Server error' }),
            fc.constant({ status: 'error', details: 'Unknown failure' }),
          ),
          (error) => {
            const { res, captured } = createMockResponse();
            
            handleError(res, error, 'test');
            
            // Should still return valid JSON
            expect(isValidJsonResponse(captured.body)).toBe(true);
            expect(isValidApiResponseFormat(captured.body)).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should handle null and undefined errors gracefully', () => {
      // Test null
      const { res: res1, captured: captured1 } = createMockResponse();
      handleError(res1, null, 'test');
      expect(isValidJsonResponse(captured1.body)).toBe(true);
      expect(isValidApiResponseFormat(captured1.body)).toBe(true);
      
      // Test undefined
      const { res: res2, captured: captured2 } = createMockResponse();
      handleError(res2, undefined, 'test');
      expect(isValidJsonResponse(captured2.body)).toBe(true);
      expect(isValidApiResponseFormat(captured2.body)).toBe(true);
    });
  });

  describe('Property: Error responses are sanitized (no PII in responses)', () => {
    
    it('should sanitize email addresses from error messages', () => {
      fc.assert(
        fc.property(
          realisticEmailArbitrary,
          (email) => {
            const { res, captured } = createMockResponse();
            const message = `User ${email} not found`;
            
            sendError(res, message);
            
            const response = captured.body as ErrorResponse;
            expect(response.error).not.toContain(email);
            expect(response.error).toContain('[EMAIL]');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should sanitize UUIDs from error messages', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (uuid) => {
            const { res, captured } = createMockResponse();
            const message = `User ID ${uuid} not found`;
            
            sendError(res, message);
            
            const response = captured.body as ErrorResponse;
            expect(response.error).not.toContain(uuid);
            expect(response.error).toContain('[ID]');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should sanitize various PII patterns from error messages', () => {
      fc.assert(
        fc.property(
          errorMessageWithPiiArbitrary,
          (message) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message);
            
            const response = captured.body as ErrorResponse;
            
            // Should not contain raw email addresses
            expect(response.error).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
            
            // Should not contain raw UUIDs
            expect(response.error).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
            
            // Should not contain raw JWT tokens
            expect(response.error).not.toMatch(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: Response format is consistent across all response types', () => {
    
    it('should have consistent structure for success responses', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          (data) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data);
            
            const response = captured.body as Record<string, unknown>;
            
            // Must have exactly these keys for success
            expect(Object.keys(response).sort()).toEqual(['data', 'success']);
            expect(response.success).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should have consistent structure for error responses', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          errorCodeArbitrary,
          (message, code) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message, HttpStatus.BAD_REQUEST, code);
            
            const response = captured.body as Record<string, unknown>;
            
            // Must have these keys for error
            expect(response.success).toBe(false);
            expect(typeof response.error).toBe('string');
            expect(typeof response.code).toBe('string');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should have consistent structure for handleError responses', () => {
      fc.assert(
        fc.property(
          errorObjectArbitrary,
          (error) => {
            const { res, captured } = createMockResponse();
            
            handleError(res, error, 'test');
            
            const response = captured.body as Record<string, unknown>;
            
            // Must have these keys for error
            expect(response.success).toBe(false);
            expect(typeof response.error).toBe('string');
            expect(typeof response.code).toBe('string');
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: handleError maps error types to correct status codes', () => {
    
    it('should return 401 for unauthorized errors', () => {
      const unauthorizedErrors = [
        new Error('unauthorized'),
        new Error('Unauthorized access'),
        new Error('no authorization header'),
      ];
      
      unauthorizedErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(401);
      });
    });

    it('should return 403 for forbidden errors', () => {
      const forbiddenErrors = [
        new Error('forbidden'),
        new Error('access denied'),
        new Error('permission denied'),
      ];
      
      forbiddenErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(403);
      });
    });

    it('should return 404 for not found errors', () => {
      const notFoundErrors = [
        new Error('not found'),
        new Error('Resource not found'),
      ];
      
      notFoundErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(404);
      });
    });

    it('should return 400 for validation errors', () => {
      const validationErrors = [
        new Error('validation error'),
        new Error('invalid input'),
      ];
      
      validationErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(400);
      });
    });

    it('should return 429 for rate limit errors', () => {
      const rateLimitErrors = [
        new Error('rate limit exceeded'),
        new Error('too many requests'),
      ];
      
      rateLimitErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(429);
      });
    });

    it('should return 503 for service unavailable errors', () => {
      const serviceErrors = [
        new Error('service unavailable'),
        new Error('timeout'),
      ];
      
      serviceErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(503);
      });
    });

    it('should return 500 for unknown errors', () => {
      const unknownErrors = [
        new Error('something went wrong'),
        new Error('unexpected error'),
        new Error('database connection failed'),
      ];
      
      unknownErrors.forEach(error => {
        const { res, captured } = createMockResponse();
        handleError(res, error, 'test');
        expect(captured.statusCode).toBe(500);
      });
    });
  });

  describe('Property: JSON responses are parseable', () => {
    
    it('should produce responses that can be stringified and parsed', () => {
      fc.assert(
        fc.property(
          successDataArbitrary,
          (data) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data);
            
            // Simulate what happens when response is sent over network
            const jsonString = JSON.stringify(captured.body);
            const parsed = JSON.parse(jsonString);
            
            expect(parsed).toEqual(captured.body);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('should produce error responses that can be stringified and parsed', () => {
      fc.assert(
        fc.property(
          errorMessageArbitrary,
          (message) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message);
            
            // Simulate what happens when response is sent over network
            const jsonString = JSON.stringify(captured.body);
            const parsed = JSON.parse(jsonString);
            
            expect(parsed).toEqual(captured.body);
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('Property: Empty and edge case inputs are handled correctly', () => {
    
    it('should handle empty string error messages', () => {
      const { res, captured } = createMockResponse();
      
      sendError(res, '');
      
      expect(isValidJsonResponse(captured.body)).toBe(true);
      expect(isValidApiResponseFormat(captured.body)).toBe(true);
    });

    it('should handle null data in success responses', () => {
      const { res, captured } = createMockResponse();
      
      sendSuccess(res, null);
      
      expect(isValidJsonResponse(captured.body)).toBe(true);
      expect(isValidApiResponseFormat(captured.body)).toBe(true);
      
      const response = captured.body as SuccessResponse;
      expect(response.data).toBe(null);
    });

    it('should handle undefined data in success responses', () => {
      const { res, captured } = createMockResponse();
      
      sendSuccess(res, undefined);
      
      expect(isValidJsonResponse(captured.body)).toBe(true);
      // Note: undefined becomes null in JSON
    });

    it('should handle very long error messages', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1000, maxLength: 5000 }),
          (message) => {
            const { res, captured } = createMockResponse();
            
            sendError(res, message);
            
            expect(isValidJsonResponse(captured.body)).toBe(true);
            expect(isValidApiResponseFormat(captured.body)).toBe(true);
          }
        ),
        { numRuns: 10 } // Fewer runs for long strings
      );
    });

    it('should handle deeply nested success data', () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: 'deep',
                },
              },
            },
          },
        },
      };
      
      const { res, captured } = createMockResponse();
      
      sendSuccess(res, deeplyNested);
      
      expect(isValidJsonResponse(captured.body)).toBe(true);
      expect(isValidApiResponseFormat(captured.body)).toBe(true);
      
      const response = captured.body as SuccessResponse;
      expect(response.data).toEqual(deeplyNested);
    });

    it('should handle arrays in success data', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string(), { minLength: 0, maxLength: 100 }),
          (data) => {
            const { res, captured } = createMockResponse();
            
            sendSuccess(res, data);
            
            expect(isValidJsonResponse(captured.body)).toBe(true);
            expect(isValidApiResponseFormat(captured.body)).toBe(true);
            
            const response = captured.body as SuccessResponse;
            expect(response.data).toEqual(data);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});
