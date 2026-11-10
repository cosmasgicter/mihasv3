/**
 * The wizard's mobile recomposition (admissions-v2 task 11.2).
 *
 * Requirements: **R16.1** (320 px first; nothing essential depends on a desktop
 * layout), **R16.2** (44 px targets, names, keyboard), **R16.3** (one mobile bottom
 * action surface; the global bottom navigation must not compete), **R16.7**,
 * **R16.8**. Findings: **STU-02**, **STU-03**, **MAINT-01**.
 *
 * These are the claims that are *supposed* to change, which is why they are here
 * and not in `applicationWizardCharacterisation.test.ts` — that file's contract is
 * that it reads identically before and after.
 *
 * Layout geometry is not asserted here. jsdom has no layout engine, so "44 px" and
 * "no overflow" are measured in a real browser by
 * `tests/harness-e2e/required/student-wizard-mobile.spec.ts`. What is asserted here
 * is what the DOM can answer: that the checklist exists at mobile width at all,
 * that the disclosure is a real ARIA disclosure, that the blockers rendered are the
 * platform's own strings, and that the shell drops the global bottom bar on the
 * wizard route.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { WizardStillNeeded } from '@/pages/student/applicationWizard/components/WizardStillNeeded'
import { WizardProgressSummary } from '@/pages/student/applicationWizard/components/WizardProgressSummary'
import { WizardActionBar } from '@/pages/student/applicationWizard/components/WizardActionBar'
import {
  resolveWizardDeepLinkStep,
  wizardStepKeyFromServerStep,
} from '@/pages/student/applicationWizard/lib/wizardStepDeepLink'
import {
  ASSIGNED_SCHOOL_STEP_INDEX,
  getStepIndexByKey,
  wizardSteps,
} from '@/pages/student/applicationWizard/steps/config'
import { routeForStudentNextAction } from '@/lib/studentNextAction'
import { WIZARD_DEEP_LINK_STEPS } from '@/routes/routeRegistry'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'
import type { ReadinessBlocker } from '@/types/database'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SRC = path.resolve(__dirname, '../../src')
const readSrc = (relative: string) => readFileSync(path.join(SRC, relative), 'utf8')

/** Pretend to be a 320 px phone for `useResponsive` (it reads `window.innerWidth`). */
function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 568 })
  window.dispatchEvent(new Event('resize'))
}

const blocker = (code: string, message: string): ReadinessBlocker => ({
  code,
  category: 'documents',
  message,
  retryable: false,
  fields: [],
  details: {},
})

const stillNeededProps = {
  items: [
    { field: 'nrc_number', label: 'NRC or passport', message: 'Enter either your NRC or passport number.' },
    { field: 'date_of_birth', label: 'Date of birth', message: 'Enter your date of birth.' },
  ],
  onGoToField: () => {},
  onSwitchApplication: () => {},
  onStartNew: () => {},
  blockers: [] as ReadinessBlocker[],
  readinessLoading: false,
  readinessUnavailable: false,
  canSubmit: null as boolean | null,
  notEvaluatedYet: false,
  onRetryReadiness: () => {},
}
describe('wizard recomposition: the still-needed list reaches a phone (R16.1, STU-03; task 25.2)', () => {
  const originalWidth = window.innerWidth
  afterEach(() => {
    setViewportWidth(originalWidth)
  })
  it('offers the list behind a real disclosure at 320 px, named by its count', () => {
    setViewportWidth(320)
    render(<WizardStillNeeded {...stillNeededProps} />)
    const toggle = screen.getByTestId('wizard-context-toggle')
    expect(toggle.textContent).toContain('2 still needed')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('wizard-context-region')
    expect(screen.queryByTestId('wizard-context-region')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const region = screen.getByTestId('wizard-context-region')
    expect(within(region).getByText('NRC or passport')).toBeTruthy()
    expect(within(region).getByText('Date of birth')).toBeTruthy()
  })
  it('is open with no disclosure control on a desktop width', () => {
    setViewportWidth(1280)
    render(<WizardStillNeeded {...stillNeededProps} />)
    expect(screen.queryByTestId('wizard-context-toggle')).toBeNull()
    expect(screen.getByTestId('wizard-context-region')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Still needed' })).toBeTruthy()
  })
  it('renders exactly one instance of the panel, so a screen reader meets it once', () => {
    setViewportWidth(320)
    render(<WizardStillNeeded {...stillNeededProps} />)
    expect(screen.getAllByTestId('wizard-context-panel')).toHaveLength(1)
  })
  it('replaces the four old rails: no checklist, preview, step notes or applications card', () => {
    setViewportWidth(1280)
    render(<WizardStillNeeded {...stillNeededProps} />)
    expect(screen.queryByText(/step checklist/i)).toBeNull()
    expect(screen.queryByText(/application preview/i)).toBeNull()
    expect(screen.queryByText(/step notes/i)).toBeNull()
    expect(screen.queryByText(/^your applications$/i)).toBeNull()
  })
  it('gives each item a Go to field link and carries both draft commands', () => {
    setViewportWidth(1280)
    const onGoToField = vi.fn()
    const onSwitchApplication = vi.fn()
    const onStartNew = vi.fn()
    render(
      <WizardStillNeeded
        {...stillNeededProps}
        onGoToField={onGoToField}
        onSwitchApplication={onSwitchApplication}
        onStartNew={onStartNew}
      />,
    )
    const links = screen.getAllByRole('button', { name: 'Go to field' })
    expect(links).toHaveLength(2)
    // The visible name is the whole accessible name; the item it belongs to is the description.
    expect(links[0]!.getAttribute('aria-describedby')).toBeTruthy()
    fireEvent.click(links[1]!)
    expect(onGoToField).toHaveBeenCalledWith('date_of_birth')
    fireEvent.click(screen.getByRole('button', { name: 'Switch application' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start a new application' }))
    expect(onSwitchApplication).toHaveBeenCalledTimes(1)
    expect(onStartNew).toHaveBeenCalledTimes(1)
  })
  it('says the step is complete when nothing on it is outstanding', () => {
    setViewportWidth(1280)
    render(<WizardStillNeeded {...stillNeededProps} items={[]} />)
    expect(screen.getByText('This step is complete.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Go to field' })).toBeNull()
  })
})
describe('wizard recomposition: the blockers are the platform\u2019s (R16.1)', () => {
  const renderPanel = (overrides: Partial<typeof stillNeededProps> = {}) => {
    setViewportWidth(1280)
    return render(<WizardStillNeeded {...stillNeededProps} {...overrides} />)
  }
  it('prints the server\u2019s blocker messages verbatim, in the server\u2019s order', () => {
    renderPanel({
      blockers: [
        blocker('MINIMUM_GRADES_REQUIRED', 'Add at least 5 Grade 12 subjects.'),
        blocker('IDENTITY_DOCUMENT_REQUIRED', 'Upload your NRC or passport.'),
        blocker('PAYMENT_REQUIRED', 'Pay or defer the application fee.'),
      ],
    })
    const rendered = screen.getAllByTestId('wizard-blocker').map(node => node.textContent)
    expect(rendered).toEqual([
      'Add at least 5 Grade 12 subjects.',
      'Upload your NRC or passport.',
    ])
    expect(screen.getByText('3 things are still needed')).toBeTruthy()
    expect(screen.getByText(/and 1 more/)).toBeTruthy()
    expect(screen.getAllByTestId('wizard-blocker')[0]?.getAttribute('data-blocker-code')).toBe(
      'MINIMUM_GRADES_REQUIRED',
    )
  })
  /**
   * The distinction task 11.1 established on the dashboard, kept here: a readiness
   * that could not be read is *unknown*, and saying "nothing is outstanding" would
   * be telling a student they are done when the platform was never asked.
   */
  it('keeps \u201cwe could not check\u201d apart from \u201cnothing is outstanding\u201d', () => {
    const retry = vi.fn()
    const { unmount } = renderPanel({ readinessUnavailable: true, onRetryReadiness: retry })
    expect(screen.getByText(/could not check your application/i)).toBeTruthy()
    expect(screen.queryByTestId('wizard-no-blockers')).toBeNull()
    expect(screen.getByRole('button', { name: /check again/i })).toBeTruthy()
    unmount()
    renderPanel({ canSubmit: false })
    expect(screen.getByTestId('wizard-no-blockers').textContent).toContain(
      'Nothing is outstanding on your application right now.',
    )
    expect(screen.queryByText(/could not check/i)).toBeNull()
  })
  it('says nothing about blockers before a draft exists to evaluate', () => {
    renderPanel({ notEvaluatedYet: true })
    expect(screen.getByText(/choose your programme and intake/i)).toBeTruthy()
    expect(screen.queryByTestId('wizard-no-blockers')).toBeNull()
  })
  it('reports one progress number, once, with an accessible progressbar', () => {
    render(
      <WizardProgressSummary stepNumber={4} totalSteps={6} percentComplete={62} modeLabel="Draft in progress" />,
    )
    expect(screen.getByTestId('wizard-progress-percent').textContent).toBe('62%')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('62')
    expect(screen.getByText('Step 4 of 6')).toBeTruthy()
    expect(screen.getByTestId('wizard-mode-summary').textContent).toBe('Draft in progress')
  })
  /**
   * The source claim behind the behavioural ones: these surfaces read no form field
   * and derive no requirement. A panel that starts computing blockers is back to
   * the defect (`Missing: Assigned school, NRC or passport +8 more`) that 11.1
   * removed from the dashboard.
   */
  it('derives no blocker of its own', () => {
    for (const file of [
      'pages/student/applicationWizard/components/WizardProgressSummary.tsx',
      'pages/student/applicationWizard/components/WizardStillNeeded.tsx',
    ]) {
      const source = readSrc(file)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      expect(source).not.toContain('buildWizardReadiness')
      expect(source).not.toContain('Missing:')
    }
  })
})
describe('wizard recomposition: one bottom action surface (R16.3)', () => {
  const barProps = {
    previousStepTitle: 'Personal',
    nextStepTitle: 'Payment',
    isLastStep: false,
    loading: false,
    nextDisabled: false,
    submitDisabled: false,
    nextLabel: 'Next Step',
    onPrev: () => {},
    onNext: () => {},
    onSaveNow: () => {},
    saveStatus: 'saved' as const,
    saveError: null,
    lastSavedAt: Date.now(),
    isOnline: true,
    keyboardOpen: false,
  }

  it('carries the step controls, manual save and draft state in one surface', () => {
    render(<WizardActionBar {...barProps} />)
    const bar = screen.getByTestId('wizard-action-bar')
    expect((within(bar).getByRole('button', { name: 'Continue to Payment' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(bar).getByRole('button', { name: 'Go back to Personal' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(bar).getByRole('button', { name: /save now/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('names the offline state in words, not by colour alone', () => {
    render(<WizardActionBar {...barProps} isOnline={false} />)
    expect(screen.getByTestId('wizard-offline-badge').textContent).toContain(
      'Offline',
    )
  })

  it('releases its sticky position while the on-screen keyboard is open', () => {
    const { rerender } = render(<WizardActionBar {...barProps} />)
    expect(screen.getByTestId('wizard-action-bar').className).toContain('sticky bottom-0')
    rerender(<WizardActionBar {...barProps} keyboardOpen />)
    expect(screen.getByTestId('wizard-action-bar').className).not.toContain('sticky bottom-0')
  })

  it('pads for the device safe area (R16.3)', () => {
    render(<WizardActionBar {...barProps} />)
    expect(screen.getByTestId('wizard-action-bar').className).toContain(
      'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
    )
  })

  it('offers submit instead of continue on the last step, and refuses when readiness is unmet', () => {
    render(<WizardActionBar {...barProps} isLastStep submitDisabled />)
    const submit = screen.getByRole('button', { name: /submit application/i })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    expect(submit.getAttribute('type')).toBe('submit')
    expect(screen.queryByRole('button', { name: /^continue to/i })).toBeNull()
  })

  it('never hides the manual save behind a failing autosave', () => {
    render(
      <WizardActionBar {...barProps} saveStatus="error" saveError="We could not reach the server." />,
    )
    expect(screen.getByText('We could not reach the server.')).toBeTruthy()
    expect((screen.getByRole('button', { name: /save now/i }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: 'Continue to Payment' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks saving a stale draft and lets the student reload the latest version', () => {
    const reloadConflict = vi.fn()
    render(
      <WizardActionBar
        {...barProps}
        saveStatus="conflict"
        saveError="This draft changed elsewhere. Reload the latest version before saving."
        onReloadConflict={reloadConflict}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(
      within(alert).getByText(
        'This draft changed elsewhere. Reload the latest version before saving.',
      ),
    ).toBeTruthy()
    expect((screen.getByRole('button', { name: /save now/i }) as HTMLButtonElement).disabled).toBe(
      true,
    )

    const reload = within(alert).getByRole('button', { name: /reload latest draft/i })
    expect((reload as HTMLButtonElement).disabled).toBe(false)
    reload.focus()
    expect(document.activeElement).toBe(reload)
    fireEvent.click(reload)
    expect(reloadConflict).toHaveBeenCalledOnce()
  })
})

describe('wizard recomposition: the global bottom navigation is suppressed (R16.3)', () => {
  /**
   * The shell already dropped its bar on the wizard route; nothing was asserting
   * it, so nothing stopped it coming back. Both halves are pinned: the suppression,
   * and the padding that would otherwise leave a phantom 5 rem gap where the bar
   * used to be.
   */
  const layout = readSrc('components/navigation/AppLayout.tsx')

  it('drops the bottom bar on the wizard route and its alias', () => {
    expect(layout).toContain("isWizardRoute = location.pathname === '/apply'")
    expect(layout).toContain("location.pathname.startsWith(pathFor('student.applicationWizard'))")
    expect(layout).toContain('{!isWizardRoute && (')
  })

  it('removes the bottom-bar padding on the wizard route too', () => {
    expect(layout).toContain("isWizardRoute ? 'pb-6 md:pb-6' : 'pb-20 md:pb-6'")
  })
})

describe('wizard recomposition: step deep-linking (task 11.1\u2019s deferral)', () => {
  const resolved = { assignmentResolved: true }
  const unresolved = { assignmentResolved: false }

  it('reads only the step vocabulary the wizard owns', () => {
    expect(wizardStepKeyFromServerStep('education')).toBe('education')
    expect(wizardStepKeyFromServerStep('payment')).toBe('payment')
    expect(wizardStepKeyFromServerStep('view-status')).toBeNull()
    expect(wizardStepKeyFromServerStep(undefined)).toBeNull()
    expect(wizardStepKeyFromServerStep('')).toBeNull()
  })

  it('opens a reachable step that the URL asked for', () => {
    expect(resolveWizardDeepLinkStep('?step=education', resolved)).toEqual({
      index: getStepIndexByKey('education'),
      deferred: false,
      requested: 'education',
    })
  })

  /**
   * The browser run corrected this rule. The first version clamped an unreachable
   * request to the assigned-school checkpoint, which dragged a student *backwards*
   * out of the step they were already working in. Staying put is always legal —
   * the resume machine only ever lands on a reachable step — so the link is
   * explained instead of followed.
   */
  it('does not move for an unreachable step, and says why', () => {
    const resolution = resolveWizardDeepLinkStep('?step=payment', unresolved)
    expect(resolution.index).toBeNull()
    expect(resolution.deferred).toBe(true)
    expect(resolution.requested).toBe('payment')
    // The checkpoint itself is always reachable, so a link to it is followed.
    expect(resolveWizardDeepLinkStep('?step=assignedSchool', unresolved).index).toBe(
      ASSIGNED_SCHOOL_STEP_INDEX,
    )
  })

  it('leaves the resume machine alone when the URL asks for nothing it understands', () => {
    expect(resolveWizardDeepLinkStep('', resolved).index).toBeNull()
    expect(resolveWizardDeepLinkStep('?step=nonsense', resolved).index).toBeNull()
    expect(resolveWizardDeepLinkStep('?mode=resume&draftId=abc', resolved).index).toBeNull()
  })

  /**
   * The wizard must read the link the *student* followed, not the `?step=` it writes
   * over that link on its own first history sync.
   */
  it('reads the opened URL once, from a ref captured before the history sync', () => {
    const source = readSrc('pages/student/applicationWizard/index.tsx')
    expect(source).toContain('openedSearchRef')
    expect(source).toContain('deepLinkAppliedRef')
    expect(source).toContain('resolveWizardDeepLinkStep(openedSearchRef.current')
    // And it re-decides when the gate answers rather than refusing on the first
    // pass: `assignmentResolved` is false while the server read is still in flight,
    // which is how the browser run caught a good `?step=personal` link being refused.
    expect(source).toContain('hasAssignmentSelection')
    expect(source).toContain('nothingToResolveFrom')
  })
})

describe('wizard recomposition: the decorative surfaces are gone, not moved', () => {
  const wizardIndex = readSrc('pages/student/applicationWizard/index.tsx')

  it('renders no PageShell metrics row above the work (R16.5)', () => {
    expect(wizardIndex).not.toContain('metrics={[')
  })

  it.each([
    'pages/student/applicationWizard/components/AnalyticsDashboard.tsx',
    'pages/student/applicationWizard/components/DraftManager.tsx',
    'pages/student/applicationWizard/lib/progressSummary.ts',
  ])('deletes %s rather than relocating it', relative => {
    expect(() => readSrc(relative)).toThrow()
  })

  it('no longer estimates how long the student will take', () => {
    expect(wizardIndex).not.toContain('useEstimatedTime')
    expect(wizardIndex).not.toContain('formattedTime')
  })

  it('keeps the step rail but not its duplicate progress bar', () => {
    expect(wizardIndex).toContain('EnhancedProgressIndicator')
    expect(wizardIndex).toContain('compact')
    const indicator = readSrc(
      'pages/student/applicationWizard/components/EnhancedProgressIndicator.tsx',
    )
    expect(indicator).toContain('compact = false')
  })
})

describe('wizard recomposition: 11.1\u2019s route table now deep-links (R13.1 + R10.2)', () => {
  it('keeps one step vocabulary between the registry and the wizard', () => {
    expect([...WIZARD_DEEP_LINK_STEPS]).toEqual(wizardSteps.map(step => step.key))
  })

  it('resumes a draft at the step the platform named', () => {
    const href = routeForStudentNextAction('add-grades', {
      applicationId: 'app-1',
      isDraft: true,
      relatedApplicationId: null,
      stepKey: 'education',
    })
    expect(href).toBe('/student/application-wizard?mode=resume&draftId=app-1&step=education')
  })

  it('drops a step the wizard does not own rather than emitting a link it would ignore', () => {
    const href = routeForStudentNextAction('view-status', {
      applicationId: 'app-1',
      isDraft: true,
      relatedApplicationId: null,
      stepKey: 'not-a-step',
    })
    expect(href).not.toContain('step=')

    const draftHref = routeForStudentNextAction('add-grades', {
      applicationId: 'app-1',
      isDraft: true,
      relatedApplicationId: null,
      stepKey: 'not-a-step',
    })
    expect(draftHref).toBe('/student/application-wizard?mode=resume&draftId=app-1')
  })

  it('still addresses the draft by its own id, with or without a step', () => {
    ;['education', null].forEach(stepKey => {
      const href = routeForStudentNextAction('complete-profile', {
        applicationId: 'app-9',
        isDraft: true,
        relatedApplicationId: null,
        stepKey,
      })
      expect(href).toContain('mode=resume')
      expect(href).toContain('draftId=app-9')
    })
  })
})
