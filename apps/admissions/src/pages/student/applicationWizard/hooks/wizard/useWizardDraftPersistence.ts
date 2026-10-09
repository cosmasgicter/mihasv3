/**
 * The draft machine's adapters (admissions-v2 task 6.3 — R10.2-R10.4, R10.10;
 * findings STU-02, STU-12, MAINT-01).
 *
 * This hook used to be a second owner of the draft lifecycle: it kept the
 * application id and server version in refs, chained saves, chose idempotency
 * keys, decided start-versus-update and wrote the local snapshot — while
 * `useSmartAutoSave` separately decided *when* to call it, and `index.tsx`
 * called it a third way on step navigation (the same-value write M9 saw).
 *
 * Now it only supplies the machine (`lib/wizardDraftController.ts`) with the
 * small pieces of I/O the machine asks for — read the form, project the answers,
 * call one endpoint, write one `(user, application)` record, show one banner —
 * and offers the wizard's existing call sites the same three entry points they
 * used, each a one-line request to the machine:
 *
 * | call site | was | is |
 * |---|---|---|
 * | `saveDraft({ syncServer: false })` | write the local snapshot | `machine.persistLocal()` |
 * | `saveDraft({ syncServer: true })` | PATCH unconditionally | `machine.flush()` — only if the answers changed |
 * | `saveDraft({ syncServer: true, requireServer: true })` | PATCH unconditionally | `machine.commit()` — write if changed, else confirm with a read |
 *
 * It decides nothing about timing, retry, versions or conflicts.
 */
import { useCallback, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { UseFormGetFieldState, UseFormSetValue } from 'react-hook-form'

import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { applicationService } from '@/services/applications'
import { isApplicationMissingError } from '@/lib/applicationSession'
import {
  clearNewWizardDraftCache,
  clearWizardDraftCache,
  readWizardDraftSnapshot,
  settleWizardDraftOutbox,
  writeWizardDraftSnapshot,
} from '@/lib/draftLocalCache'
import { BROWSER_EVENTS } from '@/lib/browserNamespace'
import { flushPendingWrites, isSecureStorageReady } from '@/lib/localStorageCache'
import {
  WIZARD_DRAFT_MESSAGES,
  type WizardDraftAdapters,
  type WizardDraftController,
  type WizardDraftErrorKind,
  type WizardDraftLocalMeta,
} from '@/lib/wizardDraftController'
import {
  classifyLocalDraftOutbox,
  draftAssignmentKey,
  positiveDraftVersion,
  restoreDraftBase,
} from '@/lib/wizardDraftProjection'
import { getBestValue, getUserMetadata } from '@/hooks/useProfileAutoPopulation'
import { useDraftStore } from '@/stores/draftStore'
import type { Application } from '@/types/database'
import type { User } from '@/types/auth'
import { mergeDraftResumeUploads, resolveDraftResumeStepId } from '../../lib/draftResume'
import {
  buildDuplicateDraftConflictDecision,
  buildServerDraftPayload,
  canCreateServerDraft,
  projectDraftAnswers,
  shouldClearDuplicateDraftConflict,
} from '../../lib/draftAutosave'
import {
  SELECTED_DRAFT_LOAD_ERROR,
  applyDraftFormValues,
  draftRecordAnswers,
  draftRecordToFormValues,
  outboxAnswerOverlay,
  readAuthoritativeDraftRow,
} from '../../lib/draftHydration'
import { buildDraftOutboxRecord, draftOutboxAnswers } from '../../lib/draftOutbox'
import type { SubjectGrade, WizardFormData, WizardProgram } from '../../types'
import type { ApplicationFileType } from '../useApplicationFileUploads'
import { getStepIndexById } from '../../steps/config'
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

/** Every field the wizard form registers; dirtiness of any one is a student edit. */
const WIZARD_FORM_FIELDS: ReadonlyArray<keyof WizardFormData> = [
  'full_name',
  'nrc_number',
  'passport_number',
  'date_of_birth',
  'sex',
  'phone',
  'email',
  'residence_town',
  'country',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone',
  'program',
  'intake',
]

export interface UseWizardDraftPersistenceParams {
  /** The draft machine this hook supplies adapters to. */
  machine: WizardDraftController
  user: User | null | undefined
  profile: { nationality?: string | null } | null | undefined
  uploadedFiles: Record<string, boolean>
  currentStepConfig: { id: number; key: string }
  paymentStatus: string | null
  selectedGradesRef: { current: SubjectGrade[] }
  selectedProgramDetails: WizardProgram | undefined
  programsData: { programs?: unknown[] } | undefined
  totalSteps: number
  form: {
    getValues: () => WizardFormData
    setValue: UseFormSetValue<WizardFormData>
    getFieldState: UseFormGetFieldState<WizardFormData>
  }
  setRestoringDraft: (value: boolean) => void
  setDraftLoaded: (value: boolean) => void
  setDuplicateDraftConflict: (value: DuplicateDraftConflict | null) => void
  setGradesHydrating: (value: boolean) => void
  setError: (message: string) => void
  setSubmittedApplication: React.Dispatch<React.SetStateAction<SubmittedApplicationSummary | null>>
  markUploadedFile: (key: ApplicationFileType, value: boolean) => void
  restorePaymentStatus: (status?: string | null) => void
  showSuccess: (message: string) => void
  showWarning: (message: string) => void
  findProgramId: (
    value?: string | null,
    institutionHint?: string | null,
    programList?: WizardProgram[],
  ) => string
  deriveInstitutionLabel: (institution?: WizardProgram['institutions']) => string
  resolveProgramIdentity: (
    value?: string | null,
    institutionHint?: string | null,
  ) => { id: string; label: string; institutionLabel: string } | null
  resolveIntakeIdentity: (value?: string | null) => ResolvedIntakeIdentity | null
  goToStep: (index: number) => void
  clearStaleApplicationReference: (staleApplicationId: string, message?: string) => void
  hydrateServerGrades: (draftApplicationId: string) => Promise<SubjectGrade[]>
  hydrateServerDocuments: (draftApplicationId: string) => Promise<Record<string, boolean>>
}

/** What restoring a server draft into the wizard produced. */
export interface RestoredServerDraft {
  stepId: number
}

/**
 * What the local outbox says about a freshly loaded server draft, ready to hand
 * to `machine.completeHydration` (see `classifyLocalDraftOutbox`).
 */
export interface OutboxRecovery {
  afterBaseline?: () => void
  staleOutbox?: {
    serverVersion: number | null
    base: Record<string, unknown> | null
    reason: 'version' | 'assignment'
  }
  /** The outbox could not be read yet; hydration must leave it untouched. */
  localUnread?: boolean
}

/** The server facts an outbox read is judged against. */
export interface OutboxRecoveryContext {
  /** `draftAssignmentKey` of the freshly loaded row. */
  assignment?: string | null
  /** Whether this user's encrypted outbox has been decrypted into memory. */
  readable?: boolean
}

function createDraftCommandKey(prefix: 'start' | 'update'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function draftErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { code?: unknown; data?: { code?: unknown } }
  const code = candidate.data?.code ?? candidate.code
  return typeof code === 'string' ? code : null
}

function draftErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

/** How the machine should treat a failed draft command. Protocol knowledge only. */
export function classifyDraftCommandError(error: unknown, phase: 'start' | 'update'): WizardDraftErrorKind {
  if (isAuthSaveError(error)) return 'auth'
  const status = draftErrorStatus(error)
  if (phase === 'update' && draftErrorCode(error) === 'VERSION_CONFLICT') return 'conflict'
  if (phase === 'start' && status === 409) return 'duplicate'
  if (phase === 'update' && isApplicationMissingError(error)) return 'missing'
  if (status === 400 || status === 422) return 'validation'
  return 'retryable'
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function useWizardDraftPersistence(params: UseWizardDraftPersistenceParams) {
  const {
    machine,
    user,
    profile,
    uploadedFiles,
    currentStepConfig,
    paymentStatus,
    selectedGradesRef,
    selectedProgramDetails,
    programsData,
    totalSteps,
    form,
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
  } = params

  const { getValues, setValue, getFieldState } = form
  const queryClient = useQueryClient()
  /** The duplicate-draft decision currently shown, so it clears when answered. */
  const duplicateConflictRef = useRef<DuplicateDraftConflict | null>(null)
  const programs = programsData?.programs as WizardProgram[] | undefined

  /** The start command for the current form, or null while a server draft cannot be created. */
  const projectStart = useCallback((): Record<string, unknown> | null => {
    const formData = getValues()
    if (!user || !canCreateServerDraft(formData)) return null
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
      resolvedProgram.institutionLabel ||
      deriveInstitutionLabel(selectedProgramDetails?.institutions) ||
      'Beanola Admissions'
    return buildServerDraftPayload({
      formData: {
        ...formData,
        program: resolvedProgram.label,
        intake: resolvedIntake.name,
      },
      selectedProgramDetails,
      institutionCode: institutionLabel,
      nationality,
      programId: resolvedProgram.id,
      intakeId: resolvedIntake.id,
    })
  }, [
    deriveInstitutionLabel,
    getValues,
    profile?.nationality,
    resolveIntakeIdentity,
    resolveProgramIdentity,
    selectedProgramDetails,
    user,
  ])

  /**
   * Write — or settle — the one outbox record for the open draft (task 6.3 M14).
   *
   * An attached draft keeps a record only while the server lacks an edit, and
   * the record holds only those pending answers, their base and version, and its
   * `(user, application, assignment)` address (`draftOutbox.ts`). Once nothing is
   * pending the record is removed: the server holds the draft. An unattached new
   * application keeps its whole form, because all of it is pending.
   */
  const writeLocalSnapshot = useCallback(
    (meta: WizardDraftLocalMeta) => {
      if (!user?.id) return
      const savedAt = new Date().toISOString()
      if (meta.applicationId) {
        if (meta.pending) {
          writeWizardDraftSnapshot(
            buildDraftOutboxRecord({
              userId: user.id,
              applicationId: meta.applicationId,
              assignment: meta.assignment,
              serverVersion: meta.serverVersion,
              pendingBase: meta.pendingBase,
              formValues: getValues() as unknown as Record<string, unknown>,
              savedAt,
            }),
            { userId: user.id, applicationId: meta.applicationId },
          )
        } else {
          settleWizardDraftOutbox({ userId: user.id, applicationId: meta.applicationId })
        }
      } else {
        writeWizardDraftSnapshot(
          {
            formData: getValues(),
            selectedGrades: selectedGradesRef.current,
            uploadedFiles,
            currentStep: currentStepConfig.id,
            currentStepKey: currentStepConfig.key,
            applicationId: null,
            savedAt,
            userId: user.id,
            version: 2,
            serverVersion: meta.serverVersion,
            paymentStatus,
            pending: meta.pending,
            pendingBase: meta.pendingBase,
          },
          { userId: user.id, applicationId: null },
        )
      }
      if (meta.announce) {
        // A save point, not a copy of the answers: listeners refresh from the server.
        const savePoint = { applicationId: meta.applicationId, savedAt, pending: meta.pending }
        useDraftStore.getState().markSaved(savePoint)
        window.dispatchEvent(new CustomEvent('applicationDraftSaved', { detail: savePoint }))
      }
    },
    [currentStepConfig.id, currentStepConfig.key, getValues, paymentStatus, selectedGradesRef, uploadedFiles, user?.id],
  )

  /** Put a stale outbox record's pending answers back into the form for an explicit merge. */
  const restoreStaleOutbox = useCallback(
    (applicationId: string | null): boolean => {
      if (!applicationId || !user?.id) return false
      const record = readWizardDraftSnapshot({ userId: user.id, applicationId })
      const base = restoreDraftBase(record?.pendingBase)
      const overlay = outboxAnswerOverlay(draftOutboxAnswers(record), getValues(), base ? Object.keys(base) : undefined)
      if (Object.keys(overlay).length === 0) return false
      applyDraftFormValues(overlay, setValue, { shouldDirty: true })
      return true
    },
    [getValues, setValue, user?.id],
  )

  const adapters = useMemo<WizardDraftAdapters>(
    () => ({
      canPersist: () => Boolean(user?.id),
      projectAnswers: () => projectDraftAnswers(getValues()),
      projectStart,
      projectLocal: () => ({ ...getValues() }),
      hasUserEdits: () => WIZARD_FORM_FIELDS.some((field) => getFieldState(field).isDirty),
      startDraft: (payload, idempotencyKey) =>
        applicationService.startDraft(payload as Partial<Application>, idempotencyKey) as Promise<
          Record<string, unknown> | null
        >,
      updateDraft: (applicationId, payload, expectedVersion, idempotencyKey) =>
        applicationService.updateDraft(
          applicationId,
          payload as Partial<Application>,
          expectedVersion,
          idempotencyKey,
        ) as Promise<Record<string, unknown> | null>,
      readDraft: (applicationId) =>
        applicationService.getRecord(applicationId) as Promise<Record<string, unknown> | null>,
      answersFromRecord: (record) => draftRecordAnswers(record, { findProgramId, programs }),
      applyAnswers: (values) => applyDraftFormValues(values as Partial<WizardFormData>, setValue),
      persistLocal: writeLocalSnapshot,
      clearLocal: (applicationId) =>
        clearWizardDraftCache({ userId: user?.id ?? null, applicationId }),
      isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
      createCommandKey: createDraftCommandKey,
      classifyError: classifyDraftCommandError,
      reload: () => {
        // Storage writes are queued for an idle moment (and encrypted); let the
        // outbox removal land before the document is replaced, or the stale
        // record would reopen the conflict on the reloaded page.
        const settled = Promise.race([
          flushPendingWrites().catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, 1_500)),
        ])
        void settled.then(() => window.location.reload())
      },
      restoreStaleOutbox: () => restoreStaleOutbox(machine.getSnapshot().applicationId),
      onBeforeSave: () => {
        // A student who changed the programme or intake has answered the
        // duplicate-draft question; the banner goes with it.
        if (shouldClearDuplicateDraftConflict(duplicateConflictRef.current, getValues())) {
          duplicateConflictRef.current = null
          setDuplicateDraftConflict(null)
          setError('')
        }
      },
      onStarted: (record, payload) => {
        // This application now exists on the server: its unattached record (the
        // one "new" slot it was typed into) is superseded. Only now — never on
        // another draft's write (R10.10, task 6.3 M14).
        clearNewWizardDraftCache(user?.id ?? null, { notify: false })
        const app = record as unknown as Application
        const formData = getValues()
        const resolvedProgram = resolveProgramIdentity(formData.program)
        const resolvedIntake = resolveIntakeIdentity(formData.intake)
        const institutionLabel =
          resolvedProgram?.institutionLabel ||
          deriveInstitutionLabel(selectedProgramDetails?.institutions) ||
          String(payload.institution ?? '')
        duplicateConflictRef.current = null
        setDuplicateDraftConflict(null)
        setSubmittedApplication((prev) => ({
          applicationNumber: app.application_number || prev?.applicationNumber || '',
          trackingCode: String(app.public_tracking_code || prev?.trackingCode || ''),
          program: app.program || resolvedProgram?.label || String(payload.program ?? ''),
          institution: app.institution || institutionLabel,
          intake: resolvedIntake?.label || String(payload.intake ?? ''),
          fullName: formData.full_name,
          email: formData.email,
          phone: sanitizePhoneInput(formData.phone),
          status: app.status || 'draft',
          paymentStatus: app.payment_status ?? prev?.paymentStatus ?? null,
        }))
        queryClient.invalidateQueries({ queryKey: ['applications'] })
        window.dispatchEvent(
          new CustomEvent('applicationCreated', {
            detail: { applicationId: String(record.id), source: 'autosave' },
          }),
        )
      },
      onDuplicate: (error) => {
        // 409: a draft for this programme + intake exists. Never adopt its id
        // silently — that turns a new-application intent into a resume without
        // the student's consent (STU-12). The student chooses.
        const formData = getValues()
        const existingId = (error as { data?: { existing_id?: unknown } })?.data?.existing_id
        const conflict = buildDuplicateDraftConflictDecision({
          existingId: typeof existingId === 'string' ? existingId : null,
          program: String(formData.program || ''),
          intake: String(formData.intake || ''),
        })
        duplicateConflictRef.current = conflict
        setError(conflict.message)
        setDuplicateDraftConflict(conflict)
        showWarning(conflict.message)
      },
      onMissingDraft: (applicationId) => clearStaleApplicationReference(applicationId),
      onConflict: (error) => {
        setError(WIZARD_DRAFT_MESSAGES.versionConflict)
        showWarning(WIZARD_DRAFT_MESSAGES.versionConflict)
        logApiError('application-wizard', 'PATCH /applications/drafts/{id}/ (version conflict)', error)
      },
      onAuthExpired: () => {
        window.dispatchEvent(new CustomEvent(BROWSER_EVENTS.authExpired))
      },
    }),
    [
      clearStaleApplicationReference,
      deriveInstitutionLabel,
      findProgramId,
      getFieldState,
      getValues,
      programs,
      projectStart,
      queryClient,
      resolveIntakeIdentity,
      resolveProgramIdentity,
      selectedProgramDetails,
      setDuplicateDraftConflict,
      setError,
      setSubmittedApplication,
      setValue,
      showWarning,
      user?.id,
      writeLocalSnapshot,
      restoreStaleOutbox,
      machine,
    ],
  )
  // The machine reads its adapters at call time; hand it this render's closures.
  machine.setAdapters(adapters)

  /**
   * Restore an authoritative server draft into the wizard: answers, documents,
   * grades and the resume step. Shared by the mount loader and the draft
   * picker, so both hydrate identically. Reports nothing to the machine — the
   * caller completes the hydration with the facts this returns.
   *
   * `isCurrent` lets a caller abandon a restore that was superseded while it
   * awaited the server (a newer intent); it then returns `null` before moving
   * the step, so a stale restore can never drag the student back to a step.
   */
  const restoreServerDraft = useCallback(
    async (
      draft: Record<string, unknown>,
      draftId: string,
      options: { isCurrent?: () => boolean } = {},
    ): Promise<RestoredServerDraft | null> => {
      const isCurrent = options.isCurrent ?? (() => true)
      restorePaymentStatus(stringOrNull(draft.payment_status))
      applyDraftFormValues(draftRecordToFormValues(draft, { findProgramId, programs }), setValue)

      const hydratedServerUploads = await hydrateServerDocuments(draftId)
      if (!isCurrent()) return null
      const restoredUploads = mergeDraftResumeUploads(draft, hydratedServerUploads)
      markUploadedFile('result_slip', restoredUploads.result_slip)
      markUploadedFile('extra_kyc', restoredUploads.extra_kyc)

      setGradesHydrating(true)
      let restoredGrades: SubjectGrade[] = []
      try {
        restoredGrades = await hydrateServerGrades(draftId)
      } finally {
        setGradesHydrating(false)
      }
      if (!isCurrent()) return null

      const stepId = resolveDraftResumeStepId(draft, restoredGrades, restoredUploads)
      const index = getStepIndexById(stepId)
      goToStep(index >= 0 ? index : Math.min(Math.max(stepId - 1, 0), totalSteps - 1))

      return { stepId }
    },
    [
      findProgramId,
      goToStep,
      hydrateServerDocuments,
      hydrateServerGrades,
      markUploadedFile,
      programs,
      restorePaymentStatus,
      setGradesHydrating,
      setValue,
      totalSteps,
    ],
  )

  /**
   * The local outbox, read against a freshly loaded server draft (R10.3/R10.4).
   *
   * - pending edits made on exactly this server version, under the assignment
   *   the server still reports, are replayed — as the student's edits, so the
   *   machine sends them;
   * - pending edits made on an OLDER version, or addressed to another assignment
   *   (a reroute elsewhere), are a stale command: the draft opens in conflict and
   *   the edits wait, untouched, for an explicit reload or merge;
   * - anything else (no record, a clean copy, already-saved answers) is ignored;
   * - an outbox that could not be read yet is reported as unread, so hydration
   *   leaves it alone instead of settling over it.
   *
   * Only the answers the record lists as pending are considered, so a field the
   * student never touched on this device can never overwrite a newer one.
   */
  const outboxRecoveryFor = useCallback(
    (applicationId: string, serverVersion: number, context: OutboxRecoveryContext = {}): OutboxRecovery => {
      if (context.readable === false) return { localUnread: true }
      const record = user?.id ? readWizardDraftSnapshot({ userId: user.id, applicationId }) : null
      const base = restoreDraftBase(record?.pendingBase)
      const overlay = outboxAnswerOverlay(draftOutboxAnswers(record), getValues(), base ? Object.keys(base) : undefined)
      const disposition = classifyLocalDraftOutbox(
        record,
        { userId: user?.id, applicationId, serverVersion, assignment: context.assignment ?? null },
        Object.keys(overlay).length > 0,
      )
      if (disposition === 'replay') {
        return { afterBaseline: () => applyDraftFormValues(overlay, setValue, { shouldDirty: true }) }
      }
      if (disposition === 'stale' || disposition === 'reassigned') {
        logApiError(
          'application-wizard',
          disposition === 'stale' ? 'local draft outbox (stale version)' : 'local draft outbox (other assignment)',
          new Error(
            disposition === 'stale'
              ? 'Unsent changes on this device were made on an older version of this draft.'
              : 'Unsent changes on this device were made before this draft’s programme or intake changed.',
          ),
        )
        return {
          staleOutbox: {
            serverVersion: positiveDraftVersion(record?.serverVersion),
            base,
            reason: disposition === 'stale' ? 'version' : 'assignment',
          },
        }
      }
      return {}
    },
    [getValues, setValue, user?.id],
  )

  /** The draft picker's "continue": hydrate the chosen draft through the machine. */
  const handleLoadDraft = useCallback(
    async (draftData: unknown, draftId?: string) => {
      const app =
        draftData && typeof draftData === 'object' && 'application' in (draftData as Record<string, unknown>)
          ? (draftData as { application?: unknown }).application
          : draftData

      if (!app || typeof app !== 'object') {
        setError('This draft could not be loaded. Please refresh and try again.')
        return
      }

      const listItem = app as Record<string, unknown>
      const resolvedDraftId = String(listItem.id || draftId || '')
      if (!resolvedDraftId) {
        setError('This draft is missing its application ID. Please choose another draft.')
        return
      }

      setRestoringDraft(true)
      machine.beginHydration()
      try {
        // The picker's item is the lightweight list projection. Read the row,
        // fail closed, exactly as the mount loader does.
        const draft = await readAuthoritativeDraftRow<Record<string, unknown>>({
          ...listItem,
          id: resolvedDraftId,
        })
        const loadedVersion = positiveDraftVersion(draft.version)
        if (loadedVersion === null) {
          throw new Error('This draft did not include a valid server version. Reload and try again.')
        }
        const restored = await restoreServerDraft(draft, resolvedDraftId)
        if (!restored) return
        const assignment = draftAssignmentKey(draft)
        machine.completeHydration({
          applicationId: resolvedDraftId,
          serverVersion: loadedVersion,
          source: 'server',
          assignment,
          ...outboxRecoveryFor(resolvedDraftId, loadedVersion, { assignment, readable: isSecureStorageReady() }),
        })
        setDraftLoaded(true)
        setError('')
        showSuccess('Draft loaded successfully')
      } catch (error) {
        logApiError('application-wizard', `load draft ${resolvedDraftId}`, error)
        machine.failHydration({ applicationId: resolvedDraftId })
        setError(toError(error).message || SELECTED_DRAFT_LOAD_ERROR)
      } finally {
        setRestoringDraft(false)
      }
    },
    [machine, outboxRecoveryFor, restoreServerDraft, setDraftLoaded, setError, setRestoringDraft, showSuccess],
  )

  /**
   * The wizard's save entry point, kept for its existing call sites. Each
   * option is a request to the machine; none of them writes by itself.
   */
  const saveDraft = useCallback(
    async (options: SaveDraftOptions = {}): Promise<Application | null> => {
      if (options.syncServer === false) {
        machine.persistLocal()
        return null
      }
      if (options.requireServer) {
        return (await machine.commit()) as unknown as Application
      }
      return (await machine.flush()) as unknown as Application | null
    },
    [machine],
  )

  const persistLocalDraftSnapshot = useCallback(() => machine.persistLocal(), [machine])

  return {
    persistLocalDraftSnapshot,
    handleLoadDraft,
    saveDraft,
    restoreServerDraft,
    outboxRecoveryFor,
  }
}

