import { useEffect } from 'react'
import type { UseFormSetValue, UseFormGetValues } from 'react-hook-form'
import { normalizeSexForWizard } from '@/hooks/useProfileAutoPopulation'
import { sanitizeForLog } from '@/lib/security'
import { toError } from '@/lib/toError'
import { logger } from '@/lib/logger'
import { clearAllDraftData, isDraftDeleted, clearDraftDeletedFlag } from '@/lib/draftManager'
import { applicationSessionManager } from '@/lib/applicationSession'
import { cachedGetItem, cachedSetItem, cachedRemoveItem } from '@/lib/localStorageCache'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import { normalizeDateInputValue } from '@/lib/profileFieldMapping'
import type { User } from '@/types/auth'
import { mergeDraftResumeUploads, resolveDraftResumeStepId } from '../../lib/draftResume'
import type { SubjectGrade, WizardFormData, WizardProgram } from '../../types'
import { getStepIndexById, wizardSteps } from '../../steps/config'
import type { ApplicationFileType } from '../useApplicationFileUploads'

interface DraftApplicationsData {
  applications?: unknown[]
}

interface UseWizardDraftLoaderParams {
  user: User | null
  authLoading: boolean
  draftLoaded: boolean
  draftApplicationsLoading: boolean
  draftApplications: DraftApplicationsData | undefined
  locationSearch: string
  totalSteps: number
  programsData: { programs?: unknown[] } | undefined
  setValue: UseFormSetValue<WizardFormData>
  getValues: UseFormGetValues<WizardFormData>
  setRestoringDraft: (value: boolean) => void
  setDraftLoaded: (value: boolean) => void
  setApplicationId: (value: string | null) => void
  setSelectedGrades: (value: SubjectGrade[]) => void
  setGradesHydrating: (value: boolean) => void
  goToStep: (index: number) => void
  markUploadedFile: (key: ApplicationFileType, value: boolean) => void
  restorePaymentStatus: (status: string | null | undefined) => void
  showSuccess: (message: string) => void
  findProgramId: (value?: string | null, institutionHint?: string | null, programList?: WizardProgram[]) => string
  hydrateServerGrades: (applicationId: string) => Promise<SubjectGrade[]>
  hydrateServerDocuments: (applicationId: string) => Promise<Record<string, boolean>>
}

/**
 * Handles initial draft loading on wizard mount. Reconciles local (localStorage)
 * and server drafts by timestamp, restoring the most recent one.
 */
export function useWizardDraftLoader({
  user,
  authLoading,
  draftLoaded,
  draftApplicationsLoading,
  draftApplications,
  locationSearch,
  totalSteps,
  programsData,
  setValue,
  getValues,
  setRestoringDraft,
  setDraftLoaded,
  setApplicationId,
  setSelectedGrades,
  setGradesHydrating,
  goToStep,
  markUploadedFile,
  restorePaymentStatus,
  showSuccess,
  findProgramId,
  hydrateServerGrades,
  hydrateServerDocuments,
}: UseWizardDraftLoaderParams) {
  useEffect(() => {
    const loadDraft = async () => {
      if (!user || authLoading || draftLoaded || draftApplicationsLoading) return
      setRestoringDraft(true)
      let draftRestored = false

      const params = new URLSearchParams(locationSearch)
      const wantsFreshApplication = params.get('new') === 'true' || params.get('fresh') === '1'
      if (wantsFreshApplication) {
        try {
          clearAllDraftData()
        } catch {
          /* noop */
        }
        setRestoringDraft(false)
        setDraftLoaded(true)
        return
      }

      try {
        if (isDraftDeleted()) {
          clearDraftDeletedFlag()
          setRestoringDraft(false)
          setDraftLoaded(true)
          return
        }

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

        const draft = await applicationSessionManager.getLocalWizardDraft(user.id)
        if (draft && draft.formData && draft.version === 2) {
          localDraft = draft as unknown as LocalDraftShape
          localTimestamp = draft.savedAt ? new Date(draft.savedAt) : null
        } else if (cachedGetItem('applicationWizardDraft')) {
          cachedRemoveItem('applicationWizardDraft')
        }

        sessionStorage.removeItem('applicationWizardDraft')

        if (draftApplications?.applications && draftApplications.applications.length > 0) {
          serverApp = draftApplications.applications[0] as unknown as ServerDraftShape
          serverTimestamp = serverApp.updated_at ? new Date(serverApp.updated_at) :
                          (serverApp.created_at ? new Date(serverApp.created_at) : null)
        }

        const useLocalDraft = (() => {
          if (localDraft && !serverApp) return true
          if (!localDraft && serverApp) return false
          if (!localDraft && !serverApp) return false
          if (localTimestamp && serverTimestamp) {
            return localTimestamp.getTime() >= serverTimestamp.getTime()
          }
          return true
        })()

        if (useLocalDraft && localDraft) {
          let localApplicationId = typeof localDraft.applicationId === 'string' ? localDraft.applicationId : null

          // Backfill any identity field the local snapshot is missing/blank from
          // the server draft (the authoritative persisted record). A partial
          // local autosave (e.g. saved before profile auto-populate finished)
          // must never strip fields that were already saved server-side.
          if (serverApp) {
            const fd = localDraft.formData
            const fillFromServer = (key: keyof ServerDraftShape) => {
              const local = fd[key]
              const hasLocal = typeof local === 'string' ? local.trim() !== '' : local != null
              const serverVal = serverApp?.[key]
              if (!hasLocal && typeof serverVal === 'string' && serverVal.trim() !== '') {
                fd[key] = serverVal
              }
            }
            ;([
              'full_name', 'nrc_number', 'passport_number', 'date_of_birth', 'sex',
              'phone', 'email', 'residence_town', 'country', 'nationality',
              'next_of_kin_name', 'next_of_kin_phone', 'program', 'intake',
            ] as (keyof ServerDraftShape)[]).forEach(fillFromServer)
          }

          Object.keys(localDraft.formData).forEach(key => {
            const rawValue = localDraft.formData[key]
            const value = key === 'date_of_birth'
              ? normalizeDateInputValue(rawValue)
              : key === 'sex'
                ? normalizeSexForWizard(rawValue as string)
                : key === 'residence_town'
                  ? normalizeResidenceTown(String(rawValue ?? ''))
                  : rawValue
            if (value !== undefined && value !== null && value !== '') {
              setValue(key as keyof WizardFormData, value as WizardFormData[keyof WizardFormData], { shouldValidate: false })
            }
          })

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

          if (localDraft.formData.intake) {
            setValue('intake', localDraft.formData.intake as string, { shouldValidate: false })
          }

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
            // localStorage may be unavailable
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

          if (localDraft.currentStepKey) {
            const index = wizardSteps.findIndex(step => step.key === localDraft.currentStepKey)
            if (index >= 0) {
              goToStep(index)
            }
          } else if (typeof localDraft.currentStep === 'number') {
            const index = getStepIndexById(localDraft.currentStep)
            goToStep(index >= 0 ? index : Math.min(Math.max(localDraft.currentStep - 1, 0), totalSteps - 1))
          }

          if (localApplicationId) {
            setApplicationId(localApplicationId)
          }

          draftRestored = true
          setRestoringDraft(false)
          setDraftLoaded(true)
          showSuccess('Draft restored successfully')
          return
        } else if (serverApp) {
          const app = serverApp
          logger.info('[Draft] Restoring from database:', app.id)

          setApplicationId(app.id)
          restorePaymentStatus(app.payment_status ?? null)

          setValue('full_name', app.full_name || '', { shouldValidate: false })
          setValue('nrc_number', app.nrc_number || '', { shouldValidate: false })
          setValue('passport_number', app.passport_number || '', { shouldValidate: false })
          setValue('date_of_birth', normalizeDateInputValue(app.date_of_birth || ''), { shouldValidate: false })
          setValue('sex', normalizeSexForWizard(app.sex) as WizardFormData['sex'], { shouldValidate: false })
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
          const restoredUploads = mergeDraftResumeUploads(app, hydratedServerUploads)
          markUploadedFile('result_slip', restoredUploads.result_slip)
          markUploadedFile('extra_kyc', restoredUploads.extra_kyc)
          setGradesHydrating(true)
          let restoredGrades: SubjectGrade[]
          try {
            restoredGrades = await hydrateServerGrades(app.id)
          } finally {
            setGradesHydrating(false)
          }

          const stepId = resolveDraftResumeStepId(app, restoredGrades, restoredUploads)
          const index = getStepIndexById(stepId)
          goToStep(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))

          draftRestored = true

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
            cachedSetItem('applicationWizardDraft', JSON.stringify(syncDraft))
          } catch { /* non-critical */ }

          showSuccess('Draft restored successfully')
        }

        if (!draftRestored) {
          const stepFromQuery = new URLSearchParams(locationSearch).get('step')
          if (stepFromQuery) {
            const stepIndexFromQuery = wizardSteps.findIndex(step => step.key === stepFromQuery)
            if (stepIndexFromQuery >= 0) {
              goToStep(stepIndexFromQuery)
            }
          }
        }
      } catch (error) {
        logger.error('Error loading draft application:', { error: sanitizeForLog(toError(error).message) })
      } finally {
        setRestoringDraft(false)
        setDraftLoaded(true)
      }
    }

    if (user && !authLoading && !draftLoaded && !draftApplicationsLoading) {
      loadDraft()
    }
  }, [
    user,
    authLoading,
    draftLoaded,
    draftApplicationsLoading,
    setValue,
    getValues,
    draftApplications,
    locationSearch,
    totalSteps,
    findProgramId,
    programsData,
    hydrateServerGrades,
    hydrateServerDocuments,
    markUploadedFile,
    restorePaymentStatus,
    showSuccess,
    setRestoringDraft,
    setDraftLoaded,
    setApplicationId,
    setSelectedGrades,
    setGradesHydrating,
    goToStep,
  ])
}
