import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { connectionManager } from '@/lib/connectionFix'

import { toast } from '@/lib/toast'
import { useAuth } from '@/contexts/AuthContext'
import { applicationsData } from '@/data/applications'
import { catalogData } from '@/data/catalog'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useProfileAutoPopulation, getBestValue, getUserMetadata } from '@/hooks/useProfileAutoPopulation'
import { useApplicationSubmitFixed } from '@/hooks/useApplicationSubmitFixed'
import { useEligibilityCheckerFixed } from '@/hooks/useEligibilityCheckerFixed'
import { draftManager } from '@/lib/draftManager'
import { checkEligibility, getRecommendedSubjects } from '@/lib/eligibility'
import { createApplicationSlip } from '@/lib/slipService'
import type { ApplicationSlipData } from '@/lib/applicationSlip'
import { sanitizeForLog } from '@/lib/security'
import { getSessionToken } from '@/lib/sessionUtils'
import { supabase } from '@/lib/supabase'
import { safeJsonParse } from '@/lib/utils'
import { isDraftDeleted, clearDraftDeletedFlag } from '@/lib/draftCleanup'

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
  form: ReturnType<typeof useForm<WizardFormData>>
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
  confirmSubmission: boolean
  setConfirmSubmission: (value: boolean) => void
  resultSlipFile: File | null
  extraKycFile: File | null
  popFile: File | null
  uploadProgress: Record<string, number>
  uploadedFiles: Record<string, boolean>
  isDraftSaving: boolean
  draftSaved: boolean
  submittedApplication: SubmittedApplicationSummary | null
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  handleDownloadSlip: () => Promise<void>
  handleEmailSlip: () => Promise<void>
  handleResultSlipUpload: ReturnType<typeof useApplicationFileUploads>['handleResultSlipUpload']
  handleExtraKycUpload: ReturnType<typeof useApplicationFileUploads>['handleExtraKycUpload']
  handleProofOfPaymentUpload: ReturnType<typeof useApplicationFileUploads>['handleProofOfPaymentUpload']
  getPaymentTarget: () => string
  handleNextStep: () => Promise<void>
  handlePrevStep: () => void
  handleSubmitApplication: (data: WizardFormData) => Promise<void>
  addGrade: () => void
  removeGrade: (index: number) => void
  updateGrade: (index: number, field: keyof SubjectGrade, value: string | number) => void
  getUsedSubjects: () => string[]
  saveDraft: () => Promise<void>
  watchValues: () => WizardFormData
}

export interface PaymentValidationContext {
  formData: WizardFormData
  proofOfPaymentFile: File | null
  setError: (value: string) => void
  showError: (title: string, message?: string) => void
}

function sanitizeInput(value: any): any {
  if (typeof value === 'string') {
    return value.trim().replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]+>/g, '')
  }
  return value
}

export function validatePaymentStep({
  formData,
  proofOfPaymentFile,
  setError,
  showError
}: PaymentValidationContext): boolean {
  if (!formData.payment_method) {
    setError('')
    showError('Payment method is required')
    return false
  }

  if (!proofOfPaymentFile) {
    setError('')
    showError('Proof of payment must be uploaded before review')
    return false
  }

  if (typeof formData.amount === 'number' && Number.isFinite(formData.amount) && formData.amount < 153) {
    setError('')
    showError('Amount paid must be at least K153')
    return false
  }

  return true
}

const useWizardController = (): UseWizardControllerResult => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const { profile } = useProfileQuery()
  const showError = (message: string) => toast.error(message)
  const showWarning = (message: string) => toast.warning(message)

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
      if (exactMatches.length === 1) return exactMatches[0].id

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
        return exactMatches[0].id
      }

      // Partial name match (fallback)
      const partialMatches = list.filter(program => {
        const programName = program.name?.trim().toLowerCase() || ''
        return programName.includes(normalized) || normalized.includes(programName)
      })
      
      if (partialMatches.length === 1) return partialMatches[0].id
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

  const resolveInstitutionCode = useCallback((institutionLabel: string) => {
    const normalized = institutionLabel.trim().toLowerCase()
    if (normalized.includes('kalulushi') || normalized.includes('katc')) {
      return 'KATC'
    }
    return 'MIHAS'
  }, [])

  const totalSteps = wizardSteps.length
  const currentStepConfig = wizardSteps[currentStepIndex] ?? wizardSteps[0]
  const isLastStep = currentStepConfig.key === 'submit'

  const { data: programsData } = catalogData.usePrograms()
  const { data: intakesData } = catalogData.useIntakes()
  const { data: subjectsData } = catalogData.useSubjects()
  const subjects = subjectsData?.subjects || []
  const createApplication = applicationsData.useCreate()
  const updateApplication = applicationsData.useUpdate()
  const syncGrades = applicationsData.useSyncGrades()
  const { data: draftApplications } = applicationsData.useList({ status: 'draft', mine: true, pageSize: 1 })

  useEffect(() => {
    if (intakesData?.intakes) {
      const formattedIntakes = (intakesData.intakes as WizardIntake[]).map(intake => {
        const normalizedName = intake.name?.trim() || ''
        const yearString = Number.isFinite(intake.year) ? String(intake.year) : ''
        const includesYear = yearString && normalizedName.includes(yearString)
        const nameWithYear = includesYear ? normalizedName : `${normalizedName} ${yearString}`.trim()
        const displayName = (nameWithYear || normalizedName || yearString || 'Upcoming Intake').trim()

        return {
          ...intake,
          displayName
        }
      })

      setIntakes(formattedIntakes)
      return
    }

    setIntakes([])
  }, [intakesData])

  const programIds = useMemo(() => programs.map(program => program.id).filter(Boolean), [programs])
  const intakeOptions = useMemo(
    () => intakes.map(intake => intake.displayName).filter(Boolean),
    [intakes]
  )
  const schema = useMemo(() => createWizardSchema(programIds, intakeOptions), [programIds, intakeOptions])
  const resolver = useMemo(() => zodResolver(schema), [schema])

  const form = useForm<WizardFormData>({
    resolver,
    defaultValues: async () => {
      const { PAYMENT_CONFIG } = await import('@/config/payments')
      return {
        amount: PAYMENT_CONFIG.DEFAULT_AMOUNT,
        payment_method: PAYMENT_CONFIG.PAYMENT_METHODS[0]
      }
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
    proofOfPaymentFile: popFile,
    uploading,
    uploadProgress,
    uploadedFiles,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleProofOfPaymentUpload,
    startUpload,
    trackUploadTask
  } = useApplicationFileUploads({
    userId: user?.id,
    applicationId,
    onValidationError: setError,
    onValidationClear: clearValidationError
  })

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth/signin?redirect=/student/application-wizard')
    }
  }, [user, authLoading, navigate])

  const slipPayload: ApplicationSlipData | null = useMemo(() => {
    if (!submittedApplication || !submittedApplication.trackingCode || !submittedApplication.applicationNumber) return null
    const now = new Date().toISOString()
    return {
      public_tracking_code: submittedApplication.trackingCode,
      application_number: submittedApplication.applicationNumber,
      status: submittedApplication.status || 'submitted',
      payment_status: submittedApplication.paymentStatus || 'pending_review',
      submitted_at: submittedApplication.submittedAt || now,
      updated_at: submittedApplication.updatedAt || now,
      program_name: submittedApplication.program || null,
      intake_name: submittedApplication.intake || null,
      institution: submittedApplication.institution || null,
      full_name: submittedApplication.fullName || null,
      email: submittedApplication.email || user?.email || 'no-email@mihas.local',
      phone: submittedApplication.phone || null,
      admin_feedback: null,
      admin_feedback_date: null,
      userId: user?.id
    }
  }, [submittedApplication, user?.email, user?.id])

  const { persistingSlip, slipLoading, emailLoading, handleDownloadSlip, handleEmailSlip } = useApplicationSlip({
    submittedApplication,
    slipPayload,
    success,
    toast: { showError, showWarning },
    createApplicationSlip,
    onEmailUpdate: email => setSubmittedApplication(prev => (prev ? { ...prev, email } : prev))
  })

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentStepIndex > 0 && !success) {
        event.preventDefault()
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentStepIndex, success])

  const { completionPercentage, hasAutoPopulatedData } = useProfileAutoPopulation(setValue)

  useEffect(() => {
    const currentIntake = watch('intake')
    if (!currentIntake) return

    if (intakeOptions.length > 0 && !intakeOptions.includes(currentIntake)) {
      const fallbackIntake = intakes.find(intake => intake.name === currentIntake)
      if (fallbackIntake) {
        setValue('intake', fallbackIntake.displayName)
      }
    }
  }, [intakes, intakeOptions, setValue, watch])

  useEffect(() => {
    if (user && !authLoading && !restoringDraft && !draftLoaded) {
      const metadata = getUserMetadata(user)
      const email = user.email || ''
      
      const fullName = getBestValue(profile?.full_name, metadata.full_name, email.split('@')[0] || '')
      const phone = getBestValue(profile?.phone, metadata.phone, '')
      const dateOfBirth = getBestValue(profile?.date_of_birth, metadata.date_of_birth, '')
      const sex = getBestValue(profile?.sex, metadata.sex, '')
      const residenceTown = getBestValue(profile?.city || profile?.address, metadata.city, '')
      const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
      const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')

      if (email) setValue('email', email)
      if (fullName) setValue('full_name', fullName)
      if (phone) setValue('phone', phone)
      if (dateOfBirth) setValue('date_of_birth', dateOfBirth)
      if (sex) setValue('sex', sex as 'Male' | 'Female')
      if (residenceTown) setValue('residence_town', residenceTown)
      if (nextOfKinName) setValue('next_of_kin_name', nextOfKinName)
      if (nextOfKinPhone) setValue('next_of_kin_phone', nextOfKinPhone)
    }
  }, [user, profile, authLoading, setValue, restoringDraft, draftLoaded])

  useEffect(() => {
    const loadDraft = async () => {
      if (!user || authLoading || draftLoaded) return
      setRestoringDraft(true)
      try {
        // Check if draft was recently deleted
        if (isDraftDeleted()) {
          clearDraftDeletedFlag()
          setRestoringDraft(false)
          return
        }
        
        // Single source: localStorage only (v2)
        const savedDraft = localStorage.getItem('applicationWizardDraft')
        if (savedDraft) {
          const draft = safeJsonParse(savedDraft, null)
          if (draft && draft.formData && draft.version === 2) {
            Object.keys(draft.formData).forEach(key => {
              const value = draft.formData[key]
              if (value !== undefined && value !== null && value !== '') {
                setValue(key as keyof WizardFormData, value)
              }
            })
            if (draft.formData.program) {
              const resolvedProgramId = findProgramId(
                draft.formData.program,
                undefined,
                programsData?.programs as WizardProgram[] | undefined
              )
              if (resolvedProgramId) {
                setValue('program', resolvedProgramId, { shouldValidate: true })
              }
            }
            if (draft.selectedGrades) {
              setSelectedGrades(draft.selectedGrades)
            }
            // Only restore step if we're starting fresh (currentStepIndex is 0)
            if (currentStepIndex === 0) {
              if (draft.currentStepKey) {
                const index = wizardSteps.findIndex(step => step.key === draft.currentStepKey)
                if (index >= 0) setCurrentStepIndex(index)
              } else if (typeof draft.currentStep === 'number') {
                const index = getStepIndexById(draft.currentStep)
                setCurrentStepIndex(index >= 0 ? index : Math.min(Math.max(draft.currentStep - 1, 0), totalSteps - 1))
              }
            }
            if (draft.applicationId) {
              setApplicationId(draft.applicationId)
            }
            return
          }
          localStorage.removeItem('applicationWizardDraft')
        }
        
        // Clean up old sessionStorage drafts
        sessionStorage.removeItem('applicationWizardDraft')

        // Check database drafts as final fallback
        if (draftApplications?.applications && draftApplications.applications.length > 0) {
          const app = draftApplications.applications[0]
          setValue('full_name', app.full_name || '')
          setValue('nrc_number', app.nrc_number || '')
          setValue('passport_number', app.passport_number || '')
          setValue('date_of_birth', app.date_of_birth || '')
          setValue('sex', app.sex || '')
          setValue('phone', app.phone || '')
          setValue('email', app.email || '')
          setValue('residence_town', app.residence_town || '')
          setValue('next_of_kin_name', app.next_of_kin_name || '')
          setValue('next_of_kin_phone', app.next_of_kin_phone || '')
          if (app.program) {
            const resolvedProgramId = findProgramId(
              app.program,
              app.institution,
              programsData?.programs as WizardProgram[] | undefined
            )
            setValue('program', resolvedProgramId || app.program)
          } else {
            setValue('program', '')
          }
          setValue('intake', app.intake || '')
          setApplicationId(app.id)

          // Only restore step if we're starting fresh (currentStepIndex is 0)
          if (currentStepIndex === 0) {
            let stepId = 1
            if (app.program && app.full_name) {
              stepId = 2
              if (app.result_slip_url) {
                stepId = 3
                if (app.pop_url) stepId = 4
              }
            }
            const index = getStepIndexById(stepId)
            setCurrentStepIndex(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))
          }

          if (location.state?.continueApplication) {
            setTimeout(() => {
              setDraftSaved(true)
              setTimeout(() => setDraftSaved(false), 3000)
            }, 500)
          }
        }
      } catch (error) {
        console.error('Error loading draft application:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
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
    location.state,
    totalSteps,
    findProgramId,
    programsData
  ])

  const saveDraft = useCallback(async () => {
    if (!user || isDraftSaving || restoringDraft) return
    try {
      setIsDraftSaving(true)
      const formData = watch()
      const draft = {
        formData,
        selectedGrades,
        currentStep: currentStepConfig.id,
        currentStepKey: currentStepConfig.key,
        applicationId,
        savedAt: new Date().toISOString(),
        version: 2 // Version for migration tracking
      }

      // Single source: localStorage only
      localStorage.setItem('applicationWizardDraft', JSON.stringify(draft))
      // Clear old sessionStorage if exists
      sessionStorage.removeItem('applicationWizardDraft')

      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    } catch (error) {
      console.error('Error saving draft:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
    } finally {
      setIsDraftSaving(false)
    }
  }, [user, isDraftSaving, restoringDraft, watch, selectedGrades, currentStepConfig, applicationId])

  useEffect(() => {
    // Don't start auto-save until draft is loaded and not restoring
    if (!draftLoaded || restoringDraft) return
    
    let timeoutId: NodeJS.Timeout
    const subscription = watch(() => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        void saveDraft()
      }, 8000)
    })

    return () => {
      subscription.unsubscribe()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [saveDraft, draftLoaded, restoringDraft])

  const addGrade = useCallback(() => {
    setSelectedGrades(prev => (prev.length < 10 ? [...prev, { subject_id: '', grade: 1 }] : prev))
  }, [])

  const removeGrade = useCallback((index: number) => {
    setSelectedGrades(prev => prev.filter((_, i) => i !== index))
  }, [])

  const updateGrade = useCallback((index: number, field: keyof SubjectGrade, value: string | number) => {
    setSelectedGrades(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }, [])

  const getUsedSubjects = useCallback(() => selectedGrades.map(grade => grade.subject_id).filter(Boolean), [selectedGrades])

  // Use the fixed eligibility checker
  const { assessment: eligibilityAssessment } = useEligibilityCheckerFixed({
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
    const institutionLabel = deriveInstitutionLabel(selectedProgramDetails?.institutions)
    if (!institutionLabel) return ''

    const institutionCode = resolveInstitutionCode(institutionLabel)
    const { PAYMENT_CONFIG } = await import('@/config/payments')
    
    const target = PAYMENT_CONFIG.PAYMENT_TARGETS[institutionCode as keyof typeof PAYMENT_CONFIG.PAYMENT_TARGETS]
    if (target) {
      return `${target.name} MTN ${target.mtn}`
    }

    return `Admissions Office (${institutionLabel})`
  }, [deriveInstitutionLabel, resolveInstitutionCode, selectedProgramDetails])

  const goToStep = useCallback((index: number) => {
    setCurrentStepIndex(Math.min(Math.max(index, 0), totalSteps - 1))
  }, [totalSteps])

  const handleNextStep = useCallback(async () => {
    saveDraft()

    if (currentStepConfig.key === 'basicKyc') {
      const formData = watch()
      const requiredFields = ['full_name', 'date_of_birth', 'sex', 'phone', 'email', 'residence_town', 'program', 'intake']
      const missingFields = requiredFields.filter(field => !formData[field as keyof typeof formData])
      if (missingFields.length > 0) {
        const errorMessage = `Please fill in all required fields: ${missingFields.join(', ')}`
        setError('')
        showError(errorMessage)
        return
      }
      if (!formData.nrc_number && !formData.passport_number) {
        const errorMessage = 'Either NRC or Passport number is required'
        setError('')
        showError(errorMessage)
        return
      }
      if (formData.program && !programIds.includes(formData.program)) {
        const errorMessage = 'Please select a valid program from the list provided'
        setError('')
        showError(errorMessage)
        return
      }
      if (formData.intake && !intakeOptions.includes(formData.intake)) {
        const errorMessage = 'Please select a valid intake from the list provided'
        setError('')
        showError(errorMessage)
        return
      }

      try {
        setLoading(true)
        setError('')
        const programName = selectedProgramDetails?.name || ''
        const institutionLabel =
          deriveInstitutionLabel(selectedProgramDetails?.institutions) || 'MIHAS'
        const normalizedInstitution = resolveInstitutionCode(institutionLabel)
        
        // Check for duplicate applications (only for new applications)
        if (!applicationId) {
          const { checkDuplicateApplication } = await import('@/lib/duplicateApplicationCheck')
          const duplicateCheck = await checkDuplicateApplication(
            user.id,
            formData.program,
            formData.intake
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
          const updatedApp = await updateApplication.mutateAsync({
            id: applicationId,
            data: {
              full_name: formData.full_name,
              nrc_number: formData.nrc_number || null,
              passport_number: formData.passport_number || null,
              date_of_birth: formData.date_of_birth,
              sex: formData.sex,
              phone: formData.phone,
              email: formData.email,
              residence_town: formData.residence_town,
              next_of_kin_name: formData.next_of_kin_name || null,
              next_of_kin_phone: formData.next_of_kin_phone || null,
              program: programName || formData.program,
              intake: formData.intake,
              institution: normalizedInstitution
            }
          })

          setSubmittedApplication(prev => ({
            applicationNumber: updatedApp.application_number,
            trackingCode: updatedApp.public_tracking_code,
            program: programName || updatedApp.program,
            institution: institutionLabel,
            intake: formData.intake,
            fullName: formData.full_name,
            email: formData.email,
            phone: formData.phone,
            status: updatedApp.status || 'draft',
            paymentStatus: updatedApp.payment_status || prev?.paymentStatus || 'pending_review'
          }))
        } else {
          // Create new application
          const { generateApplicationNumber } = await import('@/lib/applicationNumberGenerator')
          const applicationNumber = generateApplicationNumber({ institution: normalizedInstitution })
          const trackingCode = `TRK${Math.random().toString(36).substring(2, 8).toUpperCase()}`

          const app = await createApplication.mutateAsync({
            application_number: applicationNumber,
            public_tracking_code: trackingCode,
            full_name: sanitizeInput(formData.full_name),
            nrc_number: sanitizeInput(formData.nrc_number) || null,
            passport_number: sanitizeInput(formData.passport_number) || null,
            date_of_birth: formData.date_of_birth,
            sex: formData.sex,
            phone: sanitizeInput(formData.phone),
            email: sanitizeInput(formData.email),
            residence_town: sanitizeInput(formData.residence_town),
            next_of_kin_name: sanitizeInput(formData.next_of_kin_name) || null,
            next_of_kin_phone: sanitizeInput(formData.next_of_kin_phone) || null,
            program: programName || formData.program,
            intake: formData.intake,
            institution: normalizedInstitution,
            status: 'draft'
          })

          if (!app?.id) {
            throw new Error('Application created but ID not returned')
          }

          setApplicationId(app.id)
          setSubmittedApplication({
            applicationNumber,
            trackingCode,
            program: programName || formData.program,
            institution: institutionLabel,
            intake: formData.intake,
            fullName: formData.full_name,
            email: formData.email,
            phone: formData.phone,
            status: 'draft',
            paymentStatus: 'pending_review'
          })
        }
        
        goToStep(currentStepIndex + 1)
      } catch (error) {
        console.error('Application save error:', error)
        let errorMessage = error instanceof Error ? error.message : 'Failed to save application'
        
        // Handle development mode - API should now return success
        if (errorMessage.includes('Bad Request')) {
          errorMessage = 'Connection issue - please try again'
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
        setError('')
        showError(errorMessage)
        return
      }
      if (selectedProgram && eligibilityCheck && !eligibilityCheck.eligible) {
      }
      if (!resultSlipFile) {
        const errorMessage = 'Result slip is required'
        setError('')
        showError(errorMessage)
        return
      }

      try {
        await trackUploadTask(async () => {
          clearValidationError()

          // Upload result slip first (required)
          const resultSlipUrl = await startUpload(resultSlipFile, 'result_slip')
          
          // Upload extra KYC if provided (optional)
          const extraKycUrl = extraKycFile ? await startUpload(extraKycFile, 'extra_kyc') : null
          if (extraKycUrl) {
          }

          // Sync grades to database
          if (selectedGrades.length > 0) {
            try {
              await syncGrades.mutateAsync({ id: applicationId, grades: selectedGrades })
            } catch (gradesError) {
            }
          }

          // Update application with document URLs
          const updateData: any = { result_slip_url: resultSlipUrl }
          if (extraKycUrl) {
            updateData.extra_kyc_url = extraKycUrl
          }
          
          await updateApplication.mutateAsync({
            id: applicationId,
            data: updateData
          })
          
        })
        goToStep(currentStepIndex + 1)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to upload education documents'
        console.error('Education step error:', error)
        setError(errorMessage)
      }
      return
    }

    if (currentStepConfig.key === 'payment') {
      const formData = watch()
      const isValid = validatePaymentStep({
        formData,
        proofOfPaymentFile: popFile,
        setError,
        showError
      })

      if (!isValid) {
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
    programIds,
    intakeOptions,
    popFile,
    showError
  ])

  const handlePrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      saveDraft()
      goToStep(currentStepIndex - 1)
    }
  }, [currentStepIndex, goToStep, saveDraft])

  const handleSubmitApplication = useCallback(async (data: WizardFormData) => {
    if (!confirmSubmission) {
      const errorMessage = 'Please confirm that all information is accurate before submitting'
      setError('')
      showError(errorMessage)
      return
    }
    if (!popFile) {
      const errorMessage = 'Proof of payment is required'
      setError('')
      showError(errorMessage)
      return
    }
    if (!applicationId) {
      const errorMessage = 'Application ID not found. Please try refreshing the page.'
      setError('')
      showError(errorMessage)
      return
    }

    try {
      setLoading(true)
      setError('')
      
      // Verify authentication first
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !currentUser) {
        throw new Error('Please sign in again to submit your application')
      }

      // Upload proof of payment first
      let popUrl: string
      try {
        popUrl = await startUpload(popFile, 'proof_of_payment')
      } catch (uploadError) {
        console.error('Proof of payment upload failed:', uploadError)
        throw new Error('Failed to upload proof of payment. Please try again.')
      }
      
      // Update application with submission data
      const updateData = {
        payment_method: data.payment_method || 'MTN Money',
        payer_name: data.payer_name || null,
        payer_phone: data.payer_phone || null,
        amount: data.amount || 153,
        paid_at: data.paid_at ? new Date(data.paid_at).toISOString() : null,
        momo_ref: data.momo_ref || null,
        pop_url: popUrl,
        status: 'submitted',
        submitted_at: new Date().toISOString()
      }
      
      
      const updatedApp = await updateApplication.mutateAsync({
        id: applicationId,
        data: updateData
      })
      

      if (!updatedApp) {
        throw new Error('Application not found or access denied')
      }

      setSubmittedApplication(prev => ({
        applicationNumber: updatedApp.application_number,
        trackingCode: updatedApp.public_tracking_code,
        program: updatedApp.program,
        institution: updatedApp.institution,
        intake: updatedApp.intake,
        fullName: updatedApp.full_name,
        email: updatedApp.email,
        phone: updatedApp.phone,
        status: updatedApp.status,
        paymentStatus: updatedApp.payment_status ?? prev?.paymentStatus ?? 'pending_review',
        submittedAt: updatedApp.submitted_at,
        updatedAt: updatedApp.updated_at
      }))

      try {
        const { getApiBaseUrl } = await import('@/lib/apiConfig')
        const apiBase = getApiBaseUrl()
        const { token, error: sessionError } = await getSessionToken()
        
        if (token) {
          await fetch(`${apiBase}/api/notifications/application-submitted`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ applicationId: updatedApp.id, userId: user.id })
          }).catch(() => {})
        }
      } catch (notificationError) {
        // Silent fail - don't block submission
      }

      try {
        localStorage.removeItem('applicationWizardDraft')
        const deleteResult = await draftManager.clearAllDrafts(user.id)
        if (!deleteResult.success) {
        }
      } catch (cleanupError) {
      }

      setSuccess(true)
    } catch (error) {
      console.error('Submission error:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
      let message = error instanceof Error ? error.message : 'Failed to submit application'
      if (message.includes('Bad Request')) {
        message = 'Connection issue - please try again'
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [confirmSubmission, popFile, applicationId, startUpload, updateApplication, user?.id])

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
    confirmSubmission,
    setConfirmSubmission,
    resultSlipFile,
    extraKycFile,
    popFile,
    uploadProgress,
    uploadedFiles,
    isDraftSaving,
    draftSaved,
    submittedApplication,
    persistingSlip,
    slipLoading,
    emailLoading,
    handleDownloadSlip,
    handleEmailSlip,
    handleResultSlipUpload,
    handleExtraKycUpload,
    handleProofOfPaymentUpload,
    getPaymentTarget,
    handleNextStep,
    handlePrevStep,
    handleSubmitApplication,
    addGrade,
    removeGrade,
    updateGrade,
    getUsedSubjects,
    saveDraft,
    watchValues: watch
  }
}

export default useWizardController
