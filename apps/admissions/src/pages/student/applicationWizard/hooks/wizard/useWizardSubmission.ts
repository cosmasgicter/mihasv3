/**
 * The wizard's submit command (admissions-v2 task 11.2, MAINT-01).
 *
 * Lifted **verbatim** out of `useWizardController`, which mixed orchestration,
 * validation, persistence and rendering across 1,773 lines. MAINT-01's remedy names
 * an order — *"Add characterization tests, then split by bounded workflow without
 * changing behavior"* — and the order is why this file exists at all: 23 pure cases
 * (`tests/unit/applicationWizardCharacterisation.test.ts`) and 8 browser journeys
 * (`tests/harness-e2e/required/student-wizard-characterisation.spec.ts`) were green
 * before it moved, and are green after.
 *
 * The body below is the callback as it stood, character for character, including its
 * comments and its error-message copy. Only the surrounding closure changed: what
 * was read from the controller's scope now arrives as a parameter, and the
 * dependency list is the same list in the same order. The first pass of this task
 * recorded what re-authoring instead of lifting costs — a silently dropped
 * `gradesHydrating` guard and six changed field labels, caught by two *other* lanes'
 * property tests (§10.1 of `docs/v2-evidence/11.2/README.md`) — so nothing here was
 * retyped.
 *
 * Requirements: **R10.2** (one state machine owns hydration, edits, autosave, manual
 * save, retry, conflict, delete, payment gate and submit; other modules are pure
 * adapters or views), **R10.6** (submission re-evaluates everything under row locks
 * and performs one legal transition), **R2.7** (a submission-time assignment failure
 * is recoverable, never a silent success).
 *
 * Task 6.3 put the command itself under the draft machine: the submit request runs
 * inside `draftMachine.submit(...)`, which first writes any answers the server does
 * not have yet, holds every autosave off while the command is in flight, ends in the
 * machine's `submitted` (terminal) or `ready.with_errors`, and clears exactly this
 * application's local outbox record on success (R10.4, R10.10). This hook keeps the
 * readiness gate, the stable submit key and the student-facing error copy.
 */
import { useCallback, type MutableRefObject } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { UseFormGetValues } from 'react-hook-form'

import { logApiError } from '@/lib/apiErrorLogger'
import { logger } from '@/lib/logger'
import { toError } from '@/lib/toError'
import { isApplicationMissingError } from '@/lib/applicationSession'
import { buildSubmitIdempotencyKey } from '@/lib/submitIdempotency'
import type { WizardDraftController } from '@/lib/wizardDraftController'
import { institutionService } from '@/services/catalog'
import type { Application } from '@/types/database'

import { buildWizardReadiness } from '../../lib/wizardReadiness'
import { asAssignmentFailureCode, resolveAssignmentRecovery } from '../../lib/assignmentRecovery'
import type { AssignmentFailureCode } from '../../lib/assignmentRecovery'
import { getStepIndexByKey } from '../../steps/config'
import type { SubjectGrade, WizardFormData, WizardIntake, WizardProgram } from '../../types'
import type { SubmittedApplicationSummary } from '../useApplicationSlip'

export interface UseWizardSubmissionParams {
  /** The draft machine the submit command runs under (task 6.3, R10.2). */
  draftMachine: WizardDraftController
  applicationId: string | null
  user: { id?: string } | null | undefined
  uploadedFiles: Record<string, boolean>
  resultSlipFile: File | null
  extraKycFile: File | null
  paymentStatus: 'pending' | 'successful' | 'failed' | 'deferred' | null
  confirmSubmission: boolean
  selectedGradesRef: MutableRefObject<SubjectGrade[]>
  isSubmittingRef: MutableRefObject<boolean>
  selectedProgramDetails: WizardProgram | undefined
  intakes: WizardIntake[]
  getValues: UseFormGetValues<WizardFormData>
  queryClient: QueryClient
  submitApplicationMutation: {
    mutateAsync: (variables: { id: string; headers?: Record<string, string> }) => Promise<Application | null>
  }
  setLoading: (value: boolean) => void
  setError: (message: string) => void
  setSuccess: (value: boolean) => void
  setSubmittedApplication: React.Dispatch<React.SetStateAction<SubmittedApplicationSummary | null>>
  setSubmitAssignmentFailureCode: (code: AssignmentFailureCode | null) => void
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
  goToStep: (index: number) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

export function useWizardSubmission({
  draftMachine,
  applicationId,
  user,
  uploadedFiles,
  resultSlipFile,
  extraKycFile,
  paymentStatus,
  confirmSubmission,
  selectedGradesRef,
  isSubmittingRef,
  selectedProgramDetails,
  intakes,
  getValues,
  queryClient,
  submitApplicationMutation,
  setLoading,
  setError,
  setSuccess,
  setSubmittedApplication,
  setSubmitAssignmentFailureCode,
  clearStaleApplicationReference,
  goToStep,
  showError,
  showSuccess,
}: UseWizardSubmissionParams) {
  const handleSubmitApplication = useCallback(async (data: WizardFormData) => {
    logger.info('[handleSubmitApplication] Starting submission...')
    // Prevent double-click on submit (Req 8.3)
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    const finalReadiness = buildWizardReadiness({
      values: data,
      selectedGrades: selectedGradesRef.current,
      uploadedFiles,
      hasResultSlipFile: Boolean(resultSlipFile),
      hasIdentityFile: Boolean(extraKycFile),
      paymentStatus,
      confirmSubmission,
    })

    if (!finalReadiness.canSubmit) {
      const errorMessage = `Complete the remaining requirements before submitting: ${finalReadiness.missingItems
        .map(item => item.label)
        .join(', ')}`
      setError(errorMessage)
      isSubmittingRef.current = false
      return
    }
    if (!applicationId) {
      const errorMessage = 'Application ID not found. Please try refreshing the page.'
      setError(errorMessage)
      isSubmittingRef.current = false
      return
    }

    try {
      setLoading(true)
      setError('')
      
      logger.info('[handleSubmitApplication] Checking signed-in user...')
      if (!user?.id) {
        throw new Error('Please sign in again to submit your application')
      }

      logger.info('[handleSubmitApplication] Finalizing submission...')
      // Deterministic per-application key (task 6.5, design §14.2): a retry
      // after a lost submit response replays the cached success response instead
      // of surfacing an error, and a concurrent double-submit is refused with
      // IDEMPOTENCY_PENDING rather than racing the submission transaction.
      const idempotencyKey = buildSubmitIdempotencyKey(applicationId)
      const updatedApp = await draftMachine.submit(() =>
        submitApplicationMutation.mutateAsync({
          id: applicationId,
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
      )
      

      if (!updatedApp) {
        throw new Error('Application not found or access denied')
      }

      // Fetch institution name
      let institutionName = updatedApp.institution
      try {
        // Read through the catalogue domain service (task 13.6 remediation L12).
        // This used to take the transport as a constructor parameter, which kept the
        // `no-restricted-imports` rule quiet without making the module obey it: an
        // injected `apiClient` is still a page hook talking to transport, just at one
        // remove. `institutionService.getInstitutions` is the canonical reader and it
        // already owns the shape tolerance this call had inline.
        //
        // The one branch that changed: the old matcher also tried `inst.slug`, and
        // `InstitutionSerializer` (`backend/apps/catalog/serializers.py`) has never
        // served a `slug` — so that comparison could not match. `code` is the field
        // that short identifier actually exists in, so it takes its place; `id` and
        // `name` are unchanged, and `name` is the one that resolves the display
        // snapshot this is looking up.
        const { institutions } = await institutionService.list()
        const match = institutions.find(
          (inst) =>
            inst.id === updatedApp.institution
            || inst.code === updatedApp.institution
            || inst.name === updatedApp.institution
        )
        if (match?.name) {
          institutionName = match.name
        }
      } catch (e) {
        logApiError('application-wizard', '/catalog/institutions/', e)
      }

      setSubmittedApplication(prev => ({
        applicationId: updatedApp.id || prev?.applicationId || null,
        applicationNumber: updatedApp.application_number || prev?.applicationNumber || '',
        trackingCode: String(updatedApp.public_tracking_code || prev?.trackingCode || ''),
        program: updatedApp.program || prev?.program || '',
        institution: String(institutionName || prev?.institution || ''),
        intake: updatedApp.intake || prev?.intake || '',
        fullName: updatedApp.full_name || prev?.fullName || '',
        email: updatedApp.email || prev?.email || '',
        phone: updatedApp.phone || prev?.phone || '',
        status: updatedApp.status || 'submitted',
        paymentStatus: updatedApp.payment_status ?? prev?.paymentStatus ?? null,
        submittedAt: updatedApp.submitted_at,
        updatedAt: updatedApp.updated_at,
        nationality: updatedApp.nationality
      }))

      // Notification is automatically sent by database trigger on status change

      // R10.10: the machine's submit already cleared only this application's
      // local outbox record — never another draft, never a payment-recovery record.

      // Invalidate all application queries to refresh dashboard
      await queryClient.invalidateQueries({ queryKey: ['applications'] })
      
      // Dispatch event to notify dashboard to refresh
      window.dispatchEvent(new CustomEvent('applicationSubmitted', {
        detail: {
          applicationId,
          applicationNumber: updatedApp.application_number,
          submittedAt: updatedApp.submitted_at,
          status: updatedApp.status,
          paymentStatus: updatedApp.payment_status ?? null,
          program: updatedApp.program,
        }
      }))
      
      logger.info('[handleSubmitApplication] Submission successful!')
      showSuccess('Application submitted successfully!')
      setSuccess(true)
    } catch (error) {
      logApiError('application-wizard', `/applications/${applicationId}/submit/`, error)
      let message = toError(error).message || 'Failed to submit application'
      
      // Handle 404 for unavailable programs/intakes (Req 6.5)
      const errorStatus = (error as { status?: number })?.status
      const errorCode = (error as { data?: { code?: string }; code?: string })?.data?.code || (error as { code?: string })?.code
      if (applicationId && isApplicationMissingError(error)) {
        clearStaleApplicationReference(applicationId)
        message = 'Your online draft was no longer available. Your details are still saved on this device; please continue from the personal details step to refresh the draft.'
        goToStep(getStepIndexByKey('personal'))
      } else if (asAssignmentFailureCode(errorCode)) {
        // R2.7: submission re-ran assignment and the assigned offering is no
        // longer eligible / filled to capacity. This is recoverable, never a
        // silent success — surface the recoverable guidance on the
        // assigned-school checkpoint and route the student there.
        const failureCode = asAssignmentFailureCode(errorCode)!
        setSubmitAssignmentFailureCode(failureCode)
        const recovery = resolveAssignmentRecovery({
          code: failureCode,
          programName: selectedProgramDetails?.name,
          intakeName: intakes.find(intake => intake.id === getValues('intake'))?.name,
        })
        message = recovery.message
        goToStep(getStepIndexByKey('assignedSchool'))
      } else if (errorCode === 'IDEMPOTENCY_PENDING') {
        message = 'Your submission is still being processed. Please wait a moment, refresh the application status, and try again only if it is not submitted.'
      } else if (errorCode === 'ALREADY_SUBMITTED') {
        message = 'This application has already been submitted. Refreshing your dashboard will show the current status.'
      } else if (errorStatus && errorStatus >= 500) {
        void queryClient.invalidateQueries({ queryKey: ['applications'] })
        void queryClient.invalidateQueries({ queryKey: ['student-dashboard-polling'] })
        message = 'We could not confirm submission because the server had a temporary issue. Please refresh your application status before trying again.'
      } else if (errorStatus === 404) {
        message = 'The selected program or intake is no longer available. Please go back and select a different option.'
      } else if (message.includes('Bad Request')) {
        message = 'Connection issue - please try again'
      }
      
      // Map Django field-level validation errors (Req 6.3)
      const fieldErrors = (error as { fieldErrors?: Record<string, unknown> })?.fieldErrors
      if (fieldErrors && typeof fieldErrors === 'object' && Object.keys(fieldErrors).length > 0) {
        message = Object.entries(fieldErrors)
          .map(([field, msg]) => {
            const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            const text = Array.isArray(msg) ? msg.join(', ') : String(msg ?? '')
            return `${label}: ${text}`
          })
          .join('; ')
      }
      
      setError(message)
      showError(message)
    } finally {
      setLoading(false)
      isSubmittingRef.current = false
    }
  // The controller's own dependency list, unchanged in content and order. The
  // setters, refs and `queryClient` are stable identities and were not listed
  // before the move either; adding them would change when the callback is
  // rebuilt, which is a behaviour change this lift is not allowed to make.
  }, [confirmSubmission, uploadedFiles, resultSlipFile, extraKycFile, paymentStatus, applicationId, submitApplicationMutation, user?.id, showError, showSuccess, queryClient, clearStaleApplicationReference, goToStep, selectedProgramDetails, intakes, getValues, draftMachine])

  return { handleSubmitApplication }
}
