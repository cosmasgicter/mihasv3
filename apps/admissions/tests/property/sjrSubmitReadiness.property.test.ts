/**
 * R6-a property: the Submit handler's readiness is the button's readiness.
 *
 * Spec: student-journey-repair task 3.22, clauses 2.31 and 2.32.
 *
 * For generated inputs, whatever the controller's single `computeReadiness`
 * says about the form, the Submit handler acts on exactly that: it calls the
 * submit mutation when the button would be enabled, and it refuses naming the
 * same blockers when the button would be disabled. Nothing in the handler adds
 * or drops an input of its own.
 */
import { act, renderHook } from '@testing-library/react'
import * as fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/catalog', () => ({
  institutionService: { list: vi.fn(async () => ({ institutions: [] })) },
}))

import { useWizardSubmission } from '@/pages/student/applicationWizard/hooks/wizard/useWizardSubmission'
import { buildWizardReadiness } from '@/pages/student/applicationWizard/lib/wizardReadiness'
import { readinessInput } from '../unit/__fixtures__/readinessInput'

const subjectId = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36)
const FULL_GRADES = [1, 2, 3, 4, 5].map((n) => ({ subject_id: subjectId(n), grade: 4 }))
const COMPLETE_VALUES = {
  full_name: 'Property Student',
  email: 'property@example.com',
  phone: '+260971234567',
  nrc_number: '123456/78/9',
  date_of_birth: '2004-05-04',
  sex: 'Male' as const,
  residence_town: 'Lusaka',
  program: 'programme-1',
  intake: 'intake-1',
}

const inputs = fc.record({
  gradeCount: fc.integer({ min: 0, max: 5 }),
  assignmentResolved: fc.boolean(),
  hasContract: fc.boolean(),
  contractDocumentDone: fc.boolean(),
  slip: fc.boolean(),
  identity: fc.boolean(),
  paymentStatus: fc.constantFrom('pending', 'successful', 'failed', 'deferred', null),
  confirmSubmission: fc.boolean(),
  hasName: fc.boolean(),
})

describe('(R6-a) the Submit handler uses the button readiness', () => {
  it('submits exactly when the button is enabled, for generated inputs', async () => {
    await fc.assert(
      fc.asyncProperty(inputs, async (generated) => {
        const values = { ...COMPLETE_VALUES, full_name: generated.hasName ? COMPLETE_VALUES.full_name : '' }
        const computeReadiness = (formValues: typeof values) =>
          buildWizardReadiness(
            readinessInput({
              values: formValues,
              selectedGrades: FULL_GRADES.slice(0, generated.gradeCount),
              uploadedFiles: { result_slip: generated.slip, extra_kyc: generated.identity },
              hasResultSlipFile: generated.slip,
              hasIdentityFile: generated.identity,
              requiredDocumentItems: generated.hasContract
                ? [{ field: 'tenant_doc', label: 'Tenant document', message: 'Upload it.', completed: generated.contractDocumentDone }]
                : undefined,
              paymentStatus: generated.paymentStatus,
              confirmSubmission: generated.confirmSubmission,
              assignmentResolved: generated.assignmentResolved,
            }),
          )
        const button = computeReadiness(values)
        const mutateAsync = vi.fn(async () => ({ id: 'app-1', institution: 'inst-1', application_number: 'APP-1' }))
        const setError = vi.fn()
        const { result, unmount } = renderHook(() =>
          useWizardSubmission({
            draftMachine: { submit: async (command: () => Promise<unknown>) => command() },
            applicationId: 'app-1',
            user: { id: 'user-1' },
            computeReadiness,
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
          } as never),
        )
        await act(async () => {
          await result.current.handleSubmitApplication(values as never)
        })
        unmount()
        if (button.canSubmit) {
          expect(mutateAsync).toHaveBeenCalledTimes(1)
        } else {
          expect(mutateAsync).not.toHaveBeenCalled()
          const refusal = String(setError.mock.calls[0]?.[0] ?? '')
          for (const item of button.missingItems) expect(refusal).toContain(item.label)
        }
      }),
      { numRuns: 60 },
    )
  })
})
