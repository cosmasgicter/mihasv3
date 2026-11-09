/**
 * One document surface, one primary action, one sheet — and a list row that adds
 * no prominence of its own (admissions-v2 task **11.3**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.3
 *               ("Show application status/next action first. Use one primary
 *               document action and accessible menu/sheet for download/email and
 *               historical documents; keep live status feedback outside dense
 *               rows.").
 * Requirements: **R13.1** (the next required action before passive detail),
 *               **R13.2** (official-document availability on the application
 *               surface), **R16.1** (320 px first; a compact layout may not lose
 *               commands), **R16.2** (44 px targets, keyboard, accessible names
 *               and state), **R16.5** (no duplicate affordances), **R16.7**.
 * Findings:     **STU-05** (*"Application document actions become a tall stack of
 *               equally prominent buttons on mobile"* — remedy: *"Present status
 *               first, one primary action, and an accessible overflow/menu for
 *               secondary document commands"*), **STU-18**.
 *
 * ## What is asserted here, and what is deliberately left to the browser
 *
 * These are the DOM-answerable halves: *how many* prominent controls exist, *what
 * order* things appear in, *which* element owns the live region, and whether the
 * disclosure carries real ARIA state. Geometry (44 × 44 measured from layout
 * boxes, no horizontal overflow at 320 px, nothing clipped under a long programme
 * name) and a real `Enter` on a focused trigger are settled by
 * `tests/harness-e2e/required/student-document-density.spec.ts`, because none of
 * them survives jsdom — jsdom lays nothing out and synthesises no default action
 * from a key event.
 *
 * The pure split itself (which document earns the primary control, and that the
 * two halves partition what the platform offered, for every input) is
 * `tests/property/officialDocumentPresentation.property.test.ts`. This file is
 * about the *surface* that consumes it.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApplicationListItem } from '@/components/student/ApplicationListItem'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import type { Application } from '@/types/database'

// ---------------------------------------------------------------------------
// Doubles. Only the transport and the toast host — every claim below is about the
// rendered surface, so the presentation helper, the gate and the hooks are real.
// ---------------------------------------------------------------------------

const generateMock = vi.fn()
const getMock = vi.fn()
const listMock = vi.fn()
const downloadMock = vi.fn()
const emailMock = vi.fn()

vi.mock('@/services/officialDocuments', () => ({
  officialDocumentService: {
    generateOfficialDocument: (...args: unknown[]) => generateMock(...args),
    getOfficialDocument: (...args: unknown[]) => getMock(...args),
    listOfficialDocuments: (...args: unknown[]) => listMock(...args),
    downloadOfficialDocument: (...args: unknown[]) => downloadMock(...args),
    emailOfficialDocument: (...args: unknown[]) => emailMock(...args),
  },
}))

vi.mock('@/hooks/useToast', () => ({
  useToastStore: () => ({ addToast: vi.fn(), success: vi.fn(), error: vi.fn() }),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'jane@example.com', role: 'student' } }),
}))

vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => ({
    brandName: 'Beanola Admissions',
    brandOwner: 'Beanola Technologies',
    isWhiteLabel: false,
    offeringInstitutionId: undefined,
    supportEmail: null,
    isLoading: false,
  }),
  DEFAULT_BRAND_NAME: 'Beanola Admissions',
}))

// The row's own reads. Neither is this file's subject, and both would otherwise
// leave a query in flight after the assertions.
vi.mock('@/services/applications', () => ({
  applicationService: {
    getWaitlistPosition: vi.fn().mockResolvedValue({ position: 0, total: 0 }),
    getConditions: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('@/services/interviews', () => ({
  interviewsService: { list: vi.fn().mockResolvedValue({ interviews: [] }) },
}))

const APP_ID = 'app-11-3'

function render(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  for (const mock of [generateMock, getMock, listMock, downloadMock, emailMock]) mock.mockReset()
  // The read-existing half (task 10.4) answers "nothing issued yet" unless a case
  // says otherwise, so the default surface is driven purely by the issuance gate.
  listMock.mockResolvedValue([])
})

afterEach(() => {
  cleanup()
})

/** Every control the surface renders, in document order. */
function controls(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
}

/**
 * The controls that are *prominent*: the design system's filled primary variant.
 *
 * Matched on the resting fill (`bg-primary text-primary-foreground`) rather than
 * on `bg-primary` alone, because `outline` and `ghost` both carry a
 * `hover:bg-primary/5` — a looser predicate calls every button prominent and the
 * whole claim becomes vacuous.
 */
function prominentControls(container: HTMLElement): HTMLButtonElement[] {
  return controls(container).filter((button) =>
    button.className.includes('bg-primary text-primary-foreground'),
  )
}

/**
 * The first element of a list, asserted rather than assumed.
 *
 * `noUncheckedIndexedAccess` is on in this workspace, and an `!` here would turn
 * "the surface rendered nothing" into a confusing null dereference several lines
 * later instead of a failure that names the missing thing.
 */
function first<T>(items: readonly T[], what: string): T {
  const value = items[0]
  expect(value, `expected at least one ${what}`).toBeTruthy()
  return value as T
}

// ---------------------------------------------------------------------------
// 1. The panel: status first, one prominent action, everything else counted
// ---------------------------------------------------------------------------

describe('DocumentButtons at panel density — one primary action (STU-05)', () => {
  /** An approved, paid application: the densest state the student surface has. */
  function renderApproved() {
    return render(
      <DocumentButtons
        applicationId={APP_ID}
        applicationNumber="APP-20260101-ABCD1234"
        status="approved"
        paymentStatus="successful"
      />,
    )
  }

  it('says what the platform has before it offers any control', () => {
    const { container } = renderApproved()
    const summary = screen.getByTestId('document-status-summary')

    // SJR task 3.20 (R5-f): nothing is issued in this case (the issued list is
    // empty), so the letter "can be prepared now"; the old "ready to download"
    // claimed a file that did not exist.
    expect(summary.textContent).toMatch(/acceptance letter can be prepared now/i)
    // "Status first" is a claim about order, so it is asserted as one: the
    // sentence precedes every button in document order.
    const firstControl = first(controls(container), 'document control')
    expect(summary.compareDocumentPosition(firstControl)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('gives exactly one document a prominent control, whatever else is available', () => {
    const { container } = renderApproved()
    // Approved + verified payment offers the letter *and* the slip *and* the
    // receipt. Before 11.3 that was three equally prominent buttons plus three
    // email affordances; it is one now.
    expect(prominentControls(container)).toHaveLength(1)
    expect(first(prominentControls(container), 'prominent control').textContent).toMatch(
      /Acceptance Letter/i,
    )
  })

  it('loses no command: the sheet names every one it hides, and holds them', () => {
    renderApproved()
    const trigger = screen.getByTestId('document-options-trigger')

    // The letter's email, plus a download and an email for the slip and the
    // receipt: five.
    expect(trigger.textContent).toContain('(5)')

    fireEvent.click(trigger)
    const panel = screen.getByTestId('document-options-panel')
    expect(panel.textContent).toContain('Email acceptance letter to me')
    // SJR task 3.20: the slip's Prepare label replaces the retired "Download Slip".
    expect(panel.textContent).toContain('Prepare Application Slip')
    expect(panel.textContent).toContain('Email application slip to me')
    expect(panel.textContent).toContain('Payment Receipt')
    expect(panel.textContent).toContain('Email payment receipt to me')
  })

  it('renders each document exactly once, at every width', () => {
    renderApproved()
    // The pre-11.3 surface mounted a `sm:hidden` mobile copy and a `hidden sm:flex`
    // desktop copy, so every document had two containers, two hook instances and
    // two independent states — and a screen reader met each heading twice.
    for (const documentType of ['acceptance_letter', 'application_slip', 'payment_receipt']) {
      expect(screen.getAllByTestId(`official-document-${documentType}`)).toHaveLength(1)
    }
  })

  it('holds exactly one live region, and it is not inside the action cluster', () => {
    const { container } = renderApproved()
    const regions = Array.from(container.querySelectorAll('[aria-live]'))

    expect(regions).toHaveLength(1)
    const region = first(regions, 'live region')
    expect(region.getAttribute('role')).toBe('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    // Outside the sheet and outside every document container: a control whose own
    // accessible name is changing is the worst possible host for a live region.
    expect(screen.getByTestId('document-options-panel').contains(region)).toBe(false)
    for (const documentType of ['acceptance_letter', 'application_slip', 'payment_receipt']) {
      expect(screen.getByTestId(`official-document-${documentType}`).contains(region)).toBe(false)
    }
  })

  it('renders nothing at all when the application has no documents', () => {
    const { container } = render(
      <DocumentButtons applicationId={APP_ID} status="draft" paymentStatus={null} />,
    )
    // Not an empty card and not a "no documents available" line: a draft has no
    // official record, so the surface is absent rather than reassuring.
    expect(container.childElementCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. The disclosure is a real one (R16.2)
// ---------------------------------------------------------------------------

describe('the document sheet is an accessible disclosure (R16.2)', () => {
  function renderSubmitted() {
    return render(
      <DocumentButtons applicationId={APP_ID} status="submitted" paymentStatus={null} />,
    )
  }

  it('is a button that reports its own state and names what it controls', () => {
    renderSubmitted()
    const trigger = screen.getByTestId('document-options-trigger')

    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger).toHaveProperty('type', 'button')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    const controlled = trigger.getAttribute('aria-controls')
    expect(controlled).toBeTruthy()
    expect(document.getElementById(controlled!)).toBe(screen.getByTestId('document-options-panel'))
  })

  it('flips aria-expanded and unhides the same panel it names', () => {
    renderSubmitted()
    const trigger = screen.getByTestId('document-options-trigger')
    const panel = screen.getByTestId('document-options-panel')

    expect(panel.hasAttribute('hidden')).toBe(true)
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hasAttribute('hidden')).toBe(false)
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hasAttribute('hidden')).toBe(true)
  })

  it('agrees with itself about display: the attribute and the class say the same thing', () => {
    renderSubmitted()
    const trigger = screen.getByTestId('document-options-trigger')
    const panel = screen.getByTestId('document-options-panel')

    // A regression guard for a defect a browser found and jsdom could not:
    // `[hidden] { display: none }` and `.flex { display: flex }` have equal
    // specificity, and Tailwind emits utilities after preflight — so a
    // permanently-`flex` panel carrying `hidden` stays on screen, with
    // `aria-expanded="false"` claiming the opposite. jsdom computes no display
    // from a class, so the only DOM-side guard is that the two agree.
    expect(panel.hasAttribute('hidden')).toBe(true)
    expect(panel.className).toMatch(/(^|\s)hidden(\s|$)/)
    expect(panel.className).not.toMatch(/(^|\s)flex(\s|$)/)

    fireEvent.click(trigger)
    expect(panel.hasAttribute('hidden')).toBe(false)
    expect(panel.className).toMatch(/(^|\s)flex(\s|$)/)
    expect(panel.className).not.toMatch(/(^|\s)hidden(\s|$)/)
  })

  it('keeps the panel mounted so work in flight survives closing it', () => {
    renderSubmitted()
    const trigger = screen.getByTestId('document-options-trigger')

    fireEvent.click(trigger)
    const email = screen.getByText('Email application slip to me')
    fireEvent.click(trigger)
    // Still the same node: `hidden`, not unmounted. A `{open && …}` sheet would
    // tear down the in-flight `useOfficialDocument` instance the moment a student
    // collapsed it, and would remount a second one on reopening.
    expect(screen.getByText('Email application slip to me')).toBe(email)
  })

  it('sizes every control for a thumb', () => {
    const { container } = renderSubmitted()
    fireEvent.click(screen.getByTestId('document-options-trigger'))

    // The measured 44 px claim is the browser journey's; this is the weaker,
    // cheaper guard that no control ships without the token at all.
    for (const button of controls(container)) {
      expect(button.className).toMatch(/min-h-touch/)
    }
  })
})

// ---------------------------------------------------------------------------
// 3. The list row adds no prominence, and no live region (task 11.3's bullet)
// ---------------------------------------------------------------------------

describe('DocumentButtons at row density — live status stays out of dense rows', () => {
  function renderRow() {
    return render(
      <DocumentButtons
        applicationId={APP_ID}
        status="approved"
        paymentStatus="successful"
        density="row"
      />,
    )
  }

  it('offers no prominent download in the row itself', () => {
    const { container } = renderRow()
    // A prominent per-application download *is* STU-05's equally-prominent stack,
    // multiplied by the number of applications on the dashboard.
    expect(prominentControls(container)).toHaveLength(0)
  })

  it('still loses no command — the download moves into the sheet, it does not vanish', () => {
    renderRow()
    const trigger = screen.getByTestId('document-options-trigger')
    // Six: the primary's download and email, plus both commands for the two others.
    expect(trigger.textContent).toContain('(6)')

    fireEvent.click(trigger)
    const panel = screen.getByTestId('document-options-panel')
    expect(panel.textContent).toContain('Acceptance Letter')
    expect(panel.textContent).toContain('Email acceptance letter to me')
    // SJR task 3.20: the slip's Prepare label replaces the retired "Download Slip".
    expect(panel.textContent).toContain('Prepare Application Slip')
    expect(panel.textContent).toContain('Payment Receipt')
  })

  it('keeps its live region inside the collapsed sheet', () => {
    const { container } = renderRow()
    const regions = Array.from(container.querySelectorAll('[aria-live]'))

    expect(regions).toHaveLength(1)
    // Inside the sheet, so a page of ten applications cannot accumulate ten
    // competing polite regions — and while the sheet is closed the region is
    // inside `hidden`, hence out of the accessibility tree, which is correct:
    // nothing in there has been reachable, so nothing can be in flight.
    expect(
      screen.getByTestId('document-options-panel').contains(first(regions, 'live region')),
    ).toBe(true)
  })

  it('still says what the platform has, before the one control', () => {
    renderRow()
    // The row is de-densified, not made mute: the status sentence is the whole
    // point of "present status first".
    // SJR task 3.20 (R5-f): nothing is issued here, so the sentence says the
    // letter can be prepared, never that it is ready.
    expect(screen.getByTestId('document-status-summary').textContent).toMatch(
      /can be prepared now/i,
    )
  })
})

// ---------------------------------------------------------------------------
// 4. The application row: status and next action before everything passive
// ---------------------------------------------------------------------------

describe('ApplicationListItem — status and next action first (R13.1, R16.1)', () => {
  function application(overrides: Partial<Application> = {}): Application {
    return {
      id: APP_ID,
      user_id: 'user-1',
      status: 'submitted',
      application_number: 'APP-20260101-ABCD1234',
      program: 'Clinical Medicine',
      intake: 'January 2026',
      submitted_at: '2026-01-05T09:00:00Z',
      // A fee the student chose to pay later: the one post-submission state that
      // `resolveStudentNextAction` answers from the payment contract, so the row
      // has a next action to place. `pending` deliberately produces none — the
      // platform is waiting on the provider, not on the student (task 8.2).
      payment_status: 'deferred',
      ...overrides,
    } as Application
  }

  it('puts the next action before the passive details and before the documents', () => {
    render(<ApplicationListItem application={application()} index={0} />)

    const nextAction = screen.getByTestId('application-row-next-action')
    const documents = screen.getByTestId('application-document-actions')
    expect(nextAction.compareDocumentPosition(documents)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    // And before the passive grid, which is the R13.1 ordering claim: a deferred
    // fee outranks "Intake: January 2026".
    const intake = screen.getByText(/Intake:/i)
    expect(nextAction.compareDocumentPosition(intake)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('carries the resolver’s own label and route, and derives neither itself', () => {
    render(<ApplicationListItem application={application()} index={0} />)

    const row = screen.getByTestId('application-row-next-action')
    const link = screen.getByTestId('application-row-next-action-link')
    // The label, the sentence and the route are all `studentNextAction`'s
    // (task 11.1) — the row authors none of them, which is why a payment
    // affordance can appear here without this file knowing a payment rule.
    expect(link.getAttribute('href')).toBe(`/student/payment?applicationId=${APP_ID}`)
    expect(link.textContent).toContain('Complete deferred payment')
    expect(row.textContent).toContain('You chose to pay this fee later.')
  })

  it('renders the row’s document actions at row density', () => {
    render(<ApplicationListItem application={application()} index={0} />)
    expect(screen.getByTestId('application-document-actions').getAttribute('data-density')).toBe(
      'row',
    )
  })

  it('ends in one document control beside the workspace link, not a stack', () => {
    const { container } = render(
      <ApplicationListItem
        application={application({ status: 'approved', payment_status: 'successful' })}
        index={0}
      />,
    )
    const documents = screen.getByTestId('application-document-actions')
    // Every control the document surface contributes to the row: exactly the
    // disclosure trigger. Everything else is behind it.
    const visibleDocumentControls = Array.from(
      documents.querySelectorAll<HTMLButtonElement>('button'),
    ).filter((button) => !screen.getByTestId('document-options-panel').contains(button))
    expect(visibleDocumentControls).toHaveLength(1)
    expect(first(visibleDocumentControls, 'row document control')).toBe(
      screen.getByTestId('document-options-trigger'),
    )
    // And the row contributes no prominent document button of its own.
    expect(prominentControls(documents)).toHaveLength(0)
    // The workspace link survives — de-densifying is not deleting.
    expect(container.textContent).toContain('View Details')
  })
})
