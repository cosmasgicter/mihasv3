// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('useWizardController Step 1 API contract regression', () => {
  // The Step-1 save/create logic was extracted into the draft-persistence
  // sub-hook during the wizard refactor. The contract (Django validates by
  // program name + intake.name, not the display label) must still hold, so
  // we read the controller plus its extracted sub-hooks as one surface.
  //
  // `useWizardStepAdvance` and `useWizardSubmission` joined that surface when
  // admissions-v2 task 11.2 finished MAINT-01's split: the forward command (472
  // lines) and the submit command (176) were lifted verbatim out of the controller,
  // so `goToStep(currentStepIndex + 1)` now lives in the first of them. This is a
  // *source-location* repoint only — every behavioural claim below is the same
  // claim, made of the same strings, and the strings moved without being retyped.
  //
  // Task 6.3 (one draft machine) moved the start command's payload builder into
  // the machine's start adapter (`projectStart`, still in the persistence hook)
  // and the draft picker's hydration into the one shared mapping
  // (`lib/draftHydration.ts`), which is where `resolvedProgramId` now lives.
  const sourceFiles = [
    'src/pages/student/applicationWizard/hooks/useWizardController.ts',
    'src/pages/student/applicationWizard/hooks/wizard/useWizardDraftPersistence.ts',
    'src/pages/student/applicationWizard/hooks/wizard/useWizardStepAdvance.ts',
    'src/pages/student/applicationWizard/hooks/wizard/useWizardSubmission.ts',
    'src/pages/student/applicationWizard/lib/draftHydration.ts',
  ]
  const source = sourceFiles
    .map((rel) => fs.readFileSync(path.resolve(rel), 'utf8'))
    .join('\n')

  it('uses resolved program/intake identities in create and update payloads', () => {
    // Django validates by program name and intake.name, not the display label.
    expect(source).toContain('program: resolvedProgram.label')
    expect(source).toContain('intake: resolvedIntake.name')
    // IDs are still used for resolution
    expect(source).toContain('resolvedProgramId')
  })

  it('advances to the next step after successful Step 1 save', () => {
    expect(source).toContain('goToStep(currentStepIndex + 1)')
  })

  it('passes program details into buildServerDraftPayload for server draft creation', () => {
    expect(source).toContain('buildServerDraftPayload({')
    // Draft payloads use the canonical intake name for Django compatibility.
    expect(source).toContain('program: resolvedProgram.label')
    expect(source).toContain('intake: resolvedIntake.name')
  })
})
