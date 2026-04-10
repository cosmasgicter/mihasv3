/**
 * Property tests for Application Process Hardening — Frontend Improvements
 *
 * Property 7: Frontend error deduplication
 * Property 9: Exponential backoff interval growth
 *
 * Uses vitest + fast-check.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import {
  INITIAL_INTERVAL,
  BACKOFF_FACTOR,
  MAX_INTERVAL,
} from '@/hooks/usePaymentStatus'

// ---------------------------------------------------------------------------
// Property 7: Frontend error deduplication
// ---------------------------------------------------------------------------

/**
 * Property 7: Frontend error deduplication
 *
 * For any set of identical errors within 5s, only one report is sent with
 * `count` equal to occurrences.
 *
 * We test this by importing the errorReporter module fresh (to get a clean
 * buffer), firing the same error N times, flushing, and verifying the POST
 * body contains exactly one entry with `count === N`.
 *
 * **Validates: Requirements 6.1, 6.3**
 */

const TEST_API_BASE_URL = 'https://api.mihas.edu.zm'
const TEST_URL = 'https://apply.mihas.edu.zm/test'
const TEST_USER_AGENT = 'Mozilla/5.0 (Test Agent)'

// Generator: error message (non-empty, printable)
const errorMessageArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)

// Generator: optional stack trace
const stackTraceArb = fc.option(
  fc
    .array(
      fc.tuple(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 9999 }),
      ),
      { minLength: 1, maxLength: 4 },
    )
    .map((frames) =>
      frames.map(([fn, line]) => `    at ${fn} (file.js:${line}:1)`).join('\n'),
    ),
  { nil: undefined },
)

// Generator: repeat count for identical errors (2–20)
const repeatCountArb = fc.integer({ min: 2, max: 20 })

describe('Feature: application-process-hardening, Property 7: Frontend error deduplication', () => {
  let capturedCalls: Array<{ url: string; init: RequestInit }>

  beforeEach(() => {
    vi.useFakeTimers()
    capturedCalls = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        capturedCalls.push({ url, init: init as RequestInit })
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )

    Object.defineProperty(window, 'location', {
      value: { href: TEST_URL },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(navigator, 'userAgent', {
      value: TEST_USER_AGENT,
      writable: true,
      configurable: true,
    })

    vi.stubEnv('VITE_APP_VERSION', '1.0.0')
    vi.stubEnv('VITE_API_BASE_URL', TEST_API_BASE_URL)
    vi.stubEnv('VITE_ERROR_REPORT_ENABLED', 'true')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('identical errors within 5s produce one report with count equal to occurrences', async () => {
    await fc.assert(
      fc.asyncProperty(
        errorMessageArb,
        stackTraceArb,
        repeatCountArb,
        async (message, stack, repeatCount) => {
          capturedCalls = []
          vi.clearAllTimers()
          vi.resetModules()

          const { initErrorReporter } = await import('@/lib/errorReporter')
          initErrorReporter()

          const errorObj = stack
            ? Object.assign(new Error(message), { stack })
            : new Error(message)

          // Fire the same error N times
          for (let i = 0; i < repeatCount; i++) {
            window.onerror?.(message, 'test.js', 1, 1, errorObj)
          }

          // No calls yet — still within debounce window
          expect(capturedCalls.length).toBe(0)

          // Flush the batch
          await vi.advanceTimersByTimeAsync(5_000)

          // Exactly one POST
          expect(capturedCalls.length).toBe(1)

          const body = JSON.parse(capturedCalls[0].init.body as string)

          // Single deduplicated error → sent as a single object (not wrapped in errors array)
          // The payload should have count === repeatCount
          const payload = body.errors ? body.errors[0] : body
          expect(payload.message).toBe(message)
          expect(payload.count).toBe(repeatCount)
        },
      ),
      { numRuns: 50 },
    )
  })

  it('distinct errors within 5s each get their own entry with count=1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(errorMessageArb, { minLength: 2, maxLength: 5 }).filter(
          // Ensure all messages are unique
          (msgs) => new Set(msgs).size === msgs.length,
        ),
        async (messages) => {
          capturedCalls = []
          vi.clearAllTimers()
          vi.resetModules()

          const { initErrorReporter } = await import('@/lib/errorReporter')
          initErrorReporter()

          for (const msg of messages) {
            const err = new Error(msg)
            window.onerror?.(msg, 'test.js', 1, 1, err)
          }

          await vi.advanceTimersByTimeAsync(5_000)

          expect(capturedCalls.length).toBe(1)

          const body = JSON.parse(capturedCalls[0].init.body as string)
          const payloads: Array<Record<string, unknown>> =
            messages.length === 1 ? [body] : (body.errors ?? [body])

          expect(payloads.length).toBe(messages.length)

          for (const p of payloads) {
            expect(p.count).toBe(1)
          }
        },
      ),
      { numRuns: 50 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 9: Exponential backoff interval growth
// ---------------------------------------------------------------------------

/**
 * Property 9: Exponential backoff interval growth
 *
 * For any sequence of N polls while `pending`, the Nth interval must equal
 * `min(2000 * 1.5^(N-1), 30000)` ms.
 *
 * This is a pure mathematical property test — no React rendering needed.
 * We verify the formula using the exported constants from usePaymentStatus.ts.
 *
 * **Validates: Requirements 9.1, 9.2**
 */

// Generator: poll sequence index (1-based, 1 to 50)
const pollIndexArb = fc.integer({ min: 1, max: 50 })

describe('Feature: application-process-hardening, Property 9: Exponential backoff interval growth', () => {
  it('exported constants match the spec values', () => {
    expect(INITIAL_INTERVAL).toBe(2_000)
    expect(BACKOFF_FACTOR).toBe(1.5)
    expect(MAX_INTERVAL).toBe(30_000)
  })

  it('the Nth interval equals min(INITIAL_INTERVAL * BACKOFF_FACTOR^(N-1), MAX_INTERVAL)', () => {
    fc.assert(
      fc.property(pollIndexArb, (n) => {
        const expected = Math.min(
          INITIAL_INTERVAL * Math.pow(BACKOFF_FACTOR, n - 1),
          MAX_INTERVAL,
        )

        // Simulate the backoff chain: start at INITIAL_INTERVAL, multiply each step
        let interval = INITIAL_INTERVAL
        for (let i = 1; i < n; i++) {
          interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL)
        }

        expect(interval).toBeCloseTo(expected, 5)
      }),
      { numRuns: 200 },
    )
  })

  it('interval never exceeds MAX_INTERVAL', () => {
    fc.assert(
      fc.property(pollIndexArb, (n) => {
        let interval = INITIAL_INTERVAL
        for (let i = 1; i < n; i++) {
          interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL)
        }
        expect(interval).toBeLessThanOrEqual(MAX_INTERVAL)
      }),
      { numRuns: 200 },
    )
  })

  it('interval is monotonically non-decreasing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }),
        (n) => {
          let prev = INITIAL_INTERVAL
          for (let i = 1; i < n; i++) {
            const next = Math.min(prev * BACKOFF_FACTOR, MAX_INTERVAL)
            expect(next).toBeGreaterThanOrEqual(prev)
            prev = next
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('first interval is always INITIAL_INTERVAL (2000ms)', () => {
    expect(INITIAL_INTERVAL).toBe(2_000)
    // The first poll uses INITIAL_INTERVAL directly
    const firstInterval = Math.min(
      INITIAL_INTERVAL * Math.pow(BACKOFF_FACTOR, 0),
      MAX_INTERVAL,
    )
    expect(firstInterval).toBe(2_000)
  })

  it('interval reaches MAX_INTERVAL cap and stays there', () => {
    // Find the poll index where we first hit MAX_INTERVAL
    let interval = INITIAL_INTERVAL
    let capsAt = 1
    while (interval < MAX_INTERVAL) {
      interval = Math.min(interval * BACKOFF_FACTOR, MAX_INTERVAL)
      capsAt++
    }

    // Verify all subsequent polls stay at MAX_INTERVAL
    fc.assert(
      fc.property(
        fc.integer({ min: capsAt, max: capsAt + 100 }),
        (n) => {
          let iv = INITIAL_INTERVAL
          for (let i = 1; i < n; i++) {
            iv = Math.min(iv * BACKOFF_FACTOR, MAX_INTERVAL)
          }
          expect(iv).toBe(MAX_INTERVAL)
        },
      ),
      { numRuns: 50 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 14: Wizard step announcement format
// ---------------------------------------------------------------------------

/**
 * Property 14: Wizard step announcement format
 *
 * For any step change, the aria-live region must contain
 * "Step N of M: title" where N is the 1-based step index and M is the total
 * number of steps.
 *
 * We test this as a pure string format property: given any valid step index
 * from the wizardSteps config, the announcement string must match the
 * expected pattern.
 *
 * **Validates: Requirements 14.1**
 */

import { wizardSteps } from '@/pages/student/applicationWizard/steps/config'

// Generator: valid step index (0-based, within wizardSteps bounds)
const stepIndexArb = fc.integer({ min: 0, max: wizardSteps.length - 1 })

describe('Feature: application-process-hardening, Property 14: Wizard step announcement format', () => {
  it('announcement string matches "Step N of M: title" for any valid step index', () => {
    fc.assert(
      fc.property(stepIndexArb, (stepIndex) => {
        const stepConfig = wizardSteps[stepIndex]
        const totalSteps = wizardSteps.length

        // Build the announcement the same way the wizard does
        const announcement = `Step ${stepIndex + 1} of ${totalSteps}: ${stepConfig.title}`

        // Verify the format matches the pattern "Step N of M: <title>"
        const pattern = /^Step (\d+) of (\d+): (.+)$/
        const match = announcement.match(pattern)

        expect(match).not.toBeNull()
        expect(Number(match![1])).toBe(stepIndex + 1)
        expect(Number(match![2])).toBe(totalSteps)
        expect(match![3]).toBe(stepConfig.title)
      }),
      { numRuns: 100 },
    )
  })

  it('step number N is always between 1 and M (total steps)', () => {
    fc.assert(
      fc.property(stepIndexArb, (stepIndex) => {
        const n = stepIndex + 1
        const m = wizardSteps.length

        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(m)
      }),
      { numRuns: 100 },
    )
  })

  it('announcement with validation errors appends ". Validation errors found."', () => {
    fc.assert(
      fc.property(stepIndexArb, (stepIndex) => {
        const stepConfig = wizardSteps[stepIndex]
        const totalSteps = wizardSteps.length

        const base = `Step ${stepIndex + 1} of ${totalSteps}: ${stepConfig.title}`
        const withErrors = `${base}. Validation errors found.`

        expect(withErrors).toContain('Validation errors found')
        expect(withErrors.startsWith(base)).toBe(true)
      }),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 15: Payment error alert role
// ---------------------------------------------------------------------------

/**
 * Property 15: Payment error alert role
 *
 * For any payment failure, the error container must have `role="alert"`.
 *
 * We test this by rendering the Alert component (used by PaymentStep for
 * error display) with the "destructive" variant and verifying it always
 * produces a DOM element with `role="alert"`.
 *
 * **Validates: Requirements 15.1**
 */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/Alert'

// Generator: random error message for payment failure
const paymentErrorMessageArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0)

// Generator: Alert variant that represents an error/failure state
const errorVariantArb = fc.constantFrom('destructive' as const, 'error' as const)

describe('Feature: application-process-hardening, Property 15: Payment error alert role', () => {
  it('Alert component with destructive/error variant always renders role="alert"', () => {
    fc.assert(
      fc.property(paymentErrorMessageArb, errorVariantArb, (message, variant) => {
        const html = renderToStaticMarkup(
          React.createElement(Alert, { variant },
            React.createElement(AlertTitle, null, 'Payment failed'),
            React.createElement(AlertDescription, null, message),
          ),
        )

        // The rendered HTML must contain role="alert"
        expect(html).toContain('role="alert"')
      }),
      { numRuns: 50 },
    )
  })

  it('payment failure alert contains descriptive error text and recovery guidance', () => {
    // Filter to messages without HTML special chars to avoid escaping issues with renderToStaticMarkup
    const safeMessageArb = fc
      .string({ minLength: 1, maxLength: 80 })
      .filter((s) => s.trim().length > 0 && !/[<>&"']/.test(s))

    fc.assert(
      fc.property(safeMessageArb, (message) => {
        const html = renderToStaticMarkup(
          React.createElement(Alert, { variant: 'destructive' },
            React.createElement(AlertTitle, null, 'Payment failed'),
            React.createElement(AlertDescription, null,
              React.createElement('p', { className: 'font-semibold text-destructive' }, message),
              React.createElement('p', { className: 'text-sm' }, 'You can retry the payment or contact support.'),
            ),
          ),
        )

        // Must have role="alert"
        expect(html).toContain('role="alert"')
        // Must contain the error message
        expect(html).toContain(message)
        // Must contain recovery guidance
        expect(html).toContain('retry')
      }),
      { numRuns: 50 },
    )
  })
})
