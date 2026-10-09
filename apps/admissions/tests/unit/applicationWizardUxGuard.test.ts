// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WIZARD_ROOT = path.resolve(__dirname, '../../src/pages/student/applicationWizard')

const read = (relative: string) => readFileSync(path.join(WIZARD_ROOT, relative), 'utf8')

/**
 * Strip comments before scanning for something's *absence*.
 *
 * The code that removed a surface is also the code documenting why it was removed,
 * so a naive substring scan is tripped by the explanation of the very thing it
 * checks for — `index.tsx` says, in prose, that the unsaved-changes guard "was
 * `window.confirm`". Task 11.1 hit the same trap and solved it the same way.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const wizardSource = read('index.tsx')
const wizardCode = stripComments(wizardSource)

/**
 * The wizard as **one surface**, not one file (admissions-v2 task 11.2, MAINT-01).
 *
 * This guard used to read `index.tsx` alone and assert that a dozen strings
 * appeared in it — which pinned *where the code lived* rather than what the wizard
 * does, and would therefore have failed on a decomposition that changed nothing a
 * student can see. `useWizardController.contract.test.ts` had already hit the same
 * wall and solved it the same way: read the controller plus its extracted sub-hooks
 * as one source.
 *
 * So the affordances are asserted against the composed surface, and the two claims
 * that are genuinely about *placement* — that the action bar is the only anchored
 * bottom surface, and that the mode banner is in the page rather than a step — are
 * asserted against the specific file that owns them.
 */
const wizardSurface = [
  'index.tsx',
  'components/WizardActionBar.tsx',
  'components/WizardContextPanel.tsx',
  'components/WizardDraftPicker.tsx',
  'components/WizardProgressSummary.tsx',
  'components/WizardStepRenderer.tsx',
]
  .map(read)
  .join('\n')

/** The same surface with comments removed, for the "this is gone" assertions. */
const wizardCodeSurface = stripComments(wizardSurface)

describe('application wizard UX guard', () => {
  it('keeps explicit mode, autosave, and draft-card affordances visible', () => {
    expect(wizardSource).toContain('wizardModeSummary')
    expect(wizardSource).toContain('New application')
    expect(wizardSource).toContain('Resuming draft')
    // Autosave state moved into the one bottom action surface (R16.3) rather than
    // sitting in a second strip beside the progress header.
    expect(wizardSurface).toContain('AutoSaveIndicator')
    expect(read('components/WizardActionBar.tsx')).toContain('AutoSaveIndicator')
  })

  /**
   * The payment protection moved rather than disappearing (admissions-v2 task
   * 11.1). This used to assert `isProtectedDraftPaymentError` *in the wizard page*,
   * which pinned where the refusal was handled rather than that it was handled.
   * Task 11.2 moved the draft list itself into `WizardDraftPicker` — one list for
   * the choice screen and the in-wizard switcher — and it still reaches the one
   * scoped command, which still owns the refusal.
   */
  it('keeps saved draft cards actionable and payment-protected', () => {
    expect(wizardSurface).toContain('Delete draft')
    expect(wizardSurface).toContain('Continue draft')
    expect(wizardSurface).toContain('Last saved')
    // The one scoped delete command, reached through task 6.2's draft hook.
    const pickerSource = read('components/WizardDraftPicker.tsx')
    expect(pickerSource).toContain('useMultiDraft')
    expect(pickerSource).toContain('deleteDraft')
    const multiDraftSource = read('hooks/useMultiDraft.ts')
    expect(multiDraftSource).toContain('deleteStudentDraft')
    const cleanupSource = readFileSync(
      path.resolve(__dirname, '../../src/lib/studentDraftCleanup.ts'),
      'utf8',
    )
    expect(cleanupSource).toContain('isProtectedDraftPaymentError')
    expect(cleanupSource).toContain('DRAFT_HAS_PAYMENT_ACTIVITY')
  })

  it('prevents back navigation from silently restoring an abandoned draft choice', () => {
    expect(wizardSource).toContain('navigate(studentApplicationNewPath(), { replace: true })')
    expect(wizardSource).toContain('form.reset()')
    // Quote-agnostic: `index.tsx` was reformatted to double quotes on 2026-08-25,
    // which broke the literal-string form of this pin without changing the code.
    expect(wizardSource).toMatch(/draftIntent\.mode === ["']new["']/)
    expect(wizardSource).toMatch(/draftIntent\.mode === ["']local["']/)
  })

  /**
   * R16.3 is a claim about placement, so it is asserted about placement: exactly one
   * file in the wizard anchors anything to the bottom of the viewport, and it is the
   * action bar. The floating `Drafts (n)` button (`fixed top-20 right-4`) and the
   * per-page sticky footer that used to compete with it are gone.
   */
  it('renders one anchored bottom surface, and it is the action bar', () => {
    expect(read('components/WizardActionBar.tsx')).toContain('sticky bottom-0')
    expect(wizardCode).not.toContain('sticky bottom-0')
    expect(wizardCodeSurface).not.toContain('fixed top-20')
    expect(wizardCodeSurface).not.toContain('fixed bottom-0')
  })

  /** R16.6: no native dialog owns a wizard workflow any more. */
  it('uses the product dialog for the unsaved-changes guard', () => {
    expect(wizardCodeSurface).not.toContain('window.confirm')
    expect(wizardSource).toContain('ConfirmAlertDialog')
    expect(wizardSource).toContain('Leave this application?')
  })
})
