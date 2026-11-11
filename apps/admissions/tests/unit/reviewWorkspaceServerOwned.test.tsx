/**
 * The review workspace is the server's, and every write is versioned
 * (Admissions V2, task 9.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4
 * Requirements: R8.3, R8.4, R8.5, R8.7, R11.3
 * Findings: AUTH-01, AUTH-02, AUTH-03, API-02, MAINT-01
 *
 * These are wiring tests, and each one names a defect the workspace had:
 *
 * * the six-call composition (R8.5) — asserted by counting requests;
 * * the generative "AI" tab (R11.1) — asserted by its absence from the source and
 *   from the request log;
 * * commands sent without a version (task 9.4) — asserted on the wire;
 * * controls gated on a role tier rather than the backend's capability answer
 *   (AUTH-02) — asserted by rendering the same application for two actors;
 * * amendment and condition paths with no control at all (R8.3) — asserted by
 *   pressing them.
 *
 * A source scan closes the loop: several of these defects can only regress by a
 * *specific* line reappearing, and a rendering test cannot see a line that is not
 * on the current tab.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApplicationReviewWorkspace } from '@/components/admin/applications/ApplicationReviewWorkspace'
import {
  NO_WORKSPACE_CAPABILITIES,
  type ReviewWorkspace,
} from '@/services/admin/reviewWorkspace'

// ---------------------------------------------------------------------------
// Transport double: one recorded request log, no network
// ---------------------------------------------------------------------------

interface RecordedRequest {
  endpoint: string
  method: string
  body: Record<string, unknown> | null
}

const requests: RecordedRequest[] = []
let workspaceResponse: ReviewWorkspace
let commandOutcome: unknown = { version: 8 }
let commandError: unknown = null

vi.mock('@/services/client', () => ({
  apiClient: {
    request: vi.fn(async (endpoint: string, options?: { method?: string; body?: string }) => {
      const method = (options?.method ?? 'GET').toUpperCase()
      requests.push({
        endpoint,
        method,
        body: options?.body ? (JSON.parse(options.body) as Record<string, unknown>) : null,
      })
      if (method === 'GET') return workspaceResponse
      if (commandError) throw commandError
      return commandOutcome
    }),
  },
  buildQueryString: (params: Record<string, unknown>) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
    })
    const query = search.toString()
    return query ? `?${query}` : ''
  },
  toApiV1Path: (path: string) => path,
}))

vi.mock('@/services/applications', () => ({
  applicationService: {
    getAssignmentCandidates: vi.fn(async () => [
      { id: 'reviewer-1', full_name: 'Reviewer One', email: 'r1@example.com' },
    ]),
  },
}))

vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildWorkspace(overrides: Partial<ReviewWorkspace> = {}): ReviewWorkspace {
  return {
    application_id: 'app-1',
    version: 7,
    status: 'under_review',
    identity: {
      application_id: 'app-1',
      application_number: 'APP-20260808-AAAA',
      public_tracking_code: 'TRK-1',
      full_name: 'Chipo Banda',
      email: 'chipo@example.com',
      phone: '+260970000001',
      date_of_birth: '2003-04-01',
      sex: 'Female',
      nationality: 'Zambian',
      nrc_number: '123456/78/9',
      passport_number: null,
      student_user_id: 'student-1',
    },
    answers: {
      residence_town: 'Lusaka',
      address_line_1: null,
      address_line_2: null,
      postal_code: null,
      next_of_kin_name: 'Mary Banda',
      next_of_kin_phone: null,
      additional_subjects: null,
      declared_program: 'Clinical Medicine',
      declared_intake: 'July 2026',
      declared_institution: 'Example School',
    },
    assignment: {
      institution_id: 'inst-1',
      institution_name: 'Example School',
      institution_code: 'EX',
      canonical_program_id: 'canon-1',
      canonical_program_name: 'Clinical Medicine',
      program_offering_id: 'offer-1',
      program_offering_name: 'Clinical Medicine',
      intake_id: 'intake-1',
      intake_name: 'July 2026',
      configuration_version: 'v1',
      assignment_version: 1,
      assigned_reviewer: null,
      is_late_submission: false,
      waitlist_position: null,
      submitted_at: '2026-08-01T09:00:00Z',
      created_at: '2026-07-30T09:00:00Z',
      updated_at: '2026-08-02T09:00:00Z',
      enrollment_confirmation_deadline: null,
      intake_capacity: 100,
      intake_enrollment: 10,
    },
    evidence: {
      documents: [
        {
          id: 'doc-1',
          document_type: 'nrc',
          document_name: 'nrc.pdf',
          verification_status: 'pending',
          verified_by: null,
          verified_at: null,
          verification_notes: null,
          version: 1,
          is_current: true,
          lifecycle_state: 'ready_for_review',
          file_size: 1024,
          mime_type: 'application/pdf',
          system_generated: false,
          uploaded_at: '2026-08-01T09:00:00Z',
        },
      ],
      documents_truncated: false,
      current_document_count: 1,
      verified_document_count: 0,
      grades: [{ id: 'g1', subject_id: 's1', subject_name: 'Mathematics', grade: 2 }],
      grade_count: 1,
    },
    payment: {
      application_payment_status: 'successful',
      application_fee: '150.00',
      records: [],
      record_count: 0,
      fee_waiver: null,
    },
    interview: { current: null, records: [], record_count: 0 },
    conditions: {
      records: [
        {
          id: 'cond-1',
          description: 'Submit certified results',
          condition_type: 'academic',
          deadline: '2026-09-01',
          status: 'pending',
          met_at: null,
          verified_by: null,
          notes: null,
          created_at: '2026-08-01T09:00:00Z',
        },
      ],
      record_count: 1,
      open_count: 1,
    },
    amendments: {
      records: [
        {
          id: 'amd-1',
          field_name: 'phone',
          old_value: '+260970000001',
          new_value: '+260970000999',
          reason: 'Changed number',
          status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          created_at: '2026-08-02T09:00:00Z',
        },
      ],
      record_count: 1,
      pending_count: 1,
    },
    communication: {
      admin_feedback: null,
      admin_feedback_at: null,
      admin_feedback_by: null,
      notifications: [],
      notification_count: 0,
    },
    history: { records: [], record_count: 0, truncated: false },
    readiness: {
      application_id: 'app-1',
      status: 'under_review',
      programme: 'Clinical Medicine',
      intake: 'July 2026',
      institution: 'Example School',
      checks: [
        {
          code: 'payment_gate',
          label: 'Payment gate',
          state: 'satisfied',
          detail: { payment_state: 'resolved' },
        },
        {
          code: 'required_documents',
          label: 'Required documents',
          state: 'blocked',
          detail: { required: 2, uploaded: 1, missing_required: ['result_slip'] },
        },
      ],
      blocked_checks: ['required_documents'],
      attention_checks: [],
      can_submit: false,
      allowed_next_actions: [{ type: 'upload_document', message: 'Upload the result slip.' }],
      evaluated_at: '2026-08-08T09:00:00Z',
    },
    allowed_next_actions: [{ type: 'upload_document', message: 'Upload the result slip.' }],
    allowed_transitions: ['approved', 'rejected', 'waitlisted'],
    capabilities: {
      ...NO_WORKSPACE_CAPABILITIES,
      review_decision: true,
      review_amendment: true,
      verify_condition: true,
      verify_document: true,
      verify_payment: true,
      manage_interview: true,
      assign_reviewer: true,
      grant_fee_waiver: true,
    },
    redaction: { applied: true, withheld_fields: ['other_tenant_application_count'] },
    definitions: { readiness: 'A deterministic checklist of verified facts.' },
    row_limit: 100,
    ...overrides,
  }
}

const rosterRow = {
  id: 'app-1',
  application_number: 'APP-20260808-AAAA',
  full_name: 'Chipo Banda',
  email: 'chipo@example.com',
  program: 'Clinical Medicine',
  intake: 'July 2026',
  status: 'under_review',
  payment_status: 'successful',
} as never

function renderWorkspace(workspace: ReviewWorkspace = buildWorkspace()) {
  workspaceResponse = workspace
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ApplicationReviewWorkspace
        applicationId="app-1"
        seed={rosterRow}
        layout="pane"
        updating={null}
        onClose={vi.fn()}
        onSendNotification={vi.fn()}
        onUpdateStatus={vi.fn(async () => ({}))}
      />
    </QueryClientProvider>,
  )
}

/** The section list that replaced the tabs (task 30.2): one nav, one button per section. */
const sectionList = () => screen.getByRole('navigation', { name: 'Review sections' })
const reads = () => requests.filter((r) => r.method === 'GET')
/**
 * The detail read. Every section is rendered on open since task 30.2, so the
 * official-documents list (a different resource, the one other per-application
 * read the spec allows) is requested with it instead of when a Documents tab is
 * chosen. "One read" is a claim about the detail query, so it counts that one.
 */
const detailReads = () => reads().filter((r) => r.endpoint === '/admin/applications/app-1/')
const writes = () => requests.filter((r) => r.method !== 'GET')

/**
 * Wait until the *workspace payload* is rendered, not merely the dialog.
 *
 * The header renders from the roster row this modal was opened with, so
 * `findByText(applicant name)` resolves before the one read has answered.
 * `data-workspace-version` is only set once the server's payload is in hand, so
 * it is the honest signal that the sections under test exist.
 */
async function workspaceLoaded() {
  const dialog = await screen.findByTestId('review-workspace')
  await waitFor(() => expect(dialog.getAttribute('data-workspace-version')).toBeTruthy())
  return dialog
}

beforeEach(() => {
  requests.length = 0
  commandError = null
  commandOutcome = { version: 8 }
})

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------

describe('the review workspace is one read (R8.5)', () => {
  it('opens an application with exactly one detail request', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    await waitFor(() => expect(detailReads().length).toBeGreaterThan(0))
    expect(detailReads()).toHaveLength(1)
    // Anything else is the official-documents list and nothing else.
    expect(
      reads()
        .filter((r) => r.endpoint !== '/admin/applications/app-1/')
        .map((r) => r.endpoint),
    ).toEqual(['/applications/app-1/official-documents/'])
  })

  it('issues none of the six retired per-application reads', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    const retired = [
      '/details/',
      '/documents/',
      '/grades/',
      '/summary/',
      '/interviews/',
      '/payments/?application_id',
      '/admin-summary/',
    ]
    for (const fragment of retired) {
      expect(
        requests.some((request) => request.endpoint.includes(fragment)),
        `the workspace still calls ${fragment}`,
      ).toBe(false)
    }
  })

  it('renders the deterministic readiness checklist and no AI section', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    // The section list itself: "AI" is gone, "Readiness" is there.
    await workspaceLoaded()
    const names = within(sectionList())
      .getAllByRole('button')
      .map((button) => button.textContent ?? '')
    expect(names).toContain('Readiness')
    expect(names.join(' ')).not.toMatch(/\bAI\b/)
    fireEvent.click(within(sectionList()).getByRole('button', { name: /readiness/i }))
    expect(await screen.findByTestId('review-readiness')).toBeTruthy()
    expect(screen.getByTestId('readiness-check-payment_gate').getAttribute('data-state')).toBe(
      'satisfied',
    )
    expect(
      screen.getByTestId('readiness-check-required_documents').getAttribute('data-state'),
    ).toBe('blocked')
    // Still one read: switching tabs does not fetch a section.
    expect(detailReads()).toHaveLength(1)
  })

  it('says readiness is unavailable rather than showing an empty checklist', async () => {
    renderWorkspace(buildWorkspace({ readiness: null }))
    await screen.findByText('Chipo Banda')
    fireEvent.click(within(sectionList()).getByRole('button', { name: /readiness/i }))

    expect(await screen.findByTestId('readiness-unavailable')).toBeTruthy()
    expect(screen.queryByTestId('review-readiness')).toBeNull()
  })

  /**
   * Every section is a button with visible text and a heading (task 30.2, R17.7).
   *
   * The tabs needed an `aria-label` because their text was hidden under `sm`.
   * The section list shows its text at every width, so the accessible name is the
   * visible text (WCAG 2.5.3) with nothing to keep in step, and each of the seven
   * sections has a heading to land on.
   */
  it('names every section by its visible text and gives each a heading', async () => {
    renderWorkspace()
    await workspaceLoaded()
    const buttons = within(sectionList()).getAllByRole('button')
    expect(buttons).toHaveLength(7)
    for (const button of buttons) {
      expect(button.getAttribute('aria-label')).toBeNull()
      expect(button.textContent?.trim()).toBeTruthy()
    }
    for (const name of [
      'Overview',
      'Readiness',
      'Academic',
      'Documents',
      'Payment',
      'Interview',
      'History',
    ]) {
      expect(
        within(sectionList()).getByRole('button', { name }),
        `no section button named ${name}`,
      ).toBeTruthy()
      expect(
        screen.getByRole('heading', { level: 2, name }),
        `no section heading named ${name}`,
      ).toBeTruthy()
    }
  })
})
describe('every write is a versioned command (R8.4)', () => {
  it('sends the version the read returned with an amendment decision', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    fireEvent.click(await screen.findByTestId('amendment-approve-amd-1'))

    await waitFor(() => expect(writes()).toHaveLength(1))
    const write = writes()[0]!
    expect(write.endpoint).toBe('/applications/app-1/amendments/amd-1/review/')
    expect(write.body).toMatchObject({ status: 'approved', expected_version: 7 })
  })

  // Task 10.6 (R13.9, R13.13, findings STU-23 / STU-16): the reviewer's condition
  // decision goes through the canonical three-outcome `/review/` route. The
  // two-outcome `/verify/` front door could not express `changes_required`, so a
  // reviewer who needed *different* evidence had to accept it or reject the offer.
  it('sends the version with a condition decision, on the canonical route', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    fireEvent.click(await screen.findByTestId('condition-met-cond-1'))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]!.endpoint).toBe('/applications/app-1/conditions/cond-1/review/')
    expect(writes()[0]!.body).toMatchObject({ outcome: 'met', expected_version: 7 })
  })

  it('offers the third outcome, and requires the reason the student reads', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    const ask = await screen.findByTestId('condition-changes-cond-1')
    // Without a reason the control is refused locally rather than by a 400 — the
    // server still enforces it, but a reviewer should not have to discover the
    // rule by being rejected.
    expect((ask as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(await screen.findByTestId('condition-reason-cond-1'), {
      target: { value: 'The transcript is not certified; please send a certified copy.' },
    })
    expect((ask as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(ask)

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]!.endpoint).toBe('/applications/app-1/conditions/cond-1/review/')
    expect(writes()[0]!.body).toMatchObject({
      outcome: 'changes_required',
      reason: 'The transcript is not certified; please send a certified copy.',
      expected_version: 7,
    })
  })

  it('sends the version with a reviewer assignment (AUTH-03: a real candidate id)', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    fireEvent.click(await screen.findByTestId('assign-reviewer-open'))
    fireEvent.click(await screen.findByRole('option', { name: /Reviewer One/i }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]!.endpoint).toBe('/applications/app-1/assign/')
    expect(writes()[0]!.body).toMatchObject({ reviewer_id: 'reviewer-1', expected_version: 7 })
  })

  it('refetches after a version conflict instead of only reporting a failure', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')
    expect(detailReads()).toHaveLength(1)

    commandError = { status: 409, code: 'VERSION_CONFLICT' }
    fireEvent.click(await screen.findByTestId('amendment-approve-amd-1'))

    // The conflict means someone else decided first: the workspace is re-read so
    // the newer decision is what the reviewer sees.
    await waitFor(() => expect(detailReads().length).toBeGreaterThan(1))
  })

  it('never sends a command body without a version', async () => {
    renderWorkspace()
    await screen.findByText('Chipo Banda')

    fireEvent.click(await screen.findByTestId('amendment-approve-amd-1'))
    // A waiver needs the reason the server requires (task 10.6): it is an
    // authorized exception to a published condition, so it is stated, not silent.
    fireEvent.change(await screen.findByTestId('condition-reason-cond-1'), {
      target: { value: 'Equivalent qualification already verified on file.' },
    })
    fireEvent.click(await screen.findByTestId('condition-waive-cond-1'))

    await waitFor(() => expect(writes().length).toBeGreaterThanOrEqual(2))
    for (const write of writes()) {
      expect(write.body, `${write.endpoint} sent no body`).toBeTruthy()
      expect(
        typeof write.body?.expected_version,
        `${write.endpoint} sent no expected_version`,
      ).toBe('number')
    }
  })
})

/**
 * The three paths that stayed on legacy wiring until the workspace took them
 * over: evidence verification, the payment decision, and interview scheduling.
 *
 * Each was issued by its own panel, unversioned, and offered to anyone who could
 * open the workspace. Each is now the same versioned command as a decision, gated
 * on the server's own answer for that command.
 */
describe('evidence, payment, and interview are workspace commands too (R8.3/R8.4)', () => {
  it('verifies a document as a versioned command, not a panel-owned fetch', async () => {
    renderWorkspace()
    await workspaceLoaded()
    fireEvent.click(within(sectionList()).getByRole('button', { name: /documents/i }))

    fireEvent.click(await screen.findByTestId('document-verify-doc-1'))

    await waitFor(() => expect(writes()).toHaveLength(1))
    const write = writes()[0]!
    expect(write.endpoint).toBe('/applications/app-1/verify-document/')
    expect(write.body).toMatchObject({
      documentId: 'doc-1',
      status: 'verified',
      expected_version: 7,
    })
  })

  it('offers no verify control without tenant.document.verify', async () => {
    renderWorkspace(
      buildWorkspace({
        capabilities: { ...NO_WORKSPACE_CAPABILITIES, review_decision: true },
      }),
    )
    await workspaceLoaded()
    fireEvent.click(within(sectionList()).getByRole('button', { name: /documents/i }))

    // The document is still readable — this is a read-and-deny, not a hide.
    expect(await screen.findByText('nrc.pdf')).toBeTruthy()
    expect(screen.queryByTestId('document-verify-doc-1')).toBeNull()
    expect(screen.queryByTestId('document-reject-doc-1')).toBeNull()
  })

  it('records a payment decision through the versioned review command', async () => {
    renderWorkspace(
      buildWorkspace({
        payment: {
          application_payment_status: 'pending_review',
          application_fee: '150.00',
          records: [],
          record_count: 0,
          fee_waiver: null,
        },
      }),
    )
    await workspaceLoaded()

    // The control, then the confirmation the reviewer has to give it.
    fireEvent.click(screen.getByRole('button', { name: /^verify$/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^verify payment$/i }))

    await waitFor(() => expect(writes()).toHaveLength(1))
    const write = writes()[0]!
    expect(write.endpoint).toBe('/applications/app-1/review/')
    expect(write.body).toMatchObject({ payment_status: 'verified', expected_version: 7 })
  })

  it('says why instead of offering a payment control without tenant.payment.verify', async () => {
    renderWorkspace(
      buildWorkspace({
        capabilities: { ...NO_WORKSPACE_CAPABILITIES, review_decision: true },
        payment: {
          application_payment_status: 'pending_review',
          application_fee: '150.00',
          records: [],
          record_count: 0,
          fee_waiver: null,
        },
      }),
    )
    await workspaceLoaded()

    expect(screen.getByTestId('payment-review-read-only')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^verify$/i })).toBeNull()
  })

  it('schedules an interview as a versioned command', async () => {
    renderWorkspace()
    await workspaceLoaded()
    fireEvent.click(within(sectionList()).getByRole('button', { name: /interview/i }))

    fireEvent.change(await screen.findByLabelText(/interview date/i), {
      target: { value: '2026-10-01T10:00' },
    })
    fireEvent.click(screen.getByTestId('interview-save'))

    await waitFor(() => expect(writes()).toHaveLength(1))
    const write = writes()[0]!
    expect(write.endpoint).toBe('/applications/app-1/interviews/')
    expect(write.method).toBe('POST')
    expect(write.body).toMatchObject({ mode: 'in_person', expected_version: 7 })
    expect(typeof write.body?.scheduled_at).toBe('string')
  })

  it('updates the existing interview with PATCH, still versioned', async () => {
    renderWorkspace(
      buildWorkspace({
        interview: {
          current: {
            id: 'int-1',
            scheduled_at: '2026-09-20T10:00:00Z',
            mode: 'in_person',
            location: 'Room 2',
            status: 'scheduled',
            notes: null,
            created_by: null,
            updated_by: null,
            created_at: '2026-09-01T10:00:00Z',
            updated_at: '2026-09-01T10:00:00Z',
          },
          records: [],
          record_count: 1,
        },
      }),
    )
    await workspaceLoaded()
    fireEvent.click(within(sectionList()).getByRole('button', { name: /interview/i }))
    fireEvent.click(await screen.findByTestId('interview-save'))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]!.method).toBe('PATCH')
    expect(writes()[0]!.body).toMatchObject({ expected_version: 7 })
  })

  it('offers no interview form without the review grant', async () => {
    renderWorkspace(buildWorkspace({ capabilities: { ...NO_WORKSPACE_CAPABILITIES } }))
    await workspaceLoaded()
    fireEvent.click(within(sectionList()).getByRole('button', { name: /interview/i }))

    expect(await screen.findByTestId('interview-read-only')).toBeTruthy()
    expect(screen.queryByTestId('interview-save')).toBeNull()
  })
})

describe('controls follow the backend capability matrix (AUTH-02)', () => {
  it('a read-only actor gets the workspace but no command controls', async () => {
    renderWorkspace(buildWorkspace({ capabilities: { ...NO_WORKSPACE_CAPABILITIES } }))
    await workspaceLoaded()

    // The facts are readable...
    expect(screen.getAllByText('Example School').length).toBeGreaterThan(0)
    // ...and every command control is absent.
    expect(screen.queryByTestId('amendment-approve-amd-1')).toBeNull()
    expect(screen.queryByTestId('condition-met-cond-1')).toBeNull()
    expect(screen.queryByTestId('assign-reviewer-open')).toBeNull()
    expect(screen.queryByTestId('fee-waiver-open')).toBeNull()
    // And the surface says why, rather than showing a dead action bar.
    expect(screen.getByTestId('review-read-only')).toBeTruthy()
  })

  it('a reviewer with the review grant gets the decision controls', async () => {
    renderWorkspace()
    await workspaceLoaded()

    expect(screen.queryByTestId('review-read-only')).toBeNull()
    expect(await screen.findByTestId('amendment-approve-amd-1')).toBeTruthy()
    expect(screen.getByTestId('condition-met-cond-1')).toBeTruthy()
  })

  it('an actor without the assignment or waiver grant sees neither control', async () => {
    renderWorkspace(
      buildWorkspace({
        capabilities: {
          ...NO_WORKSPACE_CAPABILITIES,
          review_decision: true,
          review_amendment: true,
          verify_condition: true,
        },
      }),
    )
    await workspaceLoaded()

    expect(screen.queryByTestId('assign-reviewer-open')).toBeNull()
    expect(screen.queryByTestId('fee-waiver-open')).toBeNull()
    // But the decision controls it *does* hold are present.
    expect(screen.getByTestId('amendment-approve-amd-1')).toBeTruthy()
  })
})

describe('the source cannot regress to the retired shapes', () => {
  const read = (relative: string) =>
    readFileSync(join(process.cwd(), relative), 'utf8')

  it('the workspace component holds no multi-call composition and no raw client', () => {
    // The file *documents* the shapes it replaced, so the scan starts after the
    // leading module docstring: what matters is the code, not the history note.
    const whole = read('src/components/admin/applications/ApplicationReviewWorkspace.tsx')
    const source = whole.slice(whole.indexOf('*/') + 2)

    // The six-call composition and its merge.
    expect(source).not.toContain('Promise.allSettled')
    expect(source).not.toContain('applicationService.getById')
    expect(source).not.toContain("include: ['grades'")
    expect(source).not.toContain('...summary.application')
    // The generative panel.
    expect(source).not.toContain('AISummaryPanel')
    expect(source).not.toContain('admin-summary')
    // The transport: this component talks to a domain service, not the client.
    expect(source).not.toContain("from '@/services/client'")
    expect(source).not.toContain('apiClient.request')
  })

  it('the deleted AI panel is gone from the tree', () => {
    expect(() => read('src/components/admin/applications/AISummaryPanel.tsx')).toThrow()
  })

  it('every command in the service takes an expected_version', () => {
    const source = read('src/services/admin/reviewWorkspace.ts')
    // Each command signature composes `VersionedCommand`, so a new command cannot
    // be added without one.
    const commandNames = [
      'decide',
      'reviewPayment',
      'verifyDocument',
      'reviewAmendment',
      // Task 10.6 (R13.9, R13.13): `verifyCondition` (the two-outcome `/verify/`
      // front door) is now `reviewCondition` on the canonical three-outcome route.
      'reviewCondition',
      'scheduleInterview',
      'updateInterview',
      'cancelInterview',
      'assignReviewer',
      'grantFeeWaiver',
    ]
    for (const name of commandNames) {
      const start = source.indexOf(`  ${name}: (`)
      expect(start, `${name} is not a command on the service`).toBeGreaterThan(-1)
      const signature = source.slice(start, source.indexOf('=>', start))
      expect(signature, `${name} does not take a version`).toContain('VersionedCommand')
    }
  })

  it('the capability keys match the backend command matrix', () => {
    // The backend publishes COMMAND_CAPABILITIES; the frontend union must be the
    // same set, or a control would be gated on a key the server never sends.
    const backend = readFileSync(
      join(process.cwd(), '../../backend/apps/applications/review_workspace_service.py'),
      'utf8',
    )
    const block = backend.slice(
      backend.indexOf('COMMAND_CAPABILITIES: dict[str, str] = {'),
      backend.indexOf('#: Detail fields only a platform all-access actor may read.'),
    )
    const backendKeys = [...block.matchAll(/^\s{4}"([a-z_]+)":/gm)].map((m) => m[1]).sort()
    expect(backendKeys.length).toBeGreaterThan(0)
    expect(Object.keys(NO_WORKSPACE_CAPABILITIES).sort()).toEqual(backendKeys)
  })
})
