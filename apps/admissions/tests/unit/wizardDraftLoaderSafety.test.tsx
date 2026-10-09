/**
 * `useWizardDraftLoader` — selected-draft safety (task 11.2 / M9), now as the
 * draft machine's hydration adapter (task 6.3).
 *
 * The loader reads the sources and reports the outcome; the machine owns the
 * application id, version and baseline from there on. The safety claims are the
 * ones M9 pinned — a failed authoritative read fails closed, before any
 * projection blank reaches the form — plus the ones the machine adds: a failed
 * resume leaves the machine addressed to the selected draft and writing nothing,
 * and a successful one hands it a server baseline so a resume writes nothing.
 */
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UseFormSetValue } from 'react-hook-form'

import { useWizardDraftLoader } from '@/pages/student/applicationWizard/hooks/wizard/useWizardDraftLoader'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'
import type { User } from '@/types/auth'
import type { WizardDraftController } from '@/lib/wizardDraftController'

const mocks = vi.hoisted(() => ({
  getRecord: vi.fn(),
  getLocalWizardDraft: vi.fn(),
  isDraftDeleted: vi.fn(),
  clearDraftDeletedFlag: vi.fn(),
  clearNewWizardDraftCache: vi.fn(),
  cachedGetItem: vi.fn(),
  cachedRemoveItem: vi.fn(),
  whenSecureStorageReady: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/services/applications', () => ({
  applicationService: { getRecord: mocks.getRecord },
}))

vi.mock('@/lib/applicationSession', () => ({
  applicationSessionManager: {
    getLocalWizardDraft: mocks.getLocalWizardDraft,
  },
}))

vi.mock('@/lib/draftManager', () => ({
  isDraftDeleted: mocks.isDraftDeleted,
  clearDraftDeletedFlag: mocks.clearDraftDeletedFlag,
}))

vi.mock('@/lib/draftLocalCache', () => ({
  clearNewWizardDraftCache: mocks.clearNewWizardDraftCache,
}))

vi.mock('@/lib/localStorageCache', () => ({
  cachedGetItem: mocks.cachedGetItem,
  cachedRemoveItem: mocks.cachedRemoveItem,
  whenSecureStorageReady: mocks.whenSecureStorageReady,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}))

const user: User = {
  id: 'user-1',
  email: 'student@example.com',
  role: 'student',
}

function fakeMachine() {
  return {
    startNew: vi.fn(),
    reset: vi.fn(),
    beginHydration: vi.fn(),
    completeHydration: vi.fn(),
    failHydration: vi.fn(),
  }
}

function mountSelectedDraftLoader() {
  const machine = fakeMachine()
  const setValue = vi.fn()
  const setRestoringDraft = vi.fn()
  const setDraftLoaded = vi.fn()
  const setError = vi.fn()
  const setSelectedGrades = vi.fn()
  const setGradesHydrating = vi.fn()
  const goToStep = vi.fn()
  const markUploadedFile = vi.fn()
  const restorePaymentStatus = vi.fn()
  const showSuccess = vi.fn()
  const findProgramId = vi.fn(() => 'program-1')
  const hydrateServerGrades = vi.fn().mockResolvedValue([])
  const hydrateServerDocuments = vi.fn().mockResolvedValue({
    result_slip: false,
    extra_kyc: false,
  })
  const restoreServerDraft = vi.fn(async (draft: Record<string, unknown>) => {
    // The shared hydration writes the row it is given into the form.
    for (const [key, value] of Object.entries(draft)) setValue(key, value, { shouldValidate: false })
    return { stepId: 3 }
  })
  const replay = vi.fn()
  const outboxRecoveryFor = vi.fn(() => ({ afterBaseline: replay }))

  renderHook(() =>
    useWizardDraftLoader({
      machine: machine as unknown as WizardDraftController,
      user,
      authLoading: false,
      draftLoaded: false,
      draftApplicationsLoading: false,
      draftApplications: {
        applications: [
          {
            id: 'draft-1',
            full_name: 'List Student',
            email: 'list@example.com',
            phone: '+260970000000',
            program: 'Nursing',
            intake: 'January 2027',
            institution: 'Example College',
            version: 6,
          },
        ],
      },
      locationSearch: '?mode=resume&draftId=draft-1',
      totalSteps: 6,
      programsData: { programs: [] },
      setValue: setValue as unknown as UseFormSetValue<WizardFormData>,
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
    }),
  )

  return {
    machine,
    setValue,
    setDraftLoaded,
    setError,
    showSuccess,
    restoreServerDraft,
    outboxRecoveryFor,
    replay,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getLocalWizardDraft.mockResolvedValue(null)
  mocks.isDraftDeleted.mockReturnValue(false)
  mocks.cachedGetItem.mockReturnValue(null)
  mocks.whenSecureStorageReady.mockResolvedValue(true)
})

describe('useWizardDraftLoader selected-draft safety', () => {
  it.each([
    ['request failure', () => mocks.getRecord.mockRejectedValue(new Error('network unavailable'))],
    ['empty response', () => mocks.getRecord.mockResolvedValue(null)],
  ])('fails closed on a %s without hydrating projection blanks', async (_case, arrange) => {
    arrange()
    const view = mountSelectedDraftLoader()

    await waitFor(() =>
      expect(view.setError).toHaveBeenCalledWith(
        expect.stringMatching(/could not load your selected draft/i),
      ),
    )

    expect(view.setValue).not.toHaveBeenCalled()
    expect(view.restoreServerDraft).not.toHaveBeenCalled()
    expect(view.showSuccess).not.toHaveBeenCalled()
    // The machine stays addressed to the selected draft, and writes nothing.
    expect(view.machine.beginHydration).toHaveBeenCalled()
    expect(view.machine.failHydration).toHaveBeenCalledWith({ applicationId: 'draft-1' })
    expect(view.machine.completeHydration).not.toHaveBeenCalled()
    expect(view.machine.startNew).not.toHaveBeenCalled()
    expect(view.setDraftLoaded).toHaveBeenCalledWith(true)
  })

  it('still hydrates omitted personal answers from a readable authoritative row', async () => {
    mocks.getRecord.mockResolvedValue({
      id: 'draft-1',
      version: 7,
      assignment_version: 3,
      nrc_number: '123456/78/9',
      passport_number: '',
      date_of_birth: '2004-05-04',
      sex: 'male',
      residence_town: 'Kabwe',
      country: 'Zambia',
      nationality: 'Zambian',
      next_of_kin_name: 'Next Of Kin',
      next_of_kin_phone: '+260977654321',
    })
    const view = mountSelectedDraftLoader()

    await waitFor(() => expect(view.showSuccess).toHaveBeenCalledWith('Draft restored successfully'))

    const [restoredRow, restoredId] = view.restoreServerDraft.mock.calls[0]!
    expect(restoredId).toBe('draft-1')
    expect(restoredRow).toMatchObject({
      nrc_number: '123456/78/9',
      residence_town: 'Kabwe',
      next_of_kin_name: 'Next Of Kin',
      version: 7,
    })
    // The server row becomes the machine's baseline, at the row's version. The
    // list item carries no canonical binding here, so there is no assignment to
    // address the outbox with (task 6.3 M14) and the version rule alone decides.
    expect(view.outboxRecoveryFor).toHaveBeenCalledWith('draft-1', 7, { assignment: null, readable: true })
    expect(view.machine.completeHydration).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'draft-1',
        serverVersion: 7,
        source: 'server',
        afterBaseline: view.replay,
      }),
    )
    expect(view.machine.failHydration).not.toHaveBeenCalled()
    expect(view.setError).not.toHaveBeenCalled()
  })

  it('runs one hydration per intent, even when its inputs change while it awaits the server', async () => {
    // The F3 browser run caught this: the catalogue arriving mid-load re-ran the
    // effect, a second hydration started, and it moved the student back to the
    // resume step after they had already gone to another one.
    let releaseRecord!: (value: unknown) => void
    mocks.getRecord.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseRecord = resolve
        }),
    )
    const machine = fakeMachine()
    const restoreServerDraft = vi.fn(async () => ({ stepId: 4 }))
    const setDraftLoaded = vi.fn()
    const baseProps = {
      machine: machine as unknown as WizardDraftController,
      user,
      authLoading: false,
      draftLoaded: false,
      draftApplicationsLoading: false,
      draftApplications: { applications: [{ id: 'draft-1', program: 'Nursing', version: 6 }] },
      locationSearch: '?mode=resume&draftId=draft-1',
      totalSteps: 6,
      setValue: vi.fn() as unknown as UseFormSetValue<WizardFormData>,
      setRestoringDraft: vi.fn(),
      setDraftLoaded,
      setError: vi.fn(),
      setSelectedGrades: vi.fn(),
      setGradesHydrating: vi.fn(),
      goToStep: vi.fn(),
      markUploadedFile: vi.fn(),
      restorePaymentStatus: vi.fn(),
      showSuccess: vi.fn(),
      findProgramId: vi.fn(() => ''),
      hydrateServerGrades: vi.fn().mockResolvedValue([]),
      hydrateServerDocuments: vi.fn().mockResolvedValue({ result_slip: false, extra_kyc: false }),
      outboxRecoveryFor: vi.fn(() => ({})),
    }
    const { rerender } = renderHook((props: { programs: unknown[] }) =>
      useWizardDraftLoader({
        ...baseProps,
        programsData: { programs: props.programs },
        restoreServerDraft,
      }),
      { initialProps: { programs: [] } },
    )
    await waitFor(() => expect(mocks.getRecord).toHaveBeenCalledTimes(1))
    // The catalogue arrives while the authoritative read is still in flight.
    rerender({ programs: [{ id: 'program-1', name: 'Nursing' }] })
    rerender({ programs: [{ id: 'program-1', name: 'Nursing' }, { id: 'program-2', name: 'Other' }] })
    releaseRecord({ id: 'draft-1', version: 6, residence_town: 'Kabwe' })
    await waitFor(() => expect(machine.completeHydration).toHaveBeenCalledTimes(1))
    expect(mocks.getRecord).toHaveBeenCalledTimes(1)
    expect(machine.beginHydration).toHaveBeenCalledTimes(1)
    expect(restoreServerDraft).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the selected draft is not among the student’s drafts', async () => {
    const view = (() => {
      const machine = fakeMachine()
      const setError = vi.fn()
      const setDraftLoaded = vi.fn()
      renderHook(() =>
        useWizardDraftLoader({
          machine: machine as unknown as WizardDraftController,
          user,
          authLoading: false,
          draftLoaded: false,
          draftApplicationsLoading: false,
          draftApplications: { applications: [{ id: 'another-draft', version: 2 }] },
          locationSearch: '?mode=resume&draftId=draft-1',
          totalSteps: 6,
          programsData: { programs: [] },
          setValue: vi.fn() as unknown as UseFormSetValue<WizardFormData>,
          setRestoringDraft: vi.fn(),
          setDraftLoaded,
          setError,
          setSelectedGrades: vi.fn(),
          setGradesHydrating: vi.fn(),
          goToStep: vi.fn(),
          markUploadedFile: vi.fn(),
          restorePaymentStatus: vi.fn(),
          showSuccess: vi.fn(),
          findProgramId: vi.fn(() => ''),
          hydrateServerGrades: vi.fn().mockResolvedValue([]),
          hydrateServerDocuments: vi.fn().mockResolvedValue({ result_slip: false, extra_kyc: false }),
          restoreServerDraft: vi.fn(),
          outboxRecoveryFor: vi.fn(() => ({})),
        }),
      )
      return { machine, setError, setDraftLoaded }
    })()

    await waitFor(() => expect(view.setDraftLoaded).toHaveBeenCalledWith(true))
    expect(view.machine.failHydration).toHaveBeenCalledWith({ applicationId: 'draft-1' })
    expect(view.machine.startNew).not.toHaveBeenCalled()
    expect(view.setError).toHaveBeenCalledWith(expect.stringMatching(/could not load your selected draft/i))
  })

  // Task 6.3 completion pass (R10.2, R10.4): a local outbox record is recovered
  // under its own `(user, application)` address. The loader used to second-guess
  // that address against "the first stored record" of any user or application,
  // and dropped the id when another record was listed first — so the recovered
  // answers were started as a second application instead of syncing to theirs.
  it('recovers a local outbox record under its own application id', async () => {
    mocks.getLocalWizardDraft.mockResolvedValue({
      version: 2,
      userId: 'user-1',
      applicationId: 'draft-local',
      serverVersion: 4,
      pending: true,
      currentStepKey: 'personal',
      formData: { full_name: 'Local Student', residence_town: 'Mongu' },
    })
    const machine = fakeMachine()
    const setDraftLoaded = vi.fn()
    const hydrateServerDocuments = vi.fn().mockResolvedValue({ result_slip: false, extra_kyc: false })
    renderHook(() =>
      useWizardDraftLoader({
        machine: machine as unknown as WizardDraftController,
        user,
        authLoading: false,
        draftLoaded: false,
        draftApplicationsLoading: false,
        draftApplications: { applications: [] },
        locationSearch: '?localDraft=true',
        totalSteps: 6,
        programsData: { programs: [] },
        setValue: vi.fn() as unknown as UseFormSetValue<WizardFormData>,
        setRestoringDraft: vi.fn(),
        setDraftLoaded,
        setError: vi.fn(),
        setSelectedGrades: vi.fn(),
        setGradesHydrating: vi.fn(),
        goToStep: vi.fn(),
        markUploadedFile: vi.fn(),
        restorePaymentStatus: vi.fn(),
        showSuccess: vi.fn(),
        findProgramId: vi.fn(() => ''),
        hydrateServerGrades: vi.fn().mockResolvedValue([]),
        hydrateServerDocuments,
        restoreServerDraft: vi.fn(),
        outboxRecoveryFor: vi.fn(() => ({})),
      }),
    )

    await waitFor(() => expect(machine.completeHydration).toHaveBeenCalledTimes(1))
    expect(machine.completeHydration).toHaveBeenCalledWith({
      applicationId: 'draft-local',
      serverVersion: 4,
      source: 'local',
      pending: true,
    })
    expect(hydrateServerDocuments).toHaveBeenCalledWith('draft-local')
    expect(machine.startNew).not.toHaveBeenCalled()
  })

  // Task 6.3 M13 (R10.4, R10.8): the outbox is encrypted, and it is readable only
  // once this user's key is derived and the record decrypted into memory. The
  // browser run measured the loader reading it ~1.2 s before a slow key
  // derivation finished — so it read nothing, and the clean record hydration then
  // wrote replaced the student's unsent edits.
  it('reads neither the outbox nor the server until the encrypted outbox is readable', async () => {
    let markReady!: (ready: boolean) => void
    mocks.whenSecureStorageReady.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          markReady = resolve
        }),
    )
    mocks.getRecord.mockResolvedValue({ id: 'draft-1', version: 7, residence_town: 'Kabwe' })
    const view = mountSelectedDraftLoader()

    await waitFor(() => expect(view.machine.beginHydration).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.getLocalWizardDraft).not.toHaveBeenCalled()
    expect(mocks.getRecord).not.toHaveBeenCalled()
    expect(view.outboxRecoveryFor).not.toHaveBeenCalled()
    expect(view.machine.completeHydration).not.toHaveBeenCalled()

    markReady(true)
    await waitFor(() => expect(view.machine.completeHydration).toHaveBeenCalledTimes(1))
    expect(view.outboxRecoveryFor).toHaveBeenCalledWith('draft-1', 7, { assignment: null, readable: true })
    expect(mocks.whenSecureStorageReady).toHaveBeenCalledWith(expect.any(Number))
  })

  it('still hydrates the server draft when the outbox never becomes readable', async () => {
    mocks.whenSecureStorageReady.mockResolvedValue(false)
    mocks.getRecord.mockResolvedValue({ id: 'draft-1', version: 7, residence_town: 'Kabwe' })
    const view = mountSelectedDraftLoader()

    await waitFor(() => expect(view.machine.completeHydration).toHaveBeenCalledTimes(1))
    expect(view.machine.completeHydration).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'draft-1', serverVersion: 7, source: 'server' }),
    )
    expect(view.machine.failHydration).not.toHaveBeenCalled()
    // Task 6.3 M14: the unread outbox is reported as unread, so hydration leaves
    // the record alone rather than settling over work it never saw.
    expect(view.outboxRecoveryFor).toHaveBeenCalledWith('draft-1', 7, { assignment: null, readable: false })
  })

  // Task 6.3 M14 (R10.4, design §8.2): the outbox record is addressed by
  // (user, application, assignment). The assignment is the canonical binding the
  // server reports for the draft, handed to the machine and to the outbox read.
  it('addresses the outbox with the canonical offering and intake the server reports', async () => {
    mocks.getRecord.mockResolvedValue({ id: 'draft-1', version: 7, residence_town: 'Kabwe' })
    const machine = fakeMachine()
    const outboxRecoveryFor = vi.fn(() => ({}))
    renderHook(() =>
      useWizardDraftLoader({
        machine: machine as unknown as WizardDraftController,
        user,
        authLoading: false,
        draftLoaded: false,
        draftApplicationsLoading: false,
        draftApplications: {
          applications: [
            { id: 'draft-1', version: 6, program_offering_id: 'offering-1', intake_id: 'intake-1' },
          ],
        },
        locationSearch: '?mode=resume&draftId=draft-1',
        totalSteps: 6,
        programsData: { programs: [] },
        setValue: vi.fn() as unknown as UseFormSetValue<WizardFormData>,
        setRestoringDraft: vi.fn(),
        setDraftLoaded: vi.fn(),
        setError: vi.fn(),
        setSelectedGrades: vi.fn(),
        setGradesHydrating: vi.fn(),
        goToStep: vi.fn(),
        markUploadedFile: vi.fn(),
        restorePaymentStatus: vi.fn(),
        showSuccess: vi.fn(),
        findProgramId: vi.fn(() => ''),
        hydrateServerGrades: vi.fn().mockResolvedValue([]),
        hydrateServerDocuments: vi.fn().mockResolvedValue({ result_slip: false, extra_kyc: false }),
        restoreServerDraft: vi.fn(async () => ({ stepId: 3 })),
        outboxRecoveryFor,
      }),
    )

    await waitFor(() => expect(machine.completeHydration).toHaveBeenCalledTimes(1))
    expect(outboxRecoveryFor).toHaveBeenCalledWith('draft-1', 7, {
      assignment: 'offering-1|intake-1',
      readable: true,
    })
    expect(machine.completeHydration).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 'draft-1', serverVersion: 7, assignment: 'offering-1|intake-1' }),
    )
  })
})
