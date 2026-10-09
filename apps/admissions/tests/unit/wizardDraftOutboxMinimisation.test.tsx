/**
 * The attached draft's local outbox: what reads it, what it holds, and how it is
 * addressed (admissions-v2 task 6.3, M14 — R10.4, R10.10; design §8.2 "Local
 * records are addressed by `(user_id, application_id, assignment_id)` and
 * contain only pending deltas and retry metadata").
 *
 * Driven through the production composition — the one draft machine, the real
 * `useWizardDraftPersistence` adapters and the real `draftLocalCache` /
 * `localStorageCache` modules. Under the test runner the cache writes storage
 * synchronously in plaintext, which is what lets these cases read the record a
 * browser would only hold encrypted.
 *
 *   CHARACTERISATION — what reads an attached record today. Written and run
 *     BEFORE the minimisation (docs/v2-evidence/6.3/raw/m14-01-*), and unchanged
 *     after it: they are the proof that dropping the full form, the grades, the
 *     upload flags, the step and the payment status from an attached record
 *     changes nothing a student can see.
 *   MINIMISED — the record after M14. The "before" run is the evidence of what
 *     M13 stored (M1-M3, M4, M6 fail against it, each showing the record).
 */
import React, { act } from 'react'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  startDraft: vi.fn(),
  updateDraft: vi.fn(),
  getRecord: vi.fn(),
  getById: vi.fn(),
}))

vi.mock('@/services/applications', () => ({
  applicationService: {
    startDraft: api.startDraft,
    updateDraft: api.updateDraft,
    getRecord: api.getRecord,
    getById: api.getById,
  },
}))

import { useWizardDraftMachine } from '@/pages/student/applicationWizard/hooks/useWizardDraftMachine'
import { useWizardDraftPersistence } from '@/pages/student/applicationWizard/hooks/wizard/useWizardDraftPersistence'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'
import { getWizardDraftStorageKey, listWizardDraftStorageKeys } from '@/lib/draftStorageKeys'
import { resetCache } from '@/lib/localStorageCache'
import { WIZARD_DRAFT_DEBOUNCE_MS } from '@/lib/wizardDraftController'

const USER = { id: 'user-1', email: 'student@example.com', role: 'student' } as const
const APP_ID = 'app-1'
const OTHER_APP_ID = 'app-2'
const ASSIGNMENT_A = { program_offering_id: 'offering-a', intake_id: 'intake-a' }
const ASSIGNMENT_B = { program_offering_id: 'offering-b', intake_id: 'intake-b' }

const HYDRATED: Partial<WizardFormData> = {
  full_name: 'Student Name',
  nrc_number: '123456/78/9',
  date_of_birth: '2004-05-04',
  sex: 'Male' as WizardFormData['sex'],
  phone: '+260971234567',
  email: 'student@example.com',
  residence_town: 'Kabwe',
  country: 'Zambia',
  nationality: 'Zambian',
  next_of_kin_name: 'Next Of Kin',
  next_of_kin_phone: '+260977654321',
  program: 'program-1',
  intake: 'intake-1',
}

/** The fields an M13 attached record carried that recovery never needed. */
const NON_RECOVERY_FIELDS = [
  'formData',
  'selectedGrades',
  'uploadedFiles',
  'currentStep',
  'currentStepKey',
  'paymentStatus',
] as const

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

const setOnline = (value: boolean) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })

/** A server draft row as `GET /applications/{id}/` returns it (ApplicationSerializer). */
function serverRow(version: number, overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    status: 'draft',
    version,
    assignment_version: 1,
    payment_status: null,
    ...ASSIGNMENT_A,
    ...HYDRATED,
    ...overrides,
  }
}

const recordKey = (applicationId: string | null = APP_ID) => getWizardDraftStorageKey(USER.id, applicationId)

function storedRecord(applicationId: string | null = APP_ID): Record<string, unknown> | null {
  const raw = localStorage.getItem(recordKey(applicationId))
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

function seedRecord(record: Record<string, unknown>, applicationId: string | null = APP_ID): void {
  localStorage.setItem(recordKey(applicationId), JSON.stringify(record))
}

/** What an M13 bundle wrote for an attached draft with one pending answer. */
function m13PendingRecord(overrides: Record<string, unknown> = {}) {
  return {
    formData: { ...HYDRATED, residence_town: 'Pending town', program: 'other-program', intake: 'other-intake' },
    selectedGrades: [1, 2, 3, 4, 5, 6].map((n) => ({ subject_id: `subject-${n}`, grade: 2 })),
    uploadedFiles: { result_slip: true, extra_kyc: true },
    currentStep: 6,
    currentStepKey: 'submit',
    applicationId: APP_ID,
    savedAt: '2026-10-08T10:00:00.000Z',
    userId: USER.id,
    version: 2,
    serverVersion: 3,
    paymentStatus: 'deferred',
    pending: true,
    pendingBase: { residence_town: 'Kabwe' },
    ...overrides,
  }
}

/**
 * The production composition (as `useWizardController` assembles it): the
 * machine, its adapters, the form subscription that feeds it edits.
 */
function mountDraftSystem() {
  const spies = {
    goToStep: vi.fn(),
    markUploadedFile: vi.fn(),
    restorePaymentStatus: vi.fn(),
    hydrateServerGrades: vi.fn().mockResolvedValue([]),
    hydrateServerDocuments: vi.fn().mockResolvedValue({ result_slip: false, extra_kyc: false }),
    clearStaleApplicationReference: vi.fn(),
  }
  const hook = renderHook(
    () => {
      const form = useForm<WizardFormData>({ defaultValues: { country: 'Zambia' } as WizardFormData })
      const { machine, snapshot } = useWizardDraftMachine()
      const selectedGradesRef = React.useRef([])
      const persistence = useWizardDraftPersistence({
        machine,
        user: USER as never,
        profile: null,
        uploadedFiles: { result_slip: true, extra_kyc: true },
        currentStepConfig: { id: 3, key: 'personal' },
        paymentStatus: null,
        selectedGradesRef,
        selectedProgramDetails: undefined,
        programsData: { programs: [] },
        totalSteps: 6,
        form: { getValues: form.getValues, setValue: form.setValue, getFieldState: form.getFieldState },
        setRestoringDraft: vi.fn(),
        setDraftLoaded: vi.fn(),
        setDuplicateDraftConflict: vi.fn(),
        setGradesHydrating: vi.fn(),
        setError: vi.fn(),
        setSubmittedApplication: vi.fn(),
        markUploadedFile: spies.markUploadedFile,
        restorePaymentStatus: spies.restorePaymentStatus,
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        findProgramId: (value?: string | null) => value ?? '',
        deriveInstitutionLabel: () => 'Example College',
        resolveProgramIdentity: (value?: string | null) =>
          value ? { id: value, label: 'Nursing', institutionLabel: 'Example College' } : null,
        resolveIntakeIdentity: (value?: string | null) =>
          value ? { id: value, name: 'January 2027', label: 'January 2027' } : null,
        goToStep: spies.goToStep,
        clearStaleApplicationReference: spies.clearStaleApplicationReference,
        hydrateServerGrades: spies.hydrateServerGrades,
        hydrateServerDocuments: spies.hydrateServerDocuments,
      })
      React.useEffect(() => {
        const subscription = form.watch(() => machine.observe())
        return () => subscription.unsubscribe()
      }, [form, machine])
      return { form, machine, snapshot, persistence }
    },
    {
      wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
    },
  )

  const system = {
    spies,
    get current() {
      return hook.result.current
    },
    /** The loader's server hydration: restore the row, consult the outbox, complete. */
    async hydrate(row = serverRow(3), options: { assignmentAware?: boolean } = {}) {
      await act(async () => {
        const { machine, persistence } = hook.result.current
        machine.activate()
        machine.beginHydration()
        await persistence.restoreServerDraft(row, APP_ID)
        const assignment = `${row.program_offering_id}|${row.intake_id}`
        const recovery =
          options.assignmentAware === false
            ? persistence.outboxRecoveryFor(APP_ID, row.version)
            : persistence.outboxRecoveryFor(APP_ID, row.version, { assignment, readable: true })
        machine.completeHydration({
          applicationId: APP_ID,
          serverVersion: row.version,
          source: 'server',
          assignment,
          ...recovery,
        })
        await flush()
      })
    },
    async edit(field: keyof WizardFormData, value: string) {
      await act(async () => {
        hook.result.current.form.setValue(field, value as never, { shouldDirty: true })
        await flush()
      })
    },
    async advance(ms: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms)
        await flush()
      })
    },
  }
  return system
}

beforeEach(() => {
  vi.useFakeTimers()
  setOnline(true)
  localStorage.clear()
  sessionStorage.clear()
  resetCache()
  api.startDraft.mockReset()
  api.updateDraft.mockReset()
  api.getRecord.mockReset()
  api.getById.mockReset()
  let nextVersion = 4
  api.updateDraft.mockImplementation(async () => serverRow(nextVersion++))
  api.getRecord.mockImplementation(async () => serverRow(3))
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  setOnline(true)
})

describe('CHARACTERISATION — what reads an attached outbox record (before and after M14)', () => {
  it('C1: a resume takes the step, grades, upload flags and payment state from the server, never from the record', async () => {
    // A pending M13-format record that contradicts the server on everything a
    // full snapshot carried: a later step, six grades, both documents, a
    // deferred payment, another programme and intake.
    seedRecord(m13PendingRecord())
    const system = mountDraftSystem()
    await system.hydrate(serverRow(3), { assignmentAware: false })

    // Step: the server-derived resume step (personal answers present, no grades
    // or documents on the server -> Education, index 3), not the record's 'submit'.
    expect(system.spies.goToStep).toHaveBeenCalledTimes(1)
    expect(system.spies.goToStep).toHaveBeenCalledWith(3)
    // Grades and documents are read from the server for this application.
    expect(system.spies.hydrateServerGrades).toHaveBeenCalledWith(APP_ID)
    expect(system.spies.hydrateServerDocuments).toHaveBeenCalledWith(APP_ID)
    expect(system.spies.markUploadedFile).toHaveBeenCalledWith('result_slip', false)
    expect(system.spies.markUploadedFile).toHaveBeenCalledWith('extra_kyc', false)
    expect(system.spies.markUploadedFile).not.toHaveBeenCalledWith('result_slip', true)
    // Payment state is the server's.
    expect(system.spies.restorePaymentStatus).toHaveBeenCalledWith(null)
    expect(system.spies.restorePaymentStatus).not.toHaveBeenCalledWith('deferred')
    // Of the record's answers, only the pending one is replayed; the programme
    // and intake in its full form copy never reach the form (the intake is the
    // row's canonical id, task 6.3 M13).
    const values = system.current.form.getValues()
    expect(values.residence_town).toBe('Pending town')
    expect(values.program).toBe('program-1')
    expect(values.intake).toBe('intake-a')
  })

  it('C2: in production storage the key-less local reader cannot see an attached record at all', () => {
    // Production writes draft records only through secureStorage, under the
    // `beanola_secure_` prefix; the key-less enumeration only matches
    // `applicationWizardDraft:` keys, so an attached record is never one of its
    // candidates (README §M.7). Only the unattached `:new` slot and the legacy
    // key are ever read by the dashboard and the `?localDraft=true` path.
    const productionStorage = {
      [`beanola_secure_${recordKey(APP_ID)}`]: 'opaque-ciphertext',
      [`beanola_secure_${recordKey(OTHER_APP_ID)}`]: 'opaque-ciphertext',
    } as unknown as Storage
    expect(listWizardDraftStorageKeys(productionStorage, USER.id)).toEqual([
      recordKey(null),
      'applicationWizardDraft',
    ])
  })

  it('C3: an unattached new application keeps the whole form on this device (all of it is pending)', async () => {
    const system = mountDraftSystem()
    await act(async () => {
      system.current.machine.activate()
      system.current.machine.startNew()
      await flush()
    })
    await system.edit('full_name', 'New Student')
    await system.edit('residence_town', 'Lusaka')
    const record = storedRecord(null)
    expect(record).toMatchObject({
      applicationId: null,
      userId: USER.id,
      formData: expect.objectContaining({ full_name: 'New Student', residence_town: 'Lusaka' }),
    })
  })

  it('C4: a legacy pending record made on the loaded version is still replayed once', async () => {
    seedRecord(m13PendingRecord())
    const system = mountDraftSystem()
    await system.hydrate(serverRow(3))
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    const [, payload, expectedVersion] = api.updateDraft.mock.calls[0]!
    expect(payload).toMatchObject({ residence_town: 'Pending town' })
    expect(expectedVersion).toBe(3)
  })
})

describe('MINIMISED — an attached record holds only what recovery needs (M14)', () => {
  it('M1: a draft hydrated with nothing pending keeps no record on this device', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    expect(storedRecord()).toBeNull()
  })

  it('M2: an unsent edit is stored as the pending answer, its base and version, and the full address', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await act(async () => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
      await flush()
    })
    await system.edit('residence_town', 'Mongu')
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.updateDraft).not.toHaveBeenCalled()

    const record = storedRecord()
    expect(record).not.toBeNull()
    expect(Object.keys(record!).sort()).toEqual(
      ['answers', 'applicationId', 'assignment', 'pending', 'pendingBase', 'savedAt', 'serverVersion', 'userId', 'version'].sort(),
    )
    expect(record).toMatchObject({
      version: 3,
      userId: USER.id,
      applicationId: APP_ID,
      assignment: 'offering-a|intake-a',
      serverVersion: 3,
      pending: true,
      answers: { residence_town: 'Mongu' },
      pendingBase: { residence_town: 'Kabwe' },
    })
    for (const field of NON_RECOVERY_FIELDS) expect(record).not.toHaveProperty(field)
    // No answer the student did not change is on the device.
    expect(JSON.stringify(record)).not.toContain('123456/78/9')
    expect(JSON.stringify(record)).not.toContain('+260971234567')
  })

  it('M3: a successful sync clears the record entirely', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'Chipata')
    expect(storedRecord()).toMatchObject({ pending: true })
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    expect(system.current.machine.getSnapshot()).toMatchObject({ state: 'ready.clean', serverVersion: 4 })
    expect(storedRecord()).toBeNull()
  })

  it('M4: a pending record addressed to another assignment is never replayed: it opens the explicit conflict', async () => {
    // Made on the same version under assignment A; the server now reports B.
    seedRecord(m13PendingRecord({ assignment: 'offering-a|intake-a' }))
    seedRecord(m13PendingRecord({ applicationId: OTHER_APP_ID, assignment: 'offering-x|intake-x' }), OTHER_APP_ID)
    const system = mountDraftSystem()
    await system.hydrate(serverRow(3, ASSIGNMENT_B))
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS * 4)

    expect(api.updateDraft).not.toHaveBeenCalled()
    const snapshot = system.current.machine.getSnapshot()
    expect(snapshot.state).toBe('conflict')
    expect(snapshot.saveError).toMatch(/programme or intake/i)
    expect(system.current.form.getValues().residence_town).toBe('Kabwe')
    // The record is the student's work: kept until they choose.
    expect(storedRecord()).toMatchObject({ pending: true, assignment: 'offering-a|intake-a' })

    // "Reload latest draft" discards it — for this one application only.
    const realLocation = window.location
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, reload } })
    try {
      await act(async () => {
        system.current.machine.resolveReload()
        await flush()
      })
      await system.advance(2_000)
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
    }
    expect(storedRecord()).toBeNull()
    expect(storedRecord(OTHER_APP_ID)).toMatchObject({ applicationId: OTHER_APP_ID, pending: true })
  })

  it('M6: resuming one draft leaves another, unattached application’s local work alone (R10.10)', async () => {
    // A new application typed on this device but not yet on the server.
    const unattached = {
      formData: { full_name: 'Unsent New Student', residence_town: 'Mansa', program: 'program-9', intake: 'intake-9' },
      selectedGrades: [],
      uploadedFiles: { result_slip: false, extra_kyc: false },
      currentStep: 3,
      currentStepKey: 'personal',
      applicationId: null,
      savedAt: '2026-10-08T10:00:00.000Z',
      userId: USER.id,
      version: 2,
      serverVersion: null,
      paymentStatus: null,
      pending: true,
      pendingBase: null,
    }
    seedRecord(unattached, null)
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'Chipata')
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    expect(storedRecord(null)).toEqual(unattached)
  })

  it('M7: a new application that attaches removes its own unattached record, and keeps nothing once synced', async () => {
    api.startDraft.mockImplementation(async () => serverRow(1))
    const system = mountDraftSystem()
    await act(async () => {
      system.current.machine.activate()
      system.current.machine.startNew()
      await flush()
    })
    for (const [field, value] of Object.entries({
      ...HYDRATED,
      program: 'program-1',
      intake: 'intake-a',
    })) {
      await system.edit(field as keyof WizardFormData, String(value))
    }
    expect(storedRecord(null)).toMatchObject({ applicationId: null, pending: true })
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.startDraft).toHaveBeenCalledTimes(1)
    expect(system.current.machine.getSnapshot()).toMatchObject({ applicationId: APP_ID, state: 'ready.clean' })
    expect(storedRecord(null)).toBeNull()
    expect(storedRecord(APP_ID)).toBeNull()
  })

  it('M5: a draft the server no longer has (404) loses its attached record; the answers stay in the form', async () => {
    api.updateDraft.mockReset()
    api.updateDraft.mockRejectedValue(Object.assign(new Error('Draft not found'), { status: 404 }))
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'After delete')
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    expect(system.current.machine.getSnapshot().applicationId).toBeNull()
    expect(storedRecord()).toBeNull()
    expect(system.current.form.getValues().residence_town).toBe('After delete')
  })
})
