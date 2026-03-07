import { describe, expect, it } from 'vitest'

import {
  buildServerDraftPayload,
  canCreateServerDraft,
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
  intake: 'August 2026',
  payment_option: 'pay_now',
  payment_method: 'MTN Money',
  payer_name: '',
  payer_phone: '',
  amount: 153,
  paid_at: '',
  momo_ref: '',
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
      },
      selectedProgramDetails: {
        id: 'program-1',
        name: 'Registered Nursing',
        duration_years: 3,
        institution_id: 'inst-1',
        institutions: {
          id: 'inst-1',
          name: 'MIHAS',
          full_name: 'Mukuba Institute of Health and Allied Sciences',
        },
      } as any,
      institutionCode: 'MIHAS',
      nationality: 'Zambian',
      applicationNumber: 'MIHAS202612345',
      trackingCode: 'TRKABC123',
    })

    expect(payload).toMatchObject({
      application_number: 'MIHAS202612345',
      public_tracking_code: 'TRKABC123',
      full_name: 'Jane Student',
      residence_town: 'Lusaka',
      program: 'Registered Nursing',
      institution: 'MIHAS',
      nationality: 'Zambian',
      status: 'draft',
    })
  })
})
