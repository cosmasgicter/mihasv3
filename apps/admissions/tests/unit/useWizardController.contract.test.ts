// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('useWizardController Step 1 API contract regression', () => {
  // The Step-1 save/create logic was extracted into the draft-persistence
  // sub-hook during the wizard refactor. The contract (Django validates by
  // program name + intake.name, not the display label) must still hold, so
  // we read the controller plus its extracted sub-hooks as one surface.
  const sourceFiles = [
    'src/pages/student/applicationWizard/hooks/useWizardController.ts',
    'src/pages/student/applicationWizard/hooks/wizard/useWizardDraftPersistence.ts',
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
