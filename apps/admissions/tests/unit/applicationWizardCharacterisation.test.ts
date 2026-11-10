/**
 * Wizard behaviour characterisation — written **before** the split
 * (admissions-v2 task 11.2, finding MAINT-01).
 *
 * Requirements: **R10.2** ("ONE frontend state machine SHALL own hydration,
 * edits, local outbox, debounced autosave, manual save, retry, conflict, delete,
 * payment gate, and submit; other modules SHALL be pure adapters or views"),
 * **R14.3-R14.5** by way of MAINT-01's remedy ("Add characterization tests, then
 * split by bounded workflow without changing behavior").
 *
 * ── Why this file exists, and what it is not ────────────────────────────────
 *
 * MAINT-01's remedy names an order, not a pair of activities: characterisation
 * tests **first**, then the move. This file is the "first" half for the wizard's
 * *pure* state-machine boundaries — the step table, the reachability gates, the
 * navigation reducer, the readiness rail, and the draft-intent parser. Every
 * assertion below describes behaviour that exists on the tree as it was found,
 * and every one of them must still read true after the decomposition. Nothing
 * here asserts an improvement; that is the recomposition's own suite's job.
 *
 * It is deliberately **behavioural, not source-scanning**. `applicationWizardUxGuard`
 * already reads `index.tsx` as text, and that is precisely the kind of test a
 * decomposition breaks for no behavioural reason: it pins *where* code lives.
 * These cases call the modules and compare answers, so moving a function between
 * files cannot fail them and changing what it answers cannot pass them.
 *
 * The composite behaviour a unit test cannot reach — that the six steps render in
 * that order in a browser, that autosave stays silent, that the checklist names
 * the same items, that the payment gate holds against a real payment row — is
 * characterised in the browser instead, by
 * `tests/harness-e2e/required/student-wizard-characterisation.spec.ts`, which was
 * likewise run before the change and must read identically after it.
 */
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import {
  ASSIGNED_SCHOOL_STEP_INDEX,
  PAYMENT_STEP_INDEX,
  PROGRAM_STEP_INDEX,
  getStepByKey,
  getStepIndexById,
  getStepIndexByKey,
  isPaymentReachable,
  isStepReachable,
  previousButtonLabel,
  saveNowLabel,
  wizardSteps,
  type StepKey,
} from '@/pages/student/applicationWizard/steps/config'
import { useWizardNavigation } from '@/pages/student/applicationWizard/hooks/wizard/useWizardNavigation'
import { buildWizardReadiness } from '@/pages/student/applicationWizard/lib/wizardReadiness'
import { readinessInput } from './__fixtures__/readinessInput'
import { parseWizardDraftIntent } from '@/pages/student/applicationWizard/hooks/wizard/useWizardDraftLoader'
import { resolveDraftResumeStepId } from '@/pages/student/applicationWizard/lib/draftResume'
import {
  documentChecklistItems,
  documentValidationFields,
} from '@/pages/student/applicationWizard/lib/requiredDocumentSurfaces'

/** A canonical subject id shape the readiness rail accepts (R11.5). */
const canonicalSubjectId = (n: number) =>
  `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36)

/** Five distinct canonical subjects at a passing grade — the configured minimum. */
const minimumGrades = () =>
  [1, 2, 3, 4, 5].map(n => ({ subject_id: canonicalSubjectId(n), grade: 4 }))

/** Everything the personal step asks for, so a fixture can start complete. */
const completePersonal = {
  full_name: 'Characterisation Student',
  email: 'characterisation@example.com',
  phone: '+260971234567',
  nrc_number: '123456/78/9',
  date_of_birth: '2004-05-04',
  sex: 'Male' as const,
  residence_town: 'Lusaka',
}

describe('wizard characterisation: the step table is the state machine (R10.2)', () => {
  it('has six states in the program-first order', () => {
    expect(wizardSteps.map(step => step.key)).toEqual([
      'program',
      'assignedSchool',
      'personal',
      'education',
      'payment',
      'submit',
    ])
  })

  it('keeps the assigned-school checkpoint strictly before payment (R10.3)', () => {
    expect(ASSIGNED_SCHOOL_STEP_INDEX).toBeLessThan(PAYMENT_STEP_INDEX)
    expect(PROGRAM_STEP_INDEX).toBe(0)
  })

  it('numbers its ids from one, contiguously, matching its own indexes', () => {
    wizardSteps.forEach((step, index) => {
      expect(step.id).toBe(index + 1)
      expect(getStepIndexById(step.id)).toBe(index)
      expect(getStepIndexByKey(step.key)).toBe(index)
      expect(getStepByKey(step.key)).toBe(step)
    })
  })

  /**
   * The rendered step names are load-bearing beyond this surface: another lane's
   * browser spec (`ocr-manual-fallback.spec.ts`) reaches the next control by
   * `Continue to ${progressTitle}`, so a renamed `progressTitle` silently breaks
   * a journey this task does not own.
   */
  it('names each step for the control that navigates to it', () => {
    expect(wizardSteps.map(step => step.progressTitle)).toEqual([
      'Programme',
      'Assigned school',
      'Personal',
      'Education',
      'Payment',
      'Review',
    ])
    expect(wizardSteps.every(step => step.title.length > 0)).toBe(true)
    expect(wizardSteps.every(step => step.instruction.length > 0)).toBe(true)
    expect(saveNowLabel).toBe('Save now')
    expect(previousButtonLabel).toBe('Previous')
  })

  it('gates every step after the checkpoint on a resolved assignment', () => {
    const unresolved = { assignmentResolved: false }
    const resolved = { assignmentResolved: true }

    wizardSteps.forEach((step, index) => {
      const reachableUnresolved = isStepReachable(index, unresolved)
      expect(reachableUnresolved, `${step.key} with no assignment`).toBe(
        index <= ASSIGNED_SCHOOL_STEP_INDEX,
      )
      expect(isStepReachable(index, resolved), `${step.key} with an assignment`).toBe(true)
    })

    expect(isPaymentReachable(unresolved)).toBe(false)
    expect(isPaymentReachable(resolved)).toBe(true)
  })
})

describe('wizard characterisation: the navigation reducer (R10.2)', () => {
  it('starts on the first step', () => {
    const { result } = renderHook(() => useWizardNavigation())
    expect(result.current.currentStepIndex).toBe(0)
    expect(result.current.currentStepConfig.key).toBe('program')
    expect(result.current.totalSteps).toBe(wizardSteps.length)
    expect(result.current.isLastStep).toBe(false)
  })

  it('clamps out-of-range jumps into the step range instead of throwing', () => {
    const { result } = renderHook(() => useWizardNavigation())

    act(() => result.current.goToStep(-5))
    expect(result.current.currentStepIndex).toBe(0)

    act(() => result.current.goToStep(999))
    expect(result.current.currentStepIndex).toBe(wizardSteps.length - 1)
    expect(result.current.isLastStep).toBe(true)
    expect(result.current.currentStepConfig.key).toBe('submit')
  })

  it('never steps back past the first step', () => {
    const { result } = renderHook(() => useWizardNavigation())
    act(() => result.current.handlePrevStep())
    expect(result.current.currentStepIndex).toBe(0)
  })

  it('lets the caller veto an advance', async () => {
    let allow = false
    const { result } = renderHook(() =>
      useWizardNavigation({ onBeforeNext: async () => allow }),
    )

    await act(async () => {
      await result.current.handleNextStep()
    })
    expect(result.current.currentStepIndex).toBe(0)

    allow = true
    await act(async () => {
      await result.current.handleNextStep()
    })
    expect(result.current.currentStepIndex).toBe(1)
  })

  it('runs the caller hook before stepping back', () => {
    const seen: number[] = []
    const { result } = renderHook(() =>
      useWizardNavigation({ onBeforePrev: () => seen.push(result.current.currentStepIndex) }),
    )

    act(() => result.current.goToStep(3))
    act(() => result.current.handlePrevStep())

    expect(seen).toEqual([3])
    expect(result.current.currentStepIndex).toBe(2)
  })
})

describe('wizard characterisation: the readiness rail (R10.6, R11.5)', () => {
  it('counts every requirement across the six steps', () => {
    const readiness = buildWizardReadiness(readinessInput({ values: {} }))

    expect(readiness.stepProgress.map(step => step.stepKey)).toEqual(
      wizardSteps.map(step => step.key),
    )
    expect(readiness.totalItems).toBeGreaterThan(0)
    expect(readiness.completedItems).toBe(0)
    expect(readiness.percentage).toBe(0)
    expect(readiness.canSubmit).toBe(false)
    expect(readiness.missingItems.length).toBe(readiness.totalItems)
  })

  it('reaches canSubmit only when every step is satisfied', () => {
    const readiness = buildWizardReadiness(readinessInput({
      values: { ...completePersonal, program: 'programme-1', intake: 'intake-1' },
      selectedGrades: minimumGrades(),
      uploadedFiles: { result_slip: true, extra_kyc: true },
      paymentStatus: 'successful',
      confirmSubmission: true,
      assignmentResolved: true,
    }))

    expect(readiness.missingItems).toEqual([])
    expect(readiness.canSubmit).toBe(true)
    expect(readiness.percentage).toBe(100)
  })

  it('refuses a duplicate subject and a non-canonical subject id (STU-11)', () => {
    const duplicated = buildWizardReadiness(readinessInput({
      values: {},
      selectedGrades: [
        ...minimumGrades().slice(0, 4),
        { subject_id: canonicalSubjectId(1), grade: 5 },
      ],
    }))
    expect(
      duplicated.stepProgressByKey.education.missingItems.some(item => item.field === 'grades'),
    ).toBe(true)

    const nonCanonical = buildWizardReadiness(readinessInput({
      values: {},
      selectedGrades: [1, 2, 3, 4, 5].map(n => ({ subject_id: `subject-${n}`, grade: 4 })),
    }))
    expect(
      nonCanonical.stepProgressByKey.education.missingItems.some(item => item.field === 'grades'),
    ).toBe(true)
  })

  it('treats a deferred fee as satisfied for progress, and an unpaid one as not', () => {
    const deferred = buildWizardReadiness(readinessInput({ values: {}, paymentStatus: 'deferred' }))
    expect(deferred.stepProgressByKey.payment.isComplete).toBe(true)

    const pending = buildWizardReadiness(readinessInput({ values: {}, paymentStatus: 'pending' }))
    expect(pending.stepProgressByKey.payment.isComplete).toBe(false)
  })

  it('names the tenant\u2019s own documents when a contract is supplied', () => {
    const readiness = buildWizardReadiness(readinessInput({
      values: {},
      requiredDocumentItems: [
        {
          field: 'nursing_council_letter',
          label: 'Nursing council letter',
          message: 'Upload the nursing council letter.',
          completed: false,
        },
      ],
    }))

    const documentFields = readiness.stepProgressByKey.education.missingItems.map(
      item => item.field,
    )
    expect(documentFields).toContain('nursing_council_letter')
    expect(documentFields).not.toContain('result_slip')
  })

  it('every missing item carries the step that fixes it, and a sentence', () => {
    const readiness = buildWizardReadiness(readinessInput({ values: {} }))
    const stepKeys = new Set<StepKey>(wizardSteps.map(step => step.key))

    readiness.missingItems.forEach(item => {
      expect(stepKeys.has(item.stepKey)).toBe(true)
      expect(item.label.length).toBeGreaterThan(0)
      expect(item.message.length).toBeGreaterThan(0)
      expect(item.completed).toBe(false)
    })
  })
})

describe('wizard characterisation: where a resumed draft opens (R10.1)', () => {
  /**
   * This is the behaviour that corrected the *first* draft of the browser
   * characterisation: a resumed draft does not open at step 1, it opens at the
   * step whose work is outstanding. Pinned here because a decomposition that
   * accidentally reverted it would put a student who is three steps in back at the
   * programme selection with everything already answered.
   */
  const step = (
    application: Parameters<typeof resolveDraftResumeStepId>[0],
    grades: Parameters<typeof resolveDraftResumeStepId>[1] = [],
    uploads?: Parameters<typeof resolveDraftResumeStepId>[2],
  ) => resolveDraftResumeStepId(application, grades, uploads)

  it('opens at personal when the draft has no programme or no name', () => {
    expect(step({})).toBe(3)
    expect(step({ program: 'Diploma' })).toBe(3)
    expect(step({ full_name: 'A Student' })).toBe(3)
  })

  it('opens at education when the identity is known but the education is not', () => {
    expect(step({ program: 'Diploma', full_name: 'A Student' })).toBe(4)
  })

  it('opens at payment once the education requirements are on file', () => {
    const grades = minimumGrades().map((grade, index) => ({ ...grade, row_id: `r${index}` }))
    expect(
      step({ program: 'Diploma', full_name: 'A Student' }, grades, {
        result_slip: true,
        extra_kyc: true,
      }),
    ).toBe(5)
  })

  it('opens at review once the fee is settled or deliberately deferred', () => {
    expect(step({ program: 'Diploma', full_name: 'A Student', payment_status: 'successful' })).toBe(6)
    expect(step({ program: 'Diploma', full_name: 'A Student', payment_status: 'deferred' })).toBe(6)
    expect(step({ program: 'Diploma', full_name: 'A Student', payment_status: 'verified' })).toBe(6)
  })

  it('always names a real step id', () => {
    const ids = wizardSteps.map(s => s.id)
    ;[
      {},
      { program: 'p', full_name: 'n' },
      { program: 'p', full_name: 'n', payment_status: 'pending' },
      { program: 'p', full_name: 'n', payment_status: 'failed' },
    ].forEach(application => {
      expect(ids).toContain(step(application))
    })
  })
})

describe('wizard characterisation: draft intent and the document surfaces', () => {
  it('reads explicit new, resume, local and auto intent', () => {
    expect(parseWizardDraftIntent('?mode=new').mode).toBe('new')
    expect(parseWizardDraftIntent('?new=true').mode).toBe('new')
    expect(parseWizardDraftIntent('?fresh=1').mode).toBe('new')

    const resume = parseWizardDraftIntent('?mode=resume&draftId=app-77')
    expect(resume.mode).toBe('resume')
    expect(resume.draftId).toBe('app-77')

    expect(parseWizardDraftIntent('').mode).toBe('auto')
  })

  it('falls back to the legacy pair only when no contract could be read', () => {
    const legacy = {
      hasResultSlip: false,
      hasIdentityDocument: true,
      resultSlipName: null,
      identityName: 'nrc.pdf',
    }

    const withoutContract = documentChecklistItems(null, legacy)
    expect(withoutContract.map(item => item.label)).toEqual([
      'Result slip uploaded',
      'Identity document (NRC or Passport) uploaded',
    ])
    expect(withoutContract.map(item => item.completed)).toEqual([false, true])

    const fields = documentValidationFields(null, legacy)
    expect(fields.map(field => field.label)).toEqual(['Result slip', 'Identity document'])
    expect(fields.map(field => field.completed)).toEqual([false, true])
  })
})
