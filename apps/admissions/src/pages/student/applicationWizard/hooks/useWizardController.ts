import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm, type UseFormReturn, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { connectionManager } from '@/lib/connectionFix'

import { useToastStore } from '@/hooks/useToast'
import { useAuth } from '@/contexts/AuthContext'
import { applicationsData, type ApplicationUpdateData } from '@/data/applications'
import { catalogData } from '@/data/catalog'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useProfileAutoPopulation, getBestValue, getUserMetadata } from '@/hooks/useProfileAutoPopulation'
import { useApplicationSubmit } from '@/hooks/useApplicationSubmit'
import { useEligibilityChecker } from '@/hooks/useEligibilityChecker'
import { draftManager } from '@/lib/draftManager'
// eslint-disable-next-line no-restricted-imports -- eligibilityEngine is still used until API-backed replacement is ready
import { checkEligibility, getRecommendedSubjects } from '@/lib/eligibilityEngine'
import { createApplicationSlip } from '@/lib/slipService'
import type { ApplicationSlipData } from '@/lib/applicationSlip'
import { sanitizeForLog } from '@/lib/security'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { findBestSubjectId } from '@/lib/subjectMatcher'
import { apiClient } from '@/services/client'
import { applicationService } from '@/services/applications'
import type { Application, Intake } from '@/types/database'
import { logger } from '@/lib/logger'
import { safeJsonParse } from '@/lib/utils'
import { clearAllDraftData, isDraftDeleted, clearDraftDeletedFlag } from '@/lib/draftManager'
import { applicationSessionManager } from '@/lib/applicationSession'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import {
  getCanonicalResidenceCountry,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
  normalizeDateTimeLocalValue,
} from '@/lib/profileFieldMapping'
import { mergeWizardSubjects } from '../lib/educationCatalog'
import {
  buildServerDraftPayload,
  canCreateServerDraft,
} from '../lib/draftAutosave'

import useApplicationSlip, { SubmittedApplicationSummary } from './useApplicationSlip'
import useApplicationFileUploads from './useApplicationFileUploads'
import {
  createWizardSchema,
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
  uploadedFiles: Record<string, boolean>
  isDraftSaving: boolean
  draftSaved: boolean
  draftLoaded: boolean
  submittedApplication: SubmittedApplicationSummary | null
  applicationId: string | null
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  handleDownloadSlip: () => Promise<void>
  handleEmailSlip: () => Promise<void>
  dismissSlipProgress: () => void
  handleResultSlipUpload: (file: File | null) => void
  handleExtraKycUpload: (file: File | null) => void
  getPaymentTarget: () => Promise<string>
  handleNextStep: () => Promise<void>
  handlePrevStep: () => void
  handleSubmitApplication: (data: WizardFormData) => Promise<void>
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  saveDraft: () => Promise<void>
  watchValues: () => WizardFormData
  goToStep: (index: number) => void
}

export interface PaymentValidationContext {
  formData: WizardFormData
  setError: (value: string) => void
  showError: (title: string, message?: string) => void
}

const WIZARD_AUTH_REDIRECT_GUARD_KEY = 'mihas:wizard-auth-redirect-guard'
const WIZARD_SESSION_GRACE_MS = 1500
const SESSION_EXPIRED_BANNER = 'Session expired, please sign in to continue'

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
  const [submittedApplication, setSubmittedApplication] = useState<SubmittedApplicationSummary | null>(null)
  const [selectedGrades, setSelectedGrades] = useState<SubjectGrade[]>([])
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [restoringDraft, setRestoringDraft] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [confirmSubmission, setConfirmSubmission] = useState(false)
  const [programs, setPrograms] = useState<WizardProgram[]>([])
  const [intakes, setIntakes] = useState<WizardIntake[]>([])
  const isSavingRef = useRef(false)
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

  const { data: programsData } = catalogData.usePrograms()
  const { data: intakesData } = catalogData.useIntakes()
  const { data: subjectsData } = catalogData.useSubjects()
  const subjects = useMemo(
    () => mergeWizardSubjects((subjectsData?.subjects as Array<{ id: string; name: string; code: string }> | undefined) || []),
    [subjectsData]
  )
  const createApplication = applicationsData.useCreate()
  const updateApplication = applicationsData.useUpdate()
  const syncGrades = applicationsData.useSyncGrades()
  const { data: draftApplications } = applicationsData.useList({ status: 'draft', mine: true, pageSize: 1 })

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
    uploadedFiles,
    handleResultSlipUpload: baseHandleResultSlipUpload,
    handleExtraKycUpload: baseHandleExtraKycUpload,
    handleResultSlipFile: baseHandleResultSlipFile,
    handleExtraKycFile,
    startUpload,
    trackUploadTask
  } = useApplicationFileUploads({
    userId: user?.id,
    applicationId,
    onValidationError: setError,
    onValidationClear: clearValidationError
  })

  const handleResultSlipUpload = useCallback((file: File | null) => {
    if (!file) {
      baseHandleResultSlipFile(null)
      return
    }

    baseHandleResultSlipUpload({ target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>, async (uploadedFile, url) => {
      if (!applicationId) return
      
      showInfo('Processing document...', 'Extracting grades from your result slip')
      
      try {
        const { autoFillService } = await import('@/utils/smart-features')
        const parsed = await autoFillService.extractDataFromFile(uploadedFile, 'grade12')
        
        if (!parsed || !parsed.grades || parsed.grades.length === 0) {
          showWarning('No grades detected. Please enter them manually.')
          await updateApplication.mutateAsync({ id: applicationId, data: { result_slip_url: url } })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          return
        }
        
        const gradesToSync = parsed.grades
          .map((g: { subject?: unknown; grade?: unknown }) => ({
            subject_id: findBestSubjectId(g.subject?.toString() || '', subjects) || '',
            grade: Number(g.grade) || 0
          }))
          .filter((g: { subject_id: string; grade: number }) => g.subject_id && g.grade > 0)
          
        if (gradesToSync.length === 0) {
          showWarning('Could not match subjects. Please enter grades manually.')
          await updateApplication.mutateAsync({ id: applicationId, data: { result_slip_url: url } })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          return
        }
        
        await syncGrades.mutateAsync({ id: applicationId, grades: gradesToSync })
        await updateApplication.mutateAsync({ id: applicationId, data: { result_slip_url: url } })
        setSelectedGrades(gradesToSync)
        queryClient.invalidateQueries({ queryKey: ['applications'] })
        showSuccess(`Auto-filled ${gradesToSync.length} grades successfully!`)
      } catch (e) {
        console.error('Auto-fill error:', e)
        showWarning('Auto-fill failed. Please enter grades manually.')
        await updateApplication.mutateAsync({ id: applicationId, data: { result_slip_url: url } })
        queryClient.invalidateQueries({ queryKey: ['applications'] })
      }
    })
  }, [baseHandleResultSlipUpload, baseHandleResultSlipFile, applicationId, subjects, syncGrades, updateApplication, queryClient, showSuccess, showInfo, showWarning])

  const preserveDraftBeforeAuthRedirect = useCallback(() => {
    const now = new Date().toISOString()
    const draftSnapshot = {
      formData: getValues(),
      selectedGrades,
      currentStep: currentStepConfig.id,
      currentStepKey: currentStepConfig.key,
      applicationId,
      savedAt: now,
      userId: user?.id,
      version: 2,
    }

    try {
      localStorage.setItem('applicationWizardDraft', JSON.stringify(draftSnapshot))
      sessionStorage.setItem('mihas:post-auth-redirect', `${location.pathname}${location.search}${location.hash}`)
      window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draftSnapshot }))
    } catch {
      // best effort local persistence before auth redirect
    }
  }, [
    applicationId,
    currentStepConfig.id,
    currentStepConfig.key,
    getValues,
    location.hash,
    location.pathname,
    location.search,
    selectedGrades,
    user?.id,
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
        const sessionResult = await apiClient.request<{ user?: { id?: string } }>('/auth/session/')
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
          await apiClient.request('/auth/refresh/', { method: 'POST' })
          const refreshedSession = await apiClient.request<{ user?: { id?: string } }>('/auth/session/')
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
        // Preserve form data to localStorage before unload (Req 10.4)
        try {
          const formData = getValues()
          const draft = {
            formData,
            selectedGrades,
            currentStep: currentStepConfig.id,
            currentStepKey: currentStepConfig.key,
            applicationId,
            savedAt: new Date().toISOString(),
            userId: user?.id,
            version: 2
          }
          localStorage.setItem('applicationWizardDraft', JSON.stringify(draft))
        } catch {
          // best effort
        }
        event.preventDefault()
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentStepIndex, success, getValues, selectedGrades, currentStepConfig, applicationId, user?.id])

  useEffect(() => {
    const handleAuthRedirect = () => {
      preserveDraftBeforeAuthRedirect()
    }

    window.addEventListener('mihas:before-auth-redirect', handleAuthRedirect)
    return () => window.removeEventListener('mihas:before-auth-redirect', handleAuthRedirect)
  }, [preserveDraftBeforeAuthRedirect])

  const { completionPercentage, missingFields, hasAutoPopulatedData } = useProfileAutoPopulation(setValue as (field: string, value: string) => void)

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
      
      const fullName = getBestValue(profile?.full_name, metadata.full_name, email.split('@')[0] || '')
      const phone = getBestValue(profile?.phone, metadata.phone, '')
      const dateOfBirth = normalizeDateInputValue(
        getBestValue(profile?.date_of_birth, metadata.date_of_birth, '')
      )
      const sex = getBestValue(profile?.sex, metadata.sex, '')
      const residenceTown = getCanonicalResidenceTown(profile, metadata)
      const residenceCountry = getCanonicalResidenceCountry(profile, metadata)
      const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
      const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
      const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')

      if (email) setValue('email', email)
      if (fullName) setValue('full_name', fullName)
      if (phone) setValue('phone', phone)
      if (dateOfBirth) setValue('date_of_birth', dateOfBirth)
      if (sex) setValue('sex', sex as 'Male' | 'Female')
      if (residenceTown) setValue('residence_town', normalizeResidenceTown(residenceTown))
      if (residenceCountry) setValue('country', residenceCountry)
      if (nationality) setValue('nationality', nationality)
      if (nextOfKinName) setValue('next_of_kin_name', nextOfKinName)
      if (nextOfKinPhone) setValue('next_of_kin_phone', nextOfKinPhone)
    }
  }, [user, profile, authLoading, setValue, restoringDraft, draftLoaded])

  useEffect(() => {
    const loadDraft = async () => {
      if (!user || authLoading || draftLoaded) return
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
          // Restore from localStorage
            // 3.2: Restore form values with shouldValidate: false to prevent validation errors
            Object.keys(localDraft.formData).forEach(key => {
              const rawValue = localDraft.formData[key]
              const value = key === 'date_of_birth'
                ? normalizeDateInputValue(rawValue)
                : key === 'paid_at'
                  ? normalizeDateTimeLocalValue(rawValue)
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
              }
            }
            
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
            
            if (localDraft.applicationId) {
              setApplicationId(localDraft.applicationId)
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

          // 3.1: ALWAYS restore step - removed currentStepIndex === 0 condition
          let stepId = 1
          if (app.program && app.full_name) {
            stepId = 2
            if (app.result_slip_url) {
              stepId = 3
            }
          }
          const index = getStepIndexById(stepId)
          setCurrentStepIndex(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))

          draftRestored = true
          
          // Update localStorage to match server state for future reconciliation
          const syncDraft = {
            formData: getValues(),
            selectedGrades,
            currentStep: stepId,
            currentStepKey: wizardSteps[Math.min(stepId - 1, wizardSteps.length - 1)]?.key,
            applicationId: app.id,
            savedAt: app.updated_at || app.created_at || new Date().toISOString(),
            userId: user.id,
            version: 2
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

    // Only load draft on initial mount when user is available
    if (user && !authLoading && !draftLoaded) {
      loadDraft()
    }
  }, [
    user,
    authLoading,
    draftLoaded,
    setValue,
    draftApplications,
    location.search,
    location.state,
    totalSteps,
    findProgramId,
    programsData,
    showSuccess
  ])

  const saveDraft = useCallback(async () => {
    if (!user || restoringDraft || success) return
    
    // Prevent concurrent saves
    if (isSavingRef.current) return
    
    try {
      isSavingRef.current = true
      setIsDraftSaving(true)
      
      const formData = getValues()
      const now = new Date().toISOString()
      const draft = {
        formData,
        selectedGrades,
        currentStep: currentStepConfig.id,
        currentStepKey: currentStepConfig.key,
        applicationId,
        savedAt: now,
        userId: user.id,
        version: 2
      }

      // Always save to localStorage first for reliability (works offline)
      try {
        localStorage.setItem('applicationWizardDraft', JSON.stringify(draft))
        sessionStorage.removeItem('applicationWizardDraft')
        window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draft }))
      } catch (error) {
        console.error('Error saving draft:', { error: sanitizeForLog(toError(error).message) })
      }

      if (!applicationId && navigator.onLine && canCreateServerDraft(formData)) {
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
          const normalizedInstitution = resolveInstitutionCode(institutionLabel)
          const institutionId =
            selectedProgramDetails?.institutions?.id || normalizedInstitution
          const { generateApplicationNumber } = await import('@/lib/applicationNumberGenerator')

          const applicationNumber = generateApplicationNumber({ institution: normalizedInstitution })
          const trackingCode = `TRK${Math.random().toString(36).substring(2, 8).toUpperCase()}`
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
              applicationNumber,
              trackingCode,
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
              applicationNumber: app.application_number || applicationNumber,
              trackingCode: String(app.public_tracking_code || trackingCode),
              program: resolvedProgram.label,
              institution: institutionLabel,
              intake: resolvedIntake.label,
              fullName: formData.full_name,
              email: formData.email,
              phone: formData.phone,
              status: app.status || 'draft',
              paymentStatus: app.payment_status ?? prev?.paymentStatus ?? null,
            }))

            queryClient.invalidateQueries({ queryKey: ['applications'] })
            window.dispatchEvent(new CustomEvent('applicationCreated', { detail: { applicationId: app.id, source: 'autosave' } }))
          }
        } catch (serverError) {
          logApiError('application-wizard', 'POST /applications/', serverError)
          console.warn('Server draft create failed, local draft retained:', sanitizeForLog(toError(serverError).message))
        }
      }

      // Persist to server via API if we have an applicationId and are online
      // This is non-blocking — local draft is retained on failure and retried next interval
      if (applicationId && navigator.onLine) {
        try {
          await applicationService.update(applicationId, {
            full_name: formData.full_name || undefined,
            nrc_number: formData.nrc_number || undefined,
            passport_number: formData.passport_number || undefined,
            date_of_birth: formData.date_of_birth || undefined,
            sex: formData.sex?.toLowerCase() || undefined,
            phone: formData.phone || undefined,
            email: formData.email || undefined,
            residence_town: normalizeResidenceTown(formData.residence_town) || undefined,
            country: formData.country || DEFAULT_RESIDENCE_COUNTRY,
            nationality: formData.nationality || undefined,
            next_of_kin_name: formData.next_of_kin_name || undefined,
            next_of_kin_phone: formData.next_of_kin_phone || undefined,
          } as Partial<Application>)
        } catch (serverError) {
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
    currentStepConfig,
    applicationId,
    getValues,
    profile?.nationality,
    deriveInstitutionLabel,
    selectedProgramDetails,
    resolveInstitutionCode,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    createApplication,
    queryClient,
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
      next[index] = { ...next[index]!, [field]: value }
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

  const getPaymentTarget = useCallback(async () => {
    return 'Processed via Lenco payment gateway'
  }, [])

  const goToStep = useCallback((index: number) => {
    setCurrentStepIndex(Math.min(Math.max(index, 0), totalSteps - 1))
  }, [totalSteps])

  const handleNextStep = useCallback(async () => {
    saveDraft()

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
        const normalizedInstitution = resolveInstitutionCode(institutionLabel)
        const institutionId = selectedProgramDetails?.institutions?.id || normalizedInstitution
        
        // Check for duplicate applications (only for new applications)
        if (!applicationId) {
          const { checkDuplicateApplication } = await import('@/lib/duplicateApplicationCheck')
          const duplicateCheck = await checkDuplicateApplication(
            user!.id,
            resolvedProgram.id,
            resolvedIntake.id
          )
          
          if (duplicateCheck.hasDuplicate) {
            setError(duplicateCheck.message || 'Duplicate application found')
            showError(duplicateCheck.message || 'You already have an application for this program and intake')
            setLoading(false)
            return
          }
        }

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
              phone: formData.phone,
              email: formData.email,
              residence_town: normalizeResidenceTown(formData.residence_town),
              country: formData.country || country,
              next_of_kin_name: formData.next_of_kin_name || null,
              next_of_kin_phone: formData.next_of_kin_phone || null,
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
            phone: formData.phone,
            status: updatedApp?.status || 'draft',
            paymentStatus: updatedApp?.payment_status ?? prev?.paymentStatus ?? null
          }))
          
          // Invalidate cache and notify dashboard
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          window.dispatchEvent(new CustomEvent('applicationUpdated', { detail: { applicationId } }))
        } else {
          // Create new application
          const { generateApplicationNumber } = await import('@/lib/applicationNumberGenerator')
          const applicationNumber = generateApplicationNumber({ institution: normalizedInstitution })
          const trackingCode = `TRK${Math.random().toString(36).substring(2, 8).toUpperCase()}`

          const metadata = getUserMetadata(user)
          const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
          const country = getCanonicalResidenceCountry(profile, metadata)

          const app = await createApplication.mutateAsync({
            application_number: applicationNumber,
            public_tracking_code: trackingCode,
            full_name: sanitizeInput(formData.full_name),
            nrc_number: sanitizeInput(formData.nrc_number) || null,
            passport_number: sanitizeInput(formData.passport_number) || null,
            date_of_birth: formData.date_of_birth,
            sex: formData.sex?.toLowerCase(),
            phone: sanitizeInput(formData.phone),
            email: sanitizeInput(formData.email),
            residence_town: normalizeResidenceTown(formData.residence_town),
            country: sanitizeInput(formData.country) || country,
            next_of_kin_name: sanitizeInput(formData.next_of_kin_name) || null,
            next_of_kin_phone: sanitizeInput(formData.next_of_kin_phone) || null,
            program: resolvedProgram.label,
            intake: resolvedIntake.name,
            institution: institutionLabel,
            nationality: nationality,
            status: 'draft'
          })

          if (!app?.id) {
            throw new Error('Application created but ID not returned')
          }

          setApplicationId(app.id)
          setSubmittedApplication({
            applicationNumber,
            trackingCode,
            program: programName,
            institution: institutionLabel,
            intake: resolvedIntake.label,
            fullName: formData.full_name,
            email: formData.email,
            phone: formData.phone,
            status: 'draft',
            paymentStatus: null
          })
          
          // Invalidate cache and notify dashboard
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          window.dispatchEvent(new CustomEvent('applicationCreated', { detail: { applicationId: app.id } }))
        }
        
        goToStep(currentStepIndex + 1)
      } catch (error) {
        logApiError('application-wizard', '/applications/', error)
        let errorMessage = toError(error).message || 'Failed to save application'
        
        // Handle 404 for unavailable programs/intakes (Req 6.5)
        const errorStatus = (error as { status?: number })?.status
        if (errorStatus === 404) {
          errorMessage = 'The selected program or intake is no longer available. Please select a different option.'
        } else if (errorMessage.includes('Bad Request')) {
          errorMessage = 'Connection issue - please try again'
        }
        
        // Map Django field-level validation errors to wizard display (Req 6.3)
        const fieldErrors = (error as { fieldErrors?: Record<string, string> })?.fieldErrors
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          errorMessage = Object.entries(fieldErrors)
            .map(([field, msg]) => {
              const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
              return `${label}: ${msg}`
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
      if (!applicationId) {
        const errorMessage = 'Application not created. Returning to Basic Information step.'
        setError(errorMessage)
        showError(errorMessage)
        goToStep(0)
        return
      }
      
      if (selectedGrades.length < 5) {
        const errorMessage = 'Minimum 5 subjects required'
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
        if (selectedGrades.length > 0) {
          await syncGrades.mutateAsync({ id: applicationId, grades: selectedGrades })
          queryClient.invalidateQueries({ queryKey: ['applications'] })
        }
        goToStep(currentStepIndex + 1)
      } catch (error) {
        const errorMessage = toError(error).message || 'Failed to save grades'
        logApiError('application-wizard', `/applications/${applicationId}/grades/`, error)
        setError(errorMessage)
      }
      return
    }

    if (currentStepConfig.key === 'payment') {
      if (!applicationId) {
        showError('Application not found. Please go back to step 1.')
        return
      }
      
      // Payment is handled by the Lenco widget in PaymentStep.
      // Just advance to the next step.
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
    programIds,
    intakeIds,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    showError
  ])

  const handlePrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      saveDraft()
      goToStep(currentStepIndex - 1)
    }
  }, [currentStepIndex, goToStep, saveDraft])

  const handleSubmitApplication = useCallback(async (data: WizardFormData) => {
    logger.info('[handleSubmitApplication] Starting submission...')
    // Prevent double-click on submit (Req 8.3)
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true

    if (!confirmSubmission) {
      const errorMessage = 'Please confirm that all information is accurate before submitting'
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
      
      logger.info('[handleSubmitApplication] Verifying authentication...')
      if (!user?.id) {
        throw new Error('Please sign in again to submit your application')
      }

      // Payment is handled by Lenco widget — just submit the application
      logger.info('[handleSubmitApplication] Finalizing submission...')
      const updateData = {
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }
      
      
      const updatedApp = await updateApplication.mutateAsync({
        id: applicationId,
        data: updateData as unknown as ApplicationUpdateData
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

      try {
        clearAllDraftData()
        const deleteResult = await draftManager.clearAllDrafts(user.id)
        if (!deleteResult.success) {
        }
      } catch (cleanupError) {
      }

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
      logApiError('application-wizard', `/applications/${applicationId}/`, error)
      let message = toError(error).message || 'Failed to submit application'
      
      // Handle 404 for unavailable programs/intakes (Req 6.5)
      const errorStatus = (error as { status?: number })?.status
      if (errorStatus === 404) {
        message = 'The selected program or intake is no longer available. Please go back and select a different option.'
      } else if (message.includes('Bad Request')) {
        message = 'Connection issue - please try again'
      }
      
      // Map Django field-level validation errors (Req 6.3)
      const fieldErrors = (error as { fieldErrors?: Record<string, string> })?.fieldErrors
      if (fieldErrors && Object.keys(fieldErrors).length > 0) {
        message = Object.entries(fieldErrors)
          .map(([field, msg]) => {
            const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            return `${label}: ${msg}`
          })
          .join('; ')
      }
      
      setError(message)
      showError(message)
    } finally {
      setLoading(false)
      isSubmittingRef.current = false
    }
  }, [confirmSubmission, applicationId, startUpload, updateApplication, user?.id, showError, showSuccess])

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
    uploadedFiles,
    isDraftSaving,
    draftSaved,
    draftLoaded,
    submittedApplication,
    applicationId,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    dismissSlipProgress,
    handleResultSlipUpload,
    handleExtraKycUpload: handleExtraKycFile,
    getPaymentTarget,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    saveDraft,
    watchValues: watch,
    goToStep
  }
}

export default useWizardController
