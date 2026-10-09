/**
 * Characterisation of the student application workspace's extracted modules
 * (admissions-v2 task **12.1**, MAINT-01; R14.3-R14.5, R17.5).
 *
 * Task 12.1 split `pages/student/ApplicationStatus.tsx` (807 lines) by bounded
 * workflow. `studentWorkspaceConsolidation.test.tsx` already characterises the
 * workspace as a whole and its 51 cases are unchanged by the split (only the
 * module set they read was repointed, and stated).
 *
 * What that file could not do is exercise the derivation directly, because it was
 * a closure inside a component. These cases do: the timeline and the copy
 * selection are now pure functions of the server's row, so every branch is
 * reachable without mounting a page or standing up a query client.
 *
 * This is the characterisation MAINT-01's remedy asks for — "add characterization
 * tests, then split by bounded workflow without changing behavior". The
 * assertions encode the behaviour that was already there; none of them is a new
 * rule.
 */
import { describe, expect, it } from 'vitest'

import {
  buildApplicationTimeline,
  formatInterviewDateTime,
} from '@/components/student/applicationStatus/applicationTimeline'
import {
  buildWorkspacePresentation,
  formatStatusLabel,
  resolvePaymentStatusDescription,
  truncateValue,
} from '@/components/student/applicationStatus/workspacePresentation'
import type { ApplicationWithDetails } from '@/types/database'

const BASE = {
  id: 'app-1',
  status: 'submitted',
  created_at: '2026-01-02T08:00:00Z',
  submitted_at: '2026-01-05T09:30:00Z',
  updated_at: '2026-01-09T11:00:00Z',
  program: 'Diploma in Clinical Medicine',
  intake: 'January 2026',
  payment_status: 'pending_review',
} as unknown as ApplicationWithDetails

function application(overrides: Partial<ApplicationWithDetails>): ApplicationWithDetails {
  return { ...BASE, ...overrides } as ApplicationWithDetails
}

// ---------------------------------------------------------------------------
// 1. The derived progress list
// ---------------------------------------------------------------------------
describe('buildApplicationTimeline derives the workspace progress list', () => {
  it('returns nothing without an application', () => {
    expect(buildApplicationTimeline(null)).toEqual([])
  })

  it('opens with the draft step for a draft, and the submitted step otherwise', () => {
    const draft = buildApplicationTimeline(application({ status: 'draft' }))
    expect(draft[0]).toMatchObject({
      status: 'draft',
      date: BASE.created_at,
      description: 'Application draft started',
      completed: true,
    })

    const submitted = buildApplicationTimeline(application({ status: 'submitted' }))
    expect(submitted[0]).toMatchObject({
      status: 'submitted',
      date: BASE.submitted_at,
      description: 'Application submitted successfully',
      completed: true,
    })
  })

  it('falls back to created_at when the platform recorded no submission time', () => {
    const rows = buildApplicationTimeline(application({ status: 'submitted', submitted_at: null }))
    expect(rows[0].date).toBe(BASE.created_at)
  })

  it('adds a scheduled interview step and marks a past interview complete', () => {
    const past = buildApplicationTimeline(
      application({
        interview: { id: 'iv', scheduled_at: '2020-01-01T09:00:00Z', status: 'scheduled' },
      } as Partial<ApplicationWithDetails>),
    )
    const interviewRow = past.find((row) => row.status === 'interview_scheduled')
    expect(interviewRow?.completed).toBe(true)

    const future = buildApplicationTimeline(
      application({
        interview: { id: 'iv', scheduled_at: '2099-01-01T09:00:00Z', status: 'scheduled' },
      } as Partial<ApplicationWithDetails>),
    )
    expect(future.find((row) => row.status === 'interview_scheduled')?.completed).toBe(false)
  })

  it('omits a cancelled interview entirely', () => {
    const rows = buildApplicationTimeline(
      application({
        interview: { id: 'iv', scheduled_at: '2026-02-01T09:00:00Z', status: 'cancelled' },
      } as Partial<ApplicationWithDetails>),
    )
    expect(rows.some((row) => row.status === 'interview_scheduled')).toBe(false)
  })

  it('adds the review step for every status that has reached or passed review', () => {
    for (const status of [
      'under_review',
      'approved',
      'rejected',
      'waitlisted',
      'conditionally_approved',
      'enrolled',
      'enrollment_expired',
    ]) {
      const rows = buildApplicationTimeline(application({ status }))
      const review = rows.find((row) => row.status === 'under_review')
      expect(review, status).toBeTruthy()
      // Still under review means the step is in progress; anything later means done.
      expect(review?.completed, status).toBe(status !== 'under_review')
    }
  })

  it('does not add the review step before review has started', () => {
    for (const status of ['draft', 'submitted', 'withdrawn', 'expired']) {
      const rows = buildApplicationTimeline(application({ status }))
      expect(rows.some((row) => row.status === 'under_review'), status).toBe(false)
    }
  })

  it('names each decision with its own sentence', () => {
    const cases: Array<[string, string]> = [
      ['approved', 'Application approved'],
      ['conditionally_approved', 'Application conditionally approved'],
      ['rejected', 'Application not successful'],
    ]
    for (const [status, description] of cases) {
      const rows = buildApplicationTimeline(application({ status }))
      expect(rows.some((row) => row.description === description), status).toBe(true)
    }
  })

  it('prefers the recorded decision date over the row timestamp', () => {
    const rows = buildApplicationTimeline(
      application({ status: 'approved', decision_date: '2026-01-07T00:00:00Z' } as Partial<ApplicationWithDetails>),
    )
    expect(rows.find((row) => row.status === 'approved')?.date).toBe('2026-01-07T00:00:00Z')
  })

  it('shows an enrolled application as approved and then enrolled', () => {
    const rows = buildApplicationTimeline(application({ status: 'enrolled' }))
    const statuses = rows.map((row) => row.status)
    expect(statuses).toContain('approved')
    expect(statuses).toContain('enrolled')
    expect(statuses.indexOf('approved')).toBeLessThan(statuses.indexOf('enrolled'))
  })

  it('distinguishes an expired application from an expired enrollment window', () => {
    expect(
      buildApplicationTimeline(application({ status: 'expired' })).at(-1)?.description,
    ).toBe('Application expired')
    expect(
      buildApplicationTimeline(application({ status: 'enrollment_expired' })).at(-1)?.description,
    ).toBe('Enrollment confirmation window expired')
  })

  it('records a withdrawal as its own final step', () => {
    expect(
      buildApplicationTimeline(application({ status: 'withdrawn' })).at(-1),
    ).toMatchObject({ status: 'withdrawn', description: 'Application withdrawn', completed: true })
  })

  it('reads an unscheduled or unparseable interview time as still to be confirmed', () => {
    expect(formatInterviewDateTime(null)).toBe('To be confirmed')
    expect(formatInterviewDateTime(undefined)).toBe('To be confirmed')
    expect(formatInterviewDateTime('')).toBe('To be confirmed')
    expect(formatInterviewDateTime('not a date')).toBe('To be confirmed')
  })
})

// ---------------------------------------------------------------------------
// 2. The copy the student reads about their own fee
// ---------------------------------------------------------------------------
describe('resolvePaymentStatusDescription selects the fee sentence', () => {
  const cases: Array<[string, boolean, string, string]> = [
    ['verified', false, 'submitted', 'Your application fee has been verified and recorded successfully.'],
    ['pending_review', false, 'submitted', 'Your recent payment is awaiting review by the admissions team.'],
    ['rejected', false, 'submitted', 'Your recent payment needs attention before your application can continue.'],
    ['deferred', true, 'submitted', 'You chose to pay this fee later. You can complete it whenever you are ready.'],
    ['not_paid', false, 'draft', 'Payment is completed in the wizard when you are ready to submit this draft.'],
    ['not_paid', false, 'submitted', 'Payment still needs attention before review can continue.'],
  ]

  it.each(cases)(
    '%s (deferred=%s, application=%s)',
    (normalizedPaymentStatus, hasDeferredFee, applicationStatus, expected) => {
      expect(
        resolvePaymentStatusDescription({ normalizedPaymentStatus, hasDeferredFee, applicationStatus }),
      ).toBe(expected)
    },
  )

  it('never leaves a student without a sentence, whatever the server sends', () => {
    // The dead end R13 exists to close: a status with no copy is a student
    // reading nothing about money they may still owe.
    for (const status of ['', 'unknown', 'force_approved', 'paid', 'successful', 'expired']) {
      const copy = resolvePaymentStatusDescription({
        normalizedPaymentStatus: status,
        hasDeferredFee: false,
        applicationStatus: 'submitted',
      })
      expect(copy.length, status).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. The rest of the page's derived labels
// ---------------------------------------------------------------------------
describe('buildWorkspacePresentation derives every label from the row', () => {
  it('titles the page with the application number, or names the page when there is none', () => {
    expect(buildWorkspacePresentation(application({ application_number: 'APP-20260105-AB12CD34' })).applicationTitle)
      .toBe('Application #APP-20260105-AB12CD34')
    expect(buildWorkspacePresentation(application({ application_number: null })).applicationTitle)
      .toBe('Application status')
  })

  it('says Started on for a draft and Submitted on afterwards', () => {
    expect(buildWorkspacePresentation(application({ status: 'draft' })).applicationSubtitle)
      .toContain('Started on')
    expect(buildWorkspacePresentation(application({ status: 'submitted' })).applicationSubtitle)
      .toContain('Submitted on')
  })

  it('names the programme, and falls back rather than printing an empty subtitle', () => {
    expect(buildWorkspacePresentation(application({ program: null })).applicationSubtitle)
      .toContain('Programme pending')
  })

  it('reads the institution display snapshot, preferring the explicit name', () => {
    expect(
      buildWorkspacePresentation(
        application({ institution_name: 'Example Health Institute', institution: 'EHI' } as Partial<ApplicationWithDetails>),
      ).institutionLabel,
    ).toBe('Example Health Institute')
    expect(
      buildWorkspacePresentation(application({ institution: 'EHI' } as Partial<ApplicationWithDetails>)).institutionLabel,
    ).toBe('EHI')
    expect(buildWorkspacePresentation(application({})).institutionLabel).toBe('Not provided')
  })

  it('treats a deferral as a fee still owed, and names the student\u2019s own choice', () => {
    const deferred = buildWorkspacePresentation(application({ payment_status: 'deferred' }))
    expect(deferred.hasDeferredFee).toBe(true)
    expect(deferred.paymentStatusDescription).toContain('You chose to pay this fee later')
  })

  it('surfaces a payment review note only when the platform recorded one', () => {
    expect(
      buildWorkspacePresentation(
        application({ last_payment_audit_notes: '  Reference did not match.  ' } as Partial<ApplicationWithDetails>),
      ).paymentReviewNote,
    ).toBe('Reference did not match.')
    for (const value of [null, undefined, '', '   ']) {
      expect(
        buildWorkspacePresentation(
          application({ last_payment_audit_notes: value } as Partial<ApplicationWithDetails>),
        ).paymentReviewNote,
        String(value),
      ).toBeNull()
    }
  })

  it('renders the status as an upper-case human label', () => {
    expect(buildWorkspacePresentation(application({ status: 'conditionally_approved' })).statusLabel)
      .toBe('CONDITIONALLY APPROVED')
  })
})

describe('the workspace\u2019s two string helpers', () => {
  it('formatStatusLabel replaces underscores and title-cases each word', () => {
    expect(formatStatusLabel('enrollment_expired')).toBe('Enrollment Expired')
    expect(formatStatusLabel('draft')).toBe('Draft')
    expect(formatStatusLabel('')).toBe('')
  })

  it('truncateValue only truncates past the limit, and answers null for nothing', () => {
    expect(truncateValue('short', 40)).toBe('short')
    expect(truncateValue('x'.repeat(41), 40)).toBe(`${'x'.repeat(40)}\u2026`)
    expect(truncateValue('x'.repeat(40), 40)).toBe('x'.repeat(40))
    expect(truncateValue(null, 40)).toBeNull()
    expect(truncateValue(undefined, 40)).toBeNull()
    expect(truncateValue('', 40)).toBeNull()
  })
})
