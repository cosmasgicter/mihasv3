import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import type { WizardStepConfig } from '../steps/config'
import type { SubjectGrade } from '../types'

const mockUseWizardController = vi.fn()

vi.mock('../hooks/useWizardController', () => ({
  default: () => mockUseWizardController()
}))

vi.mock('../steps/BasicKycStep', () => ({
  default: ({ title }: { title: string }) => <div data-testid="basic-kyc-step">{title}</div>
}))

vi.mock('../steps/EducationStep', () => ({
  default: ({ title }: { title: string }) => <div data-testid="education-step">{title}</div>
}))

vi.mock('../steps/PaymentStep', () => ({
  default: ({ title }: { title: string }) => <div data-testid="payment-step">{title}</div>
}))

vi.mock('../steps/SubmitStep', () => ({
  default: ({ title }: { title: string }) => <div data-testid="submit-step">{title}</div>
}))

vi.mock('../components/SubmissionSuccess', () => ({
  default: () => <div data-testid="submission-success" />
}))

vi.mock('@/components/application/AIAssistant', () => ({
  AIAssistant: () => null
}))

import ApplicationWizard from '../index'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

const createControllerReturn = (overrides: Partial<ReturnType<typeof mockUseWizardController>> = {}) => {
  const defaultStep: WizardStepConfig = {
    id: 1,
    key: 'basicKyc',
    progressTitle: 'Basic KYC',
    title: 'Step 1',
    icon: () => null,
    nextButtonLabel: 'Next Step'
  }

  const baseGrades: SubjectGrade[] = []

  return {
    authLoading: false,
    restoringDraft: false,
    user: { email: 'student@example.com' },
    success: false,
    loading: false,
    uploading: false,
    error: '',
    setError: vi.fn(),
    form: {
      handleSubmit: (cb: (values: any) => void) => (event?: React.FormEvent) => {
        event?.preventDefault?.()
        cb({})
      },
      getValues: () => ({}),
      register: vi.fn(),
      formState: { errors: {} },
      watch: vi.fn()
    },
    totalSteps: 4,
    currentStepIndex: 0,
    currentStepConfig: defaultStep,
    isLastStep: false,
    selectedProgram: 'Clinical Medicine',
    selectedGrades: baseGrades,
    eligibilityCheck: null,
    recommendedSubjects: [],
    programs: [],
    subjects: [],
    hasAutoPopulatedData: false,
    completionPercentage: 0,
    confirmSubmission: false,
    setConfirmSubmission: vi.fn(),
    resultSlipFile: null,
    extraKycFile: null,
    popFile: null,
    uploadProgress: {},
    uploadedFiles: {},
    isDraftSaving: false,
    draftSaved: false,
    submittedApplication: null,
    persistingSlip: false,
    slipLoading: false,
    emailLoading: false,
    handleDownloadSlip: vi.fn(),
    handleEmailSlip: vi.fn(),
    handleResultSlipUpload: vi.fn(),
    handleExtraKycUpload: vi.fn(),
    handleProofOfPaymentUpload: vi.fn(),
    getPaymentTarget: vi.fn(() => ''),
    handleNextStep: vi.fn(),
    handlePrevStep: vi.fn(),
    handleSubmitApplication: vi.fn(),
    addGrade: vi.fn(),
    removeGrade: vi.fn(),
    updateGrade: vi.fn(),
    getUsedSubjects: vi.fn(() => []),
    saveDraft: vi.fn(),
    watchValues: vi.fn(() => ({})),
    ...overrides
  }
}

describe('<ApplicationWizard />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWizardController.mockReturnValue(createControllerReturn())
  })

  it('renders the basic KYC step when the controller reports the first step', () => {
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    expect(screen.getByTestId('basic-kyc-step')).toBeTruthy()
  })

  it('renders the education step when controller switches to education', () => {
    mockUseWizardController.mockReturnValue(
      createControllerReturn({
        currentStepIndex: 1,
        currentStepConfig: { id: 2, key: 'education', progressTitle: 'Education', title: 'Step 2', icon: () => null, nextButtonLabel: 'Next' }
      })
    )
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    expect(screen.getByTestId('education-step')).toBeTruthy()
  })

  it('shows saved draft indicator when a draft save completes', () => {
    mockUseWizardController.mockReturnValue(createControllerReturn({ draftSaved: true }))
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    expect(screen.getByText('Saved')).toBeTruthy()
  })

  it('renders restoring draft state when the controller is loading a draft', () => {
    mockUseWizardController.mockReturnValue(
      createControllerReturn({
        authLoading: false,
        restoringDraft: true
      })
    )
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    expect(screen.getByText('Restoring your application...')).toBeTruthy()
  })

  it('invokes saveDraft when the save button is clicked', () => {
    const saveDraft = vi.fn()
    mockUseWizardController.mockReturnValue(createControllerReturn({ saveDraft }))
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    fireEvent.click(screen.getByRole('button', { name: /save now/i }))
    expect(saveDraft).toHaveBeenCalledTimes(1)
  })

  it('invokes next and previous handlers via navigation buttons', () => {
    const handleNextStep = vi.fn()
    const handlePrevStep = vi.fn()
    mockUseWizardController.mockReturnValue(
      createControllerReturn({
        currentStepIndex: 1,
        handleNextStep,
        handlePrevStep
      })
    )
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    fireEvent.click(screen.getByRole('button', { name: /previous/i }))
    expect(handlePrevStep).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /next step/i }))
    expect(handleNextStep).toHaveBeenCalledTimes(1)
  })

  it('submits the form through the controller when on the final step', () => {
    const handleSubmitApplication = vi.fn()
    mockUseWizardController.mockReturnValue(
      createControllerReturn({
        currentStepIndex: 3,
        currentStepConfig: { id: 4, key: 'submit', progressTitle: 'Submit', title: 'Step 4', icon: () => null, nextButtonLabel: 'Submit' },
        isLastStep: true,
        confirmSubmission: true,
        handleSubmitApplication
      })
    )
    render(<ApplicationWizard />, { wrapper: RouterWrapper })
    fireEvent.click(screen.getByRole('button', { name: /submit application/i }))
    expect(handleSubmitApplication).toHaveBeenCalledTimes(1)
  })
})
