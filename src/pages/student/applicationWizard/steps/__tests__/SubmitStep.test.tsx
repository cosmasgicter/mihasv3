import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import SubmitStep from '../SubmitStep'
import type { WizardFormData } from '../../types'
import type { EligibilityResult } from '@/lib/eligibility'

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children }: { children: ReactNode }) => <div>{children}</div>
  }
}))

describe('<SubmitStep />', () => {
  const baseFormValues: WizardFormData = {
    full_name: 'Test Applicant',
    nrc_number: '123456/78/9',
    passport_number: undefined,
    date_of_birth: '2000-01-01',
    sex: 'Male',
    phone: '0970000000',
    email: 'test@example.com',
    residence_town: 'Lusaka',
    next_of_kin_name: undefined,
    next_of_kin_phone: undefined,
    program: 'program-id',
    intake: 'January 2026 Intake',
    payment_method: 'MTN Money',
    payer_name: undefined,
    payer_phone: undefined,
    amount: 153,
    paid_at: undefined,
    momo_ref: undefined
  }

  const TestSubmitStep = ({
    overrides = {},
    eligibilityCheck = null,
    selectedProgramName,
    selectedInstitutionLabel
  }: {
    overrides?: Partial<WizardFormData>
    eligibilityCheck?: EligibilityResult | null
    selectedProgramName?: string
    selectedInstitutionLabel?: string
  }) => {
    const form = useForm<WizardFormData>({
      defaultValues: { ...baseFormValues, ...overrides }
    })

    return (
      <SubmitStep
        title="Review"
        form={form}
        subjects={[]}
        selectedGrades={[]}
        eligibilityCheck={eligibilityCheck}
        resultSlipFile={null}
        extraKycFile={null}
        proofOfPaymentFile={null}
        confirmSubmission={false}
        onConfirmChange={() => {}}
        selectedProgramName={selectedProgramName}
        selectedInstitutionLabel={selectedInstitutionLabel}
      />
    )
  }

  it('shows the human readable program information when provided', () => {
    render(
      <TestSubmitStep
        selectedProgramName="Clinical Medicine"
        selectedInstitutionLabel="MIHAS College"
      />
    )

    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim()
    const programSummary = screen.getByText((_, element) => normalize(element?.textContent) === 'Program: Clinical Medicine')
    const institutionSummary = screen.getByText((_, element) => normalize(element?.textContent) === 'Institution: MIHAS College')

    expect(programSummary).toBeTruthy()
    expect(institutionSummary).toBeTruthy()
  })

  it('falls back to displaying the stored program identifier when no display name is available', () => {
    render(<TestSubmitStep />)

    const normalize = (value: string | null | undefined) => value?.replace(/\s+/g, ' ').trim()
    const programSummary = screen.getByText((_, element) => normalize(element?.textContent) === 'Program: program-id')

    expect(programSummary).toBeTruthy()
  })
})
