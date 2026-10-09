/**
 * The enrollment readiness the server publishes, rendered.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.3.
 * Requirements: R13.2 (the deadline and readiness on the list/detail contracts),
 *               R13.9 (server-authored readiness).
 * Finding:      **STU-15** — the deadline was absent from the serializers, the UI
 *               offered confirmation only for `approved` although the backend has
 *               always accepted a conditionally approved offer once its
 *               conditions were resolved, and nothing rechecked the conditions.
 *
 * These assert the half no endpoint test can: that a student who has satisfied
 * every condition is *offered* the control, that a blocked student is told why
 * and given something to do instead of a missing button, and that every word on
 * screen is the platform's. The browser adds no vocabulary here — before 10.3 it
 * had its own rule (`status === 'approved'`) and the server disagreed with it.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { NextActionCards } from '@/components/student/applicationStatus/NextActionCards'
import { ApplicationListItem } from '@/components/student/ApplicationListItem'
import {
  canConfirmEnrollment,
  enrollmentMessage,
  enrollmentReadinessOf,
  formatEnrollmentCountdown,
} from '@/lib/enrollmentReadiness'
import type { Application, EnrollmentReadiness } from '@/types/database'

vi.mock('@/services/applications', () => ({
  applicationService: {
    getWaitlistPosition: vi.fn().mockResolvedValue({ position: 0, total: 0 }),
    getConditions: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/services/interviews', () => ({
  interviewsService: { list: vi.fn().mockResolvedValue({ interviews: [] }) },
}))
vi.mock('@/components/student/DocumentButtons', () => ({
  DocumentButtons: () => null,
}))

const HOUR = 3600
const DAY = 86400

function readiness(overrides: Partial<EnrollmentReadiness> = {}): EnrollmentReadiness {
  return {
    application_id: 'app-1',
    status: 'approved',
    state: 'confirmable',
    definition: 'Your place is being held. Confirm your enrollment before the deadline to keep it.',
    deadline: '2026-09-30T23:59:59Z',
    deadline_passed: false,
    seconds_remaining: 5 * DAY,
    days_remaining: 5,
    conditions: {
      total: 0,
      accepted: 0,
      expired: 0,
      outstanding: 0,
      outstanding_conditions: [],
      satisfied: true,
    },
    capacity: {
      canonical: true,
      limit: 40,
      occupied: 12,
      seats_available: 28,
      satisfied: true,
      code: null,
    },
    existing_enrollment: {
      this_application: false,
      other_application_id: null,
      canonical: true,
    },
    blockers: [],
    can_confirm: true,
    allowed_actions: [
      { action: 'confirm-enrollment', label: 'Confirm your enrollment', blocker_code: null },
    ],
    evaluated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

function blocked(code: string, message: string, label: string): EnrollmentReadiness {
  return readiness({
    state: 'blocked',
    can_confirm: false,
    blockers: [
      { code, category: 'enrollment', message, retryable: false, fields: [], details: {} },
    ],
    allowed_actions: [{ action: 'resolve-conditions', label, blocker_code: code }],
  })
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: 'app-1',
    user_id: 'user-1',
    status: 'approved',
    application_number: 'APP-20260101-ABCD1234',
    program: 'Clinical Medicine',
    intake: 'January 2026',
    submitted_at: '2026-01-05T09:00:00Z',
    payment_status: 'successful',
    ...overrides,
  }
}

function renderCards(enrollment: EnrollmentReadiness | null, extra: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter>
      <NextActionCards
        // `paymentAction` was a prop here until admissions-v2 task 11.3: the
        // workspace derived `{href, label}` from a payment helper and handed it
        // down, and the platform's own next action (task 11.1's resolver) now
        // answers that question first on the page. One action, one control.
        applicationStatus={enrollment?.status ?? 'approved'}
        onWithdrawClick={() => {}}
        enrollment={enrollment}
        onEnrollClick={() => {}}
        {...extra}
      />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// 1. Reading the contract
// ---------------------------------------------------------------------------

describe('enrollmentReadinessOf', () => {
  it('returns the readiness the server published', () => {
    const value = readiness()
    expect(enrollmentReadinessOf(application({ enrollment: value }))).toBe(value)
  })

  it('answers null when the platform published nothing', () => {
    // Unknown, never "nothing to do": rendering an absent evaluation as a green
    // tick is the defect shape STU-15 describes.
    expect(enrollmentReadinessOf(application())).toBeNull()
    expect(enrollmentReadinessOf(application({ enrollment: null }))).toBeNull()
    expect(enrollmentReadinessOf(null)).toBeNull()
  })

  it('rejects a payload that is not a readiness', () => {
    expect(
      enrollmentReadinessOf({ enrollment: { nonsense: true } } as unknown as Application)
    ).toBeNull()
  })

  it('never says confirmable without the server saying so', () => {
    expect(canConfirmEnrollment(application({ enrollment: readiness() }))).toBe(true)
    expect(
      canConfirmEnrollment(
        application({ enrollment: readiness({ can_confirm: false, state: 'blocked' }) })
      )
    ).toBe(false)
    expect(canConfirmEnrollment(application())).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. The countdown is the server's number
// ---------------------------------------------------------------------------

describe('formatEnrollmentCountdown', () => {
  it('phrases days, hours, and the last hour', () => {
    expect(formatEnrollmentCountdown(readiness({ seconds_remaining: 5 * DAY }))).toBe(
      '5 days left to confirm'
    )
    expect(formatEnrollmentCountdown(readiness({ seconds_remaining: DAY }))).toBe(
      '1 day left to confirm'
    )
    expect(formatEnrollmentCountdown(readiness({ seconds_remaining: 3 * HOUR }))).toBe(
      '3 hours left to confirm'
    )
    expect(formatEnrollmentCountdown(readiness({ seconds_remaining: 120 }))).toBe(
      'Less than an hour left to confirm'
    )
  })

  it('says the deadline passed rather than clamping to zero', () => {
    // "0 days left" and "the deadline passed" are different facts.
    expect(
      formatEnrollmentCountdown(readiness({ seconds_remaining: 0, deadline_passed: true }))
    ).toBe('Deadline has passed')
    expect(
      formatEnrollmentCountdown(
        readiness({ seconds_remaining: -2 * DAY, deadline_passed: true })
      )
    ).toBe('Deadline passed 2 days ago')
  })

  it('says nothing when there is no deadline to describe', () => {
    expect(
      formatEnrollmentCountdown(readiness({ seconds_remaining: null, deadline: null }))
    ).toBeNull()
    expect(formatEnrollmentCountdown(null)).toBeNull()
  })

  it('reads the server countdown rather than re-deriving it from the deadline', () => {
    // A device with a wrong clock must not talk a student out of a place they
    // still have: the deadline here is in the past, the server says five days
    // remain, and the server wins.
    const value = readiness({ deadline: '2000-01-01T00:00:00Z', seconds_remaining: 5 * DAY })
    expect(formatEnrollmentCountdown(value)).toBe('5 days left to confirm')
  })
})

// ---------------------------------------------------------------------------
// 3. One message, in the server's precedence
// ---------------------------------------------------------------------------

describe('enrollmentMessage', () => {
  it('shows the first blocker, which is the refusal the command would give', () => {
    const value = readiness({
      state: 'blocked',
      can_confirm: false,
      blockers: [
        {
          code: 'CONDITIONS_NOT_MET',
          category: 'enrollment',
          message: 'Every condition on your offer must be accepted or waived first.',
          retryable: false,
          fields: [],
          details: {},
        },
        {
          code: 'DEADLINE_PASSED',
          category: 'enrollment',
          message: 'The enrollment confirmation deadline has passed.',
          retryable: false,
          fields: [],
          details: {},
        },
      ],
    })
    expect(enrollmentMessage(value)).toEqual({
      message: 'Every condition on your offer must be accepted or waived first.',
      blockerCode: 'CONDITIONS_NOT_MET',
    })
  })

  it('falls back to the state definition when nothing is blocking', () => {
    expect(enrollmentMessage(readiness())?.blockerCode).toBeNull()
    expect(enrollmentMessage(readiness())?.message).toContain('Confirm your enrollment')
  })
})

// ---------------------------------------------------------------------------
// 4. The status page surface
// ---------------------------------------------------------------------------

describe('NextActionCards enrollment section', () => {
  it('offers the control when the server says the student may confirm', () => {
    renderCards(readiness())

    expect(screen.getByTestId('enrollment-confirmable')).toBeTruthy()
    expect(screen.getByRole('button', { name: /confirm enrollment/i })).toBeTruthy()
    expect(screen.getByText('5 days left to confirm')).toBeTruthy()
  })

  it('offers the control on a conditional offer whose conditions are resolved', () => {
    // The heart of STU-15: the backend always allowed this, and this surface
    // never did.
    renderCards(readiness({ status: 'conditionally_approved' }))

    expect(screen.getByRole('button', { name: /confirm enrollment/i })).toBeTruthy()
  })

  it('renders the reason and an action instead of a missing button when blocked', () => {
    renderCards(
      blocked(
        'CONDITIONS_NOT_MET',
        'Every condition on your offer must be accepted or waived before you can confirm your enrollment.',
        'Send the evidence your conditions ask for'
      )
    )

    expect(screen.getByTestId('enrollment-blocked')).toBeTruthy()
    expect(screen.getByTestId('enrollment-blocker').textContent).toContain(
      'must be accepted or waived'
    )
    expect(screen.getByText('Send the evidence your conditions ask for')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /confirm enrollment/i })).toBeNull()
  })

  it('renders the platform definition rather than copy of its own', () => {
    const value = readiness({
      definition: 'A sentence only the server could have written.',
    })
    renderCards(value)

    expect(screen.getByText('A sentence only the server could have written.')).toBeTruthy()
  })

  it('renders nothing about enrollment when the readiness is absent', () => {
    renderCards(null)

    expect(screen.queryByTestId('enrollment-confirmable')).toBeNull()
    expect(screen.queryByTestId('enrollment-blocked')).toBeNull()
    expect(screen.queryByRole('button', { name: /confirm enrollment/i })).toBeNull()
  })

  it('renders nothing about enrollment once the place is confirmed', () => {
    renderCards(
      readiness({ state: 'confirmed', status: 'enrolled', can_confirm: false, blockers: [] })
    )

    expect(screen.queryByTestId('enrollment-confirmable')).toBeNull()
    expect(screen.queryByTestId('enrollment-blocked')).toBeNull()
  })

  it('surfaces a failed confirmation without removing the affordance', () => {
    renderCards(readiness(), { enrollError: 'Failed to confirm enrollment' })

    expect(screen.getByText('Failed to confirm enrollment')).toBeTruthy()
    expect(screen.getByRole('button', { name: /confirm enrollment/i })).toBeTruthy()
  })

  it('never signals state by colour alone', () => {
    // Every status colour is paired with an icon or a label.
    const { container } = renderCards(
      blocked('DEADLINE_PASSED', 'The deadline has passed.', 'Contact admissions')
    )
    const section = screen.getByTestId('enrollment-blocked')
    expect(section.textContent).toContain('The deadline has passed.')
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 5. The dashboard list row
// ---------------------------------------------------------------------------

describe('ApplicationListItem enrollment card', () => {
  function renderRow(app: Application) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ApplicationListItem application={app} index={0} />
        </MemoryRouter>
      </QueryClientProvider>
    )
  }

  it('renders the deadline and countdown when the server says confirmable', () => {
    renderRow(application({ enrollment: readiness() }))

    const card = screen.getByTestId('enrollment-confirmable')
    expect(card.textContent).toContain('Confirm enrollment by')
    expect(card.textContent).toContain('5 days left to confirm')
  })

  it('renders the card for a conditional offer whose conditions are resolved', () => {
    renderRow(
      application({
        status: 'conditionally_approved',
        enrollment: readiness({ status: 'conditionally_approved' }),
      })
    )

    expect(screen.getByTestId('enrollment-confirmable')).toBeTruthy()
  })

  it('renders no card when the server has not published a readiness', () => {
    // The pre-10.3 state of the world: the row read a field the server never
    // sent, so the card could not appear at all.
    renderRow(application())

    expect(screen.queryByTestId('enrollment-confirmable')).toBeNull()
  })

  it('renders no card when the readiness is blocked', () => {
    renderRow(
      application({
        enrollment: blocked('DEADLINE_PASSED', 'The deadline has passed.', 'Contact admissions'),
      })
    )

    expect(screen.queryByTestId('enrollment-confirmable')).toBeNull()
  })
})
