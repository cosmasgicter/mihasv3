/**
 * R7 exploration: the staff decision controls (fixed in task 5).
 *
 * Spec: student-journey-repair task 1.7, clauses 1.35 and 1.36 (design R7-b, R7-c).
 *
 * At HEAD Approve is disabled unless payment is `verified`, although the server
 * approves every status in `RESOLVED_PAYMENT_STATUSES`, including `deferred`; and
 * "Conditional" sends the status change immediately, with no conditions, which
 * creates a conditional offer the student cannot meet.
 *
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApplicationApprovalActions } from '@/components/admin/applications/ApplicationApprovalActions'

const APP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function renderUnderReview(paymentStatus: string, onStatusUpdate = vi.fn(async () => undefined)) {
  render(
    <ApplicationApprovalActions
      applicationId={APP_ID}
      currentStatus="under_review"
      currentPaymentStatus={paymentStatus}
      onStatusUpdate={onStatusUpdate}
      onPaymentStatusUpdate={vi.fn(async () => undefined)}
    />,
  )
  return onStatusUpdate
}

function tomorrow(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

describe('staff decisions (clauses 1.35, 1.36)', () => {
  it('Approve is enabled when the student deferred payment', () => {
    renderUnderReview('deferred')

    const approve = screen.getByRole('button', { name: /approve/i })
    expect((approve as HTMLButtonElement).disabled).toBe(false)
  })

  it('Conditional opens a dialog and sends at least one condition', async () => {
    const onStatusUpdate = renderUnderReview('verified')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /conditional/i }))
    })

    // HEAD: the status change is sent at once, with no conditions and no dialog.
    expect(onStatusUpdate).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    const description = within(dialog).getAllByRole('textbox')[0]
    fireEvent.change(description, { target: { value: 'Submit a certified transcript' } })
    const deadline = dialog.querySelector<HTMLInputElement>('input[type="date"]')
    expect(deadline).not.toBeNull()
    fireEvent.change(deadline!, { target: { value: tomorrow() } })
    const confirm = within(dialog)
      .getAllByRole('button')
      .filter((button) => !/cancel|add|remove|close/i.test(button.textContent ?? ''))
      .at(-1)!
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(onStatusUpdate).toHaveBeenCalledTimes(1)
    const args = onStatusUpdate.mock.calls[0] as unknown[]
    expect(args[1]).toBe('conditionally_approved')
    const carrier = args.find(
      (arg): arg is { conditions: Array<{ description: string; deadline: string }> } =>
        Boolean(arg) && typeof arg === 'object' && Array.isArray((arg as { conditions?: unknown }).conditions),
    )
    expect(carrier?.conditions.length).toBeGreaterThanOrEqual(1)
    expect(carrier?.conditions[0]).toMatchObject({
      description: 'Submit a certified transcript',
      deadline: tomorrow(),
    })
  })
})
