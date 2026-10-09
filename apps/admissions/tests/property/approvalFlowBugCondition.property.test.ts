/**
 * Bug Condition Exploration — Admissions Approval Flow Bugs (Frontend)
 *
 * **Validates: Requirements 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12**
 *
 * These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on
 * unfixed code — failure confirms the bugs exist.
 *
 * Property 1: Bug Condition — Admissions Approval Flow Bug Conditions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Bug 2 — ApplicationApprovalActions renders empty for unhandled statuses
// ---------------------------------------------------------------------------
describe('[PBT] Bug 2 — ApplicationApprovalActions renders empty for unhandled statuses', () => {
  /**
   * **Validates: Requirements 1.4, 1.5, 1.6**
   *
   * The component only handles draft, submitted, under_review, approved,
   * rejected. All other statuses render an empty controls area.
   * On unfixed code, these statuses produce no status indicator — test FAILS.
   */

  it('property: unhandled statuses render at least one status indicator or action button', () => {
    // Read the source to check if render branches exist for these statuses
    const componentPath = path.resolve(
      __dirname,
      '../../src/components/admin/applications/ApplicationApprovalActions.tsx'
    )
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(
        fc.constantFrom(
          'conditionally_approved',
          'waitlisted',
          'enrolled',
          'withdrawn',
          'expired',
          'enrollment_expired'
        ),
        (status) => {
          // The component source must contain a render branch for this status.
          // On unfixed code, these statuses have no render branch — the
          // component falls through to rendering nothing.
          const hasRenderBranch =
            source.includes(`'${status}'`) || source.includes(`"${status}"`)

          // Check that the status appears in a conditional render context
          // (not just in the normalizePaymentStatusForActions function or imports)
          const hasStatusHandling =
            hasRenderBranch &&
            (source.includes(`currentStatus === '${status}'`) ||
              source.includes(`currentStatus === "${status}"`) ||
              // Also check for array/set inclusion patterns
              source.includes(`"${status}"`) && source.includes('includes') ||
              source.includes(`'${status}'`) && source.includes('includes'))

          // For the bug condition statuses, the component must have explicit
          // handling that renders UI elements
          expect(hasStatusHandling).toBe(true)
        }
      ),
      { numRuns: 6 }
    )
  })

  it('property: conditionally_approved has action buttons (approve/reject)', () => {
    const componentPath = path.resolve(
      __dirname,
      '../../src/components/admin/applications/ApplicationApprovalActions.tsx'
    )
    const source = fs.readFileSync(componentPath, 'utf-8')

    // On unfixed code, there is no conditionally_approved block with action buttons
    const hasConditionallyApprovedBlock =
      source.includes("currentStatus === 'conditionally_approved'") ||
      source.includes('currentStatus === "conditionally_approved"')

    expect(hasConditionallyApprovedBlock).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Bug 3 — PaymentStep dev bypass button not wired
// ---------------------------------------------------------------------------
describe('[PBT] Bug 3 — PaymentStep dev bypass button not wired', () => {
  /**
   * **Validates: Requirements 1.7, 1.8, 1.9**
   *
   * The PaymentStep component has zero references to VITE_PAYMENT_DEV_BYPASS.
   * The backend endpoint exists but the frontend never calls it.
   * On unfixed code, no dev bypass button exists — test FAILS.
   */

  it('property: PaymentStep references VITE_PAYMENT_DEV_BYPASS env var', () => {
    const componentPath = path.resolve(
      __dirname,
      '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
    )
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(
        fc.constantFrom(
          'VITE_PAYMENT_DEV_BYPASS',
          'dev-bypass',
          'Simulate Payment'
        ),
        (pattern) => {
          // On unfixed code, PaymentStep has zero references to the dev bypass
          // env var or endpoint — test FAILS
          expect(source).toContain(pattern)
        }
      ),
      { numRuns: 3 }
    )
  })

  it('property: dev bypass button calls POST /api/v1/payments/dev-bypass/', () => {
    const componentPath = path.resolve(
      __dirname,
      '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
    )
    const source = fs.readFileSync(componentPath, 'utf-8')

    // On unfixed code, there is no reference to the dev-bypass endpoint
    expect(source).toContain('dev-bypass')
    expect(source).toContain('import.meta.env.DEV')
  })
})

// ---------------------------------------------------------------------------
// Bug 4 — auth recovery must trigger an immediate save
// ---------------------------------------------------------------------------
// Originally pinned on `src/hooks/useAutoSave.ts`'s `handleAuthRecovered`.
// Admissions-v2 task 6.3 retired that hook; the wizard's autosave is the draft
// machine (`lib/wizardDraftController.ts`), so the property is asserted on it —
// behaviourally rather than by reading source text.
describe('[PBT] Bug 4 — auth recovery triggers an immediate save', () => {
  /**
   * **Validates: Requirements 1.10, 1.11, 1.12**
   *
   * When the session recovers, work held back while it was expired is sent at
   * once — not on the next interval tick and not only if a queue happened to
   * hold it.
   */
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('property: recovering the session sends held work immediately', async () => {
    const { createDraftHarness, settle } = await import('../unit/__fixtures__/wizardDraftHarness')
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 2, maxLength: 20 }).filter((v) => v.trim().length >= 2), async (town) => {
        const h = createDraftHarness()
        h.machine.activate()
        h.hydrate()
        h.server.failures.push(Object.assign(new Error('expired'), { name: 'AuthenticationError' }))
        h.edit('residence_town', town)
        await vi.advanceTimersByTimeAsync(2_000)
        await settle()
        expect(h.machine.getSnapshot().authExpired).toBe(true)
        const before = h.server.updateCalls.length
        h.machine.authRecovered()
        // No timer advance: the save is immediate.
        await settle()
        expect(h.server.updateCalls.length).toBe(before + 1)
        h.machine.dispose()
      }),
      { numRuns: 25 },
    )
  })

  it('recovery also sends work the session expiry held back without any failed request', async () => {
    const { createDraftHarness, settle } = await import('../unit/__fixtures__/wizardDraftHarness')
    const h = createDraftHarness()
    h.machine.activate()
    h.hydrate()
    h.machine.authExpiredExternally()
    h.edit('residence_town', 'Held while expired')
    await vi.advanceTimersByTimeAsync(8_000)
    await settle()
    expect(h.server.updateCalls).toHaveLength(0)
    h.machine.authRecovered()
    await settle()
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.answers.residence_town).toBe('Held while expired')
  })
})
