/**
 * The wizard's forward command (admissions-v2 task 11.2, MAINT-01).
 *
 * Lifted **verbatim** out of `useWizardController` — 472 lines of it, the single
 * largest block in a 1,773-line file that mixed orchestration, validation,
 * persistence and rendering. MAINT-01's remedy names an order: *"Add
 * characterization tests, then split by bounded workflow without changing
 * behavior."* The order is the point. 23 pure cases
 * (`tests/unit/applicationWizardCharacterisation.test.ts`) and 8 browser journeys
 * (`tests/harness-e2e/required/student-wizard-characterisation.spec.ts`) were green
 * before this moved and are green after, and three of those cases are about *this*
 * command: the reachability gates, the navigation reducer's clamping, and the
 * caller's veto.
 *
 * The body below is the callback as it stood, character for character — every
 * branch, every comment, and every error sentence a student can read. Only the
 * surrounding closure changed: what was read from the controller's scope now
 * arrives as a parameter, and the dependency list is the same list in the same
 * order. The first pass of this task recorded what re-authoring instead of lifting
 * costs — a silently dropped `gradesHydrating` guard and six changed field labels,
 * caught by two *other* lanes' property tests (§10.1 of
 * `docs/v2-evidence/11.2/README.md`) — so nothing here was retyped.
 *
 * What the command owns, in order of the six steps:
 *   1. `program`     — the programme/intake pair is real (R10.1);
 *   2. `assignedSchool` — the checkpoint: nothing past it moves until the platform
 *      has resolved the assigned school **and** the fee (R10.3);
 *   3. `personal`    — the draft is created or updated, and a changed selection goes
 *      through the one reroute command rather than a field write (R10.5, STU-01);
 *   4. `education`   — five unique canonical subjects and the tenant's own required
 *      documents (R11.5, R11.6), then one grade sync;
 *   5. `payment`     — resolved or deferred before review (R12.3);
 *   6. `submit`      — handed to `useWizardSubmission`.
 *
 * Requirements: **R10.2** (one state machine owns the lifecycle; other modules are
 * pure adapters or views), **R10.1**, **R10.3**, **R10.5**, **R11.5**, **R11.6**.
 * Findings: **MAINT-01**, **STU-01**, **STU-11**, **STU-13**.
 */
import { useCallback, type MutableRefObject } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import type { UseFormWatch } from 'react-hook-form'

import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { isApplicationMissingError } from '@/lib/applicationSession'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import { isPaymentResolvedForProgress } from '@/lib/paymentStatus'
import type { WizardDraftController } from '@/lib/wizardDraftController'

import { validateLiveGrades } from '../../lib/liveGradeValidation'
import { getStepIndexByKey } from '../../steps/config'
import { sanitizePhoneInput, type ResolvedIntakeIdentity, type SaveDraftOptions } from './wizardControllerUtils'
import type { SubjectGrade, WizardFormData, WizardProgram } from '../../types'
import type { SubmittedApplicationSummary } from '../useApplicationSlip'
import type { SelectionChangeRecovery, TargetSelection } from '../../lib/selectionChange'

export interface UseWizardStepAdvanceParams {
  applicationId: string | null
  currentStepConfig: { id: number; key: string }
  currentStepIndex: number
  watch: UseFormWatch<WizardFormData>
  programIds: string[]
  intakeIds: string[]
  selectedProgram: string
  selectedProgramDetails: WizardProgram | undefined
  selectedGradesRef: MutableRefObject<SubjectGrade[]>
  eligibilityCheck: { eligible?: boolean } | null | undefined
  resultSlipFile: File | null
  extraKycFile: File | null
  uploadedFiles: Record<string, boolean>
  uploading: boolean
  paymentStatus: 'pending' | 'successful' | 'failed' | 'deferred' | null
  assignmentPreviewFetching: boolean
  assignmentResolved: boolean
  assignmentPreviewError: string | null
  requiredDocuments: {
    contract: unknown
    blocking: Array<{ label: string }>
    uploading: boolean
  }
  queryClient: QueryClient
  /** The draft machine: the education step flushes pending grades through it (SJR R6-b). */
  draftMachine: Pick<WizardDraftController, 'flush' | 'getSnapshot'>
  saveDraft: (options?: SaveDraftOptions) => Promise<import('@/types/database').Application | null>
  applyDraftSelectionChange: (input: {
    applicationId: string
    persisted: Record<string, unknown> | null | undefined
    target: TargetSelection
  }) => Promise<{ ok: true; changed: boolean } | { ok: false; recovery: SelectionChangeRecovery }>
  resolveProgramIdentity: (value?: string | null, institutionHint?: string | null) => { id: string; label: string; institutionLabel: string } | null
  resolveIntakeIdentity: (value?: string | null) => ResolvedIntakeIdentity | null
  deriveInstitutionLabel: (institution?: WizardProgram['institutions']) => string
  normalizeSelectedGrades: (grades: SubjectGrade[]) => SubjectGrade[]
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
  goToStep: (index: number) => void
  setSelectedGrades: (grades: SubjectGrade[]) => void
  setSubmittedApplication: React.Dispatch<React.SetStateAction<SubmittedApplicationSummary | null>>
  setLoading: (value: boolean) => void
  setError: (message: string) => void
  showError: (message: string) => void
  showWarning: (message: string) => void
}

export function useWizardStepAdvance({
  applicationId,
  currentStepConfig,
  currentStepIndex,
  watch,
  programIds,
  intakeIds,
  selectedProgram,
  selectedProgramDetails,
  selectedGradesRef,
  eligibilityCheck,
  resultSlipFile,
  extraKycFile,
  uploadedFiles,
  uploading,
  paymentStatus,
  assignmentPreviewFetching,
  assignmentResolved,
  assignmentPreviewError,
  requiredDocuments,
  queryClient,
  draftMachine,
  saveDraft,
  applyDraftSelectionChange,
  resolveProgramIdentity,
  resolveIntakeIdentity,
  deriveInstitutionLabel,
  normalizeSelectedGrades,
  clearStaleApplicationReference,
  goToStep,
  setSelectedGrades,
  setSubmittedApplication,
  setLoading,
  setError,
  showError,
  showWarning,
}: UseWizardStepAdvanceParams) {
  const handleNextStep = useCallback(async () => {
    await saveDraft({ syncServer: false })

    // Step 1 (R10.1): programme + intake selection. Validate the pair, then
    // advance to the assigned-school checkpoint. The assignment preview runs
    // reactively (useAssignmentPreview) — no application row is created here.
    if (currentStepConfig.key === 'program') {
      const formData = watch()
      if (!formData.program || !programIds.includes(formData.program)) {
        setError('Please select a valid program from the list provided')
        return
      }
      if (!formData.intake || !intakeIds.includes(formData.intake)) {
        setError('Please select a valid intake from the list provided')
        return
      }
      setError('')
      goToStep(currentStepIndex + 1)
      return
    }

    // Step 2 (R10.2 / R10.3): assigned-school checkpoint. Payment is unreachable
    // until the backend has resolved the assigned school AND fee. Block forward
    // navigation past this checkpoint until the preview resolves.
    if (currentStepConfig.key === 'assignedSchool') {
      if (assignmentPreviewFetching) {
        setError('Please wait while we confirm your assigned school.')
        return
      }
      if (!assignmentResolved) {
        setError(
          assignmentPreviewError ||
          'We could not confirm your assigned school for this programme and intake. Please choose another intake or contact admissions.'
        )
        return
      }
      setError('')
      goToStep(currentStepIndex + 1)
      return
    }

    if (currentStepConfig.key === 'personal') {
      const formData = watch()
      const requiredFields = ['full_name', 'date_of_birth', 'sex', 'phone', 'email', 'residence_town', 'program', 'intake']
      const missingFields = requiredFields.filter(field => {
        if (field === 'residence_town') {
          return !normalizeResidenceTown(formData.residence_town)
        }
        return !formData[field as keyof typeof formData]
      })
      if (missingFields.length > 0) {
        const errorMessage = `Please fill in all required fields: ${missingFields.join(', ')}`
        setError(errorMessage)
        return
      }
      if (!formData.nrc_number && !formData.passport_number) {
        const errorMessage = 'Either NRC or Passport number is required'
        setError(errorMessage)
        return
      }
      if (formData.program && !programIds.includes(formData.program)) {
        const errorMessage = 'Please select a valid program from the list provided'
        setError(errorMessage)
        return
      }
      if (formData.intake && !intakeIds.includes(formData.intake)) {
        const errorMessage = 'Please select a valid intake from the list provided'
        setError(errorMessage)
        return
      }

      try {
        setLoading(true)
        setError('')
        const resolvedProgram = resolveProgramIdentity(formData.program)
        if (!resolvedProgram) {
          const errorMessage = 'Please select a valid program from the list provided'
          setError(errorMessage)
          return
        }
        const resolvedIntake = resolveIntakeIdentity(formData.intake)
        if (!resolvedIntake) {
          const errorMessage = 'Please select a valid intake from the list provided'
          setError(errorMessage)
          return
        }

        const programName = resolvedProgram.label
        const institutionLabel =
          resolvedProgram.institutionLabel || deriveInstitutionLabel(selectedProgramDetails?.institutions) || 'Beanola Admissions'
        
        // Duplicate check handled by backend on create/submit

        // One coordinator owns both start and answer persistence. Continue waits
        // for the same versioned/idempotent command autosave uses; it never races
        // a second generic PUT or a second application create (R10.2/R10.3).
        const savedApp = await saveDraft({ syncServer: true, requireServer: true })
        if (!savedApp?.id) {
          throw new Error('The application could not be saved online. Please try again.')
        }

        // Assignment remains a separate, canonical reroute command. It follows
        // the answer write so its response advances the shared server token.
        const rerouted = await applyDraftSelectionChange({
          applicationId: savedApp.id,
          persisted: savedApp as unknown as Record<string, unknown>,
          target: {
            programId: resolvedProgram.id,
            intakeId: resolvedIntake.id,
            programName: resolvedProgram.label,
            intakeName: resolvedIntake.name,
          },
        })
        if (!rerouted.ok) {
          setError(rerouted.recovery.message)
          showWarning(rerouted.recovery.message)
          return
        }

        setSubmittedApplication(prev => ({
          applicationId: savedApp.id,
          applicationNumber: savedApp.application_number || prev?.applicationNumber || '',
          trackingCode: String(savedApp.public_tracking_code || prev?.trackingCode || ''),
          program: programName,
          institution: institutionLabel,
          intake: resolvedIntake.label,
          fullName: formData.full_name,
          email: formData.email,
          phone: sanitizePhoneInput(formData.phone),
          status: savedApp.status || 'draft',
          paymentStatus: savedApp.payment_status ?? prev?.paymentStatus ?? null,
          nationality: savedApp.nationality,
        }))

        queryClient.invalidateQueries({ queryKey: ['applications'] })
        window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: { applicationId: savedApp.id } }))
        
        goToStep(currentStepIndex + 1)
      } catch (error) {
        logApiError('application-wizard', '/applications/', error)
        let errorMessage = toError(error).message || 'Failed to save application'

        if (applicationId && isApplicationMissingError(error)) {
          clearStaleApplicationReference(
            applicationId,
            'Your previous online draft is no longer available. Your details remain saved on this device.',
          )
          errorMessage = 'Your previous online draft is no longer available. Your details are still saved on this device. Please try Continue again.'
        }

        // Handle 404 for unavailable programs/intakes (Req 6.5)
        const errorStatus = (error as { status?: number })?.status
        if (errorStatus === 404 && !isApplicationMissingError(error)) {
          errorMessage = 'The selected program or intake is no longer available. Please select a different option.'
        } else if (errorMessage.includes('Bad Request')) {
          errorMessage = 'Connection issue - please try again'
        }
        
        // Map Django field-level validation errors to wizard display (Req 6.3)
        const fieldErrors = (error as { fieldErrors?: Record<string, unknown> })?.fieldErrors
        if (fieldErrors && typeof fieldErrors === 'object' && Object.keys(fieldErrors).length > 0) {
          errorMessage = Object.entries(fieldErrors)
            .map(([field, msg]) => {
              const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              const message = Array.isArray(msg) ? msg.join(', ') : String(msg ?? '')
              return `${label}: ${message}`
            })
            .join('; ')
        }
        
        setError(errorMessage)
        showError(errorMessage)
        return // Don't advance step on error
      } finally {
        setLoading(false)
      }
      return
    }

    if (currentStepConfig.key === 'education') {
      // Read from ref to avoid stale closure — selectedGrades state may not
      // have flushed yet if the user's last dropdown selection was very recent.
      const latestGrades = selectedGradesRef.current

      // Live validation — produces per-row diagnostics without silently
      // dropping in-progress rows (unlike normalizeDraftResumeGrades,
      // which is a server-draft sanitiser and was the cause of the
      // "6 subjects selected but told 2 are missing" bug).
      const liveValidation = validateLiveGrades(latestGrades)
      const validGradeCount = liveValidation.validCount

      if (!applicationId) {
        const errorMessage = 'Application not created. Returning to the personal details step.'
        setError(errorMessage)
        showError(errorMessage)
        goToStep(getStepIndexByKey('personal'))
        return
      }

      if (validGradeCount < 5) {
        const hintSuffix = liveValidation.hintMessage ? ` — ${liveValidation.hintMessage}` : ''
        const errorMessage = `Minimum 5 unique subjects required (${validGradeCount} selected${hintSuffix})`
        setError(errorMessage)
        return
      }

      // validGradeCount already excludes duplicates — if they still count as
      // "valid" (hitting the >= 5 threshold via first-occurrence), surface
      // the duplicate rows explicitly so the student can fix them.
      const duplicateCount = liveValidation.diagnostics.filter((d) => d.issue === 'duplicate').length
      if (duplicateCount > 0) {
        const errorMessage = 'Each subject can only be selected once. Please remove or change duplicate subjects.'
        setError(errorMessage)
        return
      }
      if (selectedProgram && eligibilityCheck && !eligibilityCheck.eligible) {
      }
      // Required-document gate driven by the versioned server contract (task
      // 7.2, R11.6): every requirement the tenant configured — including a
      // custom type — gates the step, not just the two legacy fields. When the
      // contract could not be read the legacy checks still apply, so this gate
      // is never weaker than before; the server re-checks under the row lock
      // either way (task 6.5).
      if (requiredDocuments.contract) {
        const blocking = requiredDocuments.blocking
        if (blocking.length > 0) {
          const labels = blocking.map((requirement) => requirement.label).join(', ')
          setError(
            blocking.length === 1
              ? `${labels} is required before continuing.`
              : `These documents are required before continuing: ${labels}.`,
          )
          return
        }
      } else {
        if (!resultSlipFile && !uploadedFiles['result_slip']) {
          const errorMessage = 'Result slip is required'
          setError(errorMessage)
          return
        }

        // Require identity document (NRC or Passport) — Req 5.1, 5.2
        if (!extraKycFile && !uploadedFiles['extra_kyc']) {
          const errorMessage = 'An NRC or Passport document is required before proceeding'
          setError(errorMessage)
          return
        }
      }

      // Wait for upload to complete if still uploading
      if (uploading || requiredDocuments.uploading) {
        const errorMessage = 'Please wait for file upload to complete'
        setError(errorMessage)
        return
      }

      // Files already uploaded on selection, just sync grades and proceed
      try {
        setLoading(true)
        // For the server sync we still strip in-progress / empty rows using
        // the draft-resume normaliser — that's what it was designed for.
        // Live validation above ensures only genuinely valid rows got us
        // here, so this normalisation is a safe final cleanup.
        const gradesToSync = normalizeSelectedGrades(latestGrades)
        if (gradesToSync.length > 0) {
          // The cleaned grid becomes the grid (ref first: the machine reads it
          // there), and the draft machine saves it. There is no second grade
          // write path (SJR R6-b, one autosave owner).
          selectedGradesRef.current = gradesToSync
          setSelectedGrades(gradesToSync)
        }
        await draftMachine.flush()
        const afterFlush = draftMachine.getSnapshot()
        if (afterFlush.applicationId === null) {
          // The server no longer has this draft: the machine detached from it.
          const errorMessage = 'Your online draft was no longer available. Your grades are saved on this device; please continue from the personal details step to refresh the draft.'
          setError(errorMessage)
          goToStep(getStepIndexByKey('personal'))
          return
        }
        if (afterFlush.pending) {
          // Offline or refused: today's behaviour, the student does not advance.
          setError("We couldn't save your grades. Check your connection and try again.")
          return
        }
        if (gradesToSync.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['applications'] })
        }
        goToStep(currentStepIndex + 1)
      } catch (error) {
        logApiError('application-wizard', `/applications/${applicationId}/grades/`, error)
        if (isApplicationMissingError(error)) {
          const errorMessage = 'Your online draft was no longer available. Your grades are saved on this device; please continue from the personal details step to refresh the draft.'
          clearStaleApplicationReference(applicationId, errorMessage)
          setError(errorMessage)
          goToStep(getStepIndexByKey('personal'))
          return
        }

        const errorMessage = toError(error).message || 'Failed to save grades'
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
      return
    }

    if (currentStepConfig.key === 'payment') {
      if (!applicationId) {
        showError('Application not found. Please go back to step 1.')
        return
      }

      if (!isPaymentResolvedForProgress(paymentStatus)) {
        const errorMessage = 'Complete and confirm payment before continuing to the review step.'
        setError(errorMessage)
        showError(errorMessage)
        return
      }

      goToStep(currentStepIndex + 1)
    }
  }, [
    saveDraft,
    currentStepConfig,
    watch,
    goToStep,
    currentStepIndex,
    selectedProgram,
    selectedProgramDetails,
    eligibilityCheck,
    resultSlipFile,
    extraKycFile,
    draftMachine,
    applicationId,
    normalizeSelectedGrades,
    programIds,
    intakeIds,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    showError,
    paymentStatus,
    deriveInstitutionLabel,
    clearStaleApplicationReference,
    queryClient,
    assignmentPreviewFetching,
    assignmentResolved,
    assignmentPreviewError,
    applyDraftSelectionChange,
    showWarning,
  ])
  return { handleNextStep }
}
