/**
 * Characterisation of the admin decision block's extracted modules
 * (admissions-v2 task **12.1**, MAINT-01; R14.3-R14.5, R17.5).
 *
 * Four other suites already characterise this block and all four are unchanged by
 * the split:
 *
 *   - `approvalFlowPreservation.property.test.ts` reads the component's **source
 *     text** for a `currentStatus === '<status>'` branch per status and for
 *     `handleStatusUpdate('approved')` / `('rejected')` adjacent to the
 *     `under_review` branch. The application-status branch tree therefore stayed
 *     in `ApplicationApprovalActions.tsx` and those pins needed no repointing.
 *   - `admissionsFlowPreservation.property.test.ts` **renders** the component and
 *     compares button labels across `status × paymentStatus`.
 *   - `adminMobileCompleteness` / `adminRouteActionParity` read the same surface.
 *
 * What none of them could do is exercise the dialog copy map directly, because it
 * was a `useMemo` inside the component. These cases do, and they add the two
 * claims a split should have to prove: the payment half still renders every branch
 * it used to, and the rejection-reason rule survived the move.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApplicationApprovalActions } from '@/components/admin/applications/ApplicationApprovalActions'
import { resolvePaymentReviewCopy } from '@/components/admin/applications/paymentReviewCopy'
import {
  OUTLINE_INFO,
  OUTLINE_SUCCESS,
  OUTLINE_WARNING,
} from '@/components/admin/applications/approvalActionTokens'

afterEach(cleanup)

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8')

function renderBlock(overrides: Record<string, unknown> = {}) {
  return render(
    <ApplicationApprovalActions
      applicationId="app-1"
      currentStatus="submitted"
      currentPaymentStatus="pending_review"
      onStatusUpdate={vi.fn()}
      onPaymentStatusUpdate={vi.fn()}
      {...overrides}
    />,
  )
}

function buttonLabels(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text) => text.length > 0)
}

// ---------------------------------------------------------------------------
// 1. The dialog copy map, exercised directly
// ---------------------------------------------------------------------------
describe('resolvePaymentReviewCopy answers for every payment decision', () => {
  it('verify: an optional note', () => {
    const copy = resolvePaymentReviewCopy('verified')
    expect(copy.title).toBe('Verify payment')
    expect(copy.confirmText).toBe('Verify payment')
    expect(copy.notesLabel).toBe('Verification note')
    expect(copy.notesRequired).toBe(false)
  })

  it('reject: a required reason, because the student has to act on it', () => {
    const copy = resolvePaymentReviewCopy('rejected')
    expect(copy.title).toBe('Reject payment')
    expect(copy.notesLabel).toBe('Rejection reason')
    expect(copy.notesRequired).toBe(true)
    expect(copy.description).toContain('so the student can correct and resubmit it')
  })

  it('defer: a required reason', () => {
    const copy = resolvePaymentReviewCopy('deferred')
    expect(copy.title).toBe('Defer payment')
    expect(copy.notesLabel).toBe('Deferral reason')
    expect(copy.notesRequired).toBe(true)
  })

  it('reopen: the fallback, with an optional note', () => {
    const copy = resolvePaymentReviewCopy('pending_review')
    expect(copy.title).toBe('Return payment to review')
    expect(copy.confirmText).toBe('Return to review')
    expect(copy.notesRequired).toBe(false)
  })

  it('is total — an unknown or absent decision still yields a usable dialog', () => {
    for (const status of [null, '', 'force_approved', 'successful', 'nonsense']) {
      const copy = resolvePaymentReviewCopy(status)
      expect(copy.title.length, String(status)).toBeGreaterThan(0)
      expect(copy.confirmText.length, String(status)).toBeGreaterThan(0)
      expect(copy.notesLabel.length, String(status)).toBeGreaterThan(0)
    }
  })

  it('requires a reason for exactly the two destructive-to-the-student decisions', () => {
    const required = ['verified', 'rejected', 'deferred', 'pending_review', null].filter(
      (status) => resolvePaymentReviewCopy(status).notesRequired,
    )
    expect(required).toEqual(['rejected', 'deferred'])
  })
})

// ---------------------------------------------------------------------------
// 2. The payment half still renders every branch, from the new module
// ---------------------------------------------------------------------------
describe('the payment controls render the same branch per payment status', () => {
  const BRANCHES: Array<[string, string[]]> = [
    ['not_paid', ['Mark as Paid']],
    ['pending_review', ['Verify', 'Reject', 'Defer']],
    ['rejected', ['Reopen review']],
    ['deferred', ['Reopen review']],
  ]

  it.each(BRANCHES)('%s offers %s', (paymentStatus, expected) => {
    renderBlock({ currentStatus: 'submitted', currentPaymentStatus: paymentStatus })
    const labels = buttonLabels()
    for (const label of expected) {
      expect(labels.some((text) => text.includes(label)), `${paymentStatus} lost "${label}"`).toBe(true)
    }
  })

  it('a verified payment offers no further payment command', () => {
    renderBlock({ currentStatus: 'under_review', currentPaymentStatus: 'verified' })
    const labels = buttonLabels()
    expect(labels.some((text) => text.includes('Verify'))).toBe(false)
    expect(labels.some((text) => text.includes('Reopen'))).toBe(false)
    expect(screen.getByText('Verified')).toBeTruthy()
  })

  it('an actor without the capability is told why, and offered nothing', () => {
    renderBlock({ currentPaymentStatus: 'pending_review', canVerifyPayment: false })
    const explanation = screen.getByTestId('payment-review-read-only')
    expect(explanation.textContent).toContain('payment verification permission for this school')
    expect(buttonLabels().some((text) => text.includes('Verify'))).toBe(false)
  })

  it('the summary pair is suppressed when the block is listed inside a record', () => {
    // Task 11.4: the roster row already publishes both statuses above the
    // disclosure this block sits in.
    renderBlock({ currentPaymentStatus: 'not_paid', showStatusSummary: false })
    expect(screen.queryByText('Awaiting payment')).toBeNull()
    // The command itself is never suppressed.
    expect(buttonLabels().some((text) => text.includes('Mark as Paid'))).toBe(true)
  })

  it('every payment command is disabled while the block is disabled', () => {
    renderBlock({ currentPaymentStatus: 'pending_review', disabled: true })
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled, button.textContent ?? '').toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. The split itself: one tone vocabulary, and the pins that stayed true
// ---------------------------------------------------------------------------
describe('the decomposition kept one definition of each thing', () => {
  it('both halves read the same tone tokens rather than restating them', () => {
    for (const token of [OUTLINE_SUCCESS, OUTLINE_WARNING, OUTLINE_INFO]) {
      // Task 11.5 measured these washes at `/5` for a reason; two copies is how
      // one of them drifts back to `/10`.
      expect(token).toContain('/5')
    }
    for (const relative of [
      'src/components/admin/applications/ApplicationApprovalActions.tsx',
      'src/components/admin/applications/PaymentDecisionControls.tsx',
    ]) {
      const source = readSource(relative)
      expect(source, relative).toContain("from '@/components/admin/applications/approvalActionTokens'")
      expect(source, relative).not.toMatch(/const OUTLINE_(SUCCESS|WARNING|INFO)\s*=/)
    }
  })

  it('the application-status branch tree stayed in the component two lanes pin by source', () => {
    // `approvalFlowPreservation.property.test.ts` reads this file's text. The split
    // moved the payment half precisely so that claim stays literally true instead
    // of being repointed.
    const source = readSource('src/components/admin/applications/ApplicationApprovalActions.tsx')
    for (const status of ['draft', 'submitted', 'under_review', 'approved', 'rejected']) {
      expect(source, status).toContain(`currentStatus === '${status}'`)
    }
    const underReview = source.indexOf("currentStatus === 'under_review'")
    expect(underReview).toBeGreaterThan(-1)
    const window = source.slice(underReview, underReview + 1200)
    expect(window).toContain("handleStatusUpdate('approved')")
    expect(window).toContain("handleStatusUpdate('rejected')")
  })

  it('no module of the block reaches the network itself', () => {
    // The block issues commands through the callbacks its caller supplies; the
    // caller is the surface that owns the versioned write (task 9.4).
    for (const relative of [
      'src/components/admin/applications/ApplicationApprovalActions.tsx',
      'src/components/admin/applications/PaymentDecisionControls.tsx',
      'src/components/admin/applications/paymentReviewCopy.ts',
      'src/hooks/admin/useApprovalActionCommands.ts',
    ]) {
      const source = readSource(relative)
      expect(source, relative).not.toMatch(/from '@\/services\/client'/)
      expect(source, relative).not.toMatch(/\bfetch\(/)
    }
  })
})
