// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { parseWizardDraftIntent } from '@/pages/student/applicationWizard/hooks/wizard/useWizardDraftLoader'

describe('wizard draft intent parsing', () => {
  it('normalizes explicit new application aliases', () => {
    expect(parseWizardDraftIntent('?mode=new')).toEqual({ mode: 'new', draftId: null })
    expect(parseWizardDraftIntent('?new=true')).toEqual({ mode: 'new', draftId: null })
    expect(parseWizardDraftIntent('?fresh=1')).toEqual({ mode: 'new', draftId: null })
  })

  it('parses selected resume targets', () => {
    expect(parseWizardDraftIntent('?mode=resume&draftId=draft-123')).toEqual({
      mode: 'resume',
      draftId: 'draft-123',
    })
    expect(parseWizardDraftIntent('?mode=resume&applicationId=app-123')).toEqual({
      mode: 'resume',
      draftId: 'app-123',
    })
  })

  it('parses local draft resume intent separately from automatic mode', () => {
    expect(parseWizardDraftIntent('?localDraft=true')).toEqual({ mode: 'local', draftId: null })
  })

  it('keeps bare visits in auto mode so the wizard can show the draft-choice screen', () => {
    expect(parseWizardDraftIntent('')).toEqual({ mode: 'auto', draftId: null })
    expect(parseWizardDraftIntent('?mode=resume')).toEqual({ mode: 'auto', draftId: null })
  })
})
