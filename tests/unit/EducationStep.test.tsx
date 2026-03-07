import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import EducationStep from '@/pages/student/applicationWizard/steps/EducationStep'

describe('EducationStep', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('renders identity-document copy instead of extra KYC copy', () => {
    const markup = renderToStaticMarkup(
      <EducationStep
        title="Education"
        subjects={[{ id: 'math', name: 'Mathematics', code: 'MATH' }]}
        selectedProgram="Nursing"
        selectedGrades={[]}
        eligibilityCheck={null}
        recommendedSubjects={[]}
        resultSlipFile={null}
        extraKycFile={null}
        uploadProgress={{}}
        uploadedFiles={{}}
        addGrade={() => undefined}
        removeGrade={() => undefined}
        updateGrade={() => undefined}
        getUsedSubjects={() => []}
        handleResultSlipUpload={() => undefined}
        handleExtraKycUpload={() => undefined}
      />
    )

    expect(markup).toContain('Identity document (NRC or Passport)')
    expect(markup).toContain('Academic document')
    expect(markup).toContain('Identity support document')
    expect(markup).not.toContain('Extra KYC Documents')
    expect(markup).toContain('Your identity details are captured in the KYC step')
  })

  it('renders an add-another-subject action after existing subjects', () => {
    const markup = renderToStaticMarkup(
      <EducationStep
        title="Education"
        subjects={[{ id: 'math', name: 'Mathematics', code: 'MATH' }]}
        selectedProgram="Nursing"
        selectedGrades={[{ subject_id: 'math', grade: 1 }]}
        eligibilityCheck={null}
        recommendedSubjects={[]}
        resultSlipFile={null}
        extraKycFile={null}
        uploadProgress={{}}
        uploadedFiles={{}}
        addGrade={() => undefined}
        removeGrade={() => undefined}
        updateGrade={() => undefined}
        getUsedSubjects={() => ['math']}
        handleResultSlipUpload={() => undefined}
        handleExtraKycUpload={() => undefined}
      />
    )

    expect(markup).toContain('Add another subject below')
  })
})
