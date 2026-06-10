/**
 * AssignmentRecoveryPanel — recoverable assignment-failure UI (R10.4, R2.6, R2.7).
 *
 * Asserts the panel never dead-ends the student: it always renders a
 * "choose another intake" affordance, surfaces contact-admissions, conditionally
 * shows the interest-list affordance, and exposes its accessible alert role.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

import AssignmentRecoveryPanel from '@/pages/student/applicationWizard/steps/AssignmentRecoveryPanel'
import { resolveAssignmentRecovery } from '@/pages/student/applicationWizard/lib/assignmentRecovery'

afterEach(cleanup)

describe('AssignmentRecoveryPanel', () => {
  it('renders an accessible alert with the failure code as a data attribute', () => {
    const guidance = resolveAssignmentRecovery({ code: 'NO_ELIGIBLE_OFFERING', programName: 'Nursing' })
    render(<AssignmentRecoveryPanel guidance={guidance} onChangeIntake={() => {}} />)

    const panel = screen.getByTestId('assignment-recovery-panel')
    expect(panel.getAttribute('role')).toBe('alert')
    expect(panel.getAttribute('data-failure-code')).toBe('NO_ELIGIBLE_OFFERING')
    expect(screen.getByRole('heading', { name: guidance.title })).toBeTruthy()
  })

  it('always offers "choose another intake" (never a dead-end)', () => {
    const guidance = resolveAssignmentRecovery({ code: 'OFFERING_CAPACITY_FULL' })
    const onChangeIntake = vi.fn()
    render(<AssignmentRecoveryPanel guidance={guidance} onChangeIntake={onChangeIntake} />)

    fireEvent.click(screen.getByRole('button', { name: /choose another intake/i }))
    expect(onChangeIntake).toHaveBeenCalledTimes(1)
  })

  it('records interest when the interest-list action is used', () => {
    const guidance = resolveAssignmentRecovery({ code: 'NO_ELIGIBLE_OFFERING' })
    const onJoin = vi.fn()
    render(
      <AssignmentRecoveryPanel
        guidance={guidance}
        onChangeIntake={() => {}}
        onJoinInterestList={onJoin}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /join the interest list/i }))
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it('shows a confirmation instead of the button once interest is recorded', () => {
    const guidance = resolveAssignmentRecovery({ code: 'NO_ELIGIBLE_OFFERING' })
    render(
      <AssignmentRecoveryPanel
        guidance={guidance}
        onChangeIntake={() => {}}
        onJoinInterestList={() => {}}
        interestRecorded
      />,
    )

    expect(screen.queryByRole('button', { name: /join the interest list/i })).toBeNull()
    expect(screen.getByText(/on the interest list/i)).toBeTruthy()
  })

  it('routes contact admissions to a mailto link when available, else the contact page', () => {
    const guidance = resolveAssignmentRecovery({ code: 'NO_ELIGIBLE_OFFERING' })
    const { rerender } = render(
      <AssignmentRecoveryPanel
        guidance={guidance}
        onChangeIntake={() => {}}
        contactMailto="mailto:admissions@example.edu?subject=Help"
      />,
    )
    const mailLink = screen.getByRole('link', { name: /contact admissions/i })
    expect(mailLink.getAttribute('href')).toBe('mailto:admissions@example.edu?subject=Help')

    rerender(
      <AssignmentRecoveryPanel guidance={guidance} onChangeIntake={() => {}} contactMailto={null} />,
    )
    expect(screen.getByRole('link', { name: /contact admissions/i }).getAttribute('href')).toBe('/contact')
  })

  it('only offers retry for transient/unknown failures (not stable-code failures)', () => {
    const onRetry = vi.fn()
    const transient = resolveAssignmentRecovery({ code: null })
    const { rerender } = render(
      <AssignmentRecoveryPanel guidance={transient} onChangeIntake={() => {}} onRetry={onRetry} />,
    )
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()

    // For a stable-code failure the parent omits onRetry — no retry button.
    const stable = resolveAssignmentRecovery({ code: 'OFFERING_NO_LONGER_AVAILABLE' })
    rerender(<AssignmentRecoveryPanel guidance={stable} onChangeIntake={() => {}} />)
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull()
  })
})
