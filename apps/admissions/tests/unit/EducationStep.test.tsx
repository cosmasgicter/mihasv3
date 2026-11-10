import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import EducationStep from '@/pages/student/applicationWizard/steps/EducationStep'
import type { UseRequiredDocumentsResult } from '@/hooks/useRequiredDocuments'
import { parseRequiredDocumentsContract, unsatisfiedRequirements } from '@/lib/requiredDocuments'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * The two platform baseline requirements the server publishes when a tenant has
 * configured nothing. Since admissions-v2 task 7.2 the step renders these
 * because the *contract* lists them, not because they are hardcoded in the UI.
 */
const PLATFORM_BASELINE = [
  {
    document_type: 'result_slip',
    label: 'Grade 12 result slip',
    required: true,
    description: 'Your Grade 12 statement of results. A clear phone photo is fine.',
    source: 'platform',
    accepts_document_types: ['result_slip'],
    accepted_mime_types: ['application/pdf', 'image/jpeg', 'image/png'],
    accepted_extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    max_size_bytes: 10 * 1024 * 1024,
    state: 'missing',
    document: null,
  },
  {
    document_type: 'extra_kyc',
    label: 'NRC or passport',
    required: true,
    description: 'Photo or scan of your NRC or passport.',
    source: 'platform',
    accepts_document_types: ['nrc', 'passport', 'extra_kyc'],
    accepted_mime_types: ['application/pdf', 'image/jpeg', 'image/png'],
    accepted_extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
    max_size_bytes: 10 * 1024 * 1024,
    state: 'missing',
    document: null,
  },
]

function requiredDocuments(): UseRequiredDocumentsResult {
  const contract = parseRequiredDocumentsContract({
    success: true,
    data: {
      application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requirements: PLATFORM_BASELINE,
    },
  })
  return {
    contract,
    requirements: contract.requirements,
    loading: false,
    contractError: null,
    contractErrorRetryable: false,
    reload: vi.fn(),
    uploadStates: {},
    uploading: false,
    selectFile: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    reportLocalError: vi.fn(),
    beginReplace: vi.fn(),
    cancelReplace: vi.fn(),
    blocking: unsatisfiedRequirements(contract),
  }
}

const baseProps = {
  subjects: [{ id: 'math', name: 'Mathematics', code: 'MATH' }],
  selectedProgram: 'Nursing',
  selectedGrades: [],
  eligibilityCheck: null,
  recommendedSubjects: [],
  requiredDocuments: requiredDocuments(),
  addGrade: () => undefined,
  removeGrade: () => undefined,
  updateGrade: () => undefined,
  getUsedSubjects: () => [],
}

describe('EducationStep', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('renders concise upload controls without repeated instruction copy', () => {
    const markup = renderToStaticMarkup(<EducationStep {...baseProps} />)

    // Labels and constraints come from the contract rows above.
    expect(markup).toContain('Grade 12 result slip')
    expect(markup).toContain('NRC or passport')
    expect(markup).toContain('PDF, JPG or PNG up to 10MB')
    expect(markup).not.toContain('Document checklist')
    expect(markup).not.toContain('Auto-fill enabled')
    expect(markup).not.toContain('Extra KYC Documents')
    expect(markup).not.toContain('Your identity details are captured in the KYC step')
  })

  it('renders an add-another-subject action after existing subjects', () => {
    const markup = renderToStaticMarkup(
      <EducationStep
        {...baseProps}
        selectedGrades={[{ subject_id: 'math', grade: 1 }]}
        getUsedSubjects={() => ['math']}
      />
    )

    expect(markup).toContain('Add another subject below')
  })

  it('states no document-type list, accept list, or size limit of its own', () => {
    // Task 7.2 / STU-13: with an empty contract the step offers no upload
    // control at all, which is only possible because it holds no type list.
    const empty = requiredDocuments()
    const markup = renderToStaticMarkup(
      <EducationStep
        {...baseProps}
        requiredDocuments={{ ...empty, contract: null, requirements: [], blocking: [] }}
      />
    )

    expect(markup).not.toContain('Grade 12 result slip')
    expect(markup).not.toContain('NRC or passport')
    expect(markup).not.toContain('type="file"')
  })
})
