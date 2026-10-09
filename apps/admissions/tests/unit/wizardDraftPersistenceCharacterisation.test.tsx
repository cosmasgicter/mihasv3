/**
 * Characterisation of the wizard's draft persistence across task 6.3's
 * consolidation (admissions-v2 task 6.3 — R10.2, R10.3, R10.4, R10.7, R10.10;
 * findings STU-02, STU-12, MAINT-01).
 *
 * MAINT-01's order is "add characterization tests, then split". This file was
 * first written against the composition production ran BEFORE the consolidation
 * — `useSmartAutoSave` (a coordinator) driving `useWizardDraftPersistence`
 * (`saveDraft`) — and its run on that composition is retained as evidence
 * (`docs/v2-evidence/6.3/raw/m12-01-characterisation-before.txt`).
 *
 * It now drives the composition production runs AFTER it, assembled exactly as
 * `useWizardController` and `index.tsx` assemble it: the one draft machine
 * (`useWizardDraftMachine`), its adapters (`useWizardDraftPersistence`), the form
 * subscription that feeds it edits, and the autosave view (`useSmartAutoSave`).
 *
 *   PARITY — behaviour the single machine had to keep. The assertions are the
 *            ones the "before" run passed, unchanged.
 *   FIXED  — the "before" run's recorded defects (CURRENT D1-D5), each now
 *            asserting the corrected behaviour.
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

import { useSmartAutoSave } from '@/pages/student/applicationWizard/hooks/useSmartAutoSave'
import { useWizardDraftMachine } from '@/pages/student/applicationWizard/hooks/useWizardDraftMachine'
import { useWizardDraftPersistence } from '@/pages/student/applicationWizard/hooks/wizard/useWizardDraftPersistence'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'
import { getWizardDraftStorageKey } from '@/lib/draftStorageKeys'
import { resetCache } from '@/lib/localStorageCache'
import { AuthenticationError } from '@/services/errors'

const USER = { id: 'user-1', email: 'student@example.com', role: 'student' } as const
const APP_ID = 'app-1'

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

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve()
}

const setOnline = (value: boolean) =>
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })

function record(version: number, overrides: Record<string, unknown> = {}) {
  return { id: APP_ID, status: 'draft', version, assignment_version: 1, ...HYDRATED, ...overrides }
}

/**
 * The production composition, in one place: `useWizardController` creates the
 * machine, hands it `useWizardDraftPersistence`'s adapters, feeds it every form
 * change; `index.tsx` renders `useSmartAutoSave` over it. Step navigation is
 * `machine.flush()`, the personal-step Continue is
 * `saveDraft({ syncServer: true, requireServer: true })` (= `machine.commit()`).
 */
function mountDraftSystem({ version = 3 }: { version?: number } = {}) {
  const hook = renderHook(
    () => {
      const form = useForm<WizardFormData>({ defaultValues: { country: 'Zambia' } as WizardFormData })
      const { machine, snapshot } = useWizardDraftMachine()
      const [restoringDraft, setRestoringDraft] = React.useState(true)
      const [draftLoaded, setDraftLoaded] = React.useState(false)
      const selectedGradesRef = React.useRef([])
      const persistence = useWizardDraftPersistence({
        machine,
        user: USER as never,
        profile: null,
        uploadedFiles: { result_slip: false, extra_kyc: false },
        currentStepConfig: { id: 3, key: 'personal' },
        paymentStatus: null,
        selectedGradesRef,
        selectedProgramDetails: undefined,
        programsData: { programs: [] },
        totalSteps: 6,
        form: { getValues: form.getValues, setValue: form.setValue, getFieldState: form.getFieldState },
        setRestoringDraft,
        setDraftLoaded,
        setDuplicateDraftConflict: vi.fn(),
        setGradesHydrating: vi.fn(),
        setError: vi.fn(),
        setSubmittedApplication: vi.fn(),
        markUploadedFile: vi.fn(),
        restorePaymentStatus: vi.fn(),
        showSuccess: vi.fn(),
        showWarning: vi.fn(),
        findProgramId: (value?: string | null) => value ?? '',
        deriveInstitutionLabel: () => 'Example College',
        resolveProgramIdentity: (value?: string | null) =>
          value ? { id: value, label: 'Nursing', institutionLabel: 'Example College' } : null,
        resolveIntakeIdentity: (value?: string | null) =>
          value ? { id: value, name: 'January 2027', label: 'January 2027' } : null,
        goToStep: vi.fn(),
        clearStaleApplicationReference: vi.fn(),
        hydrateServerGrades: vi.fn().mockResolvedValue([]),
        hydrateServerDocuments: vi.fn().mockResolvedValue({ result_slip: false, extra_kyc: false }),
      })
      React.useEffect(() => {
        const subscription = form.watch(() => machine.observe())
        return () => subscription.unsubscribe()
      }, [form, machine])
      const autosave = useSmartAutoSave({
        machine,
        snapshot,
        enabled: draftLoaded && !restoringDraft,
      })
      return { form, machine, snapshot, persistence, autosave, setRestoringDraft, setDraftLoaded }
    },
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    },
  )

  const system = {
    hook,
    get current() {
      return hook.result.current
    },
    get serverVersion() {
      return hook.result.current.machine.getSnapshot().serverVersion
    },
    /** What the loader does for a selected server draft. */
    async hydrate() {
      await act(async () => {
        hook.result.current.machine.beginHydration()
        for (const [key, value] of Object.entries(HYDRATED)) {
          hook.result.current.form.setValue(key as keyof WizardFormData, value as never, {
            shouldValidate: false,
          })
        }
        hook.result.current.machine.completeHydration({
          applicationId: APP_ID,
          serverVersion: version,
          source: 'server',
        })
        await flush()
      })
      await act(async () => {
        hook.result.current.setRestoringDraft(false)
        hook.result.current.setDraftLoaded(true)
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
    async saveNow() {
      await act(async () => {
        await hook.result.current.autosave.forceSave().catch(() => undefined)
        await flush()
      })
    },
    /** `index.tsx` handleProgressStepClick / handleNavigateToStep. */
    async navigate() {
      await act(async () => {
        await hook.result.current.machine.flush()
        await flush()
      })
    },
    /** `useWizardStepAdvance` on the personal step. */
    async continueRequiringServer() {
      let result: unknown
      await act(async () => {
        result = await hook.result.current.persistence
          .saveDraft({ syncServer: true, requireServer: true })
          .catch((error: unknown) => error)
        await flush()
      })
      return result
    },
    async goOffline() {
      await act(async () => {
        setOnline(false)
        window.dispatchEvent(new Event('offline'))
        await flush()
      })
    },
    async goOnline() {
      await act(async () => {
        setOnline(true)
        window.dispatchEvent(new Event('online'))
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
  api.updateDraft.mockImplementation(async () => record(nextVersion++))
  api.getRecord.mockImplementation(async () => record(3))
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  setOnline(true)
})

describe('PARITY — behaviour the single draft machine must keep', () => {
  it('P1: a hydrated, unedited draft issues no write on debounce or interval', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.advance(24_000)
    expect(api.updateDraft).not.toHaveBeenCalled()
    expect(api.startDraft).not.toHaveBeenCalled()
  })

  it('P2: one edit becomes one debounced versioned, idempotent write', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'Chipata')
    await system.advance(2_000)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    const [id, payload, expectedVersion, key] = api.updateDraft.mock.calls[0]!
    expect(id).toBe(APP_ID)
    expect(payload).toMatchObject({ residence_town: 'Chipata' })
    expect(payload).not.toHaveProperty('program')
    expect(payload).not.toHaveProperty('intake')
    expect(expectedVersion).toBe(3)
    expect(typeof key).toBe('string')
    expect(system.current.autosave.saveStatus).toBe('saved')
  })

  it('P3: an offline edit stays local, then saves once the connection returns', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.goOffline()
    await system.edit('residence_town', 'Mongu')
    await system.advance(2_000)
    expect(api.updateDraft).not.toHaveBeenCalled()
    expect(system.current.autosave.saveStatus).toBe('offline')
    const local = localStorage.getItem(getWizardDraftStorageKey(USER.id, APP_ID))
    expect(local).toContain('Mongu')

    await system.goOnline()
    await system.advance(100)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    expect(api.updateDraft.mock.calls[0]![1]).toMatchObject({ residence_town: 'Mongu' })
    expect(system.current.autosave.saveStatus).toBe('saved')
  })

  it('P4: a transient failure is retried with the same idempotency key and version', async () => {
    api.updateDraft.mockReset()
    api.updateDraft
      .mockRejectedValueOnce(Object.assign(new Error('Service unavailable'), { status: 503 }))
      .mockResolvedValueOnce(record(4))
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'Solwezi')
    await system.advance(2_000)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    await system.advance(1_000)
    expect(api.updateDraft).toHaveBeenCalledTimes(2)
    const [first, second] = api.updateDraft.mock.calls
    expect(second![2]).toBe(first![2])
    expect(second![3]).toBe(first![3])
    expect(system.current.autosave.saveStatus).toBe('saved')
  })

  it('P5: VERSION_CONFLICT is terminal — no retry, Save now does not write', async () => {
    api.updateDraft.mockReset()
    api.updateDraft.mockRejectedValue(
      Object.assign(new Error('stale'), { status: 409, data: { code: 'VERSION_CONFLICT', current_version: 9 } }),
    )
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'Kitwe')
    await system.advance(2_000)
    expect(system.current.autosave.saveStatus).toBe('conflict')
    expect(system.current.autosave.saveError).toMatch(/another tab or device/i)
    await system.advance(60_000)
    await system.saveNow()
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
  })

  it('P6: an edit made during a save is written next, on the new version with a new key', async () => {
    let release!: () => void
    api.updateDraft.mockReset()
    api.updateDraft
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(record(4))
          }),
      )
      .mockImplementation(async () => record(5))
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'First')
    await system.advance(2_000)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    await system.edit('residence_town', 'Second')
    await act(async () => {
      release()
      await flush()
    })
    await system.advance(2_100)
    expect(api.updateDraft).toHaveBeenCalledTimes(2)
    const [first, second] = api.updateDraft.mock.calls
    expect(second![1]).toMatchObject({ residence_town: 'Second' })
    expect(second![2]).toBe(4)
    expect(second![3]).not.toBe(first![3])
  })

  it('P7: an expired session stops cloud retries and says the work is on this device', async () => {
    api.updateDraft.mockReset()
    api.updateDraft.mockRejectedValue(new AuthenticationError('expired'))
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('residence_town', 'Ndola')
    await system.advance(2_000)
    expect(system.current.autosave.saveError).toMatch(/saved on this device/i)
    const callsAfterExpiry = api.updateDraft.mock.calls.length
    await system.advance(5_000)
    // No backoff retry is scheduled for an authentication failure.
    expect(api.updateDraft.mock.calls.length).toBe(callsAfterExpiry)
  })
})

describe('FIXED — the recorded defects, after the consolidation', () => {
  it('D1: Save now on an unchanged draft writes nothing', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.saveNow()
    expect(api.updateDraft).not.toHaveBeenCalled()
  })

  it('D2: step navigation on an unchanged draft writes nothing (the F3 residual)', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.navigate()
    expect(api.updateDraft).not.toHaveBeenCalled()
    expect(system.serverVersion).toBe(3)
  })

  it('D3: Continue on an unchanged personal step confirms with a read, never a write', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    const result = await system.continueRequiringServer()
    expect(api.updateDraft).not.toHaveBeenCalled()
    expect(api.getRecord).toHaveBeenCalledWith(APP_ID)
    expect(result).toMatchObject({ id: APP_ID, version: 3 })
  })

  it('D5: answers recovered from a pending local outbox record are sent without another keystroke', async () => {
    const system = mountDraftSystem()
    await act(async () => {
      system.current.machine.beginHydration()
      system.current.form.setValue('residence_town', 'Recovered offline', { shouldDirty: true })
      system.current.machine.completeHydration({
        applicationId: APP_ID,
        serverVersion: 3,
        source: 'local',
        pending: true,
      })
      await flush()
    })
    await act(async () => {
      system.current.setRestoringDraft(false)
      system.current.setDraftLoaded(true)
      await flush()
    })
    await system.advance(2_000)
    expect(api.updateDraft).toHaveBeenCalledTimes(1)
    expect(api.updateDraft.mock.calls[0]![1]).toMatchObject({ residence_town: 'Recovered offline' })
  })

  it('D4: a programme/intake-only change is not an answer write', async () => {
    const system = mountDraftSystem()
    await system.hydrate()
    await system.edit('intake', 'intake-2')
    await system.advance(2_000)
    await system.advance(8_000)
    expect(api.updateDraft).not.toHaveBeenCalled()
  })
})
