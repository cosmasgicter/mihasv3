/**
 * R6 exploration: the Submit handler uses the same readiness as the button.
 *
 * Spec: student-journey-repair task 1.6, clauses 1.29 (design R6-a).
 *
 * `useWizardSubmission` rebuilds its own readiness without `assignmentResolved`
 * or the tenant's `requiredDocumentItems`, so a student whose Submit button is
 * enabled is told "Complete the remaining requirements: Assigned school" and
 * nothing is sent. The fix gives the hook the controller's `computeReadiness`.
 *
 * The test supplies `computeReadiness` (the new parameter; HEAD ignores it) and
 * asserts the observable outcome: the submit mutation is called.
 *
 * Markers removed at the R6 checkpoint (task 3.25).
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/catalog', () => ({
  institutionService: { list: vi.fn(async () => ({ institutions: [] })) },
}))

import { useWizardSubmission } from '@/pages/student/applicationWizard/hooks/wizard/useWizardSubmission'
import { buildWizardReadiness } from '@/pages/student/applicationWizard/lib/wizardReadiness'
import { readinessInput } from './__fixtures__/readinessInput'

const canonicalSubjectId = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36)
const grades = [1, 2, 3, 4, 5].map((n) => ({ subject_id: canonicalSubjectId(n), grade: 4 }))
const values = {
  full_name: 'Readiness Student',
  email: 'readiness@example.com',
  phone: '+260971234567',
  nrc_number: '123456/78/9',
  date_of_birth: '2004-05-04',
  sex: 'Male' as const,
  residence_town: 'Lusaka',
  program: 'programme-1',
  intake: 'intake-1',
}

/** What the controller computes for the button: a tenant contract, school resolved. */
function buttonReadiness(formValues: typeof values) {
  return buildWizardReadiness(readinessInput({
    values: formValues,
    selectedGrades: grades,
    uploadedFiles: { nursing_council_letter: true },
    requiredDocumentItems: [
      {
        field: 'nursing_council_letter',
        label: 'Nursing Council letter',
        message: 'Upload the Nursing Council letter.',
        completed: true,
      },
    ],
    paymentStatus: 'successful',
    confirmSubmission: true,
    assignmentResolved: true,
  }))
}

const mutateAsync = vi.fn()
const setError = vi.fn()

beforeEach(() => {
  mutateAsync.mockReset()
  setError.mockReset()
  mutateAsync.mockResolvedValue({
    id: 'app-1',
    institution: 'inst-1',
    application_number: 'APP-1',
  })
})

describe('the Submit handler (clause 1.29)', () => {
  it('submits when the button is enabled: one readiness, one answer', async () => {
    // Precondition (true at HEAD): the button's readiness allows submitting.
    expect(buttonReadiness(values).canSubmit).toBe(true)

    const { result } = renderHook(() =>
      useWizardSubmission({
        draftMachine: { submit: async (command: () => Promise<unknown>) => command() },
        applicationId: 'app-1',
        user: { id: 'user-1' },
        uploadedFiles: { nursing_council_letter: true },
        resultSlipFile: null,
        extraKycFile: null,
        paymentStatus: 'successful',
        confirmSubmission: true,
        selectedGradesRef: { current: grades },
        isSubmittingRef: { current: false },
        selectedProgramDetails: undefined,
        intakes: [],
        getValues: () => values,
        queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn() },
        submitApplicationMutation: { mutateAsync },
        setLoading: vi.fn(),
        setError,
        setSuccess: vi.fn(),
        setSubmittedApplication: vi.fn(),
        setSubmitAssignmentFailureCode: vi.fn(),
        clearStaleApplicationReference: vi.fn(),
        goToStep: vi.fn(),
        showError: vi.fn(),
        showSuccess: vi.fn(),
        // The controller's single readiness computation (design R6-a).
        computeReadiness: buttonReadiness,
      } as never),
    )

    await act(async () => {
      await result.current.handleSubmitApplication(values as never)
    })

    // HEAD: setError("Complete the remaining requirements before submitting:
    // Assigned school, ...") and the mutation is never called.
    const refusals = setError.mock.calls.map(([message]) => String(message))
    expect(refusals.filter((message) => message.startsWith('Complete the remaining'))).toEqual([])
    expect(mutateAsync).toHaveBeenCalledTimes(1)
  })
})
