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
  const TEST_URL = 'https://apply.mihas.edu.zm/applications/new';
  const TEST_API_BASE_URL = 'https://api.mihas.edu.zm';
  const TEST_USER_AGENT = 'Mozilla/5.0 (Test Agent)';
  const TEST_APP_VERSION = '2.5.0';

  let fetchMock: ReturnType<typeof vi.fn>;
  let capturedCalls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    vi.useFakeTimers();
    capturedCalls = [];

    // Mock fetch
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      capturedCalls.push({ url: url as string, init: init as RequestInit });
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { href: TEST_URL },
      writable: true,
      configurable: true,
    });

    // Mock navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: TEST_USER_AGENT,
      writable: true,
      configurable: true,
    });

    // Mock import.meta.env
    vi.stubEnv('VITE_APP_VERSION', TEST_APP_VERSION);
    vi.stubEnv('VITE_API_BASE_URL', TEST_API_BASE_URL);
    vi.stubEnv('VITE_ERROR_REPORT_ENABLED', 'true');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * **Validates: Requirements 3.8, 3.9**
   *
   * For any sequence of errors fired within a 5-second window,
   * the reporter should send at most one POST containing all errors,
   * and each error payload must include URL, user_agent, and app_version.
   */
  it('batches all errors within 5s window into a single POST with required metadata', async () => {
    await fc.assert(
      fc.asyncProperty(errorBatchArb, async (errors) => {
        // Reset state for each property run
        capturedCalls = [];
        vi.clearAllTimers();
        vi.resetModules();

        // Re-import to get a fresh module with clean buffer
        const { initErrorReporter } = await import('@/lib/errorReporter');
        initErrorReporter();

        // Fire all errors within the 5-second window
        for (const err of errors) {
          const errorObj = err.stack
            ? Object.assign(new Error(err.message), { stack: err.stack })
            : new Error(err.message);

          window.onerror?.(
            err.message,       // event/message
            'test-source.js',  // source
            1,                 // lineno
            1,                 // colno
            errorObj,          // error object
          );
        }

        // No fetch calls should have been made yet (still within debounce)
        expect(capturedCalls.length).toBe(0);

        // Advance timers by 5 seconds to trigger the flush
        await vi.advanceTimersByTimeAsync(5_000);

        // Exactly one POST should have been made
        expect(capturedCalls.length).toBe(1);

        const call = capturedCalls[0];
        expect(call.url).toBe(`${TEST_API_BASE_URL}/api/v1/errors/report/`);
        expect(call.init.method).toBe('POST');

        // Parse the body
        const body = JSON.parse(call.init.body as string);

        // Determine the payloads array based on single vs batch format
        const payloads: Array<Record<string, unknown>> =
          errors.length === 1 ? [body] : (body.errors as Array<Record<string, unknown>>);

        // Must have the same number of payloads as errors fired
        expect(payloads.length).toBe(errors.length);

        // Each payload must include required metadata
        for (const payload of payloads) {
          // Requirement 3.9: URL
          expect(payload.url).toBe(TEST_URL);
          // Requirement 3.9: user agent
          expect(payload.user_agent).toBe(TEST_USER_AGENT);
          // Requirement 3.9: app version in context
          expect(payload.context).toBeDefined();
          expect((payload.context as Record<string, unknown>).app_version).toBe(TEST_APP_VERSION);
          // Must have a message
          expect(typeof payload.message).toBe('string');
          expect((payload.message as string).length).toBeGreaterThan(0);
        }

        // Verify each error message appears in the payloads
        for (let i = 0; i < errors.length; i++) {
          expect(payloads[i].message).toBe(errors[i].message);
        }
      }),
      { numRuns: 100 },
    );
  });
});
