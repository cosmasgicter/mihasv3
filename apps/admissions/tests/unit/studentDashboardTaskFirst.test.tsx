/**
 * Task 11.1 — the student dashboard is composed around the next action.
 *
 * Requirements: R13.1, R16.1, R16.4-R16.8. Findings: STU-04, STU-12, MAINT-02.
 *
 * The claims are organised the way the finding is: the action comes from the
 * server and comes first (§1-2); the draft and the application status are concise
 * (§3); the decorative metrics and the duplicate quick actions are gone (§4);
 * destructive draft cleanup is scoped and is not a `window.confirm` (§5).
 *
 * Source-scanning cases strip comments first. The code that removed a surface is
 * also the code that documents why it was removed, so a naive substring scan is
 * tripped by the explanation of the very thing it checks for.
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { NextActionPanel } from '@/components/student/dashboard/NextActionPanel'
import type { StudentNextAction } from '@/lib/studentNextAction'
import { studentApplicationWorkspacePath } from '@/routes/routeRegistry'

const SRC = join(__dirname, '../../src')

function readSource(relative: string): string {
  return readFileSync(join(SRC, relative), 'utf8')
}

/** Source with block and line comments removed (string literals preserved). */
function readCode(relative: string): string {
  return readSource(relative)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const DASHBOARD_SOURCE = readSource('pages/student/Dashboard.tsx')
const DASHBOARD_CODE = readCode('pages/student/Dashboard.tsx')
const APPLICATIONS_SECTION_CODE = readCode('components/student/dashboard/ApplicationsGrid.tsx')
const PANEL_CODE = readCode('components/student/dashboard/NextActionPanel.tsx')
const DRAFT_CARD_CODE = readCode('components/student/dashboard/DraftManagementCard.tsx')

function action(overrides: Partial<StudentNextAction> = {}): StudentNextAction {
  return {
    action: 'upload-identity-document',
    label: 'Upload your NRC or passport',
    href: '/student/application-wizard?mode=resume&draftId=app-1',
    applicationId: 'app-1',
    applicationStatus: 'draft',
    blockerCode: 'IDENTITY_DOCUMENT_REQUIRED',
    blockerMessage: 'An NRC or passport is required before this application can be submitted.',
    source: 'readiness',
    otherActions: [],
    ...overrides,
  }
}

function renderPanel(props: Partial<Parameters<typeof NextActionPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <NextActionPanel
        nextAction={action()}
        applicationCount={1}
        startApplicationHref="/student/application-wizard?mode=new"
        {...props}
      />
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// 1. The next action is the platform's, not the browser's (R13.1)
// ---------------------------------------------------------------------------
describe('the next action is server-derived', () => {
  it('renders the server label as the primary control, verbatim', () => {
    renderPanel()
    const primary = screen.getByTestId('next-action-primary')
    expect(primary.textContent).toContain('Upload your NRC or passport')
  })

  it('renders the server blocker sentence rather than re-authoring one', () => {
    renderPanel()
    expect(screen.getByTestId('next-action-detail').textContent).toBe(
      'An NRC or passport is required before this application can be submitted.',
    )
  })

  it('offers the rest of the platform\u2019s actions, in the platform\u2019s order', () => {
    renderPanel({
      nextAction: action({
        otherActions: [
          { action: 'change-selection', label: 'Choose another intake', href: '/a' },
          { action: 'contact-admissions', label: 'Contact admissions for help', href: '/contact' },
        ],
      }),
    })
    const items = screen.getByTestId('next-action-alternatives').querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]?.textContent).toContain('Choose another intake')
    expect(items[1]?.textContent).toContain('Contact admissions for help')
  })

  it('distinguishes "we could not check" from "nothing to do"', () => {
    renderPanel({ nextAction: null, readinessUnavailable: true })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'We could not check your application just now',
    )
    expect(screen.queryByText(/nothing needs you right now/i)).toBeNull()
  })

  it('says nothing needs the student only when the platform published no action', () => {
    renderPanel({ nextAction: null })
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Nothing needs you right now')
  })

  it('renders an action with nowhere to go as the page\u2019s own retry, not a dead link', () => {
    renderPanel({
      nextAction: action({ action: 'retry', label: 'Try again in a moment', href: null }),
      onRetry: () => {},
    })
    const primary = screen.getByTestId('next-action-primary')
    expect(primary.tagName).toBe('BUTTON')
    expect(primary.textContent).toContain('Try again in a moment')
  })

  it('announces the action politely, so a polling refresh reaches assistive technology', () => {
    renderPanel()
    const live = screen.getByRole('status')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('Next action: Upload your NRC or passport')
  })

  it('never states a status by colour alone', () => {
    renderPanel()
    const badge = screen.getByTestId('next-action-application')
    // The status word is present as text, and an icon accompanies it.
    expect(badge.textContent?.toLowerCase()).toContain('draft')
    expect(badge.querySelector('svg')).not.toBeNull()
  })

  it('the panel derives no lifecycle rule of its own', () => {
    // Every branch in the panel is about *presentation state* (loading, no
    // action, no application). It must not branch on an application status or a
    // payment status to decide what the student should do — that is the whole
    // finding.
    expect(PANEL_CODE).not.toMatch(/payment_status/)
    expect(PANEL_CODE).not.toMatch(/requiresStudentPaymentAction/)
    // The one status read in the panel is `StateIcon`, which chooses an icon so
    // the badge is never colour alone. It decides no action.
    const withoutStateIcon = PANEL_CODE.slice(0, PANEL_CODE.indexOf('function StateIcon'))
    expect(withoutStateIcon).not.toMatch(/status === '/)
  })
})

// ---------------------------------------------------------------------------
// 2. It comes first (R13.1, R16.1)
// ---------------------------------------------------------------------------
describe('the next action is ordered before everything passive', () => {
  it('is the first section the dashboard renders', () => {
    const panelIndex = DASHBOARD_CODE.indexOf('<NextActionPanel')
    const draftIndex = DASHBOARD_CODE.indexOf('<DraftManagementCard')
    const applicationsIndex = DASHBOARD_CODE.indexOf('<ApplicationsGrid')
    expect(panelIndex).toBeGreaterThan(-1)
    expect(panelIndex).toBeLessThan(draftIndex)
    expect(panelIndex).toBeLessThan(applicationsIndex)
  })

  it('has nothing above it in the page header', () => {
    // `PageShell`'s `metrics` render between the title and the children, so a
    // metrics array is literally above the next action.
    expect(DASHBOARD_CODE).not.toMatch(/metrics=\{/)
  })

  it('reads the readiness contract task 6.5 published', () => {
    expect(DASHBOARD_CODE).toContain('useStudentNextAction')
    expect(readCode('services/studentReadiness.ts')).toContain(
      '/api/v2/student/applications/',
    )
    expect(readCode('services/studentReadiness.ts')).toContain('/readiness/')
  })
})

// ---------------------------------------------------------------------------
// 3. The draft and the application status are concise (R16.1, R16.5)
// ---------------------------------------------------------------------------
describe('the draft and the application status are concise', () => {
  it('the draft card states a name and when it was saved, and nothing else', () => {
    // The card this replaced rendered a four-row metric table (progress, last
    // saved, expires in) plus a live countdown recomputed from the browser clock
    // every minute.
    expect(DRAFT_CARD_CODE).toContain('Saved ')
    expect(DRAFT_CARD_CODE).not.toMatch(/Expires in|getTimeUntilExpiry|setInterval/)
    expect(DRAFT_CARD_CODE).not.toMatch(/Progress/)
  })

  it('the draft card offers no second Refresh beside the page\u2019s own', () => {
    expect(DRAFT_CARD_CODE).not.toMatch(/RefreshCw|Refresh<\//)
  })

  it('the applications section is one column, not a three-across grid', () => {
    expect(APPLICATIONS_SECTION_CODE).not.toMatch(/lg:grid-cols-3/)
  })

  it('the applications section describes nothing it does not show', () => {
    // R16.5 / MAINT-02: the section descriptions were feature narration
    // ("Review submitted applications, payment progress, and document actions
    // after you complete the draft above.").
    expect(APPLICATIONS_SECTION_CODE).not.toMatch(/We'll guide you every step/)
    expect(APPLICATIONS_SECTION_CODE).not.toMatch(/Start your journey/)
  })

  /**
   * Task 10.6 §12 left this open: "Whether `/student/history` survives the
   * dashboard recomposition is task 11.1's question." The answer is **yes**, and
   * the reasoning is a contract difference rather than a preference.
   *
   * `/student/history` reads `GET /applications/history/` — the student's own
   * status-history rows across **every** application, paginated and grouped by
   * application number. The workspace's `ApplicationHistory` (10.6) reads the rows
   * for **one** application off the detail read it already made. R13.13 gives the
   * workspace *an* application's history; nothing else owns the cross-application
   * record, so removing this page would delete a read rather than de-duplicate one
   * — the same reasoning 10.6 used to keep communications as one inbox reached by a
   * link instead of a per-application feed.
   *
   * What the recomposition does change: the dashboard does not link to it. It is
   * reached from navigation, so the record is available without competing with the
   * next action for the first viewport.
   */
  it('keeps the cross-application record, and does not link to it from the dashboard', () => {
    expect(existsSync(join(SRC, 'pages/student/History.tsx'))).toBe(true)
    // A different contract from the workspace's own history, which is why both exist.
    expect(readCode('pages/student/History.tsx')).toContain('useTimeline')
    expect(readCode('services/communications.ts')).toContain('/applications/history/')
    expect(readCode('components/student/applicationStatus/ApplicationHistory.tsx')).not.toMatch(
      /applications\/history\//,
    )
    expect(DASHBOARD_CODE).not.toMatch(/\/student\/history/)
    expect(APPLICATIONS_SECTION_CODE).not.toMatch(/to="\/student\/history"|'\/student\/history'/)
  })

  /**
   * The traversal guard on `studentApplicationWorkspacePath` (found by this task's
   * property suite) only protects callers that use the builder. `ApplicationListItem`
   * built one workspace path by hand — 10.6's docstring even named a drift guard for
   * exactly this, which was never written. So this is that guard.
   */
  it('every student link to an application workspace goes through the one builder', () => {
    for (const relative of [
      'components/student/ApplicationListItem.tsx',
      'components/student/dashboard/ApplicationsGrid.tsx',
      'lib/studentNextAction.ts',
      'pages/student/ApplicationStatus.tsx',
    ]) {
      expect(readCode(relative), relative).not.toMatch(/['"`]\/student\/application\/\$\{/)
    }
    // And the builder refuses an id that would rewrite the path rather than
    // percent-encoding it, because `encodeURIComponent('..')` is `'..'`.
    expect(studentApplicationWorkspacePath('..')).toBe('/student/dashboard')
    expect(studentApplicationWorkspacePath('app-1')).toBe('/student/application/app-1/status')
  })
})

// ---------------------------------------------------------------------------
// 4. The decorative metrics and the duplicate quick actions are gone
// ---------------------------------------------------------------------------
describe('decorative metrics and duplicate quick actions are removed', () => {
  it('the dashboard publishes no metric it invented', () => {
    for (const label of ['Submitted applications', 'Profile completion', 'Action needed']) {
      expect(DASHBOARD_SOURCE).not.toContain(`label: '${label}'`)
    }
  })

  it('the four deleted dashboard surfaces are gone from disk', () => {
    for (const relative of [
      'components/student/QuickActions.tsx',
      'components/student/DashboardStatusOverview.tsx',
      'components/student/ApplicationTimeline.tsx',
      'components/student/dashboard/NextActionCard.tsx',
      'components/application/ContinueApplication.tsx',
    ]) {
      expect(existsSync(join(SRC, relative)), relative).toBe(false)
    }
  })

  it('no surface still imports them', () => {
    for (const code of [DASHBOARD_CODE, APPLICATIONS_SECTION_CODE]) {
      expect(code).not.toMatch(/from '@\/components\/student\/QuickActions'/)
      expect(code).not.toMatch(/from '@\/components\/student\/DashboardStatusOverview'/)
      expect(code).not.toMatch(/from '@\/components\/student\/ApplicationTimeline'/)
      expect(code).not.toMatch(/from '@\/components\/application\/ContinueApplication'/)
    }
  })

  it('the payment action is offered once, by the platform, not three times', () => {
    // Before: the next-action card, the QuickActions "Complete Payment" card, and
    // DashboardStatusOverview's payment alert all linked to `/student/payment`
    // from one screen — and the global bottom navigation has the same item.
    const paymentLinks = DASHBOARD_CODE.match(/\/student\/payment/g) ?? []
    expect(paymentLinks).toHaveLength(0)
  })

  it('the dashboard no longer measures the student\u2019s profile completeness', () => {
    expect(DASHBOARD_CODE).not.toMatch(/calculateProfileCompletion|ProfileCompletionBadge/)
  })
})

// ---------------------------------------------------------------------------
// 5. Destructive draft cleanup is scoped, dialog-confirmed, and not global
// ---------------------------------------------------------------------------
describe('destructive draft cleanup is scoped to one draft', () => {
  it('the dashboard has no clear-all', () => {
    expect(DASHBOARD_CODE).not.toMatch(/clearAllDrafts|executeClearAllDrafts/)
    expect(readCode('pages/student/lib/dashboardReducer.ts')).not.toMatch(/clearAllDrafts/)
  })

  it('deletion goes through the one scoped command', () => {
    expect(DRAFT_CARD_CODE).toContain('deleteStudentDraft')
    const cleanup = readCode('lib/studentDraftCleanup.ts')
    // One application id in, one out. Task 6.3's addressed local cleanup.
    expect(cleanup).toMatch(/applicationService\.delete\(id\)/)
    expect(cleanup).toMatch(/clearWizardDraftCache\(\{ userId: userId \?\? null, applicationId: id \}/)
    expect(cleanup).not.toMatch(/clearAllDraftData|clearAllDrafts|forceCleanBrowserStorage/)
  })

  it('never clears the payment-recovery store', () => {
    // Steering "Student Draft Lifecycle": payment-linked drafts and their
    // recovery caches must never be wiped by cleanup.
    expect(readCode('lib/studentDraftCleanup.ts')).not.toMatch(/payment-recovery|paymentRecoveryStore/)
  })

  it('surfaces the platform\u2019s payment-linked refusal as protection, not failure', () => {
    const cleanup = readCode('lib/studentDraftCleanup.ts')
    expect(cleanup).toContain('DRAFT_HAS_PAYMENT_ACTIVITY')
    expect(cleanup).toContain('isProtectedDraftPaymentError')
  })

  it('confirms with the product dialog, never window.confirm (R16.6)', () => {
    expect(DRAFT_CARD_CODE).toContain('ConfirmAlertDialog')
    expect(DRAFT_CARD_CODE).not.toMatch(/window\.confirm/)
    // The wizard's scoped draft-management surface. It was a floating drawer
    // (`components/DraftManager.tsx`) when 11.1 converted it off `window.confirm`;
    // admissions-v2 task **11.2** replaced the drawer *and* the separate
    // draft-choice screen with one `WizardDraftPicker` (R16.3 — the drawer's
    // `fixed top-20 right-4` trigger was one of four surfaces anchored to a phone
    // viewport at once). The claim is unchanged and now has one place to hold.
    const wizardPicker = readCode('pages/student/applicationWizard/components/WizardDraftPicker.tsx')
    expect(wizardPicker).not.toMatch(/window\.confirm/)
    expect(wizardPicker).toContain('ConfirmAlertDialog')
  })

  /**
   * There were **three** hand-rolled copies of "delete this one draft", not two.
   * The third was the wizard's draft-choice screen, and it was the last
   * `window.confirm` still owning a destructive draft workflow — found by grepping
   * the student surfaces after the first two were converted, not by a test.
   */
  it('all three scoped surfaces issue the same command, none of them natively', () => {
    // 11.1 found three hand-rolled copies of "delete this one draft" and put them
    // all on `deleteStudentDraft`. Task **11.2** then merged the wizard's two copies
    // (the floating drawer and the draft-choice screen) into one `WizardDraftPicker`,
    // so the three call sites are now two components and the shared draft hook.
    for (const relative of [
      'components/student/dashboard/DraftManagementCard.tsx',
      'pages/student/applicationWizard/hooks/useMultiDraft.ts',
    ]) {
      expect(readCode(relative), relative).toContain('deleteStudentDraft')
    }
    const picker = readCode('pages/student/applicationWizard/components/WizardDraftPicker.tsx')
    expect(picker).toContain('deleteDraft')
    expect(picker).toContain('ConfirmAlertDialog')
    expect(picker).toContain('Your other drafts are not affected.')
    // No surface re-implements the command it used to inline.
    expect(picker).not.toMatch(/applicationService\.delete\(/)
    const wizard = readCode('pages/student/applicationWizard/index.tsx')
    expect(wizard).not.toMatch(/window\.confirm/)
    expect(wizard).not.toMatch(/applicationService\.delete\(/)
  })

  it('names the one draft in the confirmation, and says the others survive', () => {
    expect(DRAFT_CARD_CODE).toContain('Your other drafts are not affected.')
  })

  it('the local-only draft is resumable but not deletable, because it has no id to address', () => {
    const localRow = DRAFT_CARD_CODE.slice(DRAFT_CARD_CODE.indexOf('draft-row-local'))
    expect(localRow).toContain('studentApplicationLocalResumePath')
    expect(localRow).not.toMatch(/handleDelete/)
  })
})
