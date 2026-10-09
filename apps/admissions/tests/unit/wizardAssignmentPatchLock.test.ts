// @vitest-environment node
/**
 * Wizard contract — the assignment never rides a generic draft update.
 *
 * Spec: .kiro/specs/admissions-v2-canonical-rebuild/ — task 6.4.
 * Requirements: R7.2, R10.5 · Findings: STU-01, DATA-01.
 * Design: design.md §7.2 — "Generic PATCH never accepts assignment identifiers
 * or their display snapshots … Before any payment exists,
 * `ChangeSelectionCommand` may atomically reassign the draft."
 *
 * Finding STU-01 was reproduced by exactly one call site: the wizard's
 * personal-step advance PATCHed `program` / `intake` / `institution` onto an
 * existing draft, moving the display labels while the canonical routing ids
 * stayed behind. This test pins the fix at the source level (the same style as
 * `useWizardController.contract.test.ts`): the update payload carries no
 * assignment field, and the reroute command is what moves the selection.
 *
 * Validates: Requirements R7.2, R10.5
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The personal-step advance — the one call site that reproduced STU-01 — was lifted
 * **verbatim** out of `useWizardController` into `wizard/useWizardStepAdvance.ts`
 * when admissions-v2 task 11.2 finished MAINT-01's split. This is a source-location
 * repoint only: every claim below is the same claim about the same payload, and the
 * payload moved without being retyped (which is exactly why the split was done as a
 * lift — see §10.1 of `docs/v2-evidence/11.2/README.md` for what re-authoring cost
 * the first time it was tried).
 */
const CONTROLLER = 'src/pages/student/applicationWizard/hooks/wizard/useWizardStepAdvance.ts'
/**
 * Task 6.3 moved the draft write into the one draft machine. The answer payload
 * is now a named projection (`projectDraftAnswers` in `lib/draftAutosave.ts`,
 * lifted verbatim from the old inline `updatePayload` literal), and the machine
 * (`lib/wizardDraftController.ts`) is the only caller of `updateDraft` through
 * its adapter (`useWizardDraftPersistence.ts`).
 */
const PERSISTENCE = 'src/pages/student/applicationWizard/hooks/wizard/useWizardDraftPersistence.ts'
const PROJECTION = 'src/pages/student/applicationWizard/lib/draftAutosave.ts'
const MACHINE = 'src/lib/wizardDraftController.ts'

const read = (rel: string) => fs.readFileSync(path.resolve(rel), 'utf8')

/** Extract the object literal beginning at a marker ending in `{`. */
function extractMutatePayload(source: string, marker: string): string {
  const start = source.indexOf(marker)
  expect(start, `expected to find ${marker}`).toBeGreaterThan(-1)
  const from = start + marker.length
  let depth = 1
  for (let i = from; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(from, i)
    }
  }
  throw new Error(`unbalanced braces after ${marker}`)
}

describe('wizard draft update never carries assignment fields (task 6.4)', () => {
  const controller = read(CONTROLLER)

  it('the existing-draft update payload contains no assignment display field', () => {
    expect(controller).toContain('saveDraft({ syncServer: true, requireServer: true })')
    expect(controller).not.toContain('updateApplication.mutateAsync')
    expect(controller).not.toContain('createApplication.mutateAsync')
  })

  it('the autosave update payload contains no assignment display field', () => {
    const projection = read(PROJECTION)
    const payload = extractMutatePayload(
      projection,
      'export function projectDraftAnswers(formData: Partial<WizardFormData>): Record<string, string | undefined> {\n  return {',
    )
    expect(payload).not.toMatch(/\bprogram\s*:/)
    expect(payload).not.toMatch(/\bintake\s*:/)
    expect(payload).not.toMatch(/\binstitution\s*:/)
    const persistence = read(PERSISTENCE)
    expect(persistence).toContain('applicationService.updateDraft(')
    expect(persistence).toContain('projectAnswers: () => projectDraftAnswers(getValues())')
    const machine = read(MACHINE)
    expect(machine).toContain('expectedVersion')
    expect(machine).toContain('this.adapters.updateDraft(applicationId, command.payload, expectedVersion, command.key)')
  })

  it('serializes autosave and Continue instead of answering a concurrent manual save with null', () => {
    const machine = read(MACHINE)
    // Every command joins one chain, read at execution time.
    expect(machine).toContain('const run = this.chain.catch(() => undefined).then(task)')
    expect(machine).toContain('commit(): Promise<WizardDraftRecord> {')
    expect(machine).toContain('this.applicationId = id')
    expect(machine).not.toContain('if (isSavingRef.current)')
    // Continue that requires the server rejects instead of resolving null.
    expect(machine).toContain("if (!record) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)")
  })

  it('the legacy session cache is no longer a draft writer at all', () => {
    const session = read('src/lib/applicationSession.ts')
    expect(session).not.toContain('applicationService.update(')
    expect(session).not.toContain('setInterval(')
    expect(session).not.toContain('async saveDraft(')
  })

  it('moves the selection through the reroute command instead', () => {
    // The *call* is in the advance command; the adapter it calls stayed in the
    // controller, so the claim is read across both — the same two halves the
    // rejected-reroute case below reads.
    const reroute = `${controller}\n${read('src/pages/student/applicationWizard/hooks/useWizardController.ts')}`
    expect(reroute).toContain('applyDraftSelectionChange({')
    expect(reroute).toContain('resolveSelectionChangeIntent')
    expect(reroute).toContain('resolveSelectionChangeRecovery')
    expect(reroute).toContain('applicationService.changeSelection(')
  })

  it('blocks the step advance and surfaces recovery when the reroute is rejected', () => {
    // A rejected reroute (e.g. payment activity) must not silently advance the
    // wizard onto a selection the server refused.
    expect(controller).toMatch(/if\s*\(!rerouted\.ok\)\s*{[\s\S]{0,200}return/)
    expect(controller).toContain('rerouted.recovery.message')
  })
})
