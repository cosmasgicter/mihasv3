import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm, type UseFormReturn, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useToastStore } from '@/hooks/useToast'
import { useAuth } from '@/contexts/AuthContext'
import { applicationsData } from '@/data/applications'
import { catalogData } from '@/data/catalog'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useProfileAutoPopulation, getBestValue, getUserMetadata, normalizeSexForWizard } from '@/hooks/useProfileAutoPopulation'
import { useEligibilityChecker } from '@/hooks/useEligibilityChecker'
import { normalizePaymentStatusValue, usePaymentStatus } from '@/hooks/usePaymentStatus'
// eslint-disable-next-line no-restricted-imports -- eligibilityEngine is still used until API-backed replacement is ready
import { checkEligibility, getRecommendedSubjects } from '@/lib/eligibilityEngine'
import { createApplicationSlip } from '@/lib/slipService'
import type { ApplicationSlipData } from '@/lib/applicationSlip'
import { sanitizeForLog } from '@/lib/security'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { findBestSubjectId } from '@/lib/subjectMatcher'
import { apiClient, AuthenticationError } from '@/services/client'
import { authService } from '@/services/auth'
import { applicationService } from '@/services/applications'
import type { Application, Intake } from '@/types/database'
import { logger } from '@/lib/logger'
import { safeJsonParse } from '@/lib/utils'
import { clearAllDraftData, isDraftDeleted, clearDraftDeletedFlag } from '@/lib/draftManager'
import {
  applicationSessionManager,
  clearStaleApplicationDraftReference,
  isApplicationMissingError,
} from '@/lib/applicationSession'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import {
  getCanonicalResidenceCountry,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
} from '@/lib/profileFieldMapping'
import { mergeWizardSubjects, resolveWizardSubjectId } from '../lib/educationCatalog'
import {
  deriveDraftResumeUploads,
  normalizeDraftResumeGrades,
  resolveDraftResumeStepId,
} from '../lib/draftResume'
import {
  buildServerDraftPayload,
  canCreateServerDraft,
} from '../lib/draftAutosave'
import { buildWizardReadiness, type WizardReadiness } from '../lib/wizardReadiness'

import useApplicationSlip, { SubmittedApplicationSummary } from './useApplicationSlip'
import useApplicationFileUploads, { type ApplicationUploadState } from './useApplicationFileUploads'
import { useOcrGradeExtraction } from './useOcrGradeExtraction'
import { selectLatestDocumentByType, type UploadedApplicationDocument } from '../lib/documentSelection'
import {
  createWizardSchema,
  normalizePhoneNumberInput,
  type SubjectGrade,
  type WizardFormData,
  type WizardProgram,
  type WizardIntake
} from '../types'
import { getStepIndexById, wizardSteps } from '../steps/config'

interface UseWizardControllerResult {
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
  wizardReadiness: WizardReadiness
  isDraftSaving: boolean
  draftSaved: boolean
  draftLoaded: boolean
  gradesHydrating: boolean
  submittedApplication: SubmittedApplicationSummary | null
  applicationId: string | null
  paymentStatus: 'pending' | 'successful' | 'failed' | 'deferred' | null
  ocrStatus: 'idle' | 'polling' | 'done' | 'failed'
  ocrExtractedCount: number
  ocrFailureReason: import('./useOcrGradeExtraction').OcrFailureReason
  retryOcr: (documentId?: string | null) => void
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  handleDownloadSlip: () => Promise<void>
  handleEmailSlip: () => Promise<void>
  dismissSlipProgress: () => void
  handleResultSlipUpload: (file: File | null) => void
  handleExtraKycUpload: (file: File | null) => void
  handleLoadDraft: (draftData: unknown, draftId?: string) => Promise<void>
  handleNextStep: () => Promise<void>
  handlePrevStep: () => void
  handleSubmitApplication: (data: WizardFormData) => Promise<void>
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  saveDraft: (options?: SaveDraftOptions) => Promise<void>
  watchValues: () => WizardFormData
  goToStep: (index: number) => void
  refetchPaymentStatus: () => Promise<void>
  setPaymentStatus: (status: 'pending' | 'successful' | 'failed' | 'deferred' | null) => void
}

export interface PaymentValidationContext {
  formData: WizardFormData
  setError: (value: string) => void
  showError: (title: string, message?: string) => void
}

const WIZARD_AUTH_REDIRECT_GUARD_KEY = 'mihas:wizard-auth-redirect-guard'
const WIZARD_SESSION_GRACE_MS = 5000
const IDENTITY_DOCUMENT_TYPES = new Set(['extra_kyc', 'nrc', 'passport'])

function normalizeServerUploadedFiles(documents: unknown[]): Record<string, boolean> {
  return documents.reduce<Record<string, boolean>>(
    (acc, document) => {
      if (!document || typeof document !== 'object') {
        return acc
      }

      const record = document as { document_type?: unknown; verification_status?: unknown }
      const documentType = typeof record.document_type === 'string' ? record.document_type : ''
      const verificationStatus = typeof record.verification_status === 'string' ? record.verification_status : ''
      if (verificationStatus === 'deleted') {
        return acc
      }

      if (documentType === 'result_slip') {
        acc.result_slip = true
      }
      if (IDENTITY_DOCUMENT_TYPES.has(documentType)) {
        acc.extra_kyc = true
      }

      return acc
    },
    { result_slip: false, extra_kyc: false }
  )
}
const SESSION_EXPIRED_BANNER = 'Your session expired. We saved your progress. Please sign in again to continue.'

type SessionCacheShape = { user?: { id?: string } | null } | null | undefined

export const getCachedAuthUser = (sessionCache: SessionCacheShape) => sessionCache?.user ?? null

export const shouldRedirectToSignIn = ({
  sessionRecheckFailed,
  tokenRefreshFailed,
  cachedUser,
}: {
  sessionRecheckFailed: boolean
  tokenRefreshFailed: boolean
  cachedUser: { id?: string } | null
}) => sessionRecheckFailed && tokenRefreshFailed && !cachedUser

export const hasRecentWizardRedirectGuard = (rawGuardValue: string | null, now: number): boolean => {
  if (!rawGuardValue) return false
  const guard = safeJsonParse<{ createdAt?: number } | null>(rawGuardValue, null)
  if (!guard?.createdAt || typeof guard.createdAt !== 'number') return false
  return now - guard.createdAt < 15_000
}

type ResolvedIntakeIdentity = {
  id: string
  name: string
  label: string
}

type SaveDraftOptions = {
  syncServer?: boolean
}

export const buildWizardIntakeDisplayName = (intake: Intake & { year?: number }) => {
  const normalizedName = intake.name?.trim() || ''
  const yearString = Number.isFinite(intake.year) ? String(intake.year) : ''
  const includesYear = yearString && normalizedName.includes(yearString)
  const nameWithYear = includesYear ? normalizedName : `${normalizedName} ${yearString}`.trim()
  return (nameWithYear || normalizedName || yearString || 'Upcoming Intake').trim()
}

export const resolveWizardIntakeIdentity = (
  availableIntakes: WizardIntake[],
  value?: string | null
): ResolvedIntakeIdentity | null => {
  const trimmed = value?.trim() || ''
  if (!trimmed) return null

  const toResolvedIdentity = (intake: WizardIntake): ResolvedIntakeIdentity => {
    const canonicalName = intake.name?.trim() || intake.displayName?.trim() || ''
    const displayLabel = intake.displayName?.trim() || canonicalName
    return {
      id: intake.id,
      name: canonicalName,
      label: displayLabel,
    }
  }

  const byId = availableIntakes.find(intake => intake.id === trimmed)
  if (byId) return toResolvedIdentity(byId)

  const byDisplayName = availableIntakes.find(intake => intake.displayName?.trim() === trimmed)
  if (byDisplayName) return toResolvedIdentity(byDisplayName)

  const byName = availableIntakes.find(intake => intake.name?.trim() === trimmed)
  if (byName) return toResolvedIdentity(byName)

  return null
}

function sanitizeInput(value: string | undefined | null): string {
  if (typeof value === 'string') {
    return value.trim().replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  }
  return ''
}

function sanitizePhoneInput(value: string | undefined | null): string {
  return sanitizeInput(normalizePhoneNumberInput(value || ''))
}

function isAuthSaveError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError ||
    (error instanceof Error && error.name === 'AuthenticationError')
}

const useWizardController = (): UseWizardControllerResult => {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, loading: authLoading } = useAuth()
  const { profile } = useProfileQuery()
  const { addToast } = useToastStore()
  const showError = useCallback((message: string) => addToast('error', message), [addToast])
  const showWarning = useCallback((message: string) => addToast('info', message), [addToast])
  const showSuccess = useCallback((message: string) => addToast('success', message), [addToast])
  const showInfo = useCallback((title: string, message?: string) => addToast('info', message || title), [addToast])

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [applicationId, setApplicationId] = useState<string | null>(null)
  const [ocrDocumentId, setOcrDocumentId] = useState<string | null>(null)
  const startOcrPollingRef = useRef<((documentId?: string | null) => void) | null>(null)
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplicationSummary | null>(null)
  const [selectedGrades, setSelectedGrades] = useState<SubjectGrade[]>([])
  const selectedGradesRef = useRef<SubjectGrade[]>([])
  selectedGradesRef.current = selectedGrades
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [restoringDraft, setRestoringDraft] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [confirmSubmission, setConfirmSubmission] = useState(false)
  const [gradesHydrating, setGradesHydrating] = useState(false)
  const [programs, setPrograms] = useState<WizardProgram[]>([])
  const [intakes, setIntakes] = useState<WizardIntake[]>([])
  const isSavingRef = useRef(false)
  const createBlockedRef = useRef(false)
  const isSubmittingRef = useRef(false)
  const authRecoveryInFlightRef = useRef(false)

  const findProgramId = useCallback(
    (
      value?: string | null,
      institutionHint?: string | null,
      programList?: WizardProgram[]
    ) => {
      const list = programList ?? programs
      if (!value) return ''

      const trimmed = value.trim()
      if (!trimmed) return ''

      // Exact ID match
      const byId = list.find(program => program.id === trimmed)
      if (byId) return byId.id

      const normalized = trimmed.toLowerCase()
      
      // Exact name match
      const exactMatches = list.filter(program => program.name?.trim().toLowerCase() === normalized)
      if (exactMatches.length === 1) return exactMatches[0]!.id

      // Multiple exact matches - use institution hint
      if (exactMatches.length > 1 && institutionHint) {
        const hint = institutionHint.trim().toLowerCase()
        const byInstitution = exactMatches.find(program => {
          const institutionName = program.institutions?.full_name || program.institutions?.name || ''
          const normalizedInstitution = institutionName.trim().toLowerCase()
          return normalizedInstitution === hint || normalizedInstitution.includes(hint) || hint.includes(normalizedInstitution)
        })
        if (byInstitution) return byInstitution.id
        // Return first match if institution hint doesn't help
        return exactMatches[0]!.id
      }

      // Partial name match (fallback)
      const partialMatches = list.filter(program => {
        const programName = program.name?.trim().toLowerCase() || ''
        return programName.includes(normalized) || normalized.includes(programName)
      })
      
      if (partialMatches.length === 1) return partialMatches[0]!.id
      if (partialMatches.length > 1 && institutionHint) {
        const hint = institutionHint.trim().toLowerCase()
        const byInstitution = partialMatches.find(program => {
          const institutionName = program.institutions?.full_name || program.institutions?.name || ''
          const normalizedInstitution = institutionName.trim().toLowerCase()
          return normalizedInstitution === hint || normalizedInstitution.includes(hint)
        })
        if (byInstitution) return byInstitution.id
      }

      // No match found - return empty to trigger validation error
      return ''
    },
    [programs]
  )

  const deriveInstitutionLabel = useCallback((institution?: WizardProgram['institutions']) => {
    if (!institution) return ''
    return institution.full_name?.trim() || institution.name?.trim() || ''
  }, [])

  const resolveProgramIdentity = useCallback(
    (value?: string | null, institutionHint?: string | null) => {
      const programId = findProgramId(value, institutionHint)
      if (!programId) return null

      const program = programs.find(item => item.id === programId)
      if (!program?.name?.trim()) return null

      return {
        id: programId,
        label: program.name.trim(),
        institutionLabel: deriveInstitutionLabel(program.institutions)
      }
    },
    [deriveInstitutionLabel, findProgramId, programs]
  )

  const resolveIntakeIdentity = useCallback(
    (value?: string | null) => resolveWizardIntakeIdentity(intakes, value),
    [intakes]
  )

  const resolveInstitutionCode = useCallback((institutionLabel: string) => {
    const normalized = institutionLabel.trim().toLowerCase()
    if (normalized.includes('kalulushi') || normalized.includes('katc')) {
      return 'KATC'
    }
    return 'MIHAS'
  }, [])

  const totalSteps = wizardSteps.length
  const currentStepConfig = (wizardSteps[currentStepIndex] ?? wizardSteps[0])!
  const isLastStep = currentStepConfig.key === 'submit'

  const programIds = useMemo(() => programs.map(program => program.id).filter(Boolean), [programs])
  const intakeIds = useMemo(
    () => intakes.map(intake => intake.id).filter(Boolean),
    [intakes]
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

  const { data: programsData, isLoading: programsLoading } = catalogData.useProgramsForIntake(watch('intake') || null)
  const { data: intakesData } = catalogData.useIntakes()
  const { data: subjectsData } = catalogData.useSubjects()
  const subjects = useMemo(
    () => mergeWizardSubjects((subjectsData?.subjects as Array<{ id: string; name: string; code: string }> | undefined) || []),
    [subjectsData]
  )
  const createApplication = applicationsData.useCreate()
  const updateApplication = applicationsData.useUpdate()
  const submitApplicationMutation = applicationsData.useSubmit()
  const syncGrades = applicationsData.useSyncGrades()
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

  const selectedProgram = watch('program')
  const selectedProgramDetails = useMemo(
    () => programs.find(program => program.id === selectedProgram),
    [programs, selectedProgram]
  )

  useEffect(() => {
    if (programsData?.programs) {
      const fetchedPrograms = programsData.programs as WizardProgram[]
      setPrograms(fetchedPrograms)

      const currentValue = getValues('program')
      if (currentValue) {
        const resolvedId = findProgramId(currentValue, undefined, fetchedPrograms)
        if (resolvedId && resolvedId !== currentValue) {
          setValue('program', resolvedId, { shouldValidate: true })
        }
      }
      return
    }

    setPrograms([])
  }, [programsData, getValues, setValue, findProgramId])
  const clearValidationError = useCallback(() => setError(''), [])

  const {
    resultSlipFile,
    extraKycFile,
    uploading,
    uploadProgress,
    uploadStates,
    uploadedFiles,
    handleResultSlipUpload: baseHandleResultSlipUpload,
    handleExtraKycUpload: baseHandleExtraKycUpload,
    handleResultSlipFile: baseHandleResultSlipFile,
    handleExtraKycFile: baseHandleExtraKycFile,
    markUploadedFile,
    startUpload,
    trackUploadTask
  } = useApplicationFileUploads({
    userId: user?.id,
    applicationId,
    onValidationError: setError,
    onValidationClear: clearValidationError
  })

  const normalizeSelectedGrades = useCallback((grades: SubjectGrade[]): SubjectGrade[] => {
    return normalizeDraftResumeGrades(
      grades.map(grade => ({
        ...grade,
        subject_id: resolveWizardSubjectId(grade.subject_id, subjects),
      }))
    )
  }, [subjects])

  const clearStaleApplicationReference = useCallback((staleApplicationId: string, message?: string) => {
    clearStaleApplicationDraftReference(staleApplicationId)
    setApplicationId(current => (current === staleApplicationId ? null : current))
    queryClient.removeQueries({ queryKey: ['application-detail', staleApplicationId] })
    queryClient.removeQueries({ queryKey: ['applications', 'detail', staleApplicationId] })
    queryClient.invalidateQueries({ queryKey: ['applications'] })
    window.dispatchEvent(new CustomEvent('applicationDraftStale', { detail: { applicationId: staleApplicationId } }))
    if (message) {
      showWarning(message)
    }
  }, [queryClient, showWarning])

  const persistLocalDraftSnapshot = useCallback(() => {
    const draftSnapshot = {
      formData: getValues(),
      selectedGrades: selectedGradesRef.current,
      uploadedFiles,
      currentStep: currentStepConfig.id,
      currentStepKey: currentStepConfig.key,
      applicationId,
      savedAt: new Date().toISOString(),
      userId: user?.id,
      version: 2,
      paymentStatus,
    }

    try {
      localStorage.setItem('applicationWizardDraft', JSON.stringify(draftSnapshot))
      window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draftSnapshot }))
    } catch {
      // best effort local persistence
    }

    return draftSnapshot
  }, [applicationId, currentStepConfig.id, currentStepConfig.key, getValues, paymentStatus, uploadedFiles, user?.id])

  const hydrateServerGrades = useCallback(async (draftApplicationId: string): Promise<SubjectGrade[]> => {
    try {
      const response = await applicationService.getGrades(draftApplicationId)
      const normalized = normalizeSelectedGrades(
        (Array.isArray(response) ? response : []).map((grade) => {
          const record = grade as { subject_id?: unknown; grade?: unknown }
          return {
            subject_id: typeof record.subject_id === 'string' ? record.subject_id : '',
            grade: Number(record.grade) || 0,
          }
        })
      )
      setSelectedGrades(normalized)
      return normalized
    } catch (gradeError) {
      logApiError('application-wizard', `/applications/${draftApplicationId}/grades/`, gradeError)
      if (isApplicationMissingError(gradeError)) {
        clearStaleApplicationReference(draftApplicationId)
      }
      return []
    }
  }, [clearStaleApplicationReference, normalizeSelectedGrades])

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

  const handleResultSlipUpload = useCallback((file: File | null) => {
    if (!file) {
      baseHandleResultSlipFile(null)
      return
    }

    baseHandleResultSlipUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>, async (uploadedFile, url) => {
      if (!applicationId) return
      
      showInfo('Processing document...', 'Extracting grades from your result slip')
      persistLocalDraftSnapshot()

      const persistResultSlipUrl = async () => {
        try {
          await updateApplication.mutateAsync({ id: applicationId, data: { result_slip_url: url } })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          return true
        } catch (error) {
          if (isApplicationMissingError(error)) {
            clearStaleApplicationReference(
              applicationId,
              'Your online draft was no longer available. The selected file is still on this device; continue from Basic Information to refresh the draft.'
            )
            return false
          }
          throw error
        }
      }
      
      try {
        // Result slip uploaded — persist URL and trigger OCR extraction
        const persisted = await persistResultSlipUrl()
        if (!persisted) return

        // Trigger backend OCR extraction (async Celery task)
        // The document ID is available from the upload response stored in uploadedFiles
        try {
          // Find the document ID from the most recent upload
          const docs = await apiClient.request<{ results?: UploadedApplicationDocument[] } | UploadedApplicationDocument[]>(
            `/applications/${applicationId}/documents/`
          )
          const docList = Array.isArray(docs) ? docs : (docs?.results ?? [])
          const resultSlipDoc = selectLatestDocumentByType(docList, 'result_slip')

          if (resultSlipDoc?.id) {
            // Fire OCR extraction — this is async (Celery task), don't await completion
            apiClient.request(`/documents/${resultSlipDoc.id}/extract/`, { method: 'POST' }).catch(() => {})
            // Start polling for AI grade extraction results
            setOcrDocumentId(resultSlipDoc.id)
            startOcrPollingRef.current?.(resultSlipDoc.id)
            showInfo('Analyzing your result slip...', 'AI is extracting grades — they will auto-populate shortly.')
          }
        } catch {
          // Non-critical — OCR is a convenience, not a requirement
          showSuccess('Result slip uploaded successfully.')
        }
      } catch (e) {
        if (isApplicationMissingError(e)) {
          clearStaleApplicationReference(
            applicationId,
            'Your online draft was no longer available. The selected file is still on this device; continue from Basic Information to refresh the draft.'
          )
          return
        }
        console.error('Auto-fill error:', e)
        showWarning('Auto-fill failed. Please enter grades manually.')
        await persistResultSlipUrl()
      }
    })
  }, [applicationId, baseHandleResultSlipFile, baseHandleResultSlipUpload, clearStaleApplicationReference, normalizeSelectedGrades, persistLocalDraftSnapshot, queryClient, showInfo, showSuccess, showWarning, subjects, syncGrades, updateApplication])

  const handleExtraKycUpload = useCallback((file: File | null) => {
    if (!file) {
      baseHandleExtraKycFile(null)
      return
    }

    baseHandleExtraKycUpload(
      { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>,
      async (_uploadedFile, url) => {
        if (!applicationId) return

        persistLocalDraftSnapshot()

        try {
          await updateApplication.mutateAsync({ id: applicationId, data: { extra_kyc_url: url } })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
        } catch (error) {
          if (isApplicationMissingError(error)) {
            clearStaleApplicationReference(
              applicationId,
              'Your online draft was no longer available. The selected file is still on this device; continue from Basic Information to refresh the draft.'
            )
            return
          }

          logApiError('application-wizard', `PATCH /applications/${applicationId}/`, error)
          showWarning('Identity document uploaded. Refresh the application if it does not appear immediately.')
        }
      }
    )
  }, [applicationId, baseHandleExtraKycFile, baseHandleExtraKycUpload, clearStaleApplicationReference, persistLocalDraftSnapshot, queryClient, showWarning, updateApplication])

  const preserveDraftBeforeAuthRedirect = useCallback(() => {
    persistLocalDraftSnapshot()
    try {
      sessionStorage.setItem('mihas:post-auth-redirect', `${location.pathname}${location.search}${location.hash}`)
    } catch {
      // best effort local persistence before auth redirect
    }
  }, [
    location.hash,
    location.pathname,
    location.search,
    persistLocalDraftSnapshot,
  ])

  useEffect(() => {
    if (authLoading) return

    if (user) {
      authRecoveryInFlightRef.current = false
      setError(current => (current === SESSION_EXPIRED_BANNER ? '' : current))
      try {
        sessionStorage.removeItem(WIZARD_AUTH_REDIRECT_GUARD_KEY)
      } catch {
        // best effort guard cleanup
      }
      return
    }

    if (authRecoveryInFlightRef.current) return
    authRecoveryInFlightRef.current = true

    let cancelled = false
    let graceTimer: ReturnType<typeof setTimeout> | null = null

    const recoverSessionThenMaybeRedirect = async () => {
      setError(current => current || SESSION_EXPIRED_BANNER)
      await new Promise<void>(resolve => {
        graceTimer = setTimeout(resolve, WIZARD_SESSION_GRACE_MS)
      })

      if (cancelled) return

      const readCachedUser = () =>
        getCachedAuthUser(queryClient.getQueryData<{ user?: { id?: string } }>(['auth', 'session']))

      const cachedBeforeChecks = readCachedUser()
      if (cachedBeforeChecks) {
        setError(current => (current === SESSION_EXPIRED_BANNER ? '' : current))
        authRecoveryInFlightRef.current = false
        return
      }

      let sessionRecheckFailed = true
      try {
        const sessionResult = await authService.session() as { user?: { id?: string } } | null
        const sessionUser = sessionResult?.user ?? null
        if (sessionUser) {
          queryClient.setQueryData(['auth', 'session'], { user: sessionUser })
          sessionRecheckFailed = false
        }
      } catch {
        sessionRecheckFailed = true
      }

      if (cancelled) return

      let tokenRefreshFailed = true
      if (sessionRecheckFailed) {
        try {
          await authService.refresh()
          const refreshedSession = await authService.session() as { user?: { id?: string } } | null
          const refreshedUser = refreshedSession?.user ?? null
          if (refreshedUser) {
            queryClient.setQueryData(['auth', 'session'], { user: refreshedUser })
            tokenRefreshFailed = false
            sessionRecheckFailed = false
          }
        } catch {
          tokenRefreshFailed = true
        }
      }

      const cachedAfterChecks = readCachedUser()
      const shouldRedirect = shouldRedirectToSignIn({
        sessionRecheckFailed,
        tokenRefreshFailed,
        cachedUser: cachedAfterChecks,
      })

      if (cancelled || !shouldRedirect) {
        setError(current => (current === SESSION_EXPIRED_BANNER ? '' : current))
        authRecoveryInFlightRef.current = false
        return
      }

      const now = Date.now()
      let rawGuard: string | null = null
      try {
        rawGuard = sessionStorage.getItem(WIZARD_AUTH_REDIRECT_GUARD_KEY)
      } catch {
        rawGuard = null
      }
      if (hasRecentWizardRedirectGuard(rawGuard, now)) {
        setError(SESSION_EXPIRED_BANNER)
        authRecoveryInFlightRef.current = false
        return
      }

      preserveDraftBeforeAuthRedirect()
      try {
        sessionStorage.setItem(WIZARD_AUTH_REDIRECT_GUARD_KEY, JSON.stringify({ createdAt: now }))
      } catch {
        // best effort loop guard
      }
      const redirectTarget = `/student/application-wizard?step=${encodeURIComponent(currentStepConfig.key)}`
      navigate(`/auth/signin?redirect=${encodeURIComponent(redirectTarget)}`, {
        replace: true,
        state: {
          from: {
            pathname: '/student/application-wizard',
            search: `?step=${encodeURIComponent(currentStepConfig.key)}`,
            hash: '',
          },
        },
      })
    }

    recoverSessionThenMaybeRedirect().finally(() => {
      if (!cancelled) authRecoveryInFlightRef.current = false
    })

    return () => {
      cancelled = true
      authRecoveryInFlightRef.current = false
      if (graceTimer) clearTimeout(graceTimer)
    }
  }, [authLoading, currentStepConfig.key, navigate, preserveDraftBeforeAuthRedirect, queryClient, user])

  const slipPayload: ApplicationSlipData | null = useMemo(() => {
    if (!submittedApplication || !submittedApplication.trackingCode || !submittedApplication.applicationNumber) return null
    const now = new Date().toISOString()
    return {
      application_id: applicationId || undefined,
      public_tracking_code: submittedApplication.trackingCode,
      application_number: submittedApplication.applicationNumber,
      status: submittedApplication.status || 'submitted',
      payment_status: submittedApplication.paymentStatus ?? null,
      submitted_at: submittedApplication.submittedAt || now,
      updated_at: submittedApplication.updatedAt || now,
      program_name: submittedApplication.program || null,
      intake_name: submittedApplication.intake || null,
      institution: submittedApplication.institution || null,
      institution_name: submittedApplication.institution || null,
      full_name: submittedApplication.fullName || null,
      email: submittedApplication.email || user?.email || 'no-email@mihas.local',
      phone: submittedApplication.phone || null,
      nationality: submittedApplication.nationality || 'Zambian',
      admin_feedback: null,
      admin_feedback_date: null,
      userId: user?.id
    }
  }, [applicationId, submittedApplication, user?.email, user?.id])

  const { persistingSlip, slipLoading, emailLoading, handleDownloadSlip, handleEmailSlip, dismissSlipProgress } = useApplicationSlip({
    submittedApplication,
    slipPayload,
    success,
    toast: { showError, showWarning, showSuccess, showInfo },
    createApplicationSlip,
    onEmailUpdate: email => setSubmittedApplication(prev => (prev ? { ...prev, email } : prev))
  })

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentStepIndex > 0 && !success) {
        persistLocalDraftSnapshot()
        event.preventDefault()
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentStepIndex, persistLocalDraftSnapshot, success])

  useEffect(() => {
    const handleAuthRedirect = () => {
      preserveDraftBeforeAuthRedirect()
    }

    window.addEventListener('mihas:before-auth-redirect', handleAuthRedirect)
    return () => window.removeEventListener('mihas:before-auth-redirect', handleAuthRedirect)
  }, [preserveDraftBeforeAuthRedirect])

  const { completionPercentage, missingFields, hasAutoPopulatedData } = useProfileAutoPopulation()
  const wizardReadiness = buildWizardReadiness({
    values: watch(),
    selectedGrades,
    uploadedFiles,
    hasResultSlipFile: Boolean(resultSlipFile),
    hasIdentityFile: Boolean(extraKycFile),
    paymentStatus,
    confirmSubmission,
  })

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

  useEffect(() => {
    if (user && !authLoading && !restoringDraft && !draftLoaded) {
      const metadata = getUserMetadata(user)
      const email = user.email || ''
      const setIfEmpty = (field: keyof WizardFormData, value: string) => {
        const normalizedValue = value.trim()
        if (!normalizedValue) return

        const currentValue = getValues(field)
        if (typeof currentValue === 'string' && currentValue.trim()) {
          return
        }

        setValue(field, normalizedValue as WizardFormData[typeof field], {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        })
      }
      
      const fullName = getBestValue(profile?.full_name, metadata.full_name, email.split('@')[0] || '')
      const phone = getBestValue(profile?.phone, metadata.phone, '')
      const dateOfBirth = normalizeDateInputValue(
        getBestValue(profile?.date_of_birth, metadata.date_of_birth, '')
      )
      const sex = normalizeSexForWizard(getBestValue(profile?.sex, metadata.sex, ''))
      const residenceTown = getCanonicalResidenceTown(profile, metadata)
      const residenceCountry = getCanonicalResidenceCountry(profile, metadata)
      const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
      const nrcNumber = getBestValue(profile?.nrc_number, metadata.nrc_number, '')
      const passportNumber = getBestValue(profile?.passport_number, metadata.passport_number, '')
      const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
      const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')

      setIfEmpty('email', email)
      setIfEmpty('full_name', fullName)
      setIfEmpty('phone', phone)
      setIfEmpty('date_of_birth', dateOfBirth)
      setIfEmpty('sex', sex)
      setIfEmpty('residence_town', normalizeResidenceTown(residenceTown))
      setIfEmpty('country', residenceCountry)
      setIfEmpty('nationality', nationality)
      setIfEmpty('nrc_number', nrcNumber)
      setIfEmpty('passport_number', passportNumber)
      setIfEmpty('next_of_kin_name', nextOfKinName)
      setIfEmpty('next_of_kin_phone', nextOfKinPhone)
    }
  }, [
    user,
    profile?.full_name,
    profile?.phone,
    profile?.date_of_birth,
    profile?.sex,
    profile?.residence_town,
    profile?.country,
    profile?.nationality,
    profile?.nrc_number,
    profile?.passport_number,
    profile?.next_of_kin_name,
    profile?.next_of_kin_phone,
    authLoading,
    draftLoaded,
    getValues,
    restoringDraft,
    setValue,
  ])

  useEffect(() => {
    const loadDraft = async () => {
      if (!user || authLoading || draftLoaded || draftApplicationsLoading) return
      setRestoringDraft(true)
      let draftRestored = false
      
      try {
        // Check if draft was recently deleted
        if (isDraftDeleted()) {
          clearDraftDeletedFlag()
          setRestoringDraft(false)
          setDraftLoaded(true)
          return
        }
        
        // Load both local and server drafts, then reconcile by timestamp
        interface LocalDraftShape {
          formData: Record<string, unknown>
          selectedGrades?: unknown[]
          uploadedFiles?: Record<string, boolean>
          paymentStatus?: string | null
          currentStep?: number
          currentStepKey?: string
          applicationId?: string
          savedAt?: string
          userId?: string
          version?: number
        }
        interface ServerDraftShape {
          id: string
          full_name?: string
          nrc_number?: string
          passport_number?: string
          date_of_birth?: string
          sex?: string
          phone?: string
          email?: string
          residence_town?: string
          country?: string
          nationality?: string
          next_of_kin_name?: string
          next_of_kin_phone?: string
          program?: string
          intake?: string
          institution?: string
          result_slip_url?: string
          extra_kyc_url?: string
          payment_status?: string | null
          status?: string
          updated_at?: string
          created_at?: string
        }
        let localDraft: LocalDraftShape | null = null
        let localTimestamp: Date | null = null
        let serverApp: ServerDraftShape | null = null
        let serverTimestamp: Date | null = null
        
        // 1. Check localStorage for local draft
        const draft = await applicationSessionManager.getLocalWizardDraft(user.id)
        if (draft && draft.formData && draft.version === 2) {
          localDraft = draft as LocalDraftShape
          localTimestamp = draft.savedAt ? new Date(draft.savedAt) : null
        } else if (localStorage.getItem('applicationWizardDraft')) {
          localStorage.removeItem('applicationWizardDraft')
        }
        
        // Clean up old sessionStorage drafts
        sessionStorage.removeItem('applicationWizardDraft')
        
        // 2. Check database for server draft
        if (draftApplications?.applications && draftApplications.applications.length > 0) {
          serverApp = draftApplications.applications[0] as unknown as ServerDraftShape
          serverTimestamp = serverApp.updated_at ? new Date(serverApp.updated_at) : 
                          (serverApp.created_at ? new Date(serverApp.created_at) : null)
        }
        
        // 3. Reconcile: pick the most recently updated draft
        const useLocalDraft = (() => {
          if (localDraft && !serverApp) return true
          if (!localDraft && serverApp) return false
          if (!localDraft && !serverApp) return false // nothing to restore
          
          // Both exist — compare timestamps, pick most recent
          if (localTimestamp && serverTimestamp) {
            return localTimestamp.getTime() >= serverTimestamp.getTime()
          }
          // If timestamps are missing, prefer local (it's the most recent user action)
          return true
        })()
        
        if (useLocalDraft && localDraft) {
          let localApplicationId = typeof localDraft.applicationId === 'string' ? localDraft.applicationId : null
          // Restore from localStorage
            // 3.2: Restore form values with shouldValidate: false to prevent validation errors
            Object.keys(localDraft.formData).forEach(key => {
              const rawValue = localDraft.formData[key]
              const value = key === 'date_of_birth'
                ? normalizeDateInputValue(rawValue)
                : rawValue
              if (value !== undefined && value !== null && value !== '') {
                setValue(key as keyof WizardFormData, value as WizardFormData[keyof WizardFormData], { shouldValidate: false })
              }
            })
            
            // Handle program ID resolution correctly
            if (localDraft.formData.program) {
              const resolvedProgramId = findProgramId(
                localDraft.formData.program as string,
                undefined,
                programsData?.programs as WizardProgram[] | undefined
              )
              if (resolvedProgramId) {
                setValue('program', resolvedProgramId, { shouldValidate: false })
              }
            }
            
            // Ensure intake is restored
            if (localDraft.formData.intake) {
              setValue('intake', localDraft.formData.intake as string, { shouldValidate: false })
            }
            
            // 3.3: Validate grades array structure before setting
            if (localDraft.selectedGrades && Array.isArray(localDraft.selectedGrades)) {
              const validGrades = localDraft.selectedGrades.filter((grade: unknown) => 
                grade && 
                typeof grade === 'object' &&
                typeof (grade as Record<string, unknown>).subject_id === 'string' &&
                (typeof (grade as Record<string, unknown>).grade === 'number' || typeof (grade as Record<string, unknown>).grade === 'string')
              ).map((grade: unknown) => {
                const g = grade as { subject_id: string; grade: string | number }
                return {
                  subject_id: g.subject_id,
                  grade: typeof g.grade === 'string' ? parseInt(g.grade, 10) : g.grade
                }
              })
              
              if (validGrades.length > 0) {
                setSelectedGrades(validGrades)
              } else if (localApplicationId) {
                setGradesHydrating(true)
                try {
                  await hydrateServerGrades(localApplicationId)
                } finally {
                  setGradesHydrating(false)
                }
              }
            } else if (localApplicationId) {
              setGradesHydrating(true)
              try {
                await hydrateServerGrades(localApplicationId)
              } finally {
                setGradesHydrating(false)
              }
            }

            try {
              const latestDraft = applicationSessionManager.getStoredDraft()
              if (
                localApplicationId &&
                latestDraft &&
                latestDraft.applicationId !== localApplicationId &&
                latestDraft.application_id !== localApplicationId
              ) {
                localApplicationId = null
              }
            } catch {
              // localStorage may be unavailable; keep the in-memory draft state
            }

            const serverUploads = localApplicationId
              ? await hydrateServerDocuments(localApplicationId)
              : { result_slip: false, extra_kyc: false }
            const mergedLocalUploads = {
              result_slip:
                Boolean(localDraft.uploadedFiles?.result_slip) ||
                Boolean(serverUploads.result_slip),
              extra_kyc:
                Boolean(localDraft.uploadedFiles?.extra_kyc) ||
                Boolean(serverUploads.extra_kyc),
            }
            markUploadedFile('result_slip', mergedLocalUploads.result_slip)
            markUploadedFile('extra_kyc', mergedLocalUploads.extra_kyc)
            restorePaymentStatus(serverApp?.payment_status ?? localDraft.paymentStatus ?? null)
            
            // 3.1: ALWAYS restore step - removed currentStepIndex === 0 condition
            // Use currentStepKey for reliable step matching
            if (localDraft.currentStepKey) {
              const index = wizardSteps.findIndex(step => step.key === localDraft.currentStepKey)
              if (index >= 0) {
                setCurrentStepIndex(index)
              }
            } else if (typeof localDraft.currentStep === 'number') {
              const index = getStepIndexById(localDraft.currentStep)
              setCurrentStepIndex(index >= 0 ? index : Math.min(Math.max(localDraft.currentStep - 1, 0), totalSteps - 1))
            }
            
            if (localApplicationId) {
              setApplicationId(localApplicationId)
            }

            draftRestored = true
            setRestoringDraft(false)
            setDraftLoaded(true)
            
            // 3.4: Show restoration confirmation message only if draft was actually restored
            showSuccess('Draft restored successfully')
            return
        } else if (serverApp) {
          // Restore from database (server draft is newer or local doesn't exist)
          const app = serverApp
          logger.info('[Draft] Restoring from database:', app.id)
          
          // CRITICAL: Set application ID FIRST
          setApplicationId(app.id)
          restorePaymentStatus(app.payment_status ?? null)
          
          // 3.2: Set form values with shouldValidate: false
          setValue('full_name', app.full_name || '', { shouldValidate: false })
          setValue('nrc_number', app.nrc_number || '', { shouldValidate: false })
          setValue('passport_number', app.passport_number || '', { shouldValidate: false })
          setValue('date_of_birth', normalizeDateInputValue(app.date_of_birth || ''), { shouldValidate: false })
          setValue('sex', (app.sex || '') as WizardFormData['sex'], { shouldValidate: false })
          setValue('phone', app.phone || '', { shouldValidate: false })
          setValue('email', app.email || '', { shouldValidate: false })
          setValue('residence_town', normalizeResidenceTown(app.residence_town || ''), { shouldValidate: false })
          setValue('country', (String(app.country ?? '') || DEFAULT_RESIDENCE_COUNTRY), { shouldValidate: false })
          setValue('nationality', (String(app.nationality ?? '') || 'Zambian'), { shouldValidate: false })
          setValue('next_of_kin_name', app.next_of_kin_name || '', { shouldValidate: false })
          setValue('next_of_kin_phone', app.next_of_kin_phone || '', { shouldValidate: false })
          
          if (app.program) {
            const resolvedProgramId = findProgramId(
              app.program,
              app.institution,
              programsData?.programs as WizardProgram[] | undefined
            )
            setValue('program', resolvedProgramId || app.program, { shouldValidate: false })
          } else {
            setValue('program', '', { shouldValidate: false })
          }
          setValue('intake', app.intake || '', { shouldValidate: false })
          const hydratedServerUploads = await hydrateServerDocuments(app.id)
          const restoredUploads = {
            result_slip: Boolean(hydratedServerUploads.result_slip),
            extra_kyc: Boolean(hydratedServerUploads.extra_kyc),
          }
          markUploadedFile('result_slip', restoredUploads.result_slip)
          markUploadedFile('extra_kyc', restoredUploads.extra_kyc)
          setGradesHydrating(true)
          let restoredGrades: SubjectGrade[]
          try {
            restoredGrades = await hydrateServerGrades(app.id)
          } finally {
            setGradesHydrating(false)
          }

          // 3.1: ALWAYS restore step - removed currentStepIndex === 0 condition
          const stepId = resolveDraftResumeStepId(app, restoredGrades, restoredUploads)
          const index = getStepIndexById(stepId)
          setCurrentStepIndex(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))

          draftRestored = true
          
          // Update localStorage to match server state for future reconciliation
          const syncDraft = {
            formData: getValues(),
            selectedGrades: restoredGrades,
            uploadedFiles: restoredUploads,
            currentStep: stepId,
            currentStepKey: wizardSteps[Math.min(stepId - 1, wizardSteps.length - 1)]?.key,
            applicationId: app.id,
            savedAt: app.updated_at || app.created_at || new Date().toISOString(),
            userId: user.id,
            version: 2,
            paymentStatus: app.payment_status ?? null,
          }
          try {
            localStorage.setItem('applicationWizardDraft', JSON.stringify(syncDraft))
          } catch { /* non-critical */ }
          
          // 3.4: Show restoration confirmation for database draft
          showSuccess('Draft restored successfully')
        }

        if (!draftRestored) {
          const stepFromQuery = new URLSearchParams(location.search).get('step')
          if (stepFromQuery) {
            const stepIndexFromQuery = wizardSteps.findIndex(step => step.key === stepFromQuery)
            if (stepIndexFromQuery >= 0) {
              setCurrentStepIndex(stepIndexFromQuery)
            }
          }
        }
      } catch (error) {
        console.error('Error loading draft application:', { error: sanitizeForLog(toError(error).message) })
      } finally {
        setRestoringDraft(false)
        setDraftLoaded(true)
      }
    }

    // Only load draft on initial mount when user is available and draft query resolved
    if (user && !authLoading && !draftLoaded && !draftApplicationsLoading) {
      loadDraft()
    }
  }, [
    user,
    authLoading,
    draftLoaded,
    draftApplicationsLoading,
    setValue,
    draftApplications,
    location.search,
    location.state,
    totalSteps,
    findProgramId,
    programsData,
    hydrateServerGrades,
    markUploadedFile,
    restorePaymentStatus,
    showSuccess
  ])

  const handleLoadDraft = useCallback(async (draftData: unknown, draftId?: string) => {
    const app = (
      draftData &&
      typeof draftData === 'object' &&
      'application' in (draftData as Record<string, unknown>)
    )
      ? (draftData as { application?: unknown }).application
      : draftData

    if (!app || typeof app !== 'object') {
      setError('This draft could not be loaded. Please refresh and try again.')
      return
    }

    const draft = app as Record<string, unknown>
    const resolvedDraftId = String(draft.id || draftId || '')
    if (!resolvedDraftId) {
      setError('This draft is missing its application ID. Please choose another draft.')
      return
    }

    setRestoringDraft(true)
    try {
      setApplicationId(resolvedDraftId)
      restorePaymentStatus(typeof draft.payment_status === 'string' ? draft.payment_status : null)

      setValue('full_name', String(draft.full_name || ''), { shouldValidate: false })
      setValue('nrc_number', String(draft.nrc_number || ''), { shouldValidate: false })
      setValue('passport_number', String(draft.passport_number || ''), { shouldValidate: false })
      setValue('date_of_birth', normalizeDateInputValue(draft.date_of_birth || ''), { shouldValidate: false })
      setValue('sex', String(draft.sex || '') as WizardFormData['sex'], { shouldValidate: false })
      setValue('phone', String(draft.phone || ''), { shouldValidate: false })
      setValue('email', String(draft.email || user?.email || ''), { shouldValidate: false })
      setValue('residence_town', normalizeResidenceTown(String(draft.residence_town || '')), { shouldValidate: false })
      setValue('country', String(draft.country || DEFAULT_RESIDENCE_COUNTRY), { shouldValidate: false })
      setValue('nationality', String(draft.nationality || 'Zambian'), { shouldValidate: false })
      setValue('next_of_kin_name', String(draft.next_of_kin_name || ''), { shouldValidate: false })
      setValue('next_of_kin_phone', String(draft.next_of_kin_phone || ''), { shouldValidate: false })

      const programValue = typeof draft.program === 'string' ? draft.program : ''
      if (programValue) {
        const resolvedProgramId = findProgramId(
          programValue,
          typeof draft.institution === 'string' ? draft.institution : undefined,
          programsData?.programs as WizardProgram[] | undefined
        )
        setValue('program', resolvedProgramId || programValue, { shouldValidate: false })
      } else {
        setValue('program', '', { shouldValidate: false })
      }
      setValue('intake', String(draft.intake || ''), { shouldValidate: false })

      const hydratedServerUploads = await hydrateServerDocuments(resolvedDraftId)
      const restoredUploads = {
        ...deriveDraftResumeUploads(draft),
        result_slip: Boolean(hydratedServerUploads.result_slip),
        extra_kyc: Boolean(hydratedServerUploads.extra_kyc),
      }
      markUploadedFile('result_slip', restoredUploads.result_slip)
      markUploadedFile('extra_kyc', restoredUploads.extra_kyc)

      setGradesHydrating(true)
      let restoredGrades: SubjectGrade[] = []
      try {
        restoredGrades = await hydrateServerGrades(resolvedDraftId)
      } finally {
        setGradesHydrating(false)
      }

      const stepId = resolveDraftResumeStepId(draft, restoredGrades, restoredUploads)
      const index = getStepIndexById(stepId)
      setCurrentStepIndex(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))

      const syncDraft = {
        formData: getValues(),
        selectedGrades: restoredGrades,
        uploadedFiles: restoredUploads,
        currentStep: stepId,
        currentStepKey: wizardSteps[Math.min(stepId - 1, wizardSteps.length - 1)]?.key,
        applicationId: resolvedDraftId,
        savedAt: String(draft.updated_at || draft.created_at || new Date().toISOString()),
        userId: user?.id,
        version: 2,
        paymentStatus: typeof draft.payment_status === 'string' ? draft.payment_status : null,
      }

      try {
        localStorage.setItem('applicationWizardDraft', JSON.stringify(syncDraft))
        window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: syncDraft }))
      } catch {
        // Local recovery cache is best effort.
      }

      setDraftLoaded(true)
      setError('')
      showSuccess('Draft loaded successfully')
    } catch (error) {
      logApiError('application-wizard', `load draft ${resolvedDraftId}`, error)
      setError(toError(error).message || 'Failed to load draft')
    } finally {
      setRestoringDraft(false)
    }
  }, [
    findProgramId,
    getValues,
    hydrateServerGrades,
    markUploadedFile,
    programsData?.programs,
    restorePaymentStatus,
    setValue,
    showSuccess,
    totalSteps,
    user?.email,
    user?.id,
  ])

  const saveDraft = useCallback(async (options: SaveDraftOptions = {}) => {
    if (!user || restoringDraft || success) return
    const syncServer = options.syncServer ?? true
    
    // Prevent concurrent saves
    if (isSavingRef.current) return
    
    try {
      isSavingRef.current = true
      setIsDraftSaving(true)
      
      const formData = getValues()
      const now = new Date().toISOString()
      const draft = {
        formData,
        selectedGrades: selectedGradesRef.current,
        uploadedFiles,
        currentStep: currentStepConfig.id,
        currentStepKey: currentStepConfig.key,
        applicationId,
        savedAt: now,
        userId: user.id,
        version: 2,
        paymentStatus,
      }

      // Always save to localStorage first for reliability (works offline)
      try {
        localStorage.setItem('applicationWizardDraft', JSON.stringify(draft))
        sessionStorage.removeItem('applicationWizardDraft')
        window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draft }))
      } catch (error) {
        console.error('Error saving draft:', { error: sanitizeForLog(toError(error).message) })
      }

      if (syncServer && !applicationId && !createBlockedRef.current && navigator.onLine && canCreateServerDraft(formData)) {
        try {
          const metadata = getUserMetadata(user)
          const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
          const resolvedProgram = resolveProgramIdentity(formData.program)
          if (!resolvedProgram) {
            throw new Error('Please select a valid program before saving your draft online.')
          }
          const resolvedIntake = resolveIntakeIdentity(formData.intake)
          if (!resolvedIntake) {
            throw new Error('Please select a valid intake before saving your draft online.')
          }
          const institutionLabel =
            resolvedProgram.institutionLabel || deriveInstitutionLabel(selectedProgramDetails?.institutions) || 'MIHAS'
          const app = await createApplication.mutateAsync(
            buildServerDraftPayload({
              formData: {
                ...formData,
                program: resolvedProgram.label,
                intake: resolvedIntake.name
              },
              selectedProgramDetails,
              institutionCode: institutionLabel,
              nationality,
            })
          )

          if (app?.id) {
            setApplicationId(app.id)
            const draftWithId = {
              ...draft,
              applicationId: app.id,
            }

            try {
              localStorage.setItem('applicationWizardDraft', JSON.stringify(draftWithId))
              window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draftWithId }))
            } catch {
              // Non-critical localStorage refresh
            }

            setSubmittedApplication(prev => ({
              applicationNumber: app.application_number || prev?.applicationNumber || '',
              trackingCode: String(app.public_tracking_code || prev?.trackingCode || ''),
              program: resolvedProgram.label,
              institution: institutionLabel,
              intake: resolvedIntake.label,
              fullName: formData.full_name,
              email: formData.email,
              phone: sanitizePhoneInput(formData.phone),
              status: app.status || 'draft',
              paymentStatus: app.payment_status ?? prev?.paymentStatus ?? null,
            }))

            queryClient.invalidateQueries({ queryKey: ['applications'] })
            window.dispatchEvent(new CustomEvent('applicationCreated', { detail: { applicationId: app.id, source: 'autosave' } }))
          }
        } catch (serverError) {
          if (isAuthSaveError(serverError)) {
            throw serverError
          }
          // 409 = duplicate application exists for this program+intake.
          // Adopt the existing ID so auto-save stops retrying create.
          const errStatus = (serverError as { status?: number })?.status
          if (errStatus === 409) {
            // Duplicate application exists — stop retrying create.
            // The student already has an active application for this program+intake.
            logger.info('[saveDraft] Duplicate application exists, skipping server create')
            createBlockedRef.current = true
          } else {
            logApiError('application-wizard', 'POST /applications/', serverError)
            console.warn('Server draft create failed, local draft retained:', sanitizeForLog(toError(serverError).message))
          }
        }
      }

      // Persist to server via API if we have an applicationId and are online
      // This is non-blocking — local draft is retained on failure and retried next interval
      if (syncServer && applicationId && navigator.onLine) {
        try {
          await applicationService.update(applicationId, {
            full_name: formData.full_name || undefined,
            nrc_number: formData.nrc_number || undefined,
            passport_number: formData.passport_number || undefined,
            date_of_birth: formData.date_of_birth || undefined,
            sex: formData.sex?.toLowerCase() || undefined,
            phone: sanitizePhoneInput(formData.phone) || undefined,
            email: formData.email || undefined,
            residence_town: normalizeResidenceTown(formData.residence_town) || undefined,
            country: formData.country || DEFAULT_RESIDENCE_COUNTRY,
            nationality: formData.nationality || undefined,
            next_of_kin_name: formData.next_of_kin_name || undefined,
            next_of_kin_phone: sanitizePhoneInput(formData.next_of_kin_phone) || undefined,
          } as Partial<Application>)
        } catch (serverError) {
          if (isAuthSaveError(serverError)) {
            throw serverError
          }
          if (isApplicationMissingError(serverError)) {
            clearStaleApplicationReference(applicationId)
            return
          }
          // Non-blocking: local draft is retained, will retry on next 8-second interval
          logApiError('application-wizard', `PATCH /applications/${applicationId}/`, serverError)
        }
      }

      // Update UI indicators
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } finally {
      setIsDraftSaving(false)
      isSavingRef.current = false
    }
  }, [
    user,
    restoringDraft,
    success,
    selectedGrades,
    uploadedFiles,
    currentStepConfig,
    applicationId,
    getValues,
    paymentStatus,
    profile?.nationality,
    deriveInstitutionLabel,
    selectedProgramDetails,
    resolveInstitutionCode,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    createApplication,
    queryClient,
    clearStaleApplicationReference,
  ])

  // Auto-save is handled by useSmartAutoSave (via useAutoSave) in the wizard component.
  // No redundant setInterval needed here — useSmartAutoSave calls saveDraft every 8 seconds.

  const addGrade = useCallback(() => {
    setSelectedGrades(prev => (prev.length < 10 ? [...prev, { subject_id: '', grade: 1 }] : prev))
  }, [])

  const removeGrade = useCallback((index: number) => {
    setSelectedGrades(prev => prev.filter((_, i) => i !== index))
  }, [])

  const updateGrade = useCallback((index: number, field: keyof SubjectGrade, value: string | number) => {
    setSelectedGrades(prev => {
      const next = [...prev]
      next[index] = { ...next[index]!, [field]: field === 'grade' ? Number(value) : value }
      return next
    })
  }, [])

  const getUsedSubjects = useCallback(() => selectedGrades.map(grade => grade.subject_id).filter(Boolean), [selectedGrades])

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

  // OCR grade auto-population: poll for AI analysis after result slip upload
  const handleOcrGrades = useCallback((grades: Array<{ subject_id: string; grade: number }>) => {
    if (grades.length === 0) return

    // Read from ref to get the absolute latest grades (avoids stale closure)
    const currentGrades = selectedGradesRef.current
    const hadManualGrades = currentGrades.length > 0

    // Merge: OCR fills empty slots, never overwrites manually entered grades
    const manualSubjectIds = new Set(currentGrades.map(g => g.subject_id))
    const newGrades = grades.filter(g => !manualSubjectIds.has(g.subject_id))
    const merged = [...currentGrades, ...newGrades]
    setSelectedGrades(merged)

    if (hadManualGrades && newGrades.length > 0) {
      showSuccess(`✨ AI detected ${grades.length} subjects — added ${newGrades.length} new subjects (your ${currentGrades.length} existing entries were kept). Please verify.`)
    } else if (hadManualGrades && newGrades.length === 0) {
      showSuccess(`✨ AI detected ${grades.length} subjects, but all were already entered. Please verify your grades.`)
    } else {
      showSuccess(`✨ AI detected ${grades.length} subjects from your result slip! Please verify the grades are correct.`)
    }

    if (applicationId) {
      syncGrades.mutateAsync({ id: applicationId, grades: merged }).catch(() => {})
    }
  }, [applicationId, syncGrades, showSuccess])

  const { status: ocrStatus, extractedCount: ocrExtractedCount, failureReason: ocrFailureReason, startPolling: startOcrPolling } = useOcrGradeExtraction(
    ocrDocumentId,
    subjects,
    handleOcrGrades,
  )
  startOcrPollingRef.current = startOcrPolling

  // Auto-start OCR polling on draft restore when result slip exists but no grades loaded
  useEffect(() => {
    if (ocrDocumentId && ocrStatus === 'idle' && selectedGrades.length === 0 && subjects.length > 0) {
      startOcrPolling(ocrDocumentId)
    }
  }, [ocrDocumentId, ocrStatus, selectedGrades.length, subjects.length, startOcrPolling])

  const retryOcr = useCallback((documentId?: string | null) => {
    const docId = documentId || ocrDocumentId
    if (!docId) return
    apiClient.request(`/documents/${docId}/extract/`, { method: 'POST', body: JSON.stringify({ force: true }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
    startOcrPolling(docId)
  }, [ocrDocumentId, startOcrPolling])

  const goToStep = useCallback((index: number) => {
    setCurrentStepIndex(Math.min(Math.max(index, 0), totalSteps - 1))
  }, [totalSteps])

  const handleNextStep = useCallback(async () => {
    await saveDraft({ syncServer: false })

    if (currentStepConfig.key === 'basicKyc') {
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
          resolvedProgram.institutionLabel || deriveInstitutionLabel(selectedProgramDetails?.institutions) || 'MIHAS'
        
        // Duplicate check handled by backend on create/submit

        if (applicationId) {
          // Update existing application
          const metadata = getUserMetadata(user)
          const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
          const country = getCanonicalResidenceCountry(profile, metadata)

          const updatedApp = await updateApplication.mutateAsync({
            id: applicationId,
            data: {
              full_name: formData.full_name,
              nrc_number: formData.nrc_number || null,
              passport_number: formData.passport_number || null,
              date_of_birth: formData.date_of_birth,
              sex: formData.sex?.toLowerCase(),
              phone: sanitizePhoneInput(formData.phone),
              email: formData.email,
              residence_town: normalizeResidenceTown(formData.residence_town),
              country: formData.country || country,
              next_of_kin_name: formData.next_of_kin_name || null,
              next_of_kin_phone: sanitizePhoneInput(formData.next_of_kin_phone) || null,
              program: resolvedProgram.label,
              intake: resolvedIntake.name,
              institution: institutionLabel,
              nationality: nationality
            }
          })

          setSubmittedApplication(prev => ({
            applicationNumber: updatedApp?.application_number || prev?.applicationNumber || '',
            trackingCode: String(updatedApp?.public_tracking_code || prev?.trackingCode || ''),
            program: programName,
            institution: institutionLabel,
            intake: resolvedIntake.label,
            fullName: formData.full_name,
            email: formData.email,
            phone: sanitizePhoneInput(formData.phone),
            status: updatedApp?.status || 'draft',
            paymentStatus: updatedApp?.payment_status ?? prev?.paymentStatus ?? null
          }))
          
          // Invalidate cache and notify dashboard
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: { applicationId } }))
        } else {
          // Create new application
          const metadata = getUserMetadata(user)
          const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
          const country = getCanonicalResidenceCountry(profile, metadata)

          const app = await createApplication.mutateAsync({
            full_name: sanitizeInput(formData.full_name),
            nrc_number: sanitizeInput(formData.nrc_number) || null,
            passport_number: sanitizeInput(formData.passport_number) || null,
            date_of_birth: formData.date_of_birth,
            sex: formData.sex?.toLowerCase(),
            phone: sanitizePhoneInput(formData.phone),
            email: sanitizeInput(formData.email),
            residence_town: normalizeResidenceTown(formData.residence_town),
            country: sanitizeInput(formData.country) || country,
            next_of_kin_name: sanitizeInput(formData.next_of_kin_name) || null,
            next_of_kin_phone: sanitizePhoneInput(formData.next_of_kin_phone) || null,
            program: resolvedProgram.label,
            intake: resolvedIntake.name,
            institution: institutionLabel,
            nationality: nationality,
          })

          if (!app?.id) {
            throw new Error('Application created but ID not returned')
          }

          setApplicationId(app.id)
          setSubmittedApplication({
            applicationNumber: app.application_number || '',
            trackingCode: String(app.public_tracking_code || ''),
            program: programName,
            institution: institutionLabel,
            intake: resolvedIntake.label,
            fullName: formData.full_name,
            email: formData.email,
            phone: sanitizePhoneInput(formData.phone),
            status: app.status || 'draft',
            paymentStatus: app.payment_status ?? null,
            nationality,
          })
          
          // Invalidate cache and notify dashboard
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          window.dispatchEvent(new CustomEvent('applicationCreated', { detail: { applicationId: app.id } }))
        }
        
        goToStep(currentStepIndex + 1)
      } catch (error) {
        logApiError('application-wizard', '/applications/', error)
        let errorMessage = toError(error).message || 'Failed to save application'
        let staleRecoveryFailed = false
        
        if (applicationId && isApplicationMissingError(error)) {
          clearStaleApplicationReference(applicationId)
          try {
            const resolvedProgram = resolveProgramIdentity(formData.program)
            const resolvedIntake = resolveIntakeIdentity(formData.intake)
            if (!resolvedProgram || !resolvedIntake) {
              throw new Error('Please reselect your program and intake before continuing.')
            }

            const metadata = getUserMetadata(user)
            const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
            const country = getCanonicalResidenceCountry(profile, metadata)
            const institutionLabel =
              resolvedProgram.institutionLabel || deriveInstitutionLabel(selectedProgramDetails?.institutions) || 'MIHAS'

            const app = await createApplication.mutateAsync({
              full_name: sanitizeInput(formData.full_name),
              nrc_number: sanitizeInput(formData.nrc_number) || null,
              passport_number: sanitizeInput(formData.passport_number) || null,
              date_of_birth: formData.date_of_birth,
              sex: formData.sex?.toLowerCase(),
              phone: sanitizePhoneInput(formData.phone),
              email: sanitizeInput(formData.email),
              residence_town: normalizeResidenceTown(formData.residence_town),
              country: sanitizeInput(formData.country) || country,
              next_of_kin_name: sanitizeInput(formData.next_of_kin_name) || null,
              next_of_kin_phone: sanitizePhoneInput(formData.next_of_kin_phone) || null,
              program: resolvedProgram.label,
              intake: resolvedIntake.name,
              institution: institutionLabel,
              nationality,
            })

            if (!app?.id) {
              throw new Error('Application created but ID not returned')
            }

            setApplicationId(app.id)
            setSubmittedApplication({
              applicationNumber: app.application_number || '',
              trackingCode: String(app.public_tracking_code || ''),
              program: resolvedProgram.label,
              institution: institutionLabel,
              intake: resolvedIntake.label,
              fullName: formData.full_name,
              email: formData.email,
              phone: sanitizePhoneInput(formData.phone),
              status: app.status || 'draft',
              paymentStatus: app.payment_status ?? null,
              nationality,
            })
            queryClient.invalidateQueries({ queryKey: ['applications'] })
            window.dispatchEvent(new CustomEvent('applicationCreated', { detail: { applicationId: app.id, source: 'stale-draft-recovery' } }))
            goToStep(currentStepIndex + 1)
            return
          } catch (recoveryError) {
            logApiError('application-wizard', 'POST /applications/ stale-draft-recovery', recoveryError)
            errorMessage = 'Your previous online draft was no longer available. Your details are still saved on this device. Please try Continue again.'
            staleRecoveryFailed = true
          }
        }

        // Handle 404 for unavailable programs/intakes (Req 6.5)
        const errorStatus = (error as { status?: number })?.status
        if (!staleRecoveryFailed && errorStatus === 404) {
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
      const validGradeCount = latestGrades.filter(
        g => g.subject_id && Number(g.grade) >= 1 && Number(g.grade) <= 9
      ).length

      if (!applicationId) {
        const errorMessage = 'Application not created. Returning to Basic Information step.'
        setError(errorMessage)
        showError(errorMessage)
        goToStep(0)
        return
      }
      
      if (validGradeCount < 5) {
        const emptyRows = latestGrades.filter(g => !g.subject_id).length
        const hint = emptyRows > 0 ? ` — ${emptyRows} row${emptyRows > 1 ? 's have' : ' has'} no subject selected` : ''
        const errorMessage = `Minimum 5 subjects required (${validGradeCount} added${hint})`
        setError(errorMessage)
        return
      }
      if (selectedProgram && eligibilityCheck && !eligibilityCheck.eligible) {
      }
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

      // Wait for upload to complete if still uploading
      if (uploading) {
        const errorMessage = 'Please wait for file upload to complete'
        setError(errorMessage)
        return
      }

      // Files already uploaded on selection, just sync grades and proceed
      try {
        setLoading(true)
        const gradesToSync = normalizeSelectedGrades(latestGrades)
        if (gradesToSync.length > 0) {
          await syncGrades.mutateAsync({ id: applicationId, grades: gradesToSync })
          setSelectedGrades(gradesToSync)
          queryClient.invalidateQueries({ queryKey: ['applications'] })
        }
        goToStep(currentStepIndex + 1)
      } catch (error) {
        logApiError('application-wizard', `/applications/${applicationId}/grades/`, error)
        if (isApplicationMissingError(error)) {
          const errorMessage = 'Your online draft was no longer available. Your grades are saved on this device; please continue from Basic Information to refresh the draft.'
          clearStaleApplicationReference(applicationId, errorMessage)
          setError(errorMessage)
          goToStep(0)
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

      if (paymentStatus !== 'successful' && paymentStatus !== 'deferred') {
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
    createApplication,
    goToStep,
    currentStepIndex,
    selectedGrades,
    selectedProgram,
    selectedProgramDetails,
    eligibilityCheck,
    resultSlipFile,
    extraKycFile,
    trackUploadTask,
    clearValidationError,
    startUpload,
    syncGrades,
    applicationId,
    updateApplication,
    normalizeSelectedGrades,
    programIds,
    intakeIds,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    showError,
    paymentStatus,
    user,
    profile,
    deriveInstitutionLabel,
    clearStaleApplicationReference,
    queryClient,
  ])

  const handlePrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      void saveDraft({ syncServer: false })
      goToStep(currentStepIndex - 1)
    }
  }, [currentStepIndex, goToStep, saveDraft])

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
      const idempotencyKey = crypto.randomUUID()
      const updatedApp = await submitApplicationMutation.mutateAsync({
        id: applicationId,
        headers: { 'Idempotency-Key': idempotencyKey },
      })
      

      if (!updatedApp) {
        throw new Error('Application not found or access denied')
      }

      // Fetch institution name
      let institutionName = updatedApp.institution
      try {
        const result = await apiClient.request<{ institutions?: Array<{ id: string; slug?: string; name: string }> } | Array<{ id: string; slug?: string; name: string }>>(
          `/catalog/institutions/`
        )
        const institutions = Array.isArray(result) ? result : result?.institutions ?? []
        const match = institutions.find(
          (inst: { id: string; slug?: string; name: string }) =>
            inst.id === updatedApp.institution
            || inst.slug === updatedApp.institution
            || inst.name === updatedApp.institution
        )
        if (match?.name) {
          institutionName = match.name
        }
      } catch (e) {
        logApiError('application-wizard', '/catalog/institutions/', e)
      }

      setSubmittedApplication(prev => ({
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

      clearAllDraftData()

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
      if (applicationId && isApplicationMissingError(error)) {
        clearStaleApplicationReference(applicationId)
        message = 'Your online draft was no longer available. Your details are still saved on this device; please continue from Basic Information to refresh the draft.'
        goToStep(0)
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
  }, [confirmSubmission, uploadedFiles, resultSlipFile, extraKycFile, paymentStatus, applicationId, submitApplicationMutation, user?.id, showError, showSuccess, queryClient, clearStaleApplicationReference, goToStep])

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
    wizardReadiness,
    isDraftSaving,
    draftSaved,
    draftLoaded,
    gradesHydrating,
    submittedApplication,
    applicationId,
    paymentStatus,
    ocrStatus,
    ocrExtractedCount,
    ocrFailureReason,
    retryOcr,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress,
    handleResultSlipUpload,
    handleExtraKycUpload,
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
    setPaymentStatus
  }
}

export default useWizardController
