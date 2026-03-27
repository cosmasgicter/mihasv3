// @vitest-environment node
/**
 * Property-based tests for response envelope and CSRF
 * Feature: api-endpoint-hardening
 *
 * Property 4: Error responses follow the envelope format
 * Property 5: Success responses follow the envelope format
 * Property 6: Unexpected errors produce generic 500 responses
 * Property 24: Content-Type is application/json on all responses
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { sendSuccess, sendError, handleError, sanitizeError } from '../../../lib/errorHandler';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a mock VercelResponse that captures status, json output, and headers */
function createMockResponse() {
  const headers = new Map<string, string>();
  let capturedStatus = 200;
  let capturedJson: unknown = null;

  const res: any = {
    headers,
    setHeader: vi.fn((name: string, value: string) => {
      headers.set(name, value);
      return res;
    }),
    status: vi.fn((code: number) => {
      capturedStatus = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      capturedJson = body;
      return res;
    }),
    getStatus: () => capturedStatus,
    getJson: () => capturedJson,
  };

  return res;
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Random non-empty string for error messages */
const messageArb = fc.string({ minLength: 1, maxLength: 200 });

/** Random HTTP error status codes */
const errorStatusArb = fc.constantFrom(400, 401, 403, 404, 405, 409, 422, 429, 500, 503);

/** Random error codes */
const errorCodeArb = fc.constantFrom(
  'VALIDATION_ERROR',
  'AUTHENTICATION_ERROR',
  'AUTHORIZATION_ERROR',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
  'CSRF_VALIDATION_FAILED',
  'CUSTOM_CODE',
);

/** Random data objects for success responses */
const dataArb = fc.oneof(
  fc.record({ id: fc.uuid(), name: fc.string() }),
  fc.record({ items: fc.array(fc.integer(), { maxLength: 5 }), total: fc.nat() }),
  fc.record({ message: fc.string(), count: fc.integer() }),
  fc.constant({ ok: true }),
  fc.constant(null),
  fc.array(fc.string(), { maxLength: 3 }),
);

/** Random error messages for Error objects (no keywords that trigger special handling) */
const genericErrorMessageArb = fc.constantFrom(
  'Something went wrong',
  'Unexpected failure occurred',
  'An unknown problem happened',
  'Processing could not complete',
  'Operation failed unexpectedly',
  'System encountered a problem',
  'Request could not be fulfilled',
  'A critical issue was detected',
);

// ── Tests ───────────────────────────────────────────────────────────────

// Feature: api-endpoint-hardening, Property 4: Error responses follow the envelope format
// **Validates: Requirements 4.1**
describe('P4: Error responses follow the envelope format', () => {
  it('sendError produces { success: false, error: string, code: string }', () => {
    fc.assert(
      fc.property(
        messageArb,
        errorStatusArb,
        errorCodeArb,
        (message: string, status: number, code: string) => {
          const mockRes = createMockResponse();
          sendError(mockRes, message, status, code);

          const body = mockRes.getJson();

          // success is exactly false
          expect(body).toHaveProperty('success', false);
          // error is a string
          expect(typeof body.error).toBe('string');
          // code is a string
          expect(typeof body.code).toBe('string');
          // code matches what we passed
          expect(body.code).toBe(code);
          // status was set correctly
          expect(mockRes.status).toHaveBeenCalledWith(status);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 5: Success responses follow the envelope format
// **Validates: Requirements 4.2**
describe('P5: Success responses follow the envelope format', () => {
  it('sendSuccess produces { success: true, data: T }', () => {
    fc.assert(
      fc.property(dataArb, (data: unknown) => {
        const mockRes = createMockResponse();
        sendSuccess(mockRes, data);

        const body = mockRes.getJson();

        // success is exactly true
        expect(body).toHaveProperty('success', true);
        // data is present
        expect(body).toHaveProperty('data');
        // data matches what we passed
        expect(body.data).toEqual(data);
        // default status is 200
        expect(mockRes.status).toHaveBeenCalledWith(200);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 6: Unexpected errors produce generic 500 responses
// **Validates: Requirements 4.3**
describe('P6: Unexpected errors produce generic 500 responses', () => {
  it('handleError returns 500 with INTERNAL_ERROR for generic Error objects', () => {
    fc.assert(
      fc.property(genericErrorMessageArb, (message: string) => {
        const mockRes = createMockResponse();

        // Suppress console.error during test
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        handleError(mockRes, new Error(message));

        consoleSpy.mockRestore();

        const body = mockRes.getJson();
        const status = mockRes.getStatus();

        // Status should be 500
        expect(status).toBe(500);
        // Code should be INTERNAL_ERROR
        expect(body.code).toBe('INTERNAL_ERROR');
        // success is false
        expect(body.success).toBe(false);
        // Error message should NOT contain stack traces
        expect(body.error).not.toMatch(/at\s+\S+/);
        // No file paths in the error message
        expect(body.error).not.toMatch(/\/[a-zA-Z0-9_-]+\.[a-zA-Z]+/);
        expect(body.error).not.toMatch(/[A-Z]:\\/);
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-endpoint-hardening, Property 24: Content-Type is application/json on all responses
// **Validates: Requirements 4.6**
describe('P24: Content-Type is application/json on all responses', () => {
  it('sendSuccess sets Content-Type to application/json', () => {
    fc.assert(
      fc.property(dataArb, (data: unknown) => {
        const mockRes = createMockResponse();
        sendSuccess(mockRes, data);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        expect(mockRes.headers.get('Content-Type')).toBe('application/json');
      }),
      { numRuns: 100 },
    );
  });

  it('sendError sets Content-Type to application/json', () => {
    fc.assert(
      fc.property(messageArb, errorStatusArb, errorCodeArb, (message: string, status: number, code: string) => {
        const mockRes = createMockResponse();
        sendError(mockRes, message, status, code);

        expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        expect(mockRes.headers.get('Content-Type')).toBe('application/json');
      }),
      { numRuns: 100 },
    );
  });
});
