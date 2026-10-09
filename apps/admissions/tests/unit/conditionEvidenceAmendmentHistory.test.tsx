/**
 * The condition evidence workflow and the amendment history, rendered.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.2.
 * Requirements: R13.9 (per-condition evidence / comment / replacement / review /
 *               rejection reason / history), R13.10 (owner-scoped amendment
 *               list/detail status).
 * Findings:     **STU-16** (conditional offers were read-only for students),
 *               **STU-17** (amendments could not be listed or tracked).
 *
 * What these assert is the half no endpoint test can: that a student looking at a
 * rejected condition is shown the reviewer's reason and offered a replacement
 * control, that a satisfied condition offers nothing, and that the copy on screen
 * is the **server's** — the component invents no status vocabulary of its own,
 * because a client-side status table is how the notification settings drifted
 * away from the delivery path (STU-14).
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConditionsTimeline } from '@/components/student/applicationStatus/ConditionsTimeline'
import {
  AmendmentHistory,
  amendmentFieldLabel,
} from '@/components/student/applicationStatus/AmendmentHistory'
import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import type { StudentAmendment, StudentCondition } from '@/services/applications'

function condition(overrides: Partial<StudentCondition> = {}): StudentCondition {
  return {
    id: overrides.id ?? 'cond-1',
    application_id: 'app-1',
    description: 'Certified copy of your final transcript',
    condition_type: 'document',
    deadline: '2026-09-30',
    days_remaining: 20,
    status: 'pending',
    state: 'pending',
    state_design_name: 'open',
    waiting_on: 'student',
    state_definition: 'This condition is still open. Send the evidence it asks for.',
    met_at: null,
    verified_by: null,
    updated_at: null,
    notes: null,
    review_reason: null,
    evidence: null,
    evidence_versions: 0,
    superseded_evidence: [],
    allowed_actions: ['submit_evidence'],
    evidence_document_type: 'condition_evidence:cond-1',
    history: [],
    ...overrides,
  }
}

function amendment(overrides: Partial<StudentAmendment> = {}): StudentAmendment {
  return {
    id: overrides.id ?? 'amend-1',
    application_id: 'app-1',
    field_name: 'phone',
    new_value: '+260971111111',
    status: 'pending',
    status_definition: 'Waiting for the admissions team.',
    is_terminal: false,
    requested_at: '2026-08-01T09:00:00Z',
    reviewed_at: null,
    ...overrides,
  }
}

describe('ConditionsTimeline — the evidence workflow (STU-16)', () => {
  it('offers an upload control for an open condition', () => {
    render(<ConditionsTimeline conditions={[condition()]} onSubmitEvidence={vi.fn()} />)
    expect(screen.getByLabelText(/attach your evidence/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /send evidence/i })).toBeTruthy()
  })

  it('renders the state definition the server published, not its own copy', () => {
    const server = condition({
      state_definition: 'A sentence only the platform could have written.',
    })
    render(<ConditionsTimeline conditions={[server]} />)
    expect(
      screen.getByText('A sentence only the platform could have written.'),
    ).toBeTruthy()
  })

  it('shows the reviewer reason and a replacement control on a rejected condition', () => {
    const rejected = condition({
      status: 'changes_required',
      state: 'changes_required',
      waiting_on: 'student',
      review_reason: 'That is page 1 of 2 — send the page with the official stamp.',
      evidence: {
        id: 'doc-1',
        document_name: 'wrong.png',
        version: 1,
        is_current: true,
        lifecycle_state: 'ready_for_review',
        mime_type: 'image/png',
        file_size: 120,
        uploaded_at: '2026-08-02T10:00:00Z',
        superseded_at: null,
      },
      evidence_versions: 1,
      allowed_actions: ['submit_evidence'],
    })
    render(<ConditionsTimeline conditions={[rejected]} onSubmitEvidence={vi.fn()} />)
    expect(screen.getByText(/official stamp/i)).toBeTruthy()
    expect(screen.getByText(/wrong\.png/)).toBeTruthy()
    expect(screen.getByLabelText(/attach your evidence/i)).toBeTruthy()
  })

  it('labels the control as a replacement while evidence is under review', () => {
    const submitted = condition({
      status: 'evidence_submitted',
      state: 'evidence_submitted',
      waiting_on: 'school',
      allowed_actions: ['replace_evidence'],
    })
    render(<ConditionsTimeline conditions={[submitted]} onSubmitEvidence={vi.fn()} />)
    expect(screen.getByLabelText(/replace your evidence/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /send a replacement/i })).toBeTruthy()
  })

  it('offers nothing on a condition the server says is finished', () => {
    const met = condition({
      status: 'met',
      state: 'met',
      waiting_on: 'nobody',
      met_at: '2026-08-03T10:00:00Z',
      allowed_actions: [],
    })
    render(<ConditionsTimeline conditions={[met]} onSubmitEvidence={vi.fn()} />)
    expect(screen.queryByLabelText(/evidence/i)).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('never renders a status by colour alone', () => {
    const expired = condition({ status: 'expired', state: 'expired', allowed_actions: [] })
    render(<ConditionsTimeline conditions={[expired]} />)
    // The badge carries the word, so the state is legible without colour vision.
    expect(screen.getByText('EXPIRED')).toBeTruthy()
  })

  it('passes the chosen file and note straight through', () => {
    const onSubmitEvidence = vi.fn()
    render(<ConditionsTimeline conditions={[condition()]} onSubmitEvidence={onSubmitEvidence} />)
    const file = new File(['bytes'], 'transcript.png', { type: 'image/png' })
    const input = screen.getByLabelText(/attach your evidence/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText(/add a note/i), {
      target: { value: 'Stamped copy from the registrar.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send evidence/i }))
    expect(onSubmitEvidence).toHaveBeenCalledWith(
      'cond-1',
      file,
      'Stamped copy from the registrar.',
    )
  })

  it('will not submit without a file', () => {
    const onSubmitEvidence = vi.fn()
    render(<ConditionsTimeline conditions={[condition()]} onSubmitEvidence={onSubmitEvidence} />)
    const button = screen.getByRole('button', { name: /send evidence/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(onSubmitEvidence).not.toHaveBeenCalled()
  })

  it('surfaces a per-condition failure as an assertive alert', () => {
    render(
      <ConditionsTimeline
        conditions={[condition()]}
        onSubmitEvidence={vi.fn()}
        errors={{ 'cond-1': 'That file could not be sent.' }}
      />,
    )
    expect(screen.getByRole('alert').textContent).toContain('That file could not be sent.')
  })

  it('says that earlier versions are kept, because they are', () => {
    const replaced = condition({
      status: 'evidence_submitted',
      state: 'evidence_submitted',
      allowed_actions: ['replace_evidence'],
      evidence_versions: 2,
      superseded_evidence: [
        {
          id: 'doc-1',
          document_name: 'first.png',
          version: 1,
          is_current: false,
          lifecycle_state: 'superseded',
          mime_type: 'image/png',
          file_size: 100,
          uploaded_at: '2026-08-01T10:00:00Z',
          superseded_at: '2026-08-02T10:00:00Z',
        },
      ],
    })
    render(<ConditionsTimeline conditions={[replaced]} />)
    expect(screen.getByText(/1 earlier version kept/i)).toBeTruthy()
  })

  it('renders a read-only view when no submit handler is supplied', () => {
    render(<ConditionsTimeline conditions={[condition()]} />)
    expect(screen.queryByLabelText(/attach your evidence/i)).toBeNull()
  })
})

describe('AmendmentHistory — the tracking STU-17 asked for', () => {
  it('lists a request with its field, value and status', () => {
    render(<AmendmentHistory amendments={[amendment()]} totalCount={1} />)
    const item = screen.getByRole('listitem')
    expect(within(item).getByText(/Phone/)).toBeTruthy()
    expect(within(item).getByText(/\+260971111111/)).toBeTruthy()
    expect(within(item).getByText('PENDING')).toBeTruthy()
  })

  it('renders the definition the server published for each status', () => {
    render(
      <AmendmentHistory
        amendments={[
          amendment({
            status: 'rejected',
            is_terminal: true,
            reviewed_at: '2026-08-05T10:00:00Z',
            status_definition: 'Declined by the admissions team. Your application is unchanged.',
          }),
        ]}
      />,
    )
    expect(
      screen.getByText('Declined by the admissions team. Your application is unchanged.'),
    ).toBeTruthy()
    expect(screen.getByText('REJECTED')).toBeTruthy()
  })

  it('shows an empty state rather than nothing at all', () => {
    render(<AmendmentHistory amendments={[]} totalCount={0} />)
    expect(screen.getByText(/no amendment requests yet/i)).toBeTruthy()
  })

  it('announces loading politely', () => {
    render(<AmendmentHistory amendments={[]} isLoading />)
    expect(screen.getByRole('status').textContent).toMatch(/loading/i)
  })

  it('does not render the reviewing member of staff', () => {
    const approved = amendment({
      status: 'approved',
      is_terminal: true,
      reviewed_at: '2026-08-05T10:00:00Z',
    })
    const { container } = render(<AmendmentHistory amendments={[approved]} />)
    expect(container.textContent).not.toMatch(/reviewed by/i)
  })

  it('says when the page is a subset of the total', () => {
    render(<AmendmentHistory amendments={[amendment()]} totalCount={7} />)
    expect(screen.getByText(/showing 1 of 7 requests/i)).toBeTruthy()
  })

  it('labels a field the server has not seen before without crashing', () => {
    expect(amendmentFieldLabel('phone')).toBe('Phone')
    expect(amendmentFieldLabel('some_new_field')).toBe('Some new field')
  })
})

describe('applicationService — the wiring (task 10.2)', () => {
  it('posts condition evidence as multipart to the condition-scoped path', async () => {
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue(condition() as unknown as never)
    const file = new File(['bytes'], 'transcript.png', { type: 'image/png' })
    await applicationService.submitConditionEvidence('app-1', 'cond-1', {
      file,
      comment: 'A note.',
    })
    expect(request).toHaveBeenCalledTimes(1)
    const [path, options] = request.mock.calls[0]
    expect(path).toBe('/applications/app-1/conditions/cond-1/evidence/')
    expect(options?.method).toBe('POST')
    const body = options?.body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('file')).toBe(file)
    expect(body.get('comment')).toBe('A note.')
    request.mockRestore()
  })

  it('omits an empty note rather than sending a blank one', async () => {
    const request = vi
      .spyOn(apiClient, 'request')
      .mockResolvedValue(condition() as unknown as never)
    await applicationService.submitConditionEvidence('app-1', 'cond-1', {
      file: new File(['bytes'], 'a.png', { type: 'image/png' }),
      comment: '   ',
    })
    const body = request.mock.calls[0][1]?.body as FormData
    expect(body.get('comment')).toBeNull()
    request.mockRestore()
  })

  it('reads the amendment history from the owner-scoped path', async () => {
    const page = { page: 1, pageSize: 20, totalCount: 1, results: [amendment()] }
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue(page as unknown as never)
    const result = await applicationService.listAmendments('app-1', { pageSize: 20 })
    expect(request).toHaveBeenCalledWith('/applications/app-1/amendments/?pageSize=20')
    expect(result.totalCount).toBe(1)
    request.mockRestore()
  })

  it('answers an empty page rather than undefined', async () => {
    const request = vi.spyOn(apiClient, 'request').mockResolvedValue(undefined as unknown as never)
    const result = await applicationService.listAmendments('app-1')
    expect(result.results).toEqual([])
    expect(result.totalCount).toBe(0)
    request.mockRestore()
  })

  it('never sends its own condition status vocabulary', async () => {
    // The service module publishes the *shape* of a condition, not its states:
    // the copy and the permitted actions arrive on the response.
    const source = await import('@/services/applications')
    expect(Object.keys(source)).not.toContain('CONDITION_STATES')
  })
})
