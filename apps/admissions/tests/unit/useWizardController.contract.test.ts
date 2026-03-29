// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('useWizardController Step 1 API contract regression', () => {
  const filePath = path.resolve('src/pages/student/applicationWizard/hooks/useWizardController.ts')
  const source = fs.readFileSync(filePath, 'utf8')

  it('uses canonical program/intake IDs in create and update payloads', () => {
    expect(source).toContain('program: resolvedProgram.id')
    expect(source).toContain('intake: resolvedIntake.id')
    expect(source).not.toContain('program: resolvedProgram.label,\n            intake: resolvedIntake.label')
  })

  it('advances to the next step after successful Step 1 save', () => {
    expect(source).toContain('goToStep(currentStepIndex + 1)')
  })

  it('passes canonical IDs into buildServerDraftPayload for server draft creation', () => {
    expect(source).toContain('buildServerDraftPayload({')
    expect(source).toContain('program: resolvedProgram.id')
    expect(source).toContain('intake: resolvedIntake.id')
  })
})
