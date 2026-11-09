/**
 * The education step's Next saves grades through the draft machine (SJR task
 * 3.23, R6-b): there is no second grade write path, and the student does not
 * advance while grades are still pending.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWizardStepAdvance } from '@/pages/student/applicationWizard/hooks/wizard/useWizardStepAdvance'
import { getStepIndexByKey } from '@/pages/student/applicationWizard/steps/config'

const id = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`
const GRADES = [1, 2, 3, 4, 5].map((n) => ({ subject_id: id(n), grade: 4 }))
const EDUCATION = getStepIndexByKey('education')

function setup(snapshot: { pending: boolean; applicationId: string | null }) {
  const calls = { order: [] as string[] }
  const flush = vi.fn(async () => {
    calls.order.push('flush')
    return null
  })
  const params = {
    applicationId: 'app-1',
    currentStepConfig: { id: 4, key: 'education' },
    currentStepIndex: EDUCATION,
    watch: vi.fn(() => ({})),
    programIds: [],
    intakeIds: [],
    selectedProgram: '',
    selectedProgramDetails: undefined,
    selectedGradesRef: { current: GRADES } as { current: typeof GRADES },
    eligibilityCheck: null,
    resultSlipFile: null,
    extraKycFile: null,
    uploadedFiles: { result_slip: true, extra_kyc: true },
    uploading: false,
    paymentStatus: null,
    assignmentPreviewFetching: false,
    assignmentResolved: true,
    assignmentPreviewError: null,
    requiredDocuments: { contract: null, blocking: [], uploading: false },
    queryClient: { invalidateQueries: vi.fn() },
    draftMachine: { flush, getSnapshot: () => snapshot },
    saveDraft: vi.fn(async () => null),
    applyDraftSelectionChange: vi.fn(),
    resolveProgramIdentity: vi.fn(),
    resolveIntakeIdentity: vi.fn(),
    deriveInstitutionLabel: vi.fn(),
    normalizeSelectedGrades: (grades: typeof GRADES) => grades,
    clearStaleApplicationReference: vi.fn(),
    goToStep: vi.fn(() => calls.order.push('goToStep')),
    setSelectedGrades: vi.fn(),
    setSubmittedApplication: vi.fn(),
    setLoading: vi.fn(),
    setError: vi.fn(),
    showError: vi.fn(),
    showWarning: vi.fn(),
  }
  const { result } = renderHook(() => useWizardStepAdvance(params as never))
  return { params, flush, calls, next: () => act(async () => { await result.current.handleNextStep() }) }
}

beforeEach(() => vi.clearAllMocks())

describe('education step Next (SJR R6-b)', () => {
  it('flushes the draft machine, then advances, with no direct grade request', async () => {
    const { params, flush, calls, next } = setup({ pending: false, applicationId: 'app-1' })
    await next()
    expect(flush).toHaveBeenCalledTimes(1)
    expect(params.setSelectedGrades).toHaveBeenCalledWith(GRADES)
    expect(calls.order).toEqual(['flush', 'goToStep'])
    expect(params.goToStep).toHaveBeenCalledWith(EDUCATION + 1)
    expect(params.setError).not.toHaveBeenCalledWith(expect.stringMatching(/couldn't save/i))
  })

  it('does not advance while grades are still pending after the flush', async () => {
    const { params, next } = setup({ pending: true, applicationId: 'app-1' })
    await next()
    expect(params.goToStep).not.toHaveBeenCalled()
    expect(params.setError).toHaveBeenCalledWith("We couldn't save your grades. Check your connection and try again.")
    expect(params.setLoading).toHaveBeenLastCalledWith(false)
  })

  it('returns to the personal step when the machine detached from a deleted draft', async () => {
    const { params, next } = setup({ pending: true, applicationId: null })
    await next()
    expect(params.goToStep).toHaveBeenCalledWith(getStepIndexByKey('personal'))
    expect(params.setError).toHaveBeenCalledWith(expect.stringMatching(/no longer available/i))
  })
})
