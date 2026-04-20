import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'

import EducationStep from '@/pages/student/applicationWizard/steps/EducationStep'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const baseProps = {
  title: 'Education',
  subjects: [{ id: 'math', name: 'Mathematics', code: 'MATH' }],
  selectedProgram: 'Nursing',
  selectedGrades: [],
  eligibilityCheck: null,
  recommendedSubjects: [],
  resultSlipFile: null,
  extraKycFile: null,
  uploadProgress: {},
  uploadedFiles: {},
  uploadStates: {} as Record<string, string>,
  addGrade: () => undefined,
  removeGrade: () => undefined,
  updateGrade: () => undefined,
  getUsedSubjects: () => [],
  handleResultSlipUpload: () => undefined,
  handleExtraKycUpload: () => undefined,
}

describe('EducationStep', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('renders concise upload cards without repeated instruction copy', () => {
    const markup = renderToStaticMarkup(
      <EducationStep
        {...baseProps}
      />
    )

    expect(markup).toContain('Result slip')
    expect(markup).toContain('NRC or passport')
    expect(markup).toContain('PDF, JPG or PNG. Max 10MB.')
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

  it('revokes uploaded document preview URLs when files change or unmount', async () => {
    const originalCreateObjectUrl = URL.createObjectURL
    const originalRevokeObjectUrl = URL.revokeObjectURL
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:result-slip-one')
      .mockReturnValueOnce('blob:result-slip-two')
    const revokeObjectURL = vi.fn()

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const fileOne = new File(['one'], 'result-slip-one.pdf', { type: 'application/pdf' })
    const fileTwo = new File(['two'], 'result-slip-two.pdf', { type: 'application/pdf' })

    try {
      await act(async () => {
        root.render(
          <EducationStep
            {...baseProps}
            resultSlipFile={fileOne}
            uploadedFiles={{ result_slip: true }}
          />,
        )
      })

      expect(createObjectURL).toHaveBeenCalledTimes(1)

      await act(async () => {
        root.render(
          <EducationStep
            {...baseProps}
            resultSlipFile={fileTwo}
            uploadedFiles={{ result_slip: true }}
          />,
        )
      })

      expect(createObjectURL).toHaveBeenCalledTimes(2)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:result-slip-one')

      await act(async () => {
        root.unmount()
      })

      expect(revokeObjectURL).toHaveBeenCalledWith('blob:result-slip-two')
    } finally {
      container.remove()
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectUrl,
      })
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectUrl,
      })
    }
  })
})
