/**
 * The wizard's document controls come from the server contract (task **7.2**).
 *
 * Requirements: R11.6 — "REQUIRED document controls SHALL be rendered from a
 *               versioned requirements snapshot on the application, not a
 *               hardcoded type list. Failure to evaluate canonical requirements
 *               SHALL block readiness with a retryable service error."
 * Findings:     **STU-13** — the education step uploaded exactly two hardcoded
 *               types, so a tenant-configured requirement was an invisible
 *               submission blocker.
 * Design:       §9.3, §13.1.
 *
 * These assertions are about the *step*, not the panel: whatever the contract
 * lists is what the student can upload, and nothing else. A contract the client
 * could not read renders no upload control at all rather than an empty checklist
 * that reads as "nothing is required".
 *
 * Validates: Requirements R11.6
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import EducationStep from '@/pages/student/applicationWizard/steps/EducationStep'
import type { UseRequiredDocumentsResult } from '@/hooks/useRequiredDocuments'
import {
  parseRequiredDocumentsContract,
  unsatisfiedRequirements,
  type RequiredDocumentsContract,
} from '@/lib/requiredDocuments'

const CUSTOM_ONLY = [
  {
    document_type: 'nursing_council_letter',
    label: 'Nursing Council eligibility letter',
    required: true,
    description: 'The signed letter from the Nursing Council.',
    source: 'tenant',
    accepts_document_types: ['nursing_council_letter'],
    accepted_mime_types: ['application/pdf'],
    accepted_extensions: ['.pdf'],
    max_size_bytes: 2 * 1024 * 1024,
    state: 'missing',
    document: null,
  },
]

function contractFrom(requirements: unknown[]): RequiredDocumentsContract {
  return parseRequiredDocumentsContract({
    success: true,
    data: {
      application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      configuration_version: 'cfg-9',
      requirements,
    },
  })
}

function requiredDocumentsStub(
  overrides: Partial<UseRequiredDocumentsResult> = {},
): UseRequiredDocumentsResult {
  const contract = overrides.contract ?? contractFrom(CUSTOM_ONLY)
  return {
    contract,
    requirements: contract?.requirements ?? [],
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
    blocking: unsatisfiedRequirements(contract),
    ...overrides,
  }
}

const baseProps = {
  title: 'Education',
  subjects: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Mathematics', code: 'MATH' }],
  selectedProgram: 'Nursing',
  selectedGrades: [],
  eligibilityCheck: null,
  recommendedSubjects: [],
  addGrade: () => undefined,
  removeGrade: () => undefined,
  updateGrade: () => undefined,
  getUsedSubjects: () => [],
}

describe('EducationStep — required documents come from the contract (R11.6)', () => {
  it('renders a control for a custom tenant requirement the frontend never declared', () => {
    render(<EducationStep {...baseProps} requiredDocuments={requiredDocumentsStub()} />)

    expect(screen.getByText('Nursing Council eligibility letter')).toBeTruthy()
    expect(screen.getByLabelText('Upload Nursing Council eligibility letter')).toBeTruthy()
  })

  it('renders no control for a document type the contract did not list', () => {
    // This is the STU-13 closure: the two legacy fields were unconditional.
    const { container } = render(
      <EducationStep {...baseProps} requiredDocuments={requiredDocumentsStub()} />,
    )

    expect(screen.queryByText('NRC or passport')).toBeNull()
    expect(screen.queryByLabelText(/Upload Grade 12 result slip/)).toBeNull()
    expect(container.querySelectorAll('input[type="file"]').length).toBe(1)
  })

  it('states no hardcoded size or type limit of its own', () => {
    const { container } = render(
      <EducationStep {...baseProps} requiredDocuments={requiredDocumentsStub()} />,
    )
    const markup = container.innerHTML

    // The requirement's own limit is published; the old blanket copy is gone.
    expect(markup).toContain('PDF up to 2MB')
    expect(markup).not.toContain('PDF, JPG or PNG up to 10MB')
    expect(markup).not.toContain('Add both documents to continue')
  })

  it('renders no upload control when the contract could not be evaluated', () => {
    const { container } = render(
      <EducationStep
        {...baseProps}
        requiredDocuments={requiredDocumentsStub({
          contract: null,
          requirements: [],
          blocking: [],
          contractError:
            'We could not load the documents this application needs. Please try again.',
          contractErrorRetryable: true,
        })}
      />,
    )

    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByText(/could not load the documents/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('creates no object URLs, so a selected file cannot leak one', () => {
    const createObjectURL = vi.fn(() => 'blob:should-not-be-called')
    const original = URL.createObjectURL
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    try {
      render(
        <EducationStep
          {...baseProps}
          requiredDocuments={requiredDocumentsStub({
            uploadStates: {
              nursing_council_letter: {
                status: 'uploading',
                progress: 42,
                file: new File(['x'], 'letter.pdf', { type: 'application/pdf' }),
                error: null,
                errorCode: null,
                retryable: false,
              },
            },
            uploading: true,
          })}
        />,
      )
      expect(createObjectURL).not.toHaveBeenCalled()
      // Progress is still surfaced for the in-flight upload.
      expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42')
    } finally {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: original })
    }
  })

  it('keeps the grade entry surface intact alongside the contract controls', () => {
    render(
      <EducationStep
        {...baseProps}
        selectedGrades={[{ subject_id: '11111111-1111-4111-8111-111111111111', grade: 1 }]}
        getUsedSubjects={() => ['11111111-1111-4111-8111-111111111111']}
        requiredDocuments={requiredDocumentsStub()}
      />,
    )
    expect(screen.getByText(/Add another subject below/)).toBeTruthy()
  })
})
