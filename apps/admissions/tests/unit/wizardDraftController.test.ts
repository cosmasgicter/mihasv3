/**
 * The draft machine's runtime (admissions-v2 task 6.3 — R10.2, R10.3, R10.4,
 * R10.7, R10.10; findings STU-02, STU-12, MAINT-01).
 *
 * Every case drives `WizardDraftController` through its public commands against
 * a fake server that implements the canonical draft contract (versioned,
 * idempotent). The PARITY cases are the ones `wizardDraftPersistenceCharacterisation`
 * recorded on the pre-consolidation composition; the FIXED cases are that file's
 * recorded defects, now asserting the corrected behaviour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS,
  WIZARD_DRAFT_DEBOUNCE_MS,
  WIZARD_DRAFT_MESSAGES,
  WizardDraftConflictError,
  deriveWizardDraftSaveView,
} from '@/lib/wizardDraftController'
import { createDraftHarness, settle } from './__fixtures__/wizardDraftHarness'

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
  await settle()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

function hydrated() {
  const harness = createDraftHarness()
  harness.machine.activate()
  harness.hydrate()
  return harness
}

describe('draft machine — parity with the pre-consolidation composition', () => {
  it('P1: a hydrated, unedited draft writes nothing on the debounce or the 8 s sweep', async () => {
    const h = hydrated()
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 3)
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.server.startCalls).toHaveLength(0)
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
  })

  it('P2: one edit becomes one debounced, versioned, idempotent write', async () => {
    const h = hydrated()
    h.edit('residence_town', 'Chipata')
    expect(h.machine.getSnapshot().state).toBe('ready.dirty')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(1)
    const [call] = h.server.updateCalls
    expect(call!.payload).toMatchObject({ residence_town: 'Chipata' })
    expect(call!.payload).not.toHaveProperty('program')
    expect(call!.payload).not.toHaveProperty('intake')
    expect(call!.expectedVersion).toBe(3)
    expect(h.machine.getSnapshot()).toMatchObject({ state: 'ready.clean', serverVersion: 4 })
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('saved')
  })

  it('P3: an offline edit stays in the outbox, then saves once the connection returns', async () => {
    const h = hydrated()
    h.setOnline(false)
    h.edit('residence_town', 'Mongu')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.machine.getSnapshot().state).toBe('offline.queued')
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('offline')
    expect(h.outbox.at(-1)).toMatchObject({ applicationId: 'app-1', serverVersion: 3, pending: true })

    h.setOnline(true)
    await advance(0)
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.updateCalls[0]!.payload).toMatchObject({ residence_town: 'Mongu' })
    expect(h.server.answers.residence_town).toBe('Mongu')
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
    expect(h.outbox.at(-1)).toMatchObject({ pending: false, serverVersion: 4 })
  })

  it('P4: a transient failure is retried with the same idempotency key and version, and shown as retrying', async () => {
    const h = hydrated()
    h.server.failures.push(Object.assign(new Error('Service unavailable'), { status: 503 }))
    h.edit('residence_town', 'Solwezi')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(1)
    const view = deriveWizardDraftSaveView(h.machine.getSnapshot())
    expect(view.status).toBe('retrying')
    expect(view.message).toBe('Service unavailable')
    await advance(1_000)
    expect(h.server.updateCalls).toHaveLength(2)
    const [first, second] = h.server.updateCalls
    expect(second!.key).toBe(first!.key)
    expect(second!.expectedVersion).toBe(first!.expectedVersion)
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
  })

  it('P4b: a response lost after commit is replayed by the same key, so the draft advances once', async () => {
    const h = hydrated()
    h.server.loseNextResponses = 1
    h.edit('residence_town', 'Kasama')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    await advance(1_000)
    expect(h.server.updateCalls).toHaveLength(2)
    expect(h.server.updateCalls[1]!.key).toBe(h.server.updateCalls[0]!.key)
    expect(h.server.version).toBe(4)
    expect(h.machine.getSnapshot()).toMatchObject({ state: 'ready.clean', serverVersion: 4 })
  })

  it('P5: VERSION_CONFLICT is terminal — no retry, Save now and the sweep do not write', async () => {
    const h = hydrated()
    h.server.writeFromAnotherDevice({ residence_town: 'Winner' })
    h.edit('residence_town', 'Stale')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    const snapshot = h.machine.getSnapshot()
    expect(snapshot.state).toBe('conflict')
    expect(snapshot.conflictVersion).toBe(4)
    expect(deriveWizardDraftSaveView(snapshot)).toEqual({
      status: 'conflict',
      message: WIZARD_DRAFT_MESSAGES.versionConflict,
    })
    await h.machine.saveNow()
    await advance(60_000)
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.answers.residence_town).toBe('Winner')
    // The stale edit is kept on the device for an explicit merge.
    expect(h.outbox.at(-1)).toMatchObject({ pending: true })
  })

  it('P6: an edit made during a save is written next, on the new version with a new key', async () => {
    const h = hydrated()
    const release = h.server.holdWrites()
    h.edit('residence_town', 'First')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.machine.getSnapshot().state).toBe('saving')
    // Typing is never blocked while the write is in flight.
    h.edit('residence_town', 'Second')
    expect(h.machine.getSnapshot().state).toBe('saving')
    release()
    await settle()
    expect(h.machine.getSnapshot()).toMatchObject({ state: 'ready.dirty', serverVersion: 4 })
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(2)
    const [first, second] = h.server.updateCalls
    expect(second!.payload).toMatchObject({ residence_town: 'Second' })
    expect(second!.expectedVersion).toBe(4)
    expect(second!.key).not.toBe(first!.key)
    expect(h.server.answers.residence_town).toBe('Second')
    expect(h.server.maxInFlight).toBe(1)
  })

  it('P7: an expired session stops cloud retries, says the work is on this device, and sends it on recovery', async () => {
    const h = hydrated()
    h.server.failures.push(Object.assign(new Error('expired'), { name: 'AuthenticationError' }))
    h.edit('residence_town', 'Ndola')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    const view = deriveWizardDraftSaveView(h.machine.getSnapshot())
    expect(view).toEqual({ status: 'error', message: WIZARD_DRAFT_MESSAGES.sessionExpired })
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(1)

    h.machine.authRecovered()
    await advance(0)
    expect(h.server.updateCalls).toHaveLength(2)
    expect(h.server.answers.residence_town).toBe('Ndola')
  })
})

describe('draft machine — the recorded defects, fixed (no same-value writes)', () => {
  it('D1: Save now on an unchanged draft writes nothing', async () => {
    const h = hydrated()
    await h.machine.saveNow()
    await settle()
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
  })

  it('D2: leaving a step on an unchanged draft writes nothing (the F3 residual)', async () => {
    const h = hydrated()
    await h.machine.flush()
    await h.machine.flush()
    await settle()
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.server.version).toBe(3)
  })

  it('D3: Continue on an unchanged draft confirms with a read, never a write', async () => {
    const h = hydrated()
    const record = await h.machine.commit()
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.server.readCalls).toEqual(['app-1'])
    expect(record).toMatchObject({ id: 'app-1', version: 3 })
  })

  it('D3b: Continue on an unchanged draft another device advanced is a conflict, not a silent pick', async () => {
    const h = hydrated()
    h.server.writeFromAnotherDevice({ residence_town: 'Elsewhere' })
    await expect(h.machine.commit()).rejects.toBeInstanceOf(WizardDraftConflictError)
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.machine.getSnapshot().state).toBe('conflict')
  })

  it('D4: a programme/intake-only change is not an answer write', async () => {
    const h = hydrated()
    h.edit('intake', 'intake-2')
    h.edit('program', 'program-2')
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(0)
  })

  it('D5: answers recovered from a pending local outbox record are sent without another keystroke', async () => {
    const h = createDraftHarness({ values: { residence_town: 'Recovered offline' } })
    h.machine.activate()
    h.machine.beginHydration()
    h.machine.completeHydration({ applicationId: 'app-1', serverVersion: 3, source: 'local', pending: true })
    expect(h.machine.getSnapshot().state).toBe('ready.dirty')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.updateCalls[0]!.payload).toMatchObject({ residence_town: 'Recovered offline' })
  })

  it('D6: a save that times out is replayed under the same key, and the replay in flight is shown as retrying (task 6.3 M14)', async () => {
    const h = hydrated()
    const releaseFirst = h.server.holdWrites()
    h.edit('residence_town', 'Slow network')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(1)
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('saving')
    // A browser keeps sweeping every 8 s while a slow write is in flight; the
    // sweep queues behind it.
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)
    expect(h.server.updateCalls).toHaveLength(1)

    // The client gives up waiting (the API client's 30 s timeout): a retryable
    // failure whose outcome the client cannot know. The queued sweep replays the
    // exact command at once; hold that replay in flight to look at it.
    h.server.failures.push(Object.assign(new Error('Request timed out'), { name: 'TimeoutError' }))
    releaseFirst()
    const releaseReplay = h.server.holdWrites()
    await settle()
    expect(h.server.updateCalls).toHaveLength(2)
    const [first, replay] = h.server.updateCalls
    expect(replay!.key).toBe(first!.key)
    expect(replay!.payload).toEqual(first!.payload)
    expect(replay!.expectedVersion).toBe(first!.expectedVersion)
    expect(h.machine.getSnapshot().state).toBe('saving')
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('retrying')

    releaseReplay()
    await settle()
    expect(h.machine.getSnapshot()).toMatchObject({ state: 'ready.clean', serverVersion: 4, retryAttempts: 0 })
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('saved')
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(2)
    expect(h.server.maxInFlight).toBe(1)
  })

  it('a clean local recovery record is never re-sent', async () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.machine.beginHydration()
    h.machine.completeHydration({ applicationId: 'app-1', serverVersion: 3, source: 'local', pending: false })
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(0)
  })

  it('an edit undone before the debounce fires leaves nothing to write (ready.clean <-> ready.dirty)', async () => {
    const h = hydrated()
    h.edit('residence_town', 'Typo')
    expect(h.machine.getSnapshot().state).toBe('ready.dirty')
    h.edit('residence_town', 'Kabwe')
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)
    expect(h.server.updateCalls).toHaveLength(0)
  })

  it('a non-student value change that the PATCH would not carry never writes', async () => {
    const h = hydrated()
    h.setQuietly('program', 'canonical-program-uuid')
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)
    expect(h.server.updateCalls).toHaveLength(0)
  })
})

describe('draft machine — conflict resolution (design §8.2: reload | explicit merge)', () => {
  it('reload writes nothing, discards only this draft’s stale outbox, and reloads the authoritative draft', async () => {
    const h = hydrated()
    h.server.writeFromAnotherDevice({ residence_town: 'Winner' })
    h.edit('residence_town', 'Stale')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    h.machine.resolveReload()
    expect(h.reloads).toHaveLength(1)
    expect(h.cleared).toEqual(['app-1'])
    expect(h.machine.getSnapshot().state).toBe('loading')
    expect(h.machine.getSnapshot().hasUnsyncedWork).toBe(false)
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('an explicit merge keeps the student’s change and adopts the other device’s', async () => {
    const h = hydrated()
    h.server.writeFromAnotherDevice({ next_of_kin_name: 'Other device kin' })
    h.edit('residence_town', 'My town')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.machine.getSnapshot().state).toBe('conflict')

    await h.machine.resolveMerge()
    await settle()
    expect(h.machine.getSnapshot()).toMatchObject({ state: 'ready.clean', serverVersion: 5 })
    expect(h.server.answers).toMatchObject({
      residence_town: 'My town',
      next_of_kin_name: 'Other device kin',
    })
    expect(h.values.next_of_kin_name).toBe('Other device kin')
    const mergeWrite = h.server.updateCalls.at(-1)!
    expect(mergeWrite.expectedVersion).toBe(4)
  })

  it('the outbox records, for each pending answer, the value the server last acknowledged', async () => {
    const h = hydrated()
    h.setOnline(false)
    h.edit('residence_town', 'Offline edit')
    const record = h.outbox.at(-1)!
    expect(record.pending).toBe(true)
    expect(record.pendingBase).toEqual({ residence_town: 'Kabwe' })
  })

  it('a stale outbox (pending edits on an older version) opens a conflict instead of being dropped or applied', async () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.server.writeFromAnotherDevice({ residence_town: 'Other device' })
    h.machine.beginHydration()
    h.machine.completeHydration({
      applicationId: 'app-1',
      serverVersion: h.server.version,
      source: 'server',
      staleOutbox: { serverVersion: 3, base: { residence_town: 'Kabwe' } },
    })
    const snapshot = h.machine.getSnapshot()
    expect(snapshot.state).toBe('conflict')
    expect(deriveWizardDraftSaveView(snapshot).status).toBe('conflict')
    // Nothing is written, and the outbox record (the student's stale work) is
    // left exactly as it was — not even overwritten by the hydration itself.
    expect(h.outbox).toHaveLength(0)
    h.edit('phone', '+260970000001')
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 3)
    h.machine.persistLocal()
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.outbox).toHaveLength(0)
  })

  it('an explicit merge of a stale outbox restores the stale edits and merges them onto the newer version', async () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.server.writeFromAnotherDevice({ next_of_kin_name: 'Other device kin' })
    h.hydrate()
    // Simulate the loader's classification of an older-version outbox.
    h.machine.beginHydration()
    h.machine.completeHydration({
      applicationId: 'app-1',
      serverVersion: h.server.version,
      source: 'server',
      staleOutbox: { serverVersion: 3, base: { residence_town: 'Kabwe' } },
    })
    h.adapters.restoreStaleOutbox = () => {
      h.edit('residence_town', 'My offline town')
      return true
    }
    await h.machine.resolveMerge()
    await settle()
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
    expect(h.server.answers).toMatchObject({
      residence_town: 'My offline town',
      next_of_kin_name: 'Other device kin',
    })
  })

  it('an outbox addressed to another assignment opens the conflict with words that say so (task 6.3 M14)', () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.machine.beginHydration()
    h.machine.completeHydration({
      applicationId: 'app-1',
      serverVersion: 3,
      source: 'server',
      assignment: 'off-b|in-b',
      staleOutbox: { serverVersion: 3, base: { residence_town: 'Kabwe' }, reason: 'assignment' },
    })
    const snapshot = h.machine.getSnapshot()
    expect(snapshot.state).toBe('conflict')
    expect(deriveWizardDraftSaveView(snapshot)).toEqual({
      status: 'conflict',
      message: WIZARD_DRAFT_MESSAGES.assignmentConflict,
    })
    expect(h.outbox).toHaveLength(0)
  })

  it('an outbox that could not be read is left untouched by hydration; the next edit writes it (task 6.3 M14)', async () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.machine.beginHydration()
    h.machine.completeHydration({
      applicationId: 'app-1',
      serverVersion: 3,
      source: 'server',
      assignment: 'off-a|in-a',
      localUnread: true,
    })
    h.machine.observe()
    expect(h.outbox).toHaveLength(0)
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
    h.edit('residence_town', 'Typed after an unread outbox')
    expect(h.outbox.at(-1)).toMatchObject({ applicationId: 'app-1', assignment: 'off-a|in-a', pending: true })
  })

  it('a merge is never automatic: a conflict waits for the student indefinitely', async () => {
    const h = hydrated()
    h.server.writeFromAnotherDevice({ residence_town: 'Winner' })
    h.edit('residence_town', 'Stale')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 10)
    expect(h.machine.getSnapshot().state).toBe('conflict')
    expect(h.server.answers.residence_town).toBe('Winner')
    expect(h.server.readCalls).toHaveLength(0)
  })
})

describe('draft machine — start, hydration, submit, gates', () => {
  it('an unattached draft starts once creatable and attaches to the created id and version', async () => {
    const h = createDraftHarness({ applicationId: null, values: { country: 'Zambia' } })
    h.machine.activate()
    h.machine.startNew()
    h.edit('full_name', 'New Student')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.startCalls).toHaveLength(0)
    expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('saved-local')
    for (const [field, value] of Object.entries({
      date_of_birth: '2004-01-01',
      sex: 'Female',
      phone: '+260971111111',
      email: 'new@example.com',
      residence_town: 'Lusaka',
      nrc_number: '111111/11/1',
      program: 'program-1',
      intake: 'intake-1',
    })) {
      h.edit(field as never, value)
    }
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.startCalls).toHaveLength(1)
    expect(h.machine.getSnapshot()).toMatchObject({ applicationId: 'app-new', serverVersion: 1, state: 'ready.clean' })
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(0)
  })

  it('a failed hydration never writes, so projection blanks cannot overwrite real answers', async () => {
    const h = createDraftHarness({ values: {} })
    h.machine.activate()
    h.machine.beginHydration()
    h.machine.failHydration({ applicationId: 'app-1' })
    h.edit('residence_town', 'Typed into a broken resume')
    await h.machine.saveNow()
    await h.machine.flush()
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    await expect(h.machine.commit()).rejects.toThrow()
    expect(h.server.updateCalls).toHaveLength(0)
    expect(h.outbox).toHaveLength(0)
    expect(h.machine.getSnapshot()).toMatchObject({ applicationId: 'app-1', hydrationFailed: true, hasUnsyncedWork: false })
  })

  it('submit writes pending answers first, then reaches the terminal submitted state and clears only this outbox', async () => {
    const h = hydrated()
    h.edit('residence_town', 'Before submit')
    const run = vi.fn(async () => ({ id: 'app-1', status: 'submitted' }))
    const result = await h.machine.submit(run)
    expect(result).toEqual({ id: 'app-1', status: 'submitted' })
    expect(h.server.updateCalls).toHaveLength(1)
    expect(run).toHaveBeenCalledTimes(1)
    expect(h.machine.getSnapshot().state).toBe('submitted')
    expect(h.cleared).toEqual(['app-1'])
    h.edit('residence_town', 'After submit')
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('a double submit joins the one in flight', async () => {
    const h = hydrated()
    let release!: (value: unknown) => void
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    const first = h.machine.submit(run)
    const second = h.machine.submit(run)
    await settle()
    release({ ok: true })
    await expect(first).resolves.toEqual({ ok: true })
    await expect(second).resolves.toEqual({ ok: true })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('a failed submit returns to ready.with_errors and the draft stays editable', async () => {
    const h = hydrated()
    await expect(h.machine.submit(async () => Promise.reject(new Error('server said no')))).rejects.toThrow(
      'server said no',
    )
    expect(h.machine.getSnapshot().state).toBe('ready.with_errors')
    h.edit('residence_town', 'Fixed it')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('the autosave gate holds writes while paused and releases them, with a deferred Save now', async () => {
    const h = hydrated()
    h.machine.setPaused(true)
    h.edit('residence_town', 'During upload')
    await h.machine.saveNow()
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 2)
    expect(h.server.updateCalls).toHaveLength(0)
    h.machine.setPaused(false)
    await advance(0)
    expect(h.server.updateCalls).toHaveLength(1)
  })

  it('a missing draft (404) is detached and never resurrected by autosave', async () => {
    const h = hydrated()
    h.server.exists = false
    h.edit('residence_town', 'After delete')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.machine.getSnapshot().applicationId).toBeNull()
    await advance(WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS * 3)
    expect(h.server.updateCalls).toHaveLength(1)
    expect(h.server.startCalls).toHaveLength(0)
  })

  it('a missing draft (404) has its own outbox record cleared; the answers stay unattached on this device', async () => {
    const h = hydrated()
    h.server.exists = false
    h.edit('residence_town', 'After delete')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.cleared).toEqual(['app-1'])
    expect(h.outbox.at(-1)).toMatchObject({ applicationId: null, assignment: null, pending: true })
  })

  it('PAY marks payment activity without moving the persistence lifecycle', () => {
    const h = hydrated()
    h.machine.notePaymentActivity()
    expect(h.machine.getSnapshot()).toMatchObject({ paymentActivity: true, state: 'ready.clean' })
  })

  it('a reroute version is adopted, so the next answer write carries it', async () => {
    const h = hydrated()
    h.server.writeFromAnotherDevice({})
    h.machine.acknowledgeServerRecord({ id: 'app-1', version: 4 })
    h.edit('residence_town', 'After reroute')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS)
    expect(h.server.updateCalls[0]!.expectedVersion).toBe(4)
    expect(h.machine.getSnapshot().state).toBe('ready.clean')
  })

  it('a reroute with pending work re-addresses its outbox record to the new version and assignment', () => {
    const h = createDraftHarness()
    h.machine.activate()
    h.machine.beginHydration()
    h.machine.completeHydration({ applicationId: 'app-1', serverVersion: 3, source: 'server', assignment: 'off-a|in-a' })
    h.setOnline(false)
    h.edit('residence_town', 'Typed before the reroute')
    expect(h.outbox.at(-1)).toMatchObject({ pending: true, serverVersion: 3, assignment: 'off-a|in-a' })
    h.machine.acknowledgeServerRecord({ id: 'app-1', version: 4, program_offering_id: 'off-b', intake_id: 'in-b' })
    expect(h.outbox.at(-1)).toMatchObject({ pending: true, serverVersion: 4, assignment: 'off-b|in-b' })
  })

  it('a command in flight for a previous draft never attaches to the next one', async () => {
    const h = hydrated()
    h.edit('residence_town', 'Old draft edit')
    await advance(WIZARD_DRAFT_DEBOUNCE_MS - 1)
    const pending = vi.advanceTimersByTimeAsync(1)
    h.machine.startNew()
    await pending
    await settle()
    expect(h.machine.getSnapshot()).toMatchObject({ applicationId: null, serverVersion: null })
  })
})
