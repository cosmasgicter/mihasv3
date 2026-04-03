// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('useWizardController Step 1 API contract regression', () => {
  const filePath = path.resolve('src/pages/student/applicationWizard/hooks/useWizardController.ts')
  const source = fs.readFileSync(filePath, 'utf8')

  it('uses resolved program/intake identities in create and update payloads', () => {
    // Django validates by name, so payloads use resolvedProgram.label / resolvedIntake.label
    expect(source).toContain('program: resolvedProgram.label')
    expect(source).toContain('intake: resolvedIntake.label')
    // IDs are still used for duplicate checking
    expect(source).toContain('resolvedProgram.id')
    expect(source).toContain('resolvedIntake.id')
  })

  it('advances to the next step after successful Step 1 save', () => {
    expect(source).toContain('goToStep(currentStepIndex + 1)')
  })

  it('passes program details into buildServerDraftPayload for server draft creation', () => {
    expect(source).toContain('buildServerDraftPayload({')
    // Draft payloads also use label (name) for Django compatibility
    expect(source).toContain('program: resolvedProgram.label')
    expect(source).toContain('intake: resolvedIntake.label')
  })
})
