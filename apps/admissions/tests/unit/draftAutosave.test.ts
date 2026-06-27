import { describe, expect, it } from 'vitest'

import {
  buildDuplicateDraftConflictDecision,
  buildServerDraftPayload,
  canCreateServerDraft,
  shouldClearDuplicateDraftConflict,
} from '@/pages/student/applicationWizard/lib/draftAutosave'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

const completeFormData: WizardFormData = {
  full_name: 'Jane Student',
  nrc_number: '123456/78/9',
  passport_number: '',
  date_of_birth: '2001-09-08',
  sex: 'Female',
  phone: '+260971234567',
  email: 'jane@example.com',
  residence_town: 'Kitwe',
  nationality: 'Zambian',
  next_of_kin_name: 'John Student',
  next_of_kin_phone: '+260977000000',
  program: 'program-1',
  intake: 'intake-2026-aug',
}

describe('draftAutosave', () => {
  it('does not create a server draft until the first-step fields are complete', () => {
    expect(canCreateServerDraft({
      ...completeFormData,
      residence_town: '',
    })).toBe(false)

    expect(canCreateServerDraft({
      ...completeFormData,
      nrc_number: '',
      passport_number: '',
    })).toBe(false)
  })

  it('allows autosave to create a server draft once the step is complete', () => {
    expect(canCreateServerDraft(completeFormData)).toBe(true)
  })

  it('builds a canonical draft payload for autosave creation', () => {
    const payload = buildServerDraftPayload({
      formData: {
        ...completeFormData,
        full_name: '  Jane Student  ',
        residence_town: '  Lusaka ',
        intake: 'January',
      },
      selectedProgramDetails: {
        id: 'program-1',
        name: 'Registered Nursing',
        duration_years: 3,
        institution_id: 'inst-1',
        institutions: {
          id: 'inst-1',
          name: 'MIHAS',
          full_name: 'Mukuba Institute of Health and Applied Sciences',
        },
      } as any,
      institutionCode: 'MIHAS',
      nationality: 'Zambian',
      applicationNumber: 'MIHAS202612345',
      trackingCode: 'TRKABC123',
    })

    expect(payload).toMatchObject({
      full_name: 'Jane Student',
      residence_town: 'Lusaka',
      program: 'Registered Nursing',
      intake: 'January',
      institution: 'MIHAS',
      nationality: 'Zambian',
    })
  })

  it('builds duplicate draft conflicts without silently adopting the existing id', () => {
    const conflict = buildDuplicateDraftConflictDecision({
      existingId: ' existing-draft-1 ',
      program: 'program-1',
      intake: 'intake-2026-aug',
    })

    expect(conflict).toMatchObject({
      existingId: 'existing-draft-1',
      program: 'program-1',
      intake: 'intake-2026-aug',
    })
    expect(conflict.message).toContain('Continue that draft')
  })

  it('keeps duplicate conflicts until the student changes program or intake', () => {
    const conflict = buildDuplicateDraftConflictDecision({
      existingId: 'existing-draft-1',
      program: 'program-1',
      intake: 'intake-2026-aug',
    })

    expect(shouldClearDuplicateDraftConflict(conflict, completeFormData)).toBe(false)
    expect(shouldClearDuplicateDraftConflict(conflict, {
      ...completeFormData,
      intake: 'intake-2027-jan',
    })).toBe(true)
    expect(shouldClearDuplicateDraftConflict(conflict, {
      ...completeFormData,
      program: 'program-2',
    })).toBe(true)
  })
})
