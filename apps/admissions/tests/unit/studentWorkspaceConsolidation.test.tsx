/**
 * One canonical student application workspace, and the duplicate redirects to it.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task **10.6**.
 * Requirements: **R13.1-R13.7**, **R13.13** ("ONE canonical student application
 *               workspace SHALL own status, next action, payment, documents,
 *               interview, communications, conditions, amendments, enrollment,
 *               and history; duplicate routes SHALL redirect to it").
 * Findings:     **STU-23** (two overlapping workspaces with different actions and
 *               duplicate payment/document/interview/timeline logic),
 *               **API-04**, **MAINT-01**.
 *
 * These cases are the *parity proof* the task's `_Evidence:` line names. The
 * question a consolidation has to answer is not "does the survivor render" — it
 * is "did the student lose anything". So the suite is organised around the
 * differences between the two pages that actually existed:
 *
 *   1. the **route** is a redirect, not a second live page, and it preserves the
 *      application id, the query string and the hash;
 *   2. the **affordances** only the retired page had — public tracking, the
 *      nationality and institution fields, and a *clickable* virtual-interview
 *      link — are on the survivor;
 *   3. the **duplicate reads** are gone: one detail query, one cache key, one
 *      interview renderer;
 *   4. the surviving workspace covers **all ten** R13.13 concerns.
 *
 * Nothing here mocks a route table or a registry: the assertions read the real
 * `routes` array and the real registry, because a parity claim asserted against a
 * fixture of itself proves nothing.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import React from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { DuplicateRouteRedirect } from '@/routes/DuplicateRouteRedirect'
import { routes } from '@/routes/config'
import {
  duplicateRedirectPaths,
  matchesDuplicateRedirect,
  matchesRoutePath,
  routeByPath,
  routeById,
  studentApplicationWorkspacePath,
} from '@/routes/routeRegistry'
import { InterviewDetails } from '@/components/student/InterviewDetails'
import {
  ApplicationHistory,
  toApplicationHistoryRows,
} from '@/components/student/applicationStatus/ApplicationHistory'

const SRC = resolve(__dirname, '../../src')

/**
 * Read a source file with its comments removed.
 *
 * Every "this string no longer appears" guard below is a claim about **code**,
 * and the code that removed a link is also the code that documents why it was
 * removed — so a naive substring scan would be tripped by the explanation of the
 * very thing it is checking for. Stripping comments first is what makes the guard
 * measure the surface rather than the prose about it.
 */
function readCode(relative: string): string {
  return readFileSync(resolve(SRC, relative), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/**
 * The canonical workspace, as a **module set** rather than a single file
 * (admissions-v2 task 12.1, MAINT-01).
 *
 * Task 10.6 wrote these guards against `pages/student/ApplicationStatus.tsx`
 * alone, because at the time the whole workspace *was* that one 807-line file.
 * Task 12.1 split it by bounded workflow, so a pin on one path would now be a pin
 * on where a line happens to live rather than on what the workspace does.
 *
 * The set below is the page plus exactly the modules the split extracted from it —
 * named, finite, and derived from the page's own imports. That keeps every claim
 * 10.6 made true, and makes it slightly **stronger**: an assertion can no longer
 * be satisfied by leaving a string in a file that nothing renders, and the
 * "no longer appears" guards stay meaningful because the set is the page's own
 * decomposition rather than its transitive closure (which would pull in
 * `components/ui` and make every absence claim vacuous).
 */
const WORKSPACE_MODULES = [
  'pages/student/ApplicationStatus.tsx',
  'hooks/student/useApplicationWorkspace.ts',
  'components/student/applicationStatus/applicationTimeline.ts',
  'components/student/applicationStatus/workspacePresentation.ts',
  'components/student/applicationStatus/ApplicationDetailsSection.tsx',
  'components/student/applicationStatus/WorkspaceAside.tsx',
] as const
const WORKSPACE_SOURCE = WORKSPACE_MODULES.map((relative) =>
  readFileSync(resolve(SRC, relative), 'utf-8'),
).join('\n')
const WORKSPACE_CODE = WORKSPACE_MODULES.map((relative) => readCode(relative)).join('\n')

const DUPLICATE_PATH = '/student/application/:id'
const CANONICAL_PATH = '/student/application/:id/status'

function renderWithRouter(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

// ---------------------------------------------------------------------------
// 1. The duplicate route redirects (R13.13)
// ---------------------------------------------------------------------------
describe('the duplicate student application route redirects to the canonical workspace', () => {
  it('is registered as a duplicate redirect of the workspace, not as an alias', () => {
    const workspace = routeById('student.status')
    expect(duplicateRedirectPaths(workspace)).toContain(DUPLICATE_PATH)
    // An alias would keep two live URLs for one surface, which is the shape
    // R13.13 forbids. The distinction is load-bearing, so it is asserted.
    expect(workspace.aliases ?? []).not.toContain(DUPLICATE_PATH)
  })

  it('no longer resolves to a page component', () => {
    const entry = routes.find((route) => route.path === DUPLICATE_PATH)
    expect(entry, 'the duplicate path is still routed so old bookmarks work').toBeTruthy()
    expect(React.isValidElement(entry!.element)).toBe(true)
    expect((entry!.element as React.ReactElement).type).toBe(DuplicateRouteRedirect)
  })

  it('the canonical path is still served by the workspace page', () => {
    const canonical = routes.filter((route) => route.path === CANONICAL_PATH)
    expect(canonical).toHaveLength(1)
    expect(React.isValidElement(canonical[0]!.element)).toBe(false)
  })

  it('keeps the student inside the student guard while redirecting', () => {
    const entry = routes.find((route) => route.path === DUPLICATE_PATH)
    // A redirect that drops the guard would briefly expose the hop to an
    // unauthenticated visitor before the destination re-guarded it.
    expect(entry!.guard).toBe('student')
  })

  it('sends the student to the canonical workspace for the same application', () => {
    function Probe() {
      return <span data-testid="landed">{useLocation().pathname}</span>
    }
    renderWithRouter(
      <MemoryRouter initialEntries={['/student/application/app-42']}>
        <Routes>
          <Route
            path={DUPLICATE_PATH}
            element={
              <DuplicateRouteRedirect
                canonicalPath={(params) =>
                  params.id ? studentApplicationWorkspacePath(params.id) : null
                }
                fallback="/student/dashboard"
              />
            }
          />
          <Route path={CANONICAL_PATH} element={<Probe />} />
          <Route path="/student/dashboard" element={<span data-testid="landed">dashboard</span>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('landed').textContent).toBe('/student/application/app-42/status')
  })

  it('carries the query string and hash across, rather than dropping them', () => {
    function Probe() {
      const location = useLocation()
      return <span data-testid="landed">{`${location.pathname}${location.search}${location.hash}`}</span>
    }
    renderWithRouter(
      <MemoryRouter initialEntries={['/student/application/app-7?tab=files#upload']}>
        <Routes>
          <Route
            path={DUPLICATE_PATH}
            element={
              <DuplicateRouteRedirect
                canonicalPath={(params) =>
                  params.id ? studentApplicationWorkspacePath(params.id) : null
                }
                fallback="/student/dashboard"
              />
            }
          />
          <Route path={CANONICAL_PATH} element={<Probe />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('landed').textContent).toBe(
      '/student/application/app-7/status?tab=files#upload',
    )
  })

  it('falls back to the dashboard rather than building a malformed URL', () => {
    renderWithRouter(
      <MemoryRouter initialEntries={['/student/application/']}>
        <Routes>
          <Route
            path="/student/application/*"
            element={
              <DuplicateRouteRedirect
                canonicalPath={() => null}
                fallback="/student/dashboard"
              />
            }
          />
          <Route path="/student/dashboard" element={<span data-testid="landed">dashboard</span>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('landed').textContent).toBe('dashboard')
  })

  it('encodes an application id so a hostile id cannot rewrite the path', () => {
    expect(studentApplicationWorkspacePath('a/../../admin')).toBe(
      '/student/application/a%2F..%2F..%2Fadmin/status',
    )
  })
})

// ---------------------------------------------------------------------------
// 2. The registry tells a redirect apart from a destination
// ---------------------------------------------------------------------------
describe('duplicate redirects are not treated as the route itself', () => {
  const workspace = routeById('student.status')

  it('matchesRoutePath ignores the retired duplicate', () => {
    // Nav highlighting and skeleton selection both read `matchesRoutePath`. If a
    // redirect counted as the destination, the hop would paint the destination's
    // chrome for one frame and then navigate away from it.
    expect(matchesRoutePath('/student/application/abc', workspace)).toBe(false)
    expect(matchesDuplicateRedirect('/student/application/abc', workspace)).toBe(true)
  })

  it('matchesRoutePath still matches the canonical alias', () => {
    expect(matchesRoutePath('/student/application/abc/status', workspace)).toBe(true)
    expect(matchesRoutePath('/application/abc', workspace)).toBe(true)
  })

  it('routeByPath resolves the canonical path to the workspace, not to the redirect', () => {
    expect(routeByPath('/student/application/abc/status')?.id).toBe('student.status')
  })

  it('routeByPath still recognises the retired duplicate rather than calling it unknown', () => {
    // The difference between "retired duplicate" and "unknown URL" matters: one
    // has a destination and the other is a 404.
    expect(routeByPath('/student/application/abc')?.id).toBe('student.status')
  })

  it('there is no longer a separate student.applicationDetail route id', () => {
    expect(() => routeById('student.applicationDetail' as never)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// 3. Every first-party link points at the one workspace (STU-23)
// ---------------------------------------------------------------------------
describe('no production surface links to the retired workspace', () => {
  // `components/student/DashboardStatusOverview.tsx` was in this list until task
  // 11.1 deleted it: four decorative metric tiles, a "Latest Application Status"
  // card duplicating the row beneath it, and a payment alert duplicating the
  // payment action (R16.5, STU-04). Its canonical-path claim moved to the
  // next-action panel, which is asserted by `studentDashboardTaskFirst.test.tsx`
  // and by `studentNextActionServerVocabulary.test.ts`.
  const SURFACES = [
    'components/student/ApplicationListItem.tsx',
    'components/student/applicationStatus/NextActionCards.tsx',
    'components/student/dashboard/NextActionPanel.tsx',
    'lib/studentNextAction.ts',
    'pages/student/Dashboard.tsx',
    'pages/student/ApplicationStatus.tsx',
  ]

  it.each(SURFACES)('%s builds no bare /student/application/:id link', (relative) => {
    // A template link to the duplicate looks like `/student/application/${x}`
    // with nothing after the interpolation. The canonical one ends in `/status`.
    const bare = readCode(relative).match(/['"`]\/student\/application\/\$\{[^}]+\}(?!\/status)/g) ?? []
    expect(bare, `${relative} still links to the retired duplicate`).toEqual([])
  })

  it('the dashboard row and the next-action route table use the canonical path builder', () => {
    for (const relative of [
      'components/student/ApplicationListItem.tsx',
      'lib/studentNextAction.ts',
    ]) {
      expect(readCode(relative), relative).toContain('studentApplicationWorkspacePath')
    }
  })

  it('the next-action panel no longer offers a link to the page it renders on', () => {
    expect(readCode('components/student/applicationStatus/NextActionCards.tsx')).not.toContain(
      'View full application details',
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Parity: what only the retired page had (the removal gate)
// ---------------------------------------------------------------------------
describe('the canonical workspace kept every affordance the retired page had', () => {
  it('offers the public tracking link the retired page owned', () => {
    // Since task 10.5 the application number authorises nothing, so the issued
    // tracking link is the student's *only* way to share their status. It lived
    // only on the retired page; losing it in the consolidation would have been a
    // silent capability removal.
    expect(WORKSPACE_SOURCE).toContain('TrackingLinkAction')
  })

  it('does not offer tracking for a draft, which has no status to track', () => {
    expect(WORKSPACE_SOURCE).toMatch(/application\.status !== 'draft'[\s\S]{0,600}TrackingLinkAction/)
  })

  it('shows the nationality and institution the retired page showed', () => {
    expect(WORKSPACE_SOURCE).toContain('label="Nationality"')
    expect(WORKSPACE_SOURCE).toContain('label="Institution"')
    expect(WORKSPACE_SOURCE).toContain('institution_name')
  })

  it('renders the interview with the richer of the two renderers', () => {
    expect(WORKSPACE_SOURCE).toContain('InterviewDetails')
  })

  it('a virtual interview link is clickable, which the retired page had and this one did not', () => {
    render(
      <InterviewDetails
        interview={{
          id: 'iv-1',
          scheduled_at: '2026-05-01T09:00:00Z',
          mode: 'virtual',
          location: 'https://meet.example.com/abc-def',
          status: 'scheduled',
        }}
      />,
    )
    const link = screen.getByRole('link', { name: /meet\.example\.com/ })
    expect(link.getAttribute('href')).toBe('https://meet.example.com/abc-def')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('a non-URL location is not rendered as a link', () => {
    render(
      <InterviewDetails
        interview={{
          id: 'iv-2',
          scheduled_at: '2026-05-01T09:00:00Z',
          mode: 'virtual',
          location: 'to be confirmed',
          status: 'scheduled',
        }}
      />,
    )
    expect(screen.queryByRole('link')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4b. A deferred fee is an action, not a dead end (R13.1, R13.13)
// ---------------------------------------------------------------------------
describe('the workspace offers an action for a deferred fee', () => {
  /**
   * Found by the golden lifecycle journey, not by reading the code.
   *
   * `requiresStudentPaymentAction` answered `not_paid` and `rejected` only, so a
   * student who chose to pay later read "Payment still needs attention" on this
   * workspace and was offered no control at all — while
   * `deferred_payment_reminder_task` emailed them about the same fee daily. R13
   * exists so payment does not become a dead end, and R13.13 makes this workspace
   * the owner of payment, so the affordance belongs here.
   *
   * 10.6 asserted the widening as a *local* `|| hasDeferredFee`; task 11.1 moved it
   * into the shared helper (see the last case in this block), so the claim here is
   * the one that survived the move: the deferral still reaches the action, and
   * `hasDeferredFee` still selects the copy.
   *
   * Task **11.3** moved the *action* off this page and onto task 11.1's resolver,
   * which is the surface that now answers "what is this student's next action" for
   * both the dashboard and this workspace. So the gate is read in
   * `lib/studentNextAction.ts` and the page keeps only the sentence that names the
   * student's own choice. Same behaviour, one owner instead of two.
   */
  it('treats a deferred payment as needing action', () => {
    expect(WORKSPACE_CODE).toMatch(/hasDeferredFee\s*=\s*normalizedPaymentStatus === 'deferred'/)
    expect(readCode('lib/studentNextAction.ts')).toMatch(
      /requiresStudentPaymentAction\(application\.payment_status\)/,
    )
    // `hasDeferredFee` earns its keep on the copy, not on the gate.
    expect(WORKSPACE_CODE).toMatch(/hasDeferredFee[\s\S]{0,400}You chose to pay this fee later/)
  })

  it('names the student\u2019s own choice rather than warning them about it', () => {
    expect(WORKSPACE_SOURCE).toContain('You chose to pay this fee later')
    // The label is the resolver's now (task 11.3) — read there, so this stays a
    // claim about what the student sees rather than about which file holds it.
    expect(readCode('lib/studentNextAction.ts')).toContain('Complete deferred payment')
  })

  it('sends them to the surface that owns post-submission collection, not a second form here', () => {
    // R12.3 splits ownership at submission: the wizard owns pre-submission
    // pay-or-defer, `/student/payment` owns everything after it. A collection form
    // on this workspace would be a third payment surface.
    expect(readCode('lib/studentNextAction.ts')).toContain('/student/payment?applicationId=$')
    expect(WORKSPACE_CODE).not.toContain('<PaymentForm')
  })

  /**
   * Task 10.6 pinned the shared helper as **unchanged** here, deliberately: it
   * also drives `Dashboard.tsx`, `ApplicationListItem.tsx` and
   * `DashboardStatusOverview.tsx`, and widening it would have moved three surfaces
   * 10.6 measured nothing about. That case named task **11.1** as the lane that
   * would change it, and 11.1 did — which is why this reads the opposite claim now
   * rather than having quietly disappeared.
   *
   * `requiresStudentPaymentAction` now includes `deferred`, so the four student
   * surfaces agree that a deferral is a promise to pay rather than a resolution.
   * The workspace's local `|| hasDeferredFee` is therefore redundant and gone; the
   * *behaviour* 10.6 established — a deferred fee is an action here, named as the
   * student's own choice, collected on `/student/payment` — is unchanged and is
   * still asserted by the three cases above.
   */
  it('reads the deferral from the shared helper rather than widening it locally', () => {
    const helper = readCode('lib/paymentStatus.ts')
    expect(helper).toMatch(
      /requiresStudentPaymentAction[\s\S]{0,240}normalized === 'not_paid' \|\| normalized === 'rejected' \|\| normalized === 'deferred'/,
    )
    // The submission gate is a different question and is deliberately untouched:
    // a deferral *is* resolved for progression — that is what deferring means.
    expect(helper).toMatch(
      /isPaymentResolvedForProgress[\s\S]{0,200}=== 'verified' \|\| paymentStatus === 'deferred'/,
    )
    // Task 11.3: the caller that reads it for *this* workspace is the resolver,
    // because the workspace's next action and the dashboard's are now the same
    // answer from the same place.
    expect(readCode('lib/studentNextAction.ts')).toMatch(
      /requiresStudentPaymentAction\(application\.payment_status\)/,
    )
  })
})

// ---------------------------------------------------------------------------
// 5. The duplicate reads are gone (STU-23, MAINT-01)
// ---------------------------------------------------------------------------
describe('one detail read serves the whole workspace', () => {
  it('uses a single cache key and no longer the retired one', () => {
    expect(WORKSPACE_CODE).toContain("'application-workspace'")
    expect(WORKSPACE_CODE).not.toContain("'application-detail'")
  })

  it('asks for the status history on that same read rather than adding a second query', () => {
    expect(WORKSPACE_CODE).toMatch(/getById\(id!, \{ include: \['statusHistory'\] \}\)/)
    // One `useQuery` for the application itself. The conditions, amendments and
    // waitlist queries are separate on purpose — they are separate contracts from
    // separate tasks — but the *application* is read once.
    const detailReads = WORKSPACE_CODE.match(/applicationService\.getById\(/g) ?? []
    expect(detailReads).toHaveLength(1)
  })

  it('no other surface still evicts the retired cache key', () => {
    for (const relative of [
      'pages/student/applicationWizard/hooks/useWizardController.ts',
      'pages/student/lib/dashboardReducer.ts',
    ]) {
      const code = readCode(relative)
      expect(code, relative).not.toContain("['application-detail'")
      expect(code, relative).toContain("'application-workspace'")
    }
  })
})

// ---------------------------------------------------------------------------
// 6. The workspace covers all ten R13.13 concerns
// ---------------------------------------------------------------------------
describe('the canonical workspace owns every concern R13.13 names', () => {
  const CONCERNS: Array<[string, RegExp]> = [
    ['status', /formatStatusLabel\(application\.status\)/],
    ['next action', /<NextActionCards/],
    ['payment', /<PaymentStatusBlock/],
    ['documents', /<DocumentChecklist[\s\S]*<DocumentButtons|<DocumentButtons[\s\S]*<DocumentChecklist/],
    ['interview', /<InterviewDetails/],
    ['communications', /pathFor\('student\.communications'\)/],
    ['conditions', /<ConditionsTimeline/],
    ['amendments', /<AmendmentForm[\s\S]*<AmendmentHistory/],
    ['enrollment', /enrollmentReadinessOf\(application\)/],
    ['history', /<ApplicationHistory/],
  ]

  it.each(CONCERNS)('presents %s', (_concern, pattern) => {
    expect(WORKSPACE_SOURCE).toMatch(pattern)
  })
})

// ---------------------------------------------------------------------------
// 7. The recorded history is the server's, not the browser's
// ---------------------------------------------------------------------------
describe('ApplicationHistory renders the platform\u2019s own rows', () => {
  it('renders the transition, the actor and the note the server recorded', () => {
    render(
      <ApplicationHistory
        rows={[
          {
            id: 'h-1',
            old_status: 'submitted',
            new_status: 'under_review',
            notes: 'Assigned to the nursing panel.',
            created_at: '2026-03-07T12:30:00Z',
            changed_by_name: 'A. Reviewer',
          },
        ]}
      />,
    )
    expect(screen.getByText(/Submitted \u2192 Under Review/)).toBeTruthy()
    expect(screen.getByText('A. Reviewer')).toBeTruthy()
    expect(screen.getByText('Assigned to the nursing panel.')).toBeTruthy()
  })

  it('does not invent a "from" state for the first recorded transition', () => {
    render(
      <ApplicationHistory
        rows={[{ id: 'h-1', new_status: 'submitted', created_at: '2026-03-07T12:00:00Z' }]}
      />,
    )
    expect(screen.getByText('Submitted')).toBeTruthy()
    expect(screen.queryByText(/\u2192/)).toBeNull()
  })

  it('says a legacy row has no recorded time rather than showing today', () => {
    render(<ApplicationHistory rows={[{ id: 'h-1', new_status: 'submitted', created_at: null }]} />)
    expect(screen.getByText('Not available')).toBeTruthy()
  })

  it('renders an empty record as empty, not as an error', () => {
    render(<ApplicationHistory rows={[]} />)
    expect(screen.getByText('No recorded changes yet')).toBeTruthy()
  })

  it('keeps the order the server sent, and does not re-sort locally', () => {
    render(
      <ApplicationHistory
        rows={[
          { id: 'newest', new_status: 'approved', created_at: '2026-03-09T12:00:00Z' },
          { id: 'oldest', new_status: 'submitted', created_at: '2026-03-01T12:00:00Z' },
        ]}
      />,
    )
    const items = screen.getByTestId('application-status-history').querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toContain('Approved')
    expect(items[1]!.textContent).toContain('Submitted')
  })

  it('drops a row the server could not identify instead of rendering a keyless entry', () => {
    expect(toApplicationHistoryRows([{ new_status: 'submitted' }, null, 'nonsense'])).toEqual([])
    expect(toApplicationHistoryRows(undefined)).toEqual([])
  })

  it('normalises a numeric id and keeps the fields it recognises', () => {
    expect(
      toApplicationHistoryRows([
        { id: 17, new_status: 'approved', created_at: '2026-03-09T12:00:00Z', extra: 'ignored' },
      ]),
    ).toEqual([
      {
        id: '17',
        status: null,
        old_status: null,
        new_status: 'approved',
        notes: null,
        created_at: '2026-03-09T12:00:00Z',
        changed_by_name: null,
      },
    ])
  })
})
