/**
 * Grades through the production draft composition (SJR task 3.23, R6-b).
 *
 * The one draft machine, the real `useWizardDraftPersistence` adapters and the
 * real outbox cache, with a grade grid held in React state the way the wizard
 * holds it. Covers what the unit cases cannot: the adapters' request shape, the
 * outbox record while grades are pending, and a reload that finds one.
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
  syncGrades: vi.fn(),
}))
vi.mock('@/services/applications', () => ({ applicationService: api }))

import { useWizardDraftMachine } from '@/pages/student/applicationWizard/hooks/useWizardDraftMachine'
import { useWizardDraftPersistence } from '@/pages/student/applicationWizard/hooks/wizard/useWizardDraftPersistence'
import type { SubjectGrade, WizardFormData } from '@/pages/student/applicationWizard/types'
import { getWizardDraftStorageKey } from '@/lib/draftStorageKeys'
import { resetCache } from '@/lib/localStorageCache'
import { WIZARD_DRAFT_DEBOUNCE_MS } from '@/lib/wizardDraftController'

const USER = { id: 'user-1', email: 'student@example.com', role: 'student' } as const
const APP_ID = 'app-1'
const id = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`
const GRADES: SubjectGrade[] = [1, 2, 3].map((n) => ({ row_id: `r${n}`, subject_id: id(n), grade: 4 }))
const SERVER_GRADES = [1, 2].map((n) => ({ subject_id: id(n), grade: 4 }))
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
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}
const row = (version: number) => ({
  id: APP_ID,
  status: 'draft',
  version,
  assignment_version: 1,
  payment_status: null,
  program_offering_id: 'offering-a',
  intake_id: 'intake-a',
  ...HYDRATED,
})
const recordKey = () => getWizardDraftStorageKey(USER.id, APP_ID)
const stored = () => {
  const raw = localStorage.getItem(recordKey())
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null
}

function mount() {
  const hook = renderHook(
    () => {
      const form = useForm<WizardFormData>({ defaultValues: { country: 'Zambia' } as WizardFormData })
      const { machine, snapshot } = useWizardDraftMachine()
      const [selectedGrades, setSelectedGrades] = React.useState<SubjectGrade[]>([])
      const selectedGradesRef = React.useRef<SubjectGrade[]>([])
      selectedGradesRef.current = selectedGrades
      const persistence = useWizardDraftPersistence({
        machine,
        user: USER as never,
        profile: null,
        uploadedFiles: {},
        currentStepConfig: { id: 4, key: 'education' },
        paymentStatus: null,
        selectedGradesRef,
        setSelectedGrades,
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
        // What the controller's hook does: the ref moves with the state.
        hydrateServerGrades: async () => {
          const rows = SERVER_GRADES.map((grade, index) => ({ row_id: `s${index}`, ...grade }))
          selectedGradesRef.current = rows
          setSelectedGrades(rows)
          return rows
        },
        hydrateServerDocuments: async () => ({ result_slip: false, extra_kyc: false }),
      })
      React.useEffect(() => {
        const subscription = form.watch(() => machine.observe())
        return () => subscription.unsubscribe()
      }, [form, machine])
      React.useEffect(() => {
        machine.observe()
      }, [machine, selectedGrades])
      return { form, machine, snapshot, persistence, selectedGrades, setSelectedGrades }
    },
    { wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider> },
  )
  return {
    get current() {
      return hook.result.current
    },
    async hydrate() {
      await act(async () => {
        const { machine, persistence } = hook.result.current
        machine.activate()
        machine.beginHydration()
        await persistence.restoreServerDraft(row(3), APP_ID)
        const assignment = 'offering-a|intake-a'
        machine.completeHydration({
          applicationId: APP_ID,
          serverVersion: 3,
          source: 'server',
          assignment,
          ...persistence.outboxRecoveryFor(APP_ID, 3, { assignment, readable: true }),
        })
        await flush()
      })
    },
    async setGrades(grades: SubjectGrade[]) {
      await act(async () => {
        hook.result.current.setSelectedGrades(grades)
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
}

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  localStorage.clear()
  sessionStorage.clear()
  resetCache()
  Object.values(api).forEach((fn) => fn.mockReset())
  api.syncGrades.mockResolvedValue({ grades: [] })
  api.getRecord.mockImplementation(async () => row(3))
  api.updateDraft.mockImplementation(async () => row(4))
})
afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('grades through the draft composition', () => {
  it('a resume writes nothing; a grade edit is sent once, as a partial set, under a key', async () => {
    const system = mount()
    await system.hydrate()
    expect(system.current.selectedGrades).toHaveLength(2)
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS * 2)
    expect(api.syncGrades).not.toHaveBeenCalled()
    expect(api.updateDraft).not.toHaveBeenCalled()

    await system.setGrades(GRADES)
    expect(stored()).toMatchObject({ version: 4, grades: GRADES.map(({ subject_id, grade }) => ({ subject_id, grade })) })
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.syncGrades).toHaveBeenCalledTimes(1)
    expect(api.syncGrades).toHaveBeenCalledWith(
      APP_ID,
      GRADES.map(({ subject_id, grade }) => ({ subject_id, grade })),
      expect.objectContaining({ partial: true, idempotencyKey: expect.stringMatching(/^grades-/) }),
    )
    expect(api.updateDraft).not.toHaveBeenCalled()
    expect(stored()).toBeNull()
    expect(system.current.snapshot.pending).toBe(false)
  })

  it('a reload that finds pending grades puts them back and sends them', async () => {
    localStorage.setItem(
      recordKey(),
      JSON.stringify({
        version: 4,
        userId: USER.id,
        applicationId: APP_ID,
        assignment: 'offering-a|intake-a',
        serverVersion: 3,
        pending: true,
        answers: {},
        pendingBase: {},
        grades: GRADES.map(({ subject_id, grade }) => ({ subject_id, grade })),
        savedAt: '2026-10-08T10:00:00.000Z',
      }),
    )
    const system = mount()
    await system.hydrate()
    expect(system.current.selectedGrades.map((grade) => grade.subject_id)).toEqual(GRADES.map((grade) => grade.subject_id))
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(api.syncGrades).toHaveBeenCalledTimes(1)
    expect(system.current.snapshot.pending).toBe(false)
    expect(stored()).toBeNull()
  })

  it('pending grades made on an older version wait for an explicit choice instead of being sent', async () => {
    localStorage.setItem(
      recordKey(),
      JSON.stringify({
        version: 4,
        userId: USER.id,
        applicationId: APP_ID,
        assignment: 'offering-a|intake-a',
        serverVersion: 2,
        pending: true,
        answers: {},
        pendingBase: {},
        grades: GRADES.map(({ subject_id, grade }) => ({ subject_id, grade })),
        savedAt: '2026-10-08T10:00:00.000Z',
      }),
    )
    const system = mount()
    await system.hydrate()
    await system.advance(WIZARD_DRAFT_DEBOUNCE_MS * 2)
    expect(system.current.snapshot.state).toBe('conflict')
    expect(api.syncGrades).not.toHaveBeenCalled()
    expect(system.current.selectedGrades).toHaveLength(2)
  })
})
