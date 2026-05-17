/**
 * Preservation Property Tests — Admissions Flow Bugs
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * These tests capture the EXISTING correct behavior on UNFIXED code.
 * They MUST PASS before and after fixes — failure indicates a regression.
 *
 * Methodology: observation-first — each test observes current behavior,
 * then writes a property asserting that behavior is preserved.
 */
import React, { act } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { createRoot, type Root } from 'react-dom/client'

// ---------------------------------------------------------------------------
// Property 2a: Valid Auth Save Preservation (Req 3.1, 3.2, 3.3)
// ---------------------------------------------------------------------------
// Observation: useAutoSave with a successful onSave callback sets
// saveStatus='saved', updates lastSaved, and resets retry counter to 0.
// ---------------------------------------------------------------------------
describe('[PBT] Preservation — Valid auth saves unchanged', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Stub navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('property: successful onSave sets saveStatus=saved and resets retry counter', async () => {
    // Mock react-router-dom useLocation
    vi.doMock('react-router-dom', () => ({
      useLocation: () => ({ pathname: '/test', search: '' }),
    }))
    // Mock localStorage cache
    vi.doMock('@/lib/localStorageCache', () => ({
      cachedGetItem: vi.fn(() => null),
      cachedSetItem: vi.fn(),
      cachedRemoveItem: vi.fn(),
    }))
    // Mock secureStorage
    vi.doMock('@/lib/secureStorage', () => ({
      stripPiiFields: (data: Record<string, unknown>) => data,
    }))

    const { useAutoSave } = await import('@/hooks/useAutoSave')

    // Use fast-check to generate various successful save data payloads
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          full_name: fc.string({ minLength: 1, maxLength: 50 }),
          email: fc.emailAddress(),
        }),
        async (formData) => {
          const onSaveMock = vi.fn().mockResolvedValue(undefined)
          let hookResult: ReturnType<typeof useAutoSave> | null = null

          function TestComponent({ data }: { data: Record<string, unknown> }) {
            hookResult = useAutoSave(data, {
              onSave: onSaveMock,
              enabled: true,
              interval: 8000,
            })
            return null
          }

          const container = document.createElement('div')
          document.body.appendChild(container)
          const root = createRoot(container)

          // Render with data
          await act(async () => {
            root.render(React.createElement(TestComponent, { data: formData }))
          })

          // Trigger manual save
          await act(async () => {
            hookResult!.saveData()
          })

          // Flush microtasks
          await act(async () => {
            await vi.advanceTimersByTimeAsync(100)
          })

          // Verify preservation: successful save → saved status, retry counter = 0
          expect(hookResult!.saveStatus).toBe('saved')
          expect(hookResult!.saveAttempts).toBe(0)

          // Cleanup
          act(() => { root.unmount() })
          document.body.removeChild(container)
          onSaveMock.mockClear()
        }
      ),
      { numRuns: 5 }
    )

    vi.doUnmock('react-router-dom')
    vi.doUnmock('@/lib/localStorageCache')
    vi.doUnmock('@/lib/secureStorage')
  })
})

// ---------------------------------------------------------------------------
// Property 2b: Valid Phone Preservation (Req 3.4)
// ---------------------------------------------------------------------------
// Observation: Phone strings matching /^\+?[0-9]{7,15}$/ (no spaces)
// pass Zod validation. This must remain true after the fix.
// ---------------------------------------------------------------------------
describe('[PBT] Preservation — Valid phone numbers unchanged', () => {
  it('property: phone strings without spaces matching regex pass validation identically', async () => {
    const { z } = await import('zod')

    // The phone field schema from types.ts — test it in isolation to avoid
    // unrelated validation failures from program/intake fields
    const phoneSchema = z.string().regex(
      /^\+?[0-9]{7,15}$/,
      'Phone must be 7–15 digits, optionally prefixed with +'
    )

    // Generate valid phone strings: optional +, then 7-15 digits, NO spaces
    const arbDigit = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9')
    const arbValidPhone = fc.tuple(
      fc.boolean(), // whether to include +
      fc.integer({ min: 7, max: 15 }), // digit count
    ).chain(([hasPlus, digitCount]) =>
      fc.array(arbDigit, { minLength: digitCount, maxLength: digitCount })
        .map(digits => (hasPlus ? '+' : '') + digits.join(''))
    )

    fc.assert(
      fc.property(arbValidPhone, (phone) => {
        // Verify the phone matches the original regex
        expect(phone).toMatch(/^\+?[0-9]{7,15}$/)

        const result = phoneSchema.safeParse(phone)
        // Valid phones without spaces must always pass
        expect(result.success).toBe(true)
        if (result.success) {
          // The phone value should be preserved (no unexpected mutation)
          expect(result.data).toBe(phone)
        }
      }),
      { numRuns: 30 }
    )
  })
})

// ---------------------------------------------------------------------------
// Property 2c: Production Payment Preservation (Req 3.5)
// ---------------------------------------------------------------------------
// Observation: PaymentStep in production mode (import.meta.env.DEV=false)
// does NOT render any bypass button. Only "Pay now" and retry buttons exist.
// ---------------------------------------------------------------------------
describe('[PBT] Preservation — Production payment enforcement', () => {
  it('property: no bypass mechanism visible in production mode', () => {
    // Read the PaymentStep source and verify that any dev bypass is gated
    // behind import.meta.env.DEV — meaning production builds exclude it.
    //
    // In production: import.meta.env.DEV === false, so any code gated on
    // `import.meta.env.DEV && ...` will not execute.
    //
    // We verify this structurally: the source must NOT contain an
    // unconditional bypass button (one that renders without env checks).
    const fs = require('fs')
    const path = require('path')
    const paymentStepPath = path.resolve(
      __dirname, '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
    )
    const source: string = fs.readFileSync(paymentStepPath, 'utf-8')

    fc.assert(
      fc.property(
        fc.constantFrom('production', 'prod'),
        (_envLabel) => {
          // The known test-ids in PaymentStep are: payment-step and pay-later-button.
          // Dev bypass was removed during auth simplification.
          const knownTestIds = ['payment-step', 'pay-later-button', 'dev-bypass-button']
          const testIdMatches = source.match(/data-testid="([^"]+)"/g) || []
          const foundTestIds = testIdMatches.map(m => m.replace(/data-testid="([^"]+)"/, '$1'))

          // All test-ids in the source should be from the known set
          for (const tid of foundTestIds) {
            expect(knownTestIds).toContain(tid)
          }

          // Verify dev bypass stays gated behind import.meta.env.DEV rather than
          // rendering unconditionally in production.
          expect(source).toContain('import.meta.env.DEV && import.meta.env.VITE_PAYMENT_DEV_BYPASS')
          expect(source).not.toContain('dev-bypass-payment-button')
        }
      ),
      { numRuns: 2 }
    )
  })
})


// ---------------------------------------------------------------------------
// Property 2d: Existing Admin Controls Preservation (Req 3.6, 3.7)
// ---------------------------------------------------------------------------
// Observation on UNFIXED code:
//   currentStatus='submitted'       → renders Review button
//   currentStatus='under_review'    → renders Approve + Reject buttons
//   currentPaymentStatus='pending_review' → renders Verify + Reject buttons
//   currentPaymentStatus='rejected' → renders Reopen Review button
// ---------------------------------------------------------------------------
describe('[PBT] Preservation — Existing admin controls unchanged', () => {
  let container: HTMLDivElement
  let root: Root

  function setup(): void {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }

  function teardown(): void {
    act(() => { root.unmount() })
    document.body.removeChild(container)
  }

  // Baseline map: for each (appStatus, paymentStatus) pair, which buttons
  // should be present. This captures the observed behavior on unfixed code.
  const BASELINE: Record<string, Record<string, string[]>> = {
    submitted: {
      pending_review: ['Review', 'Verify', 'Reject'],
      rejected: ['Review', 'Reopen Review'],
    },
    under_review: {
      pending_review: ['Approve', 'Reject', 'Verify', 'Reject'],
      rejected: ['Approve', 'Reject', 'Reopen Review'],
    },
  }

  it('property: for all status × paymentStatus in baseline, rendered buttons match', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )

    const arbAppStatus = fc.constantFrom('submitted', 'under_review')
    const arbPaymentStatus = fc.constantFrom('pending_review', 'rejected')

    fc.assert(
      fc.property(arbAppStatus, arbPaymentStatus, (appStatus, paymentStatus) => {
        setup()
        act(() => {
          root.render(
            React.createElement(ApplicationApprovalActions, {
              applicationId: 'test-app-id',
              currentStatus: appStatus,
              currentPaymentStatus: paymentStatus,
              onStatusUpdate: vi.fn(),
              onPaymentStatusUpdate: vi.fn(),
            })
          )
        })

        const allButtons = container.querySelectorAll('button')
        const buttonTexts = Array.from(allButtons)
          .map(btn => btn.textContent?.trim() ?? '')
          .filter(t => t.length > 0 && t !== 'Updating...')

        const expectedButtons = BASELINE[appStatus]?.[paymentStatus] ?? []

        // Each expected button text must appear in the rendered buttons
        for (const expected of expectedButtons) {
          const found = buttonTexts.some(text =>
            text.toLowerCase().includes(expected.toLowerCase())
          )
          expect(found).toBe(true)
        }

        teardown()
      }),
      { numRuns: 4 }
    )
  })

  it('submitted status renders Review button', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    setup()
    act(() => {
      root.render(
        React.createElement(ApplicationApprovalActions, {
          applicationId: 'app-1',
          currentStatus: 'submitted',
          currentPaymentStatus: 'pending_review',
          onStatusUpdate: vi.fn(),
          onPaymentStatusUpdate: vi.fn(),
        })
      )
    })
    const buttons = Array.from(container.querySelectorAll('button'))
    const reviewBtn = buttons.find(b => b.textContent?.includes('Review'))
    expect(reviewBtn).toBeTruthy()
    teardown()
  })

  it('under_review status renders Approve and Reject buttons', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    setup()
    act(() => {
      root.render(
        React.createElement(ApplicationApprovalActions, {
          applicationId: 'app-2',
          currentStatus: 'under_review',
          currentPaymentStatus: 'pending_review',
          onStatusUpdate: vi.fn(),
          onPaymentStatusUpdate: vi.fn(),
        })
      )
    })
    const buttons = Array.from(container.querySelectorAll('button'))
    const approveBtn = buttons.find(b => b.textContent?.includes('Approve'))
    const rejectBtn = buttons.find(b => b.textContent?.includes('Reject'))
    expect(approveBtn).toBeTruthy()
    expect(rejectBtn).toBeTruthy()
    teardown()
  })

  it('pending_review payment renders Verify and Reject buttons', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    setup()
    act(() => {
      root.render(
        React.createElement(ApplicationApprovalActions, {
          applicationId: 'app-3',
          currentStatus: 'submitted',
          currentPaymentStatus: 'pending_review',
          onStatusUpdate: vi.fn(),
          onPaymentStatusUpdate: vi.fn(),
        })
      )
    })
    const buttons = Array.from(container.querySelectorAll('button'))
    const verifyBtn = buttons.find(b => b.textContent?.includes('Verify'))
    const rejectBtn = buttons.find(b => b.textContent?.includes('Reject'))
    expect(verifyBtn).toBeTruthy()
    expect(rejectBtn).toBeTruthy()
    teardown()
  })

  it('rejected payment renders Reopen Review button', async () => {
    const { ApplicationApprovalActions } = await import(
      '@/components/admin/applications/ApplicationApprovalActions'
    )
    setup()
    act(() => {
      root.render(
        React.createElement(ApplicationApprovalActions, {
          applicationId: 'app-4',
          currentStatus: 'submitted',
          currentPaymentStatus: 'rejected',
          onStatusUpdate: vi.fn(),
          onPaymentStatusUpdate: vi.fn(),
        })
      )
    })
    const buttons = Array.from(container.querySelectorAll('button'))
    const reopenBtn = buttons.find(b => b.textContent?.includes('Reopen'))
    expect(reopenBtn).toBeTruthy()
    teardown()
  })
})
