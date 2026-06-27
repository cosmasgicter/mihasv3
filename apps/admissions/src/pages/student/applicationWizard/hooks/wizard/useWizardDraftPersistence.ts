import { useCallback, useRef, type MutableRefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { UseFormSetValue } from 'react-hook-form'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { logger } from '@/lib/logger'
import { sanitizeForLog } from '@/lib/security'
import { applicationService } from '@/services/applications'
import { isApplicationMissingError } from '@/lib/applicationSession'
import { cachedRemoveItem, cachedSetItem } from '@/lib/localStorageCache'
import { getLegacyWizardDraftStorageKey, getWizardDraftStorageKey } from '@/lib/draftStorageKeys'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import {
  getCanonicalResidenceCountry,
  normalizeDateInputValue,
} from '@/lib/profileFieldMapping'
import { getBestValue, getUserMetadata, normalizeSexForWizard } from '@/hooks/useProfileAutoPopulation'
import { useDraftStore } from '@/stores/draftStore'
import type { Application } from '@/types/database'
import type { User } from '@/types/auth'
import {
  mergeDraftResumeUploads,
  resolveDraftResumeStepId,
} from '../../lib/draftResume'
import {
  buildDuplicateDraftConflictDecision,
  buildServerDraftPayload,
  canCreateServerDraft,
  shouldClearDuplicateDraftConflict,
} from '../../lib/draftAutosave'
import type { SubjectGrade, WizardFormData, WizardProgram } from '../../types'
import type { ApplicationFileType } from '../useApplicationFileUploads'
import type { ApplicationCreateData } from '@/data/applications'
import { getStepIndexById, wizardSteps } from '../../steps/config'
import {
  sanitizePhoneInput,
  isAuthSaveError,
  type SaveDraftOptions,
  type ResolvedIntakeIdentity,
} from './wizardControllerUtils'

import type { SubmittedApplicationSummary } from '../useApplicationSlip'

export interface DuplicateDraftConflict {
  existingId: string | null
  program: string
  intake: string
  message: string
}

export interface UseWizardDraftPersistenceParams {
  user: User | null | undefined
  profile: { nationality?: string | null } | null | undefined
  restoringDraft: boolean
  success: boolean
  applicationId: string | null
  uploadedFiles: Record<string, boolean>
  currentStepConfig: { id: number; key: string }
  paymentStatus: string | null
  selectedGradesRef: MutableRefObject<SubjectGrade[]>
  selectedProgramDetails: WizardProgram | undefined
  programsData: { programs?: unknown[] } | undefined
  totalSteps: number
  form: {
    getValues: () => WizardFormData
    setValue: UseFormSetValue<WizardFormData>
  }
  setApplicationId: React.Dispatch<React.SetStateAction<string | null>>
  setRestoringDraft: (value: boolean) => void
  setDraftLoaded: (value: boolean) => void
  setDuplicateDraftConflict: (value: DuplicateDraftConflict | null) => void
  setGradesHydrating: (value: boolean) => void
  setError: (message: string) => void
  setIsDraftSaving: (value: boolean) => void
  setDraftSaved: (value: boolean) => void
  setSubmittedApplication: React.Dispatch<React.SetStateAction<SubmittedApplicationSummary | null>>
  markUploadedFile: (key: ApplicationFileType, value: boolean) => void
  restorePaymentStatus: (status?: string | null) => void
  showSuccess: (message: string) => void
  showWarning: (message: string) => void
  findProgramId: (value?: string | null, institutionHint?: string | null, programList?: WizardProgram[]) => string
  deriveInstitutionLabel: (institution?: WizardProgram['institutions']) => string
  resolveProgramIdentity: (value?: string | null, institutionHint?: string | null) => { id: string; label: string; institutionLabel: string } | null
  resolveIntakeIdentity: (value?: string | null) => ResolvedIntakeIdentity | null
  createApplication: { mutateAsync: (data: ApplicationCreateData) => Promise<Application | null> }
  goToStep: (index: number) => void
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
  hydrateServerGrades: (draftApplicationId: string) => Promise<SubjectGrade[]>
  hydrateServerDocuments: (draftApplicationId: string) => Promise<Record<string, boolean>>
}

function persistWizardDraftSnapshot(snapshot: Record<string, unknown>, userId?: string | null, applicationId?: string | null) {
  cachedSetItem(getWizardDraftStorageKey(userId, applicationId), JSON.stringify(snapshot))
  if (applicationId) {
    cachedRemoveItem(getWizardDraftStorageKey(userId, null))
  }
  cachedRemoveItem(getLegacyWizardDraftStorageKey())
  sessionStorage.removeItem(getLegacyWizardDraftStorageKey())
}

export function useWizardDraftPersistence(params: UseWizardDraftPersistenceParams) {
  const {
    user,
    profile,
    restoringDraft,
    success,
    applicationId,
    uploadedFiles,
    currentStepConfig,
    paymentStatus,
    selectedGradesRef,
    selectedProgramDetails,
    programsData,
    totalSteps,
    form,
    setApplicationId,
    setRestoringDraft,
    setDraftLoaded,
    setDuplicateDraftConflict,
    setGradesHydrating,
    setError,
    setIsDraftSaving,
    setDraftSaved,
    setSubmittedApplication,
    markUploadedFile,
    restorePaymentStatus,
    showSuccess,
    showWarning,
    findProgramId,
    deriveInstitutionLabel,
    resolveProgramIdentity,
    resolveIntakeIdentity,
    createApplication,
    goToStep,
    clearStaleApplicationReference,
    hydrateServerGrades,
    hydrateServerDocuments,
  } = params

  const { getValues, setValue } = form
  const queryClient = useQueryClient()
  const isSavingRef = useRef(false)
  const pendingSaveRef = useRef(false)
  const createBlockedRef = useRef(false)
  const duplicateConflictRef = useRef<DuplicateDraftConflict | null>(null)

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
      persistWizardDraftSnapshot(draftSnapshot, user?.id, applicationId)
      useDraftStore.getState().markSaved(draftSnapshot)
      window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draftSnapshot }))
    } catch {
      // best effort local persistence
    }

    return draftSnapshot
  }, [applicationId, currentStepConfig.id, currentStepConfig.key, getValues, paymentStatus, uploadedFiles, user?.id])

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
      setValue('sex', normalizeSexForWizard(draft.sex) as WizardFormData['sex'], { shouldValidate: false })
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
      const restoredUploads = mergeDraftResumeUploads(draft, hydratedServerUploads)
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
      goToStep(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))

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
        persistWizardDraftSnapshot(syncDraft, user?.id, resolvedDraftId)
        useDraftStore.getState().markSaved(syncDraft)
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
    goToStep,
    hydrateServerDocuments,
    hydrateServerGrades,
    markUploadedFile,
    programsData?.programs,
    restorePaymentStatus,
    setApplicationId,
    setDraftLoaded,
    setError,
    setGradesHydrating,
    setRestoringDraft,
    setValue,
    showSuccess,
    totalSteps,
    user?.email,
    user?.id,
  ])

  const saveDraft = useCallback(async (options: SaveDraftOptions = {}) => {
    if (!user || restoringDraft || success) return
    const syncServer = options.syncServer ?? true
    
    // Prevent concurrent saves -- queue a follow-up instead of dropping
    if (isSavingRef.current) {
      pendingSaveRef.current = true
      return
    }
    
    try {
      isSavingRef.current = true
      setIsDraftSaving(true)
      
      const formData = getValues()
      const activeConflict = duplicateConflictRef.current
      if (shouldClearDuplicateDraftConflict(activeConflict, formData)) {
        duplicateConflictRef.current = null
        createBlockedRef.current = false
        setDuplicateDraftConflict(null)
        setError('')
      }

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
        persistWizardDraftSnapshot(draft, user.id, applicationId)
        useDraftStore.getState().markSaved(draft)
        window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draft }))
      } catch (error) {
        logger.error('Error saving draft:', { error: sanitizeForLog(toError(error).message) })
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
            resolvedProgram.institutionLabel || deriveInstitutionLabel(selectedProgramDetails?.institutions) || 'Beanola Admissions'
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
              programId: resolvedProgram.id,
              intakeId: resolvedIntake.id,
            })
          )

          if (app?.id) {
            duplicateConflictRef.current = null
            createBlockedRef.current = false
            setDuplicateDraftConflict(null)
            setApplicationId(app.id)
            const draftWithId = {
              ...draft,
              applicationId: app.id,
            }

            try {
              persistWizardDraftSnapshot(draftWithId, user.id, app.id)
              useDraftStore.getState().markSaved(draftWithId)
              window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: draftWithId }))
            } catch {
              // Non-critical localStorage refresh
            }

            setSubmittedApplication(prev => ({
              applicationNumber: app.application_number || prev?.applicationNumber || '',
              trackingCode: String(app.public_tracking_code || prev?.trackingCode || ''),
              program: app.program || resolvedProgram.label,
              institution: app.institution || institutionLabel,
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
          // 409 = duplicate application exists for this program+intake. Do not
          // silently adopt the existing id: that converts a new-application
          // intent into a resume operation without the student's consent.
          const errStatus = (serverError as { status?: number })?.status
          if (errStatus === 409) {
            const errBody = (serverError as { data?: { existing_id?: string } })?.data
            const existingId = errBody?.existing_id
            createBlockedRef.current = true
            const conflict = buildDuplicateDraftConflictDecision({
              existingId: typeof existingId === 'string' ? existingId : null,
              program: String(formData.program || ''),
              intake: String(formData.intake || ''),
            })
            duplicateConflictRef.current = conflict
            setError(conflict.message)
            setDuplicateDraftConflict(conflict)
            showWarning(conflict.message)
            logger.info('[saveDraft] Duplicate application exists; explicit student choice required before reusing it')
          } else {
            logApiError('application-wizard', 'POST /applications/', serverError)
            logger.warn('Server draft create failed, local draft retained:', sanitizeForLog(toError(serverError).message))
          }
        }
      }

      // Persist to server via API if we have an applicationId and are online
      // This is non-blocking -- local draft is retained on failure and retried next interval
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
      // Process queued save if one was requested while we were saving
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false
        void saveDraft(options)
      }
    }
  }, [
    user,
    restoringDraft,
    success,
    uploadedFiles,
    currentStepConfig,
    applicationId,
    getValues,
    paymentStatus,
    selectedGradesRef,
    profile?.nationality,
    deriveInstitutionLabel,
    selectedProgramDetails,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    createApplication,
    queryClient,
    clearStaleApplicationReference,
    setError,
    setApplicationId,
    setIsDraftSaving,
    setDraftSaved,
    setDuplicateDraftConflict,
    setSubmittedApplication,
    showWarning,
  ])

  return {
    persistLocalDraftSnapshot,
    handleLoadDraft,
    saveDraft,
  }
}
