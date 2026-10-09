/**
 * Preservation Property Tests — Admissions Approval Flow (Frontend)
 *
 * **Validates: Requirements 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
 *
 * These tests capture BASELINE behavior on UNFIXED code. They MUST PASS
 * before and after fixes — failure indicates a regression.
 *
 * Property 2: Preservation — Admissions Approval Flow Preservation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Bug 2 Preservation — Existing status UI unchanged
// ---------------------------------------------------------------------------
describe('[PBT] Bug 2 Preservation — Existing status render behavior unchanged', () => {
  /**
   * **Validates: Requirements 3.3, 3.4, 3.5**
   *
   * The component must continue to render the correct UI for statuses
   * that are already handled: draft, submitted, under_review, approved, rejected.
   */

  const componentPath = path.resolve(
    __dirname,
    '../../src/components/admin/applications/ApplicationApprovalActions.tsx'
  )

  it('property: submitted status shows Review button', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(fc.constant('submitted'), (status) => {
        // The component must have a render branch for submitted that shows Review
        const hasSubmittedBlock =
          source.includes("currentStatus === 'submitted'") ||
          source.includes('currentStatus === "submitted"')
        expect(hasSubmittedBlock).toBe(true)

        // The submitted block must contain a Review button
        const submittedIdx = source.indexOf("currentStatus === 'submitted'")
        if (submittedIdx === -1) return
        const blockAfter = source.slice(submittedIdx, submittedIdx + 500)
        expect(blockAfter).toContain('Review')
      }),
      { numRuns: 1 }
    )
  })

  it('property: under_review status shows Approve and Reject buttons', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(fc.constant('under_review'), (status) => {
        const hasUnderReviewBlock =
          source.includes("currentStatus === 'under_review'") ||
          source.includes('currentStatus === "under_review"')
        expect(hasUnderReviewBlock).toBe(true)

        // The under_review block must wire approve and reject status updates
        const idx = source.indexOf("currentStatus === 'under_review'")
        if (idx === -1) return
        const blockAfter = source.slice(idx, idx + 1200)
        // Check for the approve and reject action handlers
        expect(blockAfter).toContain("handleStatusUpdate('approved')")
        expect(blockAfter).toContain("handleStatusUpdate('rejected')")
      }),
      { numRuns: 1 }
    )
  })

  it('property: approved and rejected statuses show status badges', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(
        fc.constantFrom('approved', 'rejected'),
        (status) => {
          // Both approved and rejected are handled in a combined block
          const hasBadgeBlock =
            source.includes("currentStatus === 'approved'") ||
            source.includes('currentStatus === "approved"')
          expect(hasBadgeBlock).toBe(true)

          const hasRejectedRef =
            source.includes("currentStatus === 'rejected'") ||
            source.includes('currentStatus === "rejected"')
          expect(hasRejectedRef).toBe(true)

          // The block must contain status badge indicators
          expect(source).toContain('Approved')
          expect(source).toContain('Rejected')
        }
      ),
      { numRuns: 2 }
    )
  })

  it('property: draft status shows Draft indicator', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(fc.constant('draft'), (status) => {
        const hasDraftBlock =
          source.includes("currentStatus === 'draft'") ||
          source.includes('currentStatus === "draft"')
        expect(hasDraftBlock).toBe(true)

        // The draft block must contain a draft indicator
        const idx = source.indexOf("currentStatus === 'draft'")
        if (idx === -1) return
        const blockAfter = source.slice(idx, idx + 500)
        const hasDraftIndicator =
          blockAfter.includes('Draft') || blockAfter.includes('draft')
        expect(hasDraftIndicator).toBe(true)
      }),
      { numRuns: 1 }
    )
  })

  it('property: all existing statuses have explicit render branches', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(
        fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected'),
        (status) => {
          const hasRenderBranch =
            source.includes(`currentStatus === '${status}'`) ||
            source.includes(`currentStatus === "${status}"`)
          expect(hasRenderBranch).toBe(true)
        }
      ),
      { numRuns: 5 }
    )
  })
})

// ---------------------------------------------------------------------------
// Bug 3 Preservation — Production payment flow unchanged
// ---------------------------------------------------------------------------
describe('[PBT] Bug 3 Preservation — No dev bypass in production', () => {
  /**
   * **Validates: Requirements 3.6**
   *
   * In production (import.meta.env.DEV = false), no dev bypass button
   * should be rendered regardless of VITE_PAYMENT_DEV_BYPASS value.
   * Also when DEV = true but VITE_PAYMENT_DEV_BYPASS = 'false', no bypass.
   */

  const componentPath = path.resolve(
    __dirname,
    '../../src/pages/student/applicationWizard/steps/PaymentStep.tsx'
  )

  it('property: production mode never renders dev bypass button', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    fc.assert(
      fc.property(
        fc.constantFrom('true', 'false', '', undefined),
        (bypassValue) => {
          // In production, import.meta.env.DEV is false.
          // The component must guard any dev bypass behind import.meta.env.DEV.
          // On UNFIXED code, there is no dev bypass at all, so this passes trivially.
          // After fix, the guard must ensure production safety.

          // Check that the component does NOT have an unconditional bypass button
          // (one that doesn't check import.meta.env.DEV)
          const hasUnguardedBypass =
            source.includes('dev-bypass') &&
            !source.includes('import.meta.env.DEV')

          expect(hasUnguardedBypass).toBe(false)
        }
      ),
      { numRuns: 4 }
    )
  })

  it('property: DEV=true with VITE_PAYMENT_DEV_BYPASS=false shows no bypass', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    // If the component has dev bypass logic, it must check BOTH
    // import.meta.env.DEV AND VITE_PAYMENT_DEV_BYPASS.
    // On unfixed code, neither exists, so this passes trivially.
    // After fix, both guards must be present.
    if (source.includes('dev-bypass') || source.includes('VITE_PAYMENT_DEV_BYPASS')) {
      expect(source).toContain('import.meta.env.DEV')
      expect(source).toContain('VITE_PAYMENT_DEV_BYPASS')
    }
    // If no bypass code exists at all, the test passes (unfixed code)
  })

  it('property: PaymentForm component is still rendered for non-deferred payments', () => {
    const source = fs.readFileSync(componentPath, 'utf-8')

    // The PaymentForm import and usage must still be present
    expect(source).toContain('PaymentForm')
    expect(source).toContain('import')

    // The Lenco payment flow via PaymentForm must still be the primary path
    const hasPaymentFormRender = source.includes('<PaymentForm')
    expect(hasPaymentFormRender).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Bug 4 Preservation — Normal auto-save and offline recovery unchanged
// ---------------------------------------------------------------------------
// Originally source scans of `src/hooks/useAutoSave.ts`. Admissions-v2 task 6.3
// retired that hook in favour of the one draft machine
// (`lib/wizardDraftController.ts`); the same preserved behaviours are asserted
// on the machine, by driving it.
describe('[PBT] Bug 4 Preservation — Normal auto-save cycle unchanged', () => {
  /**
   * **Validates: Requirements 3.7, 3.8**
   *
   * Normal auto-save cycle (auth never expired) continues to work.
   * Online recovery with queued work still sends it.
   */
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  async function hydrated() {
    const { createDraftHarness, settle } = await import('../unit/__fixtures__/wizardDraftHarness')
    const h = createDraftHarness()
    h.machine.activate()
    h.hydrate()
    return { h, settle }
  }

  it('property: saves on the 8-second sweep for normal auto-save', async () => {
    const { WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS } = await import('@/lib/wizardDraftController')
    expect(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS).toBe(8000)
    await fc.assert(
      fc.asyncProperty(fc.constantFrom('Lusaka', 'Ndola', 'Kitwe'), async (town) => {
        const { createDraftHarness, settle } = await import('../unit/__fixtures__/wizardDraftHarness')
        const h = createDraftHarness()
        h.hydrate()
        h.edit('residence_town', town)
        h.machine.activate()
        await vi.advanceTimersByTimeAsync(8_000)
        await settle()
        expect(h.server.answers.residence_town).toBe(town)
        h.machine.dispose()
      }),
      { numRuns: 3 },
    )
  })

  it('property: online recovery sends the queued work', async () => {
    const { h, settle } = await hydrated()
    h.setOnline(false)
    h.edit('residence_town', 'Queued offline')
    await vi.advanceTimersByTimeAsync(8_000)
    await settle()
    expect(h.server.updateCalls).toHaveLength(0)
    h.setOnline(true)
    await settle()
    expect(h.server.answers.residence_town).toBe('Queued offline')
  })

  it('property: queued work is sent as one command carrying every queued edit', async () => {
    const { h, settle } = await hydrated()
    h.setOnline(false)
    h.edit('residence_town', 'Offline town')
    h.edit('next_of_kin_name', 'Offline kin')
    await vi.advanceTimersByTimeAsync(8_000)
    await settle()
    h.setOnline(true)
    await settle()
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.updateCalls[0]!.payload).toMatchObject({
      residence_town: 'Offline town',
      next_of_kin_name: 'Offline kin',
    })
  })

  it('property: auth recovery still sends work queued while offline', async () => {
    const { h, settle } = await hydrated()
    h.machine.authExpiredExternally()
    h.setOnline(false)
    h.edit('residence_town', 'Queued and expired')
    h.setOnline(true)
    await settle()
    expect(h.server.updateCalls).toHaveLength(0)
    h.machine.authRecovered()
    await settle()
    expect(h.server.answers.residence_town).toBe('Queued and expired')
  })

  it('property: local persistence happens before the cloud save', async () => {
    const { h, settle } = await hydrated()
    const order: string[] = []
    const persist = h.adapters.persistLocal
    h.adapters.persistLocal = (meta) => {
      order.push(meta.pending ? 'local:pending' : 'local:clean')
      persist(meta)
    }
    const update = h.adapters.updateDraft
    h.adapters.updateDraft = async (...args) => {
      order.push('cloud')
      return update(...args)
    }
    h.edit('residence_town', 'Local first')
    await vi.advanceTimersByTimeAsync(2_000)
    await settle()
    expect(order.indexOf('local:pending')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('local:pending')).toBeLessThan(order.indexOf('cloud'))
  })

  it('property: going offline with unsaved work shows the offline status', async () => {
    const { deriveWizardDraftSaveView } = await import('@/lib/wizardDraftController')
    const { h } = await hydrated()
    h.edit('residence_town', 'Typed')
    h.setOnline(false)
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('offline')
  })
})
