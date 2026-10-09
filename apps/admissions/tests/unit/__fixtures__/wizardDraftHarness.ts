/**
 * A small, faithful stand-in for the canonical draft endpoints plus a form, so
 * the draft machine can be driven end to end without React (task 6.3).
 *
 * The fake server implements the contract the real one does
 * (`PATCH /applications/drafts/{id}/`, `student_draft_views.py`):
 *
 *   - `expected_version` must equal the row's version, otherwise
 *     `409 VERSION_CONFLICT` with `current_version`;
 *   - a successful write increments the version exactly once;
 *   - the same `Idempotency-Key` replays the original response without applying
 *     the command again.
 *
 * It is a test double, not a mock of the machine: every decision under test is
 * the machine's.
 */
import { vi } from 'vitest'

import {
  WizardDraftController,
  type WizardDraftAdapters,
  type WizardDraftLocalMeta,
  type WizardDraftRecord,
} from '@/lib/wizardDraftController'
import { fingerprintDraftProjection } from '@/lib/wizardDraftProjection'
import { projectDraftAnswers } from '@/pages/student/applicationWizard/lib/draftAutosave'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

export const HYDRATED_VALUES: Partial<WizardFormData> = {
  full_name: 'Student Name',
  nrc_number: '123456/78/9',
  passport_number: '',
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

export interface UpdateCall {
  applicationId: string
  payload: Record<string, unknown>
  expectedVersion: number
  key: string
  /** The client's own last acknowledged projection when it issued the call. */
  clientBaselineFingerprint: string | null
  /** The last version this client had been told about when it issued the call. */
  clientKnownVersion: number | null
}

export class FakeDraftServer {
  version: number
  answers: Record<string, unknown>
  exists = true
  /** Errors thrown by the next N update/start calls, in order. */
  failures: unknown[] = []
  /** Responses that commit on the server but are lost before the client hears them. */
  loseNextResponses = 0
  readonly replay = new Map<string, WizardDraftRecord>()
  readonly updateCalls: UpdateCall[] = []
  readonly startCalls: Array<{ payload: Record<string, unknown>; key: string }> = []
  readonly readCalls: string[] = []
  inFlight = 0
  maxInFlight = 0
  /** When set, a write waits here — a request held in flight. */
  gate: Promise<void> | null = null

  /** Hold the next writes in flight until the returned function is called. */
  holdWrites(): () => void {
    let release!: () => void
    this.gate = new Promise<void>((resolve) => {
      release = resolve
    })
    return () => {
      this.gate = null
      release()
    }
  }

  constructor(
    readonly applicationId: string,
    version: number,
    answers: Record<string, unknown>,
  ) {
    this.version = version
    this.answers = { ...answers }
  }

  record(): WizardDraftRecord {
    return { id: this.applicationId, status: 'draft', version: this.version, ...this.answers }
  }

  /** Another device writes the row. */
  writeFromAnotherDevice(answers: Record<string, unknown>): void {
    this.version += 1
    this.answers = { ...this.answers, ...answers }
  }

  private async enter(): Promise<void> {
    this.inFlight += 1
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    await Promise.resolve()
  }

  private leave(): void {
    this.inFlight -= 1
  }

  async update(
    applicationId: string,
    payload: Record<string, unknown>,
    expectedVersion: number,
    key: string,
    client: { baselineFingerprint: string | null; knownVersion: number | null },
  ): Promise<WizardDraftRecord> {
    this.updateCalls.push({
      applicationId,
      payload: { ...payload },
      expectedVersion,
      key,
      clientBaselineFingerprint: client.baselineFingerprint,
      clientKnownVersion: client.knownVersion,
    })
    await this.enter()
    try {
      if (this.gate) await this.gate
      if (this.failures.length > 0) throw this.failures.shift()
      const replayed = this.replay.get(key)
      if (replayed) return { ...replayed }
      if (!this.exists) throw Object.assign(new Error('Draft not found'), { status: 404 })
      if (expectedVersion !== this.version) {
        throw Object.assign(new Error('This draft changed since you loaded it.'), {
          status: 409,
          data: { code: 'VERSION_CONFLICT', current_version: this.version },
        })
      }
      this.version += 1
      this.answers = { ...this.answers, ...payload }
      const response = this.record()
      this.replay.set(key, response)
      if (this.loseNextResponses > 0) {
        this.loseNextResponses -= 1
        throw Object.assign(new Error('Failed to fetch'), { status: 0 })
      }
      return { ...response }
    } finally {
      this.leave()
    }
  }

  async start(payload: Record<string, unknown>, key: string): Promise<WizardDraftRecord> {
    this.startCalls.push({ payload: { ...payload }, key })
    await this.enter()
    try {
      if (this.failures.length > 0) throw this.failures.shift()
      const replayed = this.replay.get(key)
      if (replayed) return { ...replayed }
      this.exists = true
      this.version = 1
      this.answers = { ...payload }
      const response = this.record()
      this.replay.set(key, response)
      return { ...response }
    } finally {
      this.leave()
    }
  }

  async read(applicationId: string): Promise<WizardDraftRecord | null> {
    this.readCalls.push(applicationId)
    await this.enter()
    try {
      if (!this.exists) throw Object.assign(new Error('Draft not found'), { status: 404 })
      return this.record()
    } finally {
      this.leave()
    }
  }
}

export interface DraftHarnessOptions {
  applicationId?: string | null
  serverVersion?: number
  values?: Partial<WizardFormData>
  online?: boolean
}

/**
 * A machine wired to a fake form and the fake server, with the classification
 * production uses.
 */
export function createDraftHarness(options: DraftHarnessOptions = {}) {
  const applicationId = options.applicationId === undefined ? 'app-1' : options.applicationId
  let values: Partial<WizardFormData> = { ...(options.values ?? HYDRATED_VALUES) }
  const dirtyFields = new Set<string>()
  let online = options.online ?? true
  const server = new FakeDraftServer(
    applicationId ?? 'app-new',
    options.serverVersion ?? 3,
    projectDraftAnswers(values),
  )
  if (!applicationId) server.exists = false
  const outbox: WizardDraftLocalMeta[] = []
  const cleared: Array<string | null> = []
  const reloads: number[] = []
  let knownVersion: number | null = applicationId ? server.version : null
  let baselineFingerprint: string | null = null

  const adapters: WizardDraftAdapters = {
    canPersist: () => true,
    projectAnswers: () => projectDraftAnswers(values),
    projectStart: () => {
      const required = ['full_name', 'date_of_birth', 'sex', 'phone', 'email', 'residence_town', 'program', 'intake']
      const ok = required.every((field) => String((values as Record<string, unknown>)[field] ?? '').trim() !== '')
      if (!ok) return null
      return { ...projectDraftAnswers(values), program_id: values.program, intake_id: values.intake }
    },
    projectLocal: () => ({ ...values }),
    hasUserEdits: () => dirtyFields.size > 0,
    startDraft: vi.fn(async (payload: Record<string, unknown>, key: string) => {
      const record = await server.start(payload, key)
      knownVersion = Number(record.version)
      baselineFingerprint = fingerprintDraftProjection(projectDraftAnswers(values))
      return record
    }),
    updateDraft: vi.fn(
      async (id: string, payload: Record<string, unknown>, expectedVersion: number, key: string) => {
        const record = await server.update(id, payload, expectedVersion, key, {
          baselineFingerprint,
          knownVersion,
        })
        knownVersion = Number(record.version)
        baselineFingerprint = fingerprintDraftProjection(payload)
        return record
      },
    ),
    readDraft: vi.fn(async (id: string) => server.read(id)),
    answersFromRecord: (record) => {
      const formValues: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(record)) {
        if (key in HYDRATED_VALUES) formValues[key] = key === 'sex' && typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : value
      }
      return { formValues, answers: projectDraftAnswers(formValues as Partial<WizardFormData>) }
    },
    applyAnswers: (adopted) => {
      values = { ...values, ...(adopted as Partial<WizardFormData>) }
    },
    persistLocal: (meta) => {
      outbox.push({ ...meta })
    },
    clearLocal: (id) => {
      cleared.push(id)
    },
    isOnline: () => online,
    createCommandKey: (kind) => `${kind}-${Math.random().toString(36).slice(2)}`,
    classifyError: (error, phase) => {
      const candidate = error as { status?: number; data?: { code?: string }; name?: string }
      if (candidate?.name === 'AuthenticationError') return 'auth'
      if (phase === 'update' && candidate?.data?.code === 'VERSION_CONFLICT') return 'conflict'
      if (phase === 'start' && candidate?.status === 409) return 'duplicate'
      if (phase === 'update' && candidate?.status === 404) return 'missing'
      if (candidate?.status === 400 || candidate?.status === 422) return 'validation'
      return 'retryable'
    },
    reload: () => {
      reloads.push(Date.now())
    },
  }

  const machine = new WizardDraftController(adapters)

  const harness = {
    machine,
    adapters,
    server,
    outbox,
    cleared,
    reloads,
    get values() {
      return values
    },
    /** Hydrate from the server's current row (what the loader does). */
    hydrate() {
      machine.beginHydration()
      values = { ...values, ...(server.record() as Partial<WizardFormData>) }
      if (typeof server.answers.sex === 'string') {
        values.sex = (server.answers.sex.charAt(0).toUpperCase() + server.answers.sex.slice(1)) as WizardFormData['sex']
      }
      knownVersion = server.version
      baselineFingerprint = fingerprintDraftProjection(projectDraftAnswers(values))
      machine.completeHydration({
        applicationId: server.applicationId,
        serverVersion: server.version,
        source: 'server',
      })
    },
    /** A student edit. */
    edit(field: keyof WizardFormData, value: string) {
      values = { ...values, [field]: value }
      dirtyFields.add(field)
      machine.observe()
    },
    /** A non-student value change (hydration-style setValue). */
    setQuietly(field: keyof WizardFormData, value: string) {
      values = { ...values, [field]: value }
      machine.observe()
    },
    setOnline(next: boolean) {
      online = next
      if (next) machine.networkRestored()
      else machine.networkLost()
    },
  }
  return harness
}

/** Let the machine's promise chain settle under fake timers. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve()
}
