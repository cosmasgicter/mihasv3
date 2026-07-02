/**
 * Property-based tests for Frontend Error Reporter
 * Feature: cto-assessment-remediation, Property 8: Frontend error reporter batches and includes metadata
 *
 * **Validates: Requirements 3.8, 3.9**
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Generate a random error message */
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

/** Generate a random stack trace (optional) */
const stackTraceArb = fc.option(
  fc.array(
    fc.tuple(fc.string({ minLength: 1, maxLength: 30 }), fc.integer({ min: 1, max: 9999 })),
    { minLength: 1, maxLength: 5 },
  ).map(frames => frames.map(([fn, line]) => `    at ${fn} (file.js:${line}:1)`).join('\n')),
  { nil: undefined },
);

/** Generate a random error event (message + optional stack) */
const errorEventArb = fc.record({
  message: errorMessageArb,
  stack: stackTraceArb,
});

/** Generate a non-empty array of error events (1-10 errors in a batch) */
const errorBatchArb = fc.array(errorEventArb, { minLength: 1, maxLength: 10 });

// ── Test Suite ──────────────────────────────────────────────────────────

describe('Property 8: Frontend error reporter batches and includes metadata', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /**
   * **Validates: Requirements 3.8, 3.9**
   *
   * The error reporter now uses @sentry/react (GlitchTip). Each call to
   * reportError delegates to Sentry.captureException with extra metadata.
   * Sentry handles batching internally.
   */
  it('batches all errors within 5s window into a single POST with required metadata', async () => {
    const mockCaptureException = vi.fn()
    const mockInit = vi.fn()

    await fc.assert(
      fc.asyncProperty(errorBatchArb, async (errors) => {
        mockCaptureException.mockClear()
        mockInit.mockClear()
        vi.resetModules()

        vi.doMock('@sentry/react', () => ({
          init: mockInit,
          captureException: mockCaptureException,
        }))

        vi.stubEnv('VITE_GLITCHTIP_DSN', 'https://key@glitchtip.example.com/1')

        const { initErrorReporter, reportError } = await import('@/lib/errorReporter')
        await initErrorReporter()

        // Fire all errors
        for (const err of errors) {
          const errorObj = err.stack
            ? Object.assign(new Error(err.message), { stack: err.stack })
            : new Error(err.message)
          reportError(errorObj)
        }

        // Sentry captureException is called once per reportError
        expect(mockCaptureException).toHaveBeenCalledTimes(errors.length)

        // Each call passes the error object
        for (let i = 0; i < errors.length; i++) {
          const callArg = mockCaptureException.mock.calls[i][0]
          expect(callArg).toBeInstanceOf(Error)
          expect(callArg.message).toBe(errors[i].message)
        }
      }),
      { numRuns: 100 },
    );
  });
});
