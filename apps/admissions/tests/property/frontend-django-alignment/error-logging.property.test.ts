/**
 * Property-based tests for logApiError utility
 * Feature: frontend-django-alignment, Property 10: Error logging includes all diagnostic fields
 *
 * **Validates: Requirements 9.1**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { logApiError } from '@/lib/apiErrorLogger';

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Non-empty context string */
const contextArb = fc.string({ minLength: 1, maxLength: 100 });

/** Non-empty endpoint string */
const endpointArb = fc.string({ minLength: 1, maxLength: 200 });

/** Error instance with random message */
const errorInstanceArb = fc.string({ minLength: 0, maxLength: 200 }).map(msg => new Error(msg));

/** Plain string error */
const plainStringErrorArb = fc.string({ minLength: 0, maxLength: 200 });

/** Object with a status property (normal prototype so String() works) */
const objectWithStatusArb = fc.integer({ min: 100, max: 599 }).map(status => ({ status }));

/** Object without a status property */
const objectWithoutStatusArb = fc.string({ maxLength: 100 }).map(detail => ({ detail }));

/**
 * Any "well-behaved" error shape — objects that have a normal prototype
 * so that String() coercion works. This covers the realistic inputs
 * the function will encounter in production.
 */
const wellBehavedErrorArb = fc.oneof(
  errorInstanceArb,
  plainStringErrorArb,
  objectWithStatusArb,
  objectWithoutStatusArb,
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.boolean(),
);

// ── Test Suite ──────────────────────────────────────────────────────────

describe('Feature: frontend-django-alignment, Property 10: Error logging includes all diagnostic fields', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * For any well-behaved error object (Error instances, plain strings,
   * objects with/without status, null, undefined, numbers, booleans),
   * logApiError shall produce a console.error call that includes the
   * context string, endpoint string, and a message string.
   * The function shall never throw.
   */
  it('always calls console.error with context, endpoint, and message for any error shape', () => {
    fc.assert(
      fc.property(contextArb, endpointArb, wellBehavedErrorArb, (context, endpoint, error) => {
        consoleErrorSpy.mockClear();

        // Must never throw
        expect(() => logApiError(context, endpoint, error)).not.toThrow();

        // Must have called console.error exactly once
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

        const [logString, logData] = consoleErrorSpy.mock.calls[0];

        // The formatted string must include context and endpoint
        expect(logString).toContain(context);
        expect(logString).toContain(endpoint);

        // The data object must include a message string
        expect(typeof logData.message).toBe('string');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * For Error instances, the logged message must match error.message.
   */
  it('extracts message from Error instances correctly', () => {
    fc.assert(
      fc.property(contextArb, endpointArb, errorInstanceArb, (context, endpoint, error) => {
        consoleErrorSpy.mockClear();

        logApiError(context, endpoint, error);

        const [, logData] = consoleErrorSpy.mock.calls[0];
        expect(logData.message).toBe(error.message);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * For objects with a status property, the logged status must match.
   */
  it('extracts status from error objects that have a status field', () => {
    fc.assert(
      fc.property(contextArb, endpointArb, objectWithStatusArb, (context, endpoint, error) => {
        consoleErrorSpy.mockClear();

        logApiError(context, endpoint, error);

        const [, logData] = consoleErrorSpy.mock.calls[0];
        expect(logData.status).toBe(error.status);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * For plain strings, the logged message must equal the string.
   */
  it('uses String() for plain string errors', () => {
    fc.assert(
      fc.property(contextArb, endpointArb, plainStringErrorArb, (context, endpoint, error) => {
        consoleErrorSpy.mockClear();

        logApiError(context, endpoint, error);

        const [, logData] = consoleErrorSpy.mock.calls[0];
        expect(logData.message).toBe(String(error));
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 9.1**
   *
   * For null and undefined errors, the function must not throw and must
   * still produce a console.error call with a message string.
   */
  it('handles null and undefined errors without throwing', () => {
    for (const error of [null, undefined]) {
      consoleErrorSpy.mockClear();

      expect(() => logApiError('test-context', '/api/v1/test/', error)).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

      const [, logData] = consoleErrorSpy.mock.calls[0];
      expect(typeof logData.message).toBe('string');
    }
  });
});
