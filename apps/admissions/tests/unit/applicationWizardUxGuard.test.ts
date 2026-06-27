// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const wizardSource = readFileSync(
  path.resolve(__dirname, '../../src/pages/student/applicationWizard/index.tsx'),
  'utf8',
)

describe('application wizard UX guard', () => {
  it('keeps explicit mode, autosave, and draft-card affordances visible', () => {
    expect(wizardSource).toContain('wizardModeSummary')
    expect(wizardSource).toContain('New application')
    expect(wizardSource).toContain('Resuming draft')
    expect(wizardSource).toContain('AutoSaveIndicator')
    expect(wizardSource).toContain('min-w-[5.5rem]')
  })

  it('keeps saved draft cards actionable and payment-protected', () => {
    expect(wizardSource).toContain('Delete draft')
    expect(wizardSource).toContain('Payment-linked drafts')
    expect(wizardSource).toContain('isProtectedDraftPaymentError')
    expect(wizardSource).toContain('Last saved')
  })

  it('prevents back navigation from silently restoring an abandoned draft choice', () => {
    expect(wizardSource).toContain('navigate(studentApplicationNewPath(), { replace: true })')
    expect(wizardSource).toContain('form.reset()')
    expect(wizardSource).toContain("draftIntent.mode === 'new'")
    expect(wizardSource).toContain("draftIntent.mode === 'local'")
  })
})
