import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useForm, type UseFormReturn, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '@/hooks/useToast'
import { useAuth } from '@/contexts/AuthContext'
import { applicationsData } from '@/data/applications'
import { catalogData } from '@/data/catalog'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useProfileAutoPopulation } from '@/hooks/useProfileAutoPopulation'
import { useEligibilityChecker } from '@/hooks/useEligibilityChecker'
import { normalizePaymentStatusValue, usePaymentStatus } from '@/hooks/usePaymentStatus'
import { checkEligibility, getRecommendedSubjects } from '@/lib/eligibilityEngine'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { applicationService } from '@/services/applications'
import { documentService } from '@/services/documents'
import type { Application, Intake } from '@/types/database'
import { logger } from '@/lib/logger'
import { type PaymentPhase } from '@/lib/paymentStatus'
import { useDraftStore } from '@/stores/draftStore'
import {
  clearStaleApplicationDraftReference,
  isApplicationMissingError,
} from '@/lib/applicationSession'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { BROWSER_EVENTS, BROWSER_KEYS, LEGACY_BROWSER_EVENTS, LEGACY_BROWSER_KEYS, listenWithLegacyEventFallback } from '@/lib/browserNamespace'
import { mergeWizardSubjects } from '../lib/educationCatalog'
import {
  type AssignmentFailureCode,
  type AssignmentRecoveryGuidance,
} from '../lib/assignmentRecovery'
import {
  resolveSelectionChangeIntent,
  resolveSelectionChangeRecovery,
  type SelectionChangeRecovery,
  type TargetSelection,
} from '../lib/selectionChange'
import { documentReadinessItems } from '../lib/requiredDocumentSurfaces'
import { buildWizardReadiness, type WizardReadiness } from '../lib/wizardReadiness'

import useApplicationSlip, { SubmittedApplicationSummary } from './useApplicationSlip'
import useApplicationFileUploads, { type ApplicationUploadState } from './useApplicationFileUploads'
import { useOcrGradeExtraction } from './useOcrGradeExtraction'
import { selectLatestDocumentByType, type UploadedApplicationDocument } from '../lib/documentSelection'
import { useWizardNavigation } from './wizard/useWizardNavigation'
import {
  createWizardSchema,
  type SubjectGrade,
  type WizardFormData,
  type WizardProgram,
  type WizardIntake,
} from '../types'
import { wizardSteps } from '../steps/config'
import type { CatalogueQueryError } from '../steps/ProgramStep'
import { isRateLimitedError, retryAfterOf } from '@/lib/rateLimitCopy'
import {
  normalizeServerUploadedFiles,
  buildWizardIntakeDisplayName,
  resolveWizardIntakeIdentity,
  type SaveDraftOptions
} from './wizard/wizardControllerUtils'
import { useWizardSessionRecovery } from './wizard/useWizardSessionRecovery'
import { useWizardProfileAutoPopulate } from './wizard/useWizardProfileAutoPopulate'
import { parseWizardDraftIntent, useWizardDraftLoader } from './wizard/useWizardDraftLoader'
import { useWizardGrades } from './wizard/useWizardGrades'
import { useWizardDraftPersistence, type DuplicateDraftConflict } from './wizard/useWizardDraftPersistence'
import { useWizardAssignment } from './wizard/useWizardAssignment'
import { useWizardCatalogIdentity } from './wizard/useWizardCatalogIdentity'
import { useWizardStepAdvance } from './wizard/useWizardStepAdvance'
import { useWizardSubmission } from './wizard/useWizardSubmission'
import { useWizardDraftMachine } from './useWizardDraftMachine'
import type { WizardDraftController, WizardDraftSnapshot } from '@/lib/wizardDraftController'
import {
  useRequiredDocuments,
  type UseRequiredDocumentsResult,
} from '@/hooks/useRequiredDocuments'

// Re-export pure helpers so existing test imports keep working
export {
  getCachedAuthUser,
  shouldRedirectToSignIn,
  hasRecentWizardRedirectGuard,
  buildWizardIntakeDisplayName,
  resolveWizardIntakeIdentity,
} from './wizard/wizardControllerUtils'

/**
 * Exported by admissions-v2 task 11.2 so the extracted step views can be typed
 * against the state machine they read (MAINT-01). The shape is unchanged; only its
 * visibility is. `WizardStepRenderer` takes this whole object rather than
 * forty-odd individual props, which is what makes moving the step switch out of
 * `index.tsx` a relocation instead of a rewrite.
 */
export interface UseWizardControllerResult {
  authLoading: boolean
  restoringDraft: boolean
  user: ReturnType<typeof useAuth>['user']
  success: boolean
  loading: boolean
  uploading: boolean
  error: string
  setError: (message: string) => void
  form: UseFormReturn<WizardFormData, any, any>
  totalSteps: number
  currentStepIndex: number
  currentStepConfig: typeof wizardSteps[number]
  isLastStep: boolean
  selectedProgram: WizardFormData['program'] | undefined
  selectedProgramDetails: WizardProgram | undefined
  selectedGrades: SubjectGrade[]
  eligibilityCheck: ReturnType<typeof checkEligibility> | null
  recommendedSubjects: string[]
  programs: WizardProgram[]
  programsLoading: boolean
  programsError: CatalogueQueryError | null
  intakesError: CatalogueQueryError | null
  onRetryPrograms: () => void
  onRetryIntakes: () => void
  intakes: WizardIntake[]
  subjects: Array<{ id: string; name: string; code: string }>
  hasAutoPopulatedData: boolean
  completionPercentage: number
  missingFields: { key: string; label: string }[]
  confirmSubmission: boolean
  setConfirmSubmission: (value: boolean) => void
  resultSlipFile: File | null
  extraKycFile: File | null
  uploadProgress: Record<string, number>
  uploadStates: Record<string, ApplicationUploadState>
  uploadedFiles: Record<string, boolean>
  /**
   * The versioned required-document contract for this draft (task 7.2, R11.6).
   * The education step renders its upload controls from this — including custom
   * tenant document types — instead of a hardcoded two-field list (STU-13).
   */
  requiredDocuments: UseRequiredDocumentsResult
  wizardReadiness: WizardReadiness
  /**
   * The ONE owner of the open draft (task 6.3, R10.2): hydration, edits, the
   * local outbox, autosave, manual save, retry, conflict, payment gate and
   * submit. Views read `draftSnapshot`; they never write the draft themselves.
   */
  draftMachine: WizardDraftController
  draftSnapshot: WizardDraftSnapshot
  isDraftSaving: boolean
  draftSaved: boolean
  draftLoaded: boolean
  draftApplicationsLoading: boolean
  draftApplications: { applications?: unknown[] } | undefined
  duplicateDraftConflict: DuplicateDraftConflict | null
  clearDuplicateDraftConflict: () => void
  gradesHydrating: boolean
  submittedApplication: SubmittedApplicationSummary | null
  applicationId: string | null
  paymentStatus: 'pending' | 'successful' | 'failed' | 'deferred' | null
  /** Server-derived phase of the pending payment (task 8.2, STU-09). */
  paymentPhase: PaymentPhase | null
  ocrStatus: 'idle' | 'polling' | 'suggested' | 'applied' | 'dismissed' | 'failed'
  ocrCandidates: import('./useOcrGradeExtraction').OcrGradeCandidate[]
  ocrWithheld: import('./useOcrGradeExtraction').OcrWithheldCandidate[]
  ocrAppliedCount: number
  ocrFailureReason: import('./useOcrGradeExtraction').OcrFailureReason
  ocrRetryAfterSeconds: number | null
  ocrExtractionMeta: import('./useOcrGradeExtraction').OcrExtractionMeta | null
  /** The student's explicit confirmation of selected candidates (R11.4). */
  confirmOcrCandidates: (subjectIds: string[]) => void
  dismissOcrCandidates: () => void
  retryOcr: (documentId?: string | null) => void
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  handleDownloadSlip: () => Promise<void>
  handleEmailSlip: () => Promise<void>
  dismissSlipProgress: () => void
  handleLoadDraft: (draftData: unknown, draftId?: string) => Promise<void>
  handleNextStep: () => Promise<void>
  handlePrevStep: () => void
  handleSubmitApplication: (data: WizardFormData) => Promise<void>
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  saveDraft: (options?: SaveDraftOptions) => Promise<Application | null>
  watchValues: () => WizardFormData
  goToStep: (index: number) => void
  refetchPaymentStatus: () => Promise<void>
  setPaymentStatus: (status: 'pending' | 'successful' | 'failed' | 'deferred' | null) => void
  assignmentPreview: import('@/services/catalog').AssignmentPreview | null | undefined
  assignmentPreviewLoading: boolean
  assignmentPreviewError: string | null
  assignmentResolved: boolean
  refetchAssignmentPreview: () => void
  assignmentRecovery: AssignmentRecoveryGuidance | null
  assignmentContactMailto: string | null
  assignmentInterestRecorded: boolean
  joinAssignmentInterestList: () => void
}

export interface PaymentValidationContext {
  formData: WizardFormData
  setError: (value: string) => void
  showError: (title: string, message?: string) => void
}



function toCatalogueQueryError(error: unknown): CatalogueQueryError {
  return {
    message: error instanceof Error && error.message ? error.message : 'We could not load this list. Try again.',
    retryAfterSeconds: retryAfterOf(error),
    rateLimited: isRateLimitedError(error),
  }
}

const useWizardController = (): UseWizardControllerResult => {
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuth()
  const { profile } = useProfileQuery()
  const { addToast } = useToastStore()
  const showError = useCallback((message: string) => addToast('error', message), [addToast])
  const showWarning = useCallback((message: string) => addToast('info', message), [addToast])
  const showSuccess = useCallback((message: string) => addToast('success', message), [addToast])
  const showInfo = useCallback((title: string, message?: string) => addToast('info', message || title), [addToast])

  const navigation = useWizardNavigation()
  const { currentStepIndex, totalSteps, currentStepConfig, isLastStep, goToStep } = navigation
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  // The open draft's identity and version belong to the draft machine (task
  // 6.3, R10.1/R10.2). Everything below reads `applicationId` from it; nothing
  // else holds a copy that could disagree.
  const { machine: draftMachine, snapshot: draftSnapshot } = useWizardDraftMachine()
  const applicationId = draftSnapshot.applicationId
  const [ocrDocumentId, setOcrDocumentId] = useState<string | null>(null)
  const startOcrPollingRef = useRef<((documentId?: string | null) => void) | null>(null)
  // OCR is opt-in per institution (platform-simplification task 18.2, D4). The
  // required-documents contract says whether this application's school opted
  // in; until it says so, the wizard never calls extract and never polls.
  const ocrAvailableRef = useRef(false)
  const markOcrExtractRejectedRef = useRef<((error?: unknown) => void) | null>(null)
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplicationSummary | null>(null)
  const [selectedGrades, setSelectedGrades] = useState<SubjectGrade[]>([])
  const selectedGradesRef = useRef<SubjectGrade[]>([])
  selectedGradesRef.current = selectedGrades
  const [restoringDraft, setRestoringDraft] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [duplicateDraftConflict, setDuplicateDraftConflict] = useState<DuplicateDraftConflict | null>(null)
  const [confirmSubmission, setConfirmSubmission] = useState(false)
  const [gradesHydrating, setGradesHydrating] = useState(false)
  /*
    The catalog lists and the canonical-identity resolvers (task 12.1, MAINT-01).

    Extracted verbatim into `useWizardCatalogIdentity`: the `programs` / `intakes`
    state and `findProgramId` / `deriveInstitutionLabel` / `resolveProgramIdentity` /
    `resolveIntakeIdentity` / `programIds` / `intakeIds`. `findProgramId`'s fallback
    ladder is the code that decides which *canonical* program a restored display
    name means — the canonical truth map makes ids the sole authority and the
    `applications.program` string a display snapshot — so it now has a module with a
    name instead of 90 lines in the middle of a 1,110-line hook.

    The two population effects and the two reconciliation effects stay below. The
    reason is ordering, and it is written into the extracted module's header rather
    than left to be rediscovered: `programIds` feeds the schema, the schema feeds
    the form, and the catalog query reads `watch('intake')` off that form.
  */
  const {
    programs,
    setPrograms,
    intakes,
    setIntakes,
    findProgramId,
    deriveInstitutionLabel,
    resolveProgramIdentity,
    resolveIntakeIdentity,
    programIds,
    intakeIds,
  } = useWizardCatalogIdentity()
  const isSubmittingRef = useRef(false)
  // Submit-time re-assignment failure code (R2.7). Set when the submit path
  // returns OFFERING_NO_LONGER_AVAILABLE / OFFERING_CAPACITY_FULL so the
  // assigned-school checkpoint can render the recoverable guidance.
  const [submitAssignmentFailureCode, setSubmitAssignmentFailureCode] =
    useState<AssignmentFailureCode | null>(null)
  const [assignmentInterestTick, setAssignmentInterestTick] = useState(0)
  const wizardDraftIntent = useMemo(
    () => parseWizardDraftIntent(location.search),
    [location.search]
  )

  const schema = useMemo(() => createWizardSchema(programIds, intakeIds), [programIds, intakeIds])
  const resolver = useMemo(() => zodResolver(schema), [schema])

  const form = useForm<WizardFormData>({
    resolver: resolver as unknown as Resolver<WizardFormData>,
    defaultValues: async () => {
      return {
        country: DEFAULT_RESIDENCE_COUNTRY,
      } as WizardFormData
    }
  })
  const { watch, setValue, getValues } = form

  const {
    data: programsData,
    isLoading: programsLoading,
    error: programsQueryError,
    isError: programsFailed,
    refetch: refetchPrograms,
  } = catalogData.useProgramsForIntake(watch('intake') || null)
  const {
    data: intakesData,
    error: intakesQueryError,
    isError: intakesFailed,
    refetch: refetchIntakes,
  } = catalogData.useIntakes()
  // A failed catalogue query is an error, not an empty catalogue (SJR R3-d).
  const programsError = useMemo(
    () => (programsFailed ? toCatalogueQueryError(programsQueryError) : null),
    [programsFailed, programsQueryError],
  )
  const intakesError = useMemo(
    () => (intakesFailed ? toCatalogueQueryError(intakesQueryError) : null),
    [intakesFailed, intakesQueryError],
  )
  const onRetryPrograms = useCallback(() => { void refetchPrograms() }, [refetchPrograms])
  const onRetryIntakes = useCallback(() => { void refetchIntakes() }, [refetchIntakes])
  const { data: subjectsData } = catalogData.useSubjects()
  const subjects = useMemo(
    () => mergeWizardSubjects((subjectsData?.subjects as Array<{ id: string; name: string; code: string }> | undefined) || []),
    [subjectsData]
  )
  const submitApplicationMutation = applicationsData.useSubmit()
  const { data: draftApplications, isPending: draftApplicationsLoading } = applicationsData.useList({
    status: 'draft',
    mine: true,
    page: 1,
    pageSize: 100,
    sortBy: 'date',
    sortOrder: 'desc',
  })
  const paymentStepActive = currentStepConfig.key === 'payment' || currentStepConfig.key === 'submit'
  const {
    status: paymentStatus,
    // Task 8.2 / STU-09: who the pending payment is waiting on, decided server-side.
    phase: paymentPhase,
    refetch: refetchPaymentStatus,
    setStatus: setPaymentStatus,
  } = usePaymentStatus(paymentStepActive ? (applicationId || '') : '', submittedApplication?.paymentStatus ?? null)

  const restorePaymentStatus = useCallback((status?: string | null) => {
    const normalized = normalizePaymentStatusValue(status)
    if (normalized) {
      setPaymentStatus(normalized)
    }
  }, [setPaymentStatus])

  useEffect(() => {
    if (intakesData?.intakes) {
      const formattedIntakes = (intakesData.intakes as unknown as Array<Intake & { year?: number }>).map(intake => {
        return {
          ...intake,
          displayName: buildWizardIntakeDisplayName(intake)
        }
      })

      setIntakes(formattedIntakes)
      return
    }

    setIntakes([])
  }, [intakesData])

  const selectedIntake = watch('intake')

  // Reconcile draft-restored intake (display name) → canonical UUID. Re-runs
  // whenever either the catalog list arrives OR the form value changes,
  // closing the Order-A race where catalog cache resolved before draft restore.
  useEffect(() => {
    if (intakes.length === 0 || !selectedIntake) return
    const resolved = resolveWizardIntakeIdentity(intakes, selectedIntake)
    if (resolved && resolved.id !== selectedIntake) {
      setValue('intake', resolved.id, { shouldValidate: true })
    }
  }, [intakes, selectedIntake, setValue])

  const selectedProgram = watch('program')
  const selectedProgramDetails = useMemo(
    () => programs.find(program => program.id === selectedProgram),
    [programs, selectedProgram]
  )

  useEffect(() => {
    if (programsData?.programs) {
      setPrograms(programsData.programs as WizardProgram[])
      return
    }

    setPrograms([])
  }, [programsData])

  // Reconcile draft-restored program (display name) → canonical UUID. Re-runs
  // whenever the catalog list arrives OR the form value changes, closing the
  // Order-A race where catalog cache resolved before draft restore.
  useEffect(() => {
    if (programs.length === 0 || !selectedProgram) return
    const resolvedId = findProgramId(selectedProgram, undefined, programs)
    if (resolvedId && resolvedId !== selectedProgram) {
      setValue('program', resolvedId, { shouldValidate: true })
    }
  }, [programs, selectedProgram, findProgramId, setValue])

  const {
    wizardCatalogContext,
    assignmentPreview,
    assignmentPreviewFetching,
    assignmentResolved,
    assignmentPreviewError,
    assignmentRecovery,
    assignmentContactMailto,
    assignmentInterestRecorded,
    joinAssignmentInterestList,
    refetchAssignmentPreview,
  } = useWizardAssignment({
    user,
    profile,
    selectedProgram,
    selectedIntake,
    programIds,
    intakeIds,
    selectedProgramDetails,
    intakes,
    submitAssignmentFailureCode,
    setSubmitAssignmentFailureCode,
    assignmentInterestTick,
    setAssignmentInterestTick,
    showSuccess,
  })

  const {
    resultSlipFile,
    extraKycFile,
    uploading,
    uploadProgress,
    uploadStates,
    uploadedFiles,
    markUploadedFile,
  } = useApplicationFileUploads()

  const clearStaleApplicationReference = useCallback((staleApplicationId: string, message?: string) => {
    clearStaleApplicationDraftReference(staleApplicationId)
    // The server no longer has this draft: the machine detaches from it and
    // never resurrects it by autosave; the answers stay in the form.
    draftMachine.detach(staleApplicationId)
    // Task 10.6 (R13.13): the canonical workspace's cache key. The retired
    // `['application-detail', …]` key belonged to the second student workspace
    // and evicting it now would evict nothing, leaving a stale application on
    // screen after the draft it referred to went away.
    queryClient.removeQueries({ queryKey: ['application-workspace', staleApplicationId] })
    queryClient.removeQueries({ queryKey: ['applications', 'detail', staleApplicationId] })
    queryClient.invalidateQueries({ queryKey: ['applications'] })
    useDraftStore.getState().markStale(staleApplicationId)
    window.dispatchEvent(new CustomEvent('applicationDraftStale', { detail: { applicationId: staleApplicationId } }))
    if (message) {
      showWarning(message)
    }
  }, [draftMachine, queryClient, showWarning])

  /**
   * Move a draft's assignment through the one reroute command (task 6.4).
   *
   * Returns `ok: true` when the selection already matched (no command sent) or
   * the reroute succeeded; otherwise returns recoverable guidance for the stable
   * rejection code (payment lock, duplicate, version conflict, unavailable
   * configuration). Never throws — the caller decides whether to block.
   */
  const applyDraftSelectionChange = useCallback(async ({
    applicationId: draftId,
    persisted,
    target,
  }: {
    applicationId: string
    persisted: Record<string, unknown> | null | undefined
    target: TargetSelection
  }): Promise<{ ok: true; changed: boolean } | { ok: false; recovery: SelectionChangeRecovery }> => {
    const record = (persisted ?? {}) as Record<string, unknown>
    const intent = resolveSelectionChangeIntent({
      persisted: {
        programId: typeof record.program_id === 'string' ? record.program_id : null,
        intakeId: typeof record.intake_id === 'string' ? record.intake_id : null,
        programName: typeof record.program === 'string' ? record.program : null,
        intakeName: typeof record.intake === 'string' ? record.intake : null,
        assignmentVersion:
          typeof record.assignment_version === 'number' ? record.assignment_version : null,
      },
      target,
    })
    if (intent.kind === 'noop') return { ok: true, changed: false }

    try {
      const changedApplication = await applicationService.changeSelection(draftId, {
        programId: intent.programId,
        intakeId: intent.intakeId,
        ...(intent.assignmentVersion !== undefined
          ? { assignmentVersion: intent.assignmentVersion }
          : {}),
      })
      // The reroute is a canonical command of its own and advances the shared
      // optimistic version; the machine adopts it so the next answer write
      // carries the right `expected_version`.
      draftMachine.acknowledgeServerRecord(
        changedApplication as unknown as Record<string, unknown> | null,
      )
      // The requirement/eligibility/fee snapshots changed server-side, so any
      // cached view of this application is stale.
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      queryClient.invalidateQueries({ queryKey: ['application-workspace', draftId] })
      return { ok: true, changed: true }
    } catch (selectionError) {
      logApiError(
        'application-wizard',
        `POST /applications/drafts/${draftId}/change-selection/`,
        selectionError,
      )
      return {
        ok: false,
        recovery: resolveSelectionChangeRecovery(selectionError, {
          programName: target.programName,
          intakeName: target.intakeName,
        }),
      }
    }
  }, [draftMachine, queryClient])

  const {
    normalizeSelectedGrades,
    hydrateServerGrades,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    handleOcrGrades,
  } = useWizardGrades({
    subjects,
    selectedGradesRef,
    setSelectedGrades,
    showSuccess,
    clearStaleApplicationReference,
  })

  const hydrateServerDocuments = useCallback(async (draftApplicationId: string): Promise<Record<string, boolean>> => {
    try {
      const response = await applicationService.getDocuments(draftApplicationId)
      const docList = Array.isArray(response) ? response : []
      const normalized = normalizeServerUploadedFiles(docList)
      markUploadedFile('result_slip', Boolean(normalized.result_slip))
      markUploadedFile('extra_kyc', Boolean(normalized.extra_kyc))

      // If a result slip exists, store its ID so OCR can check for existing analysis
      if (normalized.result_slip) {
        const resultSlipDoc = selectLatestDocumentByType(
          docList.filter((d): d is UploadedApplicationDocument => d != null && typeof d === 'object' && 'id' in d && 'document_type' in d) as UploadedApplicationDocument[],
          'result_slip'
        )
        if (resultSlipDoc?.id) {
          setOcrDocumentId(resultSlipDoc.id)
        }
      }

      return normalized
    } catch (documentError) {
      logApiError('application-wizard', `/applications/${draftApplicationId}/documents/`, documentError)
      if (isApplicationMissingError(documentError)) {
        clearStaleApplicationReference(draftApplicationId)
      }
      return { result_slip: false, extra_kyc: false }
    }
  }, [clearStaleApplicationReference, markUploadedFile])

  const {
    persistLocalDraftSnapshot,
    handleLoadDraft,
    saveDraft,
    restoreServerDraft,
    outboxRecoveryFor,
  } = useWizardDraftPersistence({
    machine: draftMachine,
    user,
    profile,
    uploadedFiles,
    currentStepConfig,
    paymentStatus,
    selectedGradesRef,
    setSelectedGrades,
    selectedProgramDetails,
    programsData,
    totalSteps,
    form: { getValues, setValue, getFieldState: form.getFieldState },
    setRestoringDraft,
    setDraftLoaded,
    setDuplicateDraftConflict,
    setGradesHydrating,
    setError,
    setSubmittedApplication,
    markUploadedFile,
    restorePaymentStatus,
    showSuccess,
    showWarning,
    findProgramId,
    deriveInstitutionLabel,
    resolveProgramIdentity,
    resolveIntakeIdentity,
    goToStep,
    clearStaleApplicationReference,
    hydrateServerGrades,
    hydrateServerDocuments,
  })

  /**
   * The versioned required-document contract (admissions-v2 task 7.2, R11.6).
   *
   * The education step renders one upload control per server requirement, so a
   * tenant-configured document type — including a custom one — is uploadable
   * instead of being an invisible submission blocker (STU-13). The upload
   * command persists ``result_slip_url`` / ``extra_kyc_url`` itself, so this path
   * needs no extra application PATCH; the local draft snapshot is still refreshed
   * so an interrupted session keeps the student's other work.
   */
  const requiredDocuments = useRequiredDocuments({
    applicationId,
    onUploaded: useCallback(
      (documentType: string, documentId: string) => {
        persistLocalDraftSnapshot()
        if (documentType !== 'result_slip') {
          return
        }
        if (!ocrAvailableRef.current) {
          // The school has not opted in: manual grade entry only (R11.3).
          return
        }
        // Optional deterministic grade assistance — never authoritative, and a
        // failure here never blocks the upload (R11.4, task 7.5).
        setOcrDocumentId(documentId)
        // Follow progress only once the server has accepted the job: a rejected
        // extract means no job exists, so there is nothing to poll (clause 2.15).
        documentService
          .extract({ documentId })
          .then(() => {
            startOcrPollingRef.current?.(documentId)
          })
          .catch((extractError: unknown) => {
            logger.warn('OCR extraction request failed', toError(extractError))
            markOcrExtractRejectedRef.current?.(extractError)
          })
      },
      [persistLocalDraftSnapshot, setOcrDocumentId, startOcrPollingRef],
    ),
  })

  /**
   * Bridge the contract into the legacy ``uploadedFiles`` map.
   *
   * Progress, draft resume, and the advisory client readiness still read the two
   * legacy keys. The contract is the source of truth; this keeps those surfaces
   * consistent with it rather than with a local optimistic flag. Tasks 10.6/11.2
   * replace the advisory readiness with the server readiness query, at which
   * point this bridge goes away.
   */
  const ocrAvailable = requiredDocuments.contract?.ocrAvailable === true
  ocrAvailableRef.current = ocrAvailable
  useEffect(() => {
    const contract = requiredDocuments.contract
    if (!contract) return
    const satisfies = (types: string[]) =>
      contract.requirements.some(
        (requirement) =>
          requirement.state !== 'missing' &&
          (types.includes(requirement.documentType) ||
            requirement.acceptsDocumentTypes.some((accepted) => types.includes(accepted))),
      )
    markUploadedFile('result_slip', satisfies(['result_slip']))
    markUploadedFile('extra_kyc', satisfies(['extra_kyc', 'nrc', 'passport']))
  }, [markUploadedFile, requiredDocuments.contract])

  const preserveDraftBeforeAuthRedirect = useCallback(() => {
    persistLocalDraftSnapshot()
    try {
      sessionStorage.setItem(BROWSER_KEYS.postAuthRedirect, `${location.pathname}${location.search}${location.hash}`)
      sessionStorage.removeItem(LEGACY_BROWSER_KEYS.postAuthRedirect)
    } catch {
      // best effort local persistence before auth redirect
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    persistLocalDraftSnapshot,
  ])

  useWizardSessionRecovery({
    authLoading,
    user,
    currentStepKey: currentStepConfig.key,
    setError,
    preserveDraftBeforeAuthRedirect,
  })

  const { persistingSlip, slipLoading, emailLoading, handleDownloadSlip, handleEmailSlip, dismissSlipProgress } = useApplicationSlip({
    submittedApplication,
    applicationId,
    success,
    toast: { showError, showWarning, showSuccess, showInfo },
  })

  // The `beforeunload` guard belongs to the draft machine binding
  // (`useWizardDraftMachine`): it asks only when the machine says work is not on
  // the server, instead of whenever the student was past step 1.

  // Every form change is an edit event for the machine. It decides — by
  // comparing the canonical answer projection with what the server last
  // acknowledged — whether anything is due; a change the PATCH would not carry
  // (the programme, a re-resolved intake id) can never cause a write.
  useEffect(() => {
    const subscription = form.watch(() => draftMachine.observe())
    return () => subscription.unsubscribe()
  }, [form, draftMachine])

  // Grades are the draft's second channel (SJR R6-b): the grid lives in React
  // state rather than the form, so a change to it is an edit event too. The
  // machine compares it with the rows the server acknowledged.
  useEffect(() => {
    draftMachine.observe()
  }, [draftMachine, selectedGrades])
  // PAY: once the draft has payment activity it is payment-linked.
  useEffect(() => {
    if (paymentStatus) draftMachine.notePaymentActivity()
  }, [draftMachine, paymentStatus])

  // An in-app change of draft intent (R10.1) — "Switch application", "Start a
  // new application", "Continue existing" — keeps this component mounted, so it
  // must re-hydrate: the machine lets go of the draft it held and the loader runs
  // again for the new intent. Without this the machine would stay attached to the
  // previous application, and answers typed into the "new" one would be written
  // to it. Keyed on mode + draft id only: the wizard's own `?step=` history
  // entries are not an intent change.
  const draftIntentKey = `${wizardDraftIntent.mode}:${wizardDraftIntent.draftId ?? ''}`
  const hydratedIntentKeyRef = useRef<string | null>(null)
  // "Resume the draft this machine already holds" is not an intent change: it is
  // the address the wizard itself gave a just-started application (below), which
  // Back/Forward can land on. Re-hydrating there would move the student off the
  // step they navigated to.
  const intentNamesOpenDraft =
    wizardDraftIntent.mode === 'resume' && applicationId !== null && wizardDraftIntent.draftId === applicationId
  useEffect(() => {
    if (!draftLoaded) return
    if (hydratedIntentKeyRef.current === null) {
      hydratedIntentKeyRef.current = draftIntentKey
      return
    }
    if (hydratedIntentKeyRef.current === draftIntentKey) return
    if (intentNamesOpenDraft) return
    hydratedIntentKeyRef.current = null
    draftMachine.reset()
    // The grid belongs to the draft being left. The grades channel compares it
    // with the next draft's baseline, so a leftover grid would be sent to it.
    selectedGradesRef.current = []
    setSelectedGrades([])
    setDuplicateDraftConflict(null)
    setDraftLoaded(false)
  }, [draftIntentKey, draftLoaded, draftMachine, intentNamesOpenDraft])

  // Refresh after a NEW application has been saved (R10.1, R10.8). The machine
  // attaches a `mode=new` draft to the id the start command returned, but the
  // address bar kept saying `mode=new`, so a refresh — or a tab the browser
  // restored — reopened a blank new application instead of the student's saved
  // one (the browser run measured `?mode=new&step=education` reloading to
  // `?mode=new&step=program` with every answer gone from the screen).
  //
  // Once attached, the address bar is rewritten IN PLACE to resume that draft,
  // the same way the wizard already writes its own `?step=` (`index.tsx`):
  // `history.replaceState`, not a router navigation. The mounted wizard's intent
  // does not change, so nothing re-hydrates. Back/Forward stay on the same
  // application either way: an older `mode=new` entry keeps the hydrated intent
  // (and this effect rewrites it on arrival), and a rewritten entry names the
  // open draft, which the effect above ignores. Only what a reload opens changes.
  useEffect(() => {
    if (!draftLoaded || wizardDraftIntent.mode !== 'new' || !applicationId) return
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('mode') === 'resume' && url.searchParams.get('draftId') === applicationId) return
    url.searchParams.delete('new')
    url.searchParams.delete('fresh')
    url.searchParams.set('mode', 'resume')
    url.searchParams.set('draftId', applicationId)
    window.history.replaceState(window.history.state, '', url.toString())
  }, [applicationId, draftLoaded, location.search, wizardDraftIntent.mode])

  useEffect(() => {
    const handleAuthRedirect = () => {
      preserveDraftBeforeAuthRedirect()
    }

    return listenWithLegacyEventFallback(
      window,
      BROWSER_EVENTS.beforeAuthRedirect,
      [LEGACY_BROWSER_EVENTS.beforeAuthRedirect],
      handleAuthRedirect,
    )
  }, [preserveDraftBeforeAuthRedirect])

  const { completionPercentage, missingFields, hasAutoPopulatedData } = useProfileAutoPopulation()
  // The one client readiness computation (SJR R6-a): the Submit button reads it
  // below and the Submit handler calls it, so they cannot disagree about which
  // inputs count. The server re-runs readiness under row locks at submit.
  const computeReadiness = useCallback(
    (values: WizardFormData): WizardReadiness =>
      buildWizardReadiness({
        values,
        selectedGrades: selectedGradesRef.current,
        uploadedFiles,
        hasResultSlipFile: Boolean(resultSlipFile),
        hasIdentityFile: Boolean(extraKycFile),
        // Task 7.2 (R11.6): the readiness rail describes the *tenant's* required
        // documents. `undefined` (no readable contract) keeps the legacy pair, so
        // the rail is never weaker than before.
        requiredDocumentItems: requiredDocuments.contract
          ? documentReadinessItems(requiredDocuments.contract, {
              hasResultSlip: Boolean(resultSlipFile || uploadedFiles.result_slip),
              hasIdentityDocument: Boolean(extraKycFile || uploadedFiles.extra_kyc),
            })
          : undefined,
        paymentStatus,
        confirmSubmission,
        assignmentResolved,
      }),
    [
      uploadedFiles,
      resultSlipFile,
      extraKycFile,
      requiredDocuments.contract,
      paymentStatus,
      confirmSubmission,
      assignmentResolved,
    ],
  )
  const wizardReadiness = computeReadiness(watch() as WizardFormData)
  useEffect(() => {
    const currentIntake = watch('intake')
    if (!currentIntake) return

    if (intakeIds.length > 0 && !intakeIds.includes(currentIntake)) {
      const fallbackIntake = intakes.find(intake =>
        intake.displayName === currentIntake || intake.name === currentIntake
      )
      if (fallbackIntake) {
        setValue('intake', fallbackIntake.id)
      }
    }
  }, [intakes, intakeIds, setValue, watch])

  const clearDuplicateDraftConflict = useCallback(() => {
    setDuplicateDraftConflict(null)
    setError('')
  }, [])

  useWizardProfileAutoPopulate({
    user,
    profile,
    authLoading,
    restoringDraft,
    draftLoaded,
    allowAfterDraftLoaded: wizardDraftIntent.mode === 'new',
    getValues,
    setValue,
  })

  useWizardDraftLoader({
    machine: draftMachine,
    user,
    authLoading,
    draftLoaded,
    draftApplicationsLoading,
    draftApplications,
    locationSearch: location.search,
    totalSteps,
    programsData,
    setValue,
    setRestoringDraft,
    setDraftLoaded,
    setError,
    setSelectedGrades,
    setGradesHydrating,
    goToStep,
    markUploadedFile,
    restorePaymentStatus,
    showSuccess,
    findProgramId,
    hydrateServerGrades,
    hydrateServerDocuments,
    restoreServerDraft,
    outboxRecoveryFor,
  })

  // Autosave is the draft machine's own debounce and 8-second sweep; nothing
  // here schedules a second one.

  // Use the fixed eligibility checker
  const { assessment: eligibilityAssessment } = useEligibilityChecker({
    applicationId: applicationId || '',
    programId: selectedProgram || '',
    programName: selectedProgramDetails?.name,
    grades: selectedGrades.map(grade => {
      const subject = subjects.find(s => s.id === grade.subject_id)
      return { 
        subject_id: grade.subject_id, 
        subject_name: subject?.name || grade.subject_id || '', 
        grade: grade.grade 
      }
    }).filter(g => g.subject_name),
    enabled: Boolean(selectedProgramDetails?.name && selectedGrades.length > 0)
  })

  const eligibilityCheck = eligibilityAssessment

  const recommendedSubjects = useMemo(
    () => (selectedProgramDetails?.name ? getRecommendedSubjects(selectedProgramDetails.name) : []),
    [selectedProgramDetails]
  )

  // admissions-v2 task 7.5 (R11.4): the hook *holds* deterministic candidates; it
  // does not apply them. `handleOcrGrades` now runs only from
  // `confirmOcrCandidates` — i.e. only after the student ticks rows and presses
  // confirm in the education step. Nothing reaches the grades grid otherwise.
  const {
    status: ocrStatus,
    candidates: ocrCandidates,
    withheld: ocrWithheld,
    appliedCount: ocrAppliedCount,
    failureReason: ocrFailureReason,
    retryAfterSeconds: ocrRetryAfterSeconds,
    markExtractRejected: markOcrExtractRejected,
    extractionMeta: ocrExtractionMeta,
    startPolling: startOcrPolling,
    confirmCandidates,
    dismissCandidates: dismissOcrCandidates,
  } = useOcrGradeExtraction(ocrDocumentId)
  startOcrPollingRef.current = startOcrPolling
  markOcrExtractRejectedRef.current = markOcrExtractRejected

  const confirmOcrCandidates = useCallback((subjectIds: string[]) => {
    const confirmed = confirmCandidates(subjectIds)
    if (confirmed.length > 0) {
      handleOcrGrades(confirmed)
    }
  }, [confirmCandidates, handleOcrGrades])

  // Auto-start OCR polling on draft restore when result slip exists but no grades loaded
  useEffect(() => {
    if (ocrAvailable && ocrDocumentId && ocrStatus === 'idle' && selectedGrades.length === 0 && subjects.length > 0) {
      startOcrPolling(ocrDocumentId)
    }
  }, [ocrAvailable, ocrDocumentId, ocrStatus, selectedGrades.length, subjects.length, startOcrPolling])

  const retryOcr = useCallback((documentId?: string | null) => {
    const docId = documentId || ocrDocumentId
    if (!docId || !ocrAvailableRef.current) return
    documentService
      .extract({ documentId: docId, force: true })
      .catch((err) => logger.warn('OCR retry request failed', toError(err)))
    startOcrPolling(docId)
  }, [ocrDocumentId, startOcrPolling])

  const { handleNextStep } = useWizardStepAdvance({
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
  })

  const handlePrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      void saveDraft({ syncServer: false })
      goToStep(currentStepIndex - 1)
    }
  }, [currentStepIndex, goToStep, saveDraft])

  const { handleSubmitApplication } = useWizardSubmission({
    draftMachine,
    applicationId,
    user,
    computeReadiness,
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
  })

  return {
    authLoading,
    restoringDraft,
    user,
    success,
    loading,
    uploading,
    error,
    setError,
    form,
    totalSteps,
    currentStepIndex,
    currentStepConfig,
    isLastStep,
    selectedProgram,
    selectedProgramDetails,
    selectedGrades,
    eligibilityCheck,
    recommendedSubjects,
    programs,
    programsLoading,
    programsError,
    intakesError,
    onRetryPrograms,
    onRetryIntakes,
    intakes,
    subjects,
    hasAutoPopulatedData,
    completionPercentage,
    missingFields,
    confirmSubmission,
    setConfirmSubmission,
    resultSlipFile,
    extraKycFile,
    uploadProgress,
    uploadStates,
    uploadedFiles,
    requiredDocuments,
    wizardReadiness,
    draftMachine,
    draftSnapshot,
    isDraftSaving: draftSnapshot.state === 'saving',
    draftSaved: draftSnapshot.state === 'ready.clean' && draftSnapshot.lastSavedAt !== null,
    draftLoaded,
    draftApplicationsLoading,
    draftApplications,
    duplicateDraftConflict,
    clearDuplicateDraftConflict,
    gradesHydrating,
    submittedApplication,
    applicationId,
    paymentStatus,
    paymentPhase,
    ocrStatus,
    ocrCandidates,
    ocrWithheld,
    ocrAppliedCount,
    ocrFailureReason,
    ocrRetryAfterSeconds,
    ocrExtractionMeta,
    confirmOcrCandidates,
    dismissOcrCandidates,
    retryOcr,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress,
    handleLoadDraft,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    saveDraft,
    watchValues: watch,
    goToStep,
    refetchPaymentStatus,
    setPaymentStatus,
    assignmentPreview,
    assignmentPreviewLoading: assignmentPreviewFetching,
    assignmentPreviewError,
    assignmentResolved,
    refetchAssignmentPreview: () => { void refetchAssignmentPreview() },
    assignmentRecovery,
    assignmentContactMailto,
    assignmentInterestRecorded,
    joinAssignmentInterestList,
  }
}

export default useWizardController
