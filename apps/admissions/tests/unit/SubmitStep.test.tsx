import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { useForm } from 'react-hook-form'

import SubmitStep from '@/pages/student/applicationWizard/steps/SubmitStep'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

function renderSubmitStep(uploadedFiles: Record<string, boolean>) {
  const Harness = () => {
    const form = useForm<WizardFormData>({
      defaultValues: {
        full_name: 'Jane Student',
        program: 'Diploma in Nursing',
        intake: 'January 2026',
      },
    })

    return (
      <SubmitStep
        title="Review and Submit"
        form={form}
        subjects={[{ id: 'math', name: 'Mathematics', code: 'MATH' }]}
        selectedGrades={[
          { subject_id: 'math', grade: 1 },
          { subject_id: 'eng', grade: 2 },
          { subject_id: 'bio', grade: 3 },
          { subject_id: 'chem', grade: 4 },
          { subject_id: 'phy', grade: 5 },
        ]}
        eligibilityCheck={null}
        resultSlipFile={null}
        extraKycFile={null}
        uploadedFiles={uploadedFiles}
        confirmSubmission={false}
        onConfirmChange={() => undefined}
        paymentStatus="successful"
      />
    )
  }

  return renderToStaticMarkup(<Harness />)
}

describe('SubmitStep', () => {
  it('treats restored uploaded documents as attached when local File objects are unavailable', () => {
    const markup = renderSubmitStep({ result_slip: true, extra_kyc: true })

    expect(markup).toContain('Result slip attached')
    expect(markup).toContain('Identity document attached')
    expect(markup).toContain('Already uploaded')
    expect(markup).toContain('Result slip attached, identity document attached')
  })
})
