/**
 * The wizard draft machine's runtime — the ONE owner of a student's open draft
 * (admissions-v2 task 6.3 — R10.1-R10.4, R10.7-R10.10; findings STU-02, STU-03,
 * STU-12, MAINT-01; design §8.2, §14.2).
 *
 * `wizardDraftMachine.ts` is the pure transition graph. This module is the
 * machine that runs it: it holds the open draft's context and performs —
 * through small injected adapters — every piece of I/O design §8.2 assigns to
 * the machine:
 *
 * | Responsibility (R10.2) | How it is owned here |
 * |---|---|
 * | hydration          | `beginHydration` / `completeHydration` / `failHydration` set the server-acknowledged baseline and version; edits are ignored while `loading` |
 * | edits              | `observe()` compares the canonical answer projection with that baseline — `EDIT` / `REVERT` |
 * | local outbox       | `adapters.persistLocal` keeps the one `(user, application, assignment)` record — pending answers, their base and version — only while the server lacks an edit; nothing once synced, deleted (404) or submitted |
 * | debounced autosave | a 2 s debounce after an edit plus the 8 s sweep (consolidation Property 8) |
 * | manual save        | `saveNow()` — an unchanged draft writes nothing |
 * | retry              | exponential backoff (1 s … 30 s, five attempts) reusing ONE idempotency key per command, then the 8 s sweep |
 * | conflict           | `409 VERSION_CONFLICT` is terminal until `resolveReload()` or the explicit `resolveMerge()` |
 * | delete             | a draft the server no longer has (`404`) is detached and never resurrected by autosave |
 * | payment gate       | `notePaymentActivity()` (PAY) and `setPaused()` — no autosave write races a payment in progress |
 * | submit             | `submit(run)` flushes pending answers, then runs the submit command as `submitting -> submitted | ready.with_errors` |
 *
 * Every server write goes through one serialized chain, so there is never more
 * than one draft command in flight, and every write is decided by one rule: the
 * projection must differ from what the server last acknowledged. That rule is
 * what removes the same-value projection write M9 observed on resume and step
 * navigation — an unchanged draft has an unchanged fingerprint, so neither the
 * debounce, the sweep, Save now, step navigation nor Continue sends it.
 *
 * Framework-neutral (no React), so the lifecycle is unit- and property-testable
 * with fake adapters and fake timers. React binds it through
 * `useWizardDraftMachine`; the hooks that used to own pieces of this lifecycle
 * (`useSmartAutoSave`, `useWizardDraftPersistence`, the loader, the session
 * manager) are adapters or views over it.
 */
import {
  INITIAL_WIZARD_DRAFT_STATE,
  isTerminalWizardDraftState,
  wizardDraftTransition,
  type WizardDraftEvent,
  type WizardDraftState,
} from './wizardDraftMachine'
import {
  draftAssignmentKey,
  fingerprintDraftProjection,
  mergeDraftAnswerProjections,
  pendingDraftBase,
  positiveDraftVersion,
} from './wizardDraftProjection'

/** Debounce after an edit before the machine writes it. */
export const WIZARD_DRAFT_DEBOUNCE_MS = 2_000
/** The 8-second autosave sweep (consolidation Property 8; product: 8 s autosave). */
export const WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS = 8_000
/** Backoff retries scheduled after a failed write; the 8 s sweep keeps trying after that. */
export const WIZARD_DRAFT_MAX_BACKOFF_ATTEMPTS = 5
export const WIZARD_DRAFT_MAX_BACKOFF_MS = 30_000

export const WIZARD_DRAFT_MESSAGES = {
  versionConflict:
    'This application changed in another tab or device. Reload the latest version before saving again.',
  assignmentConflict:
    'The programme or intake of this application changed in another tab or device after you made changes on this device. Reload the latest version, or keep your changes on top of it.',
  sessionExpired: 'Your progress is saved on this device while we reconnect.',
  offline: 'You are offline. Your changes are saved on this device and will sync when you reconnect.',
  notSavedOnline: 'The application could not be saved online. Please try again.',
  missingVersion: 'This draft is missing its server version. Reload it before saving online.',
  localOnly: 'Saved on this device. It is not in your account yet.',
  mergeUnavailable:
    'We could not load the latest version to combine with your changes. Check your connection and try again, or reload the latest draft.',
  saveFailed: 'Draft save failed. Please try again.',
} as const

/** How a failed draft command is handled. */
export type WizardDraftErrorKind =
  | 'conflict'
  | 'auth'
  | 'missing'
  | 'duplicate'
  | 'validation'
  | 'retryable'

/** A server draft row as the draft commands return it. */
export interface WizardDraftRecord {
  id?: unknown
  version?: unknown
  [key: string]: unknown
}

/**
 * What the machine asks the local-outbox adapter to write.
 *
 * For an attached draft the adapter keeps a record only while `pending` is true
 * (design §8.2: pending deltas and retry metadata); a non-pending attached draft
 * is in the server's hands and keeps no record (task 6.3 M14). An unattached new
 * application keeps its whole form: all of it is pending.
 */
export interface WizardDraftLocalMeta {
  applicationId: string | null
  /** The assignment the server reported for this draft — the third part of the record's address. */
  assignment: string | null
  serverVersion: number | null
  /** True while the record holds edits the server has not acknowledged. */
  pending: boolean
  /**
   * For each pending answer, the value the server last acknowledged (design
   * §8.2 "retry metadata"). It is what lets a later session tell the student's
   * own edits from another device's, and it is all a merge needs.
   */
  pendingBase: Record<string, unknown> | null
  /**
   * Tell the rest of the app a save point was reached (draft store revision +
   * `applicationDraftSaved`). False for the per-edit outbox write, which must
   * stay silent so typing never triggers list refetches.
   */
  announce: boolean
}

/** A server record seen through the form: form-shaped values and their projection. */
export interface WizardDraftAnswersFromRecord {
  formValues: Record<string, unknown>
  answers: Record<string, unknown>
}

export interface WizardDraftTimers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  setInterval(fn: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
  now(): number
}

/**
 * The machine's adapters. Each does one thing — read the form, call one
 * endpoint, or write one local record. None of them decides when to save; that
 * decision is the machine's alone.
 */
export interface WizardDraftAdapters {
  /** A signed-in owner exists, so there is an address to persist under. */
  canPersist(): boolean
  /** The canonical answer projection — exactly the draft PATCH body minus `expected_version`. */
  projectAnswers(): Record<string, unknown>
  /** The start command payload, or `null` when the form cannot create a server draft yet. May throw a user-facing Error. */
  projectStart(): Record<string, unknown> | null
  /** The full form values (what an unattached draft keeps on this device). */
  projectLocal(): Record<string, unknown>
  /** Whether the student has edited anything (RHF dirty fields). */
  hasUserEdits(): boolean
  startDraft(payload: Record<string, unknown>, idempotencyKey: string): Promise<WizardDraftRecord | null>
  updateDraft(
    applicationId: string,
    payload: Record<string, unknown>,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<WizardDraftRecord | null>
  /** The authoritative single-row read (never a write). */
  readDraft(applicationId: string): Promise<WizardDraftRecord | null>
  /** Project a server record the way the form would hold and send it. */
  answersFromRecord(record: WizardDraftRecord): WizardDraftAnswersFromRecord
  /** Place values into the form without marking them as the student's edits. */
  applyAnswers(formValues: Record<string, unknown>): void
  /** Write the one `(user, application)` local outbox record. */
  persistLocal(meta: WizardDraftLocalMeta): void
  /** Clear the one `(user, application)` local outbox record. */
  clearLocal(applicationId: string | null): void
  isOnline(): boolean
  createCommandKey(kind: 'start' | 'update'): string
  classifyError(error: unknown, phase: 'start' | 'update'): WizardDraftErrorKind
  /**
   * Reload the authoritative draft (the conflict's reload resolution). Must let
   * a just-queued local-record removal reach storage before the page goes away.
   */
  reload(): void
  /**
   * Put the stale outbox record's answers back into the form as the student's
   * edits (an explicit merge of a stale outbox). True when anything was restored.
   */
  restoreStaleOutbox?(): boolean
  onStarted?(record: WizardDraftRecord, payload: Record<string, unknown>): void
  onDuplicate?(error: unknown): void
  onMissingDraft?(applicationId: string, error: unknown): void
  onConflict?(error: unknown): void
  onAuthExpired?(): void
  /** Runs before each save attempt (e.g. clearing a resolved duplicate-draft banner). */
  onBeforeSave?(): void
  timers?: WizardDraftTimers
}

/** The immutable view of the machine React renders. */
export interface WizardDraftSnapshot {
  readonly state: WizardDraftState
  readonly applicationId: string | null
  readonly serverVersion: number | null
  readonly attached: boolean
  /** The answers differ from what the server last acknowledged. */
  readonly pending: boolean
  /** Work a page unload would leave off the server. */
  readonly hasUnsyncedWork: boolean
  /** An unattached draft whose work is saved on this device only. */
  readonly localOnly: boolean
  readonly lastSavedAt: number | null
  readonly saveError: string | null
  readonly retryAttempts: number
  /** A failed write is waiting to be retried. */
  readonly retrying: boolean
  readonly nextSaveAt: number | null
  readonly online: boolean
  readonly authExpired: boolean
  readonly paused: boolean
  readonly paymentActivity: boolean
  /** The selected draft could not be loaded: the form does not hold it, so nothing is written. */
  readonly hydrationFailed: boolean
  readonly conflictVersion: number | null
}

/** The save-state vocabulary a view renders (R10.7). */
export type WizardDraftSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'saved-local'
  | 'offline'
  | 'retrying'
  | 'conflict'
  | 'error'

export interface WizardDraftSaveView {
  status: WizardDraftSaveStatus
  message: string | null
}

/**
 * Project a snapshot onto the visible save state (R10.7: saving, saved, offline,
 * retrying and conflict — described, never blocking typing). Pure and total.
 */
export function deriveWizardDraftSaveView(snapshot: WizardDraftSnapshot): WizardDraftSaveView {
  if (snapshot.state === 'conflict') {
    return { status: 'conflict', message: snapshot.saveError ?? WIZARD_DRAFT_MESSAGES.versionConflict }
  }
  if (!snapshot.online || snapshot.state === 'offline.queued') {
    return { status: 'offline', message: snapshot.pending ? WIZARD_DRAFT_MESSAGES.offline : null }
  }
  // A replay in flight after a failed attempt is still a retry. Reporting it as
  // a plain 'saving' hid the retry whenever the 8 s sweep replayed at once — the
  // slow-network case, where a timed-out write is followed straight away by its
  // replay (task 6.3 M14, D6).
  if (snapshot.retrying) return { status: 'retrying', message: snapshot.saveError }
  if (snapshot.state === 'saving') return { status: 'saving', message: null }
  if (snapshot.authExpired) return { status: 'error', message: WIZARD_DRAFT_MESSAGES.sessionExpired }
  if (snapshot.saveError && (snapshot.state === 'ready.dirty' || snapshot.state === 'ready.with_errors')) {
    return { status: 'error', message: snapshot.saveError }
  }
  if (snapshot.state === 'ready.clean') {
    if (snapshot.localOnly) return { status: 'saved-local', message: WIZARD_DRAFT_MESSAGES.localOnly }
    return { status: snapshot.attached ? 'saved' : 'idle', message: null }
  }
  return { status: 'idle', message: null }
}

/** Raised to a caller that required the server while the draft is in conflict. */
export class WizardDraftConflictError extends Error {
  readonly status = 409
  readonly code = 'VERSION_CONFLICT'
  readonly data: { code: 'VERSION_CONFLICT'; current_version: number | null }

  constructor(currentVersion: number | null) {
    super(WIZARD_DRAFT_MESSAGES.versionConflict)
    this.name = 'WizardDraftConflictError'
    this.data = { code: 'VERSION_CONFLICT', current_version: currentVersion }
  }
}

/** Raised when the open draft changed under a command that was still in flight. */
class SupersededDraftCommand extends Error {
  constructor() {
    super(WIZARD_DRAFT_MESSAGES.notSavedOnline)
    this.name = 'SupersededDraftCommand'
  }
}

const defaultTimers: WizardDraftTimers = {
  // Resolved at call time, not import time, so a page that replaces
  // `window.setInterval` (the F3 harness postpones the 8 s sweep) or a test's
  // fake timers are honoured.
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  now: () => Date.now(),
}

type SaveReason =
  | 'debounce'
  | 'interval'
  | 'retry'
  | 'manual'
  | 'flush'
  | 'reconnect'
  | 'auth'
  | 'continue'
  | 'submit'
  | 'merge'

interface PendingCommand {
  fingerprint: string
  key: string
  payload: Record<string, unknown>
  /**
   * The command failed in a way that does not say whether the server applied
   * it (a network error or a lost response). Until it is replayed — same key,
   * same body — the server's state is unknown, so no newer command may be built
   * on the old version and an edit back to the old value is not "nothing to do".
   */
  uncertain: boolean
}

interface PendingUpdate extends PendingCommand {
  applicationId: string
  expectedVersion: number
}

interface PendingStart extends PendingCommand {
  answersAtSend: Record<string, unknown>
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function conflictVersionOf(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as { data?: { current_version?: unknown }; current_version?: unknown }
  return positiveDraftVersion(candidate.data?.current_version ?? candidate.current_version)
}

/** The draft machine. One instance per open wizard. */
export class WizardDraftController {
  private adapters: WizardDraftAdapters
  private state: WizardDraftState = INITIAL_WIZARD_DRAFT_STATE
  private applicationId: string | null = null
  private serverVersion: number | null = null
  /** The assignment the server last reported for the open draft (`draftAssignmentKey`). */
  private assignment: string | null = null
  /** The answers the server last acknowledged (merge base) and their fingerprint. */
  private baselineAnswers: Record<string, unknown> | null = null
  private baselineFingerprint: string | null = null
  /** The full form values last written to the local outbox record. */
  private lastOutboxFingerprint: string | null = null
  /** Unattached drafts restored from a pending local outbox record. */
  private localRecoveryPending = false
  /**
   * Set when the server no longer has the open draft. Autosave never starts a
   * replacement on its own — creating an application needs the student's
   * explicit intent (R10.1) — so only Continue (`commit`) may start one.
   */
  private autoStartSuppressed = false
  /**
   * A stale outbox found at hydration: the student's earlier edits, made on an
   * older version. Held until the student resolves the conflict it opened.
   */
  private staleOutbox: { serverVersion: number | null; base: Record<string, unknown> | null } | null = null
  /**
   * Bumped whenever the open draft changes (new, resume, choice screen), so a
   * command still in flight for the previous draft can never attach its answer
   * to the next one.
   */
  private generation = 0
  private lastSavedAt: number | null = null
  private saveError: string | null = null
  private retryAttempts = 0
  private nextSaveAt: number | null = null
  private online = true
  private authExpired = false
  private paused = false
  private paymentActivity = false
  private hydrationFailed = false
  private conflictVersion: number | null = null

  private pendingStart: PendingStart | null = null
  private pendingUpdate: PendingUpdate | null = null
  private startBlockedFingerprint: string | null = null
  /** A validation rejection is not re-sent automatically for the same answers. */
  private rejectedFingerprint: string | null = null

  private chain: Promise<unknown> = Promise.resolve()
  private autosaveQueued = false
  private manualSaveDeferred = false
  private autosaveDeferred = false
  private submitTask: Promise<unknown> | null = null

  private debounceHandle: unknown = null
  private retryHandle: unknown = null
  private intervalHandle: unknown = null
  private active = false

  private snapshot: WizardDraftSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(adapters: WizardDraftAdapters) {
    this.adapters = adapters
    this.online = this.safeIsOnline()
    this.snapshot = this.buildSnapshot(false, false)
  }

  // ------------------------------------------------------------------------
  // React binding
  // ------------------------------------------------------------------------

  /** Replace the adapters with the latest closures (called on every render). */
  setAdapters(adapters: WizardDraftAdapters): void {
    this.adapters = adapters
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getSnapshot = (): WizardDraftSnapshot => this.snapshot

  /** Start the 8 s sweep. Idempotent. */
  activate(): void {
    if (this.active) return
    this.active = true
    this.online = this.safeIsOnline()
    this.intervalHandle = this.timers.setInterval(() => this.tick(), WIZARD_DRAFT_AUTOSAVE_INTERVAL_MS)
    this.emit()
  }

  /**
   * Stop the timers. Work the server lacks is written to the local outbox and
   * offered to the server once more, so leaving inside the debounce window
   * loses nothing.
   */
  dispose(): void {
    if (!this.active) return
    this.active = false
    if (this.intervalHandle !== null) this.timers.clearInterval(this.intervalHandle)
    this.intervalHandle = null
    this.clearDebounce()
    this.clearRetry()
    if (this.canAcceptEdits()) this.writeOutboxIfChanged()
    if (this.computePendingSafe()) {
      if (this.state !== 'conflict' && !this.paused && !this.authExpired) {
        void this.enqueue(() => this.performSave('flush', false)).catch(() => undefined)
      }
    }
  }

  // ------------------------------------------------------------------------
  // Hydration (R10.1: explicit new / resume intent; Application.id identity)
  // ------------------------------------------------------------------------

  /** No draft is open (the draft-choice screen). */
  reset(): void {
    this.resetContext()
    this.emit()
  }

  /** Explicit `mode=new`: a clean, unattached draft. */
  startNew(): void {
    this.resetContext()
    this.dispatch('START_NEW')
    this.emit()
  }

  /** A resume began; edits are ignored until the selected record is in the form. */
  beginHydration(): void {
    this.resetContext()
    this.dispatch('RESUME')
    this.emit()
  }

  /**
   * The form now holds the selected draft.
   *
   * `source: 'server'` — hydrated from the authoritative row: the current
   * answers become the server-acknowledged baseline, so nothing is written until
   * the student changes something (this is what makes a resume write-free).
   * `source: 'local'` — restored from the local outbox because no server draft
   * could be read: a record marked `pending` is queued for the server; a clean
   * one is not.
   */
  completeHydration(options: {
    applicationId: string | null
    serverVersion: number | null
    source: 'server' | 'local'
    pending?: boolean
    /** The assignment the loaded draft is bound to (`draftAssignmentKey` of the row). */
    assignment?: string | null
    /**
     * Runs once the server baseline is fixed and before the draft becomes
     * editable — the version-equal outbox replay places the pending answers
     * here, so they are measured against the server's answers and queued.
     */
    afterBaseline?: () => void
    /**
     * The outbox held edits made on an OLDER version than the one just loaded
     * (`reason: 'version'`), or addressed to another assignment
     * (`reason: 'assignment'`): a stale command. The draft opens in `conflict`
     * (the answers shown are the server's) and the stale edits are recoverable
     * only by an explicit merge.
     */
    staleOutbox?: {
      serverVersion: number | null
      base: Record<string, unknown> | null
      reason?: 'version' | 'assignment'
    }
    /**
     * The outbox could not be read (its encryption key was not ready in time).
     * The record is then left exactly as it is: hydration must not clear or
     * replace work it has not seen.
     */
    localUnread?: boolean
  }): void {
    if (this.state !== 'loading') this.beginHydration()
    this.applicationId = options.applicationId ? String(options.applicationId) : null
    this.serverVersion = positiveDraftVersion(options.serverVersion)
    this.assignment = this.applicationId ? (options.assignment ?? null) : null
    this.hydrationFailed = false
    const localPending = options.source === 'local' && options.pending === true
    if (this.applicationId) {
      if (localPending) {
        this.baselineAnswers = null
        this.baselineFingerprint = null
      } else {
        this.setBaseline(this.adapters.projectAnswers())
      }
    } else {
      this.localRecoveryPending = localPending
    }
    try {
      options.afterBaseline?.()
    } catch {
      // A failed replay leaves the server's answers in place.
    }
    this.dispatch('LOADED')
    if (options.staleOutbox && this.applicationId) {
      // The outbox record is left exactly as it was — it IS the student's stale
      // work — and the machine opens in conflict (R10.3: never a silent pick).
      this.staleOutbox = { serverVersion: options.staleOutbox.serverVersion, base: options.staleOutbox.base }
      this.conflictVersion = this.serverVersion
      this.saveError =
        options.staleOutbox.reason === 'assignment'
          ? WIZARD_DRAFT_MESSAGES.assignmentConflict
          : WIZARD_DRAFT_MESSAGES.versionConflict
      this.dispatch('SERVER_CONFLICT')
      this.emit()
      return
    }
    if (options.localUnread && this.applicationId) {
      // Nothing was read, so nothing is cleared: the fingerprint is taken so the
      // student's next change is what writes the record.
      try {
        this.lastOutboxFingerprint = fingerprintDraftProjection(this.adapters.projectLocal())
      } catch {
        // Best effort.
      }
    } else {
      this.writeLocal(this.outboxPending(), { announce: true })
    }
    this.emit()
    this.observe()
  }

  /**
   * The selected draft could not be loaded (R10.1 fails closed). The machine
   * stays addressed to that draft but never writes: the form does not hold it,
   * so a save from here could only overwrite real answers with blanks.
   */
  failHydration(options: { applicationId: string | null }): void {
    if (this.state !== 'loading') this.beginHydration()
    this.applicationId = options.applicationId ? String(options.applicationId) : null
    this.serverVersion = null
    this.baselineAnswers = null
    this.baselineFingerprint = null
    this.hydrationFailed = true
    this.dispatch('LOAD_FAILED')
    this.emit()
  }

  // ------------------------------------------------------------------------
  // Edits
  // ------------------------------------------------------------------------

  /** The form changed. Decides EDIT / REVERT and schedules the debounced write. */
  observe(): void {
    if (!this.canAcceptEdits()) {
      this.emit()
      return
    }
    // The outbox first, on every change: production storage writes are
    // encrypted asynchronously and cannot finish inside `beforeunload`, so the
    // record must already be current when the page goes away. Writes to one key
    // coalesce in the storage cache, so typing costs one write per idle period.
    this.writeOutboxIfChanged()
    const pending = this.computePending()
    if (this.state === 'conflict') {
      // Typing is never blocked. The stale edits stay in the outbox for an
      // explicit merge; nothing goes to the server until the conflict resolves.
      if (pending) this.scheduleDebounce()
      this.emit()
      return
    }
    if (pending) {
      if (this.state === 'ready.clean' || this.state === 'ready.with_errors') this.dispatch('EDIT')
      this.scheduleDebounce()
    } else {
      if (this.state === 'ready.dirty' || this.state === 'offline.queued' || this.state === 'ready.with_errors') {
        this.dispatch('REVERT')
        this.saveError = null
        this.retryAttempts = 0
      }
      this.clearDebounce()
      this.clearRetry()
    }
    this.emit()
  }

  // ------------------------------------------------------------------------
  // Saves
  // ------------------------------------------------------------------------

  /** Save now (the student's control). An unchanged draft writes nothing. */
  saveNow(): Promise<WizardDraftRecord | null> {
    if (!this.canAcceptEdits() || this.state === 'conflict') return Promise.resolve(null)
    if (this.paused) {
      this.manualSaveDeferred = true
      this.emit()
      return Promise.resolve(null)
    }
    this.clearDebounce()
    return this.enqueue(() => this.performSave('manual', false)).catch(() => null)
  }

  /** Leaving a step: write pending work now. An unchanged draft writes nothing. */
  flush(): Promise<WizardDraftRecord | null> {
    if (!this.canAcceptEdits() || this.state === 'conflict') return Promise.resolve(null)
    if (!this.computePending()) return Promise.resolve(null)
    this.clearDebounce()
    if (this.paused || this.authExpired) {
      this.writeLocal(true, { announce: true })
      this.autosaveDeferred = this.paused
      this.emit()
      return Promise.resolve(null)
    }
    return this.enqueue(() => this.performSave('flush', false)).catch(() => null)
  }

  /**
   * Continue on a step that cannot advance unless the server holds the draft.
   *
   * Resolves with the authoritative record. An unchanged draft is confirmed with
   * a read, not a write; a version the server moved past is a conflict.
   */
  commit(): Promise<WizardDraftRecord> {
    return this.enqueue(async () => {
      const record = await this.performSave('continue', true)
      if (!record) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
      return record
    })
  }

  /** Write the local outbox record now (unload, upload, auth redirect, Back). */
  persistLocal(): void {
    if (!this.canAcceptEdits()) return
    this.writeLocal(this.outboxPending(), { announce: true })
    this.emit()
  }

  // ------------------------------------------------------------------------
  // Network, session, gates
  // ------------------------------------------------------------------------

  networkLost(): void {
    this.online = false
    // A request already in flight decides its own outcome; only idle dirty work queues.
    if (this.state === 'ready.dirty') this.dispatch('NETWORK_LOST')
    this.emit()
  }

  networkRestored(): void {
    this.online = true
    this.emit()
    if (this.state === 'offline.queued' || this.computePendingSafe()) this.autosave('reconnect')
  }

  /** Another surface reported the session expired. */
  authExpiredExternally(): void {
    if (this.authExpired) return
    this.authExpired = true
    this.emit()
  }

  /** The session was refreshed: send whatever the expiry held back, immediately. */
  authRecovered(): void {
    const wasExpired = this.authExpired
    this.authExpired = false
    if (this.saveError === WIZARD_DRAFT_MESSAGES.sessionExpired) this.saveError = null
    this.emit()
    if (wasExpired || this.computePendingSafe()) this.autosave('auth')
  }

  /** The autosave gate (upload, payment in progress, a step command running). */
  setPaused(paused: boolean): void {
    if (this.paused === paused) return
    this.paused = paused
    if (paused) {
      this.clearDebounce()
      this.emit()
      return
    }
    this.emit()
    if (this.manualSaveDeferred) {
      this.manualSaveDeferred = false
      void this.saveNow()
      return
    }
    if (this.autosaveDeferred || this.computePendingSafe()) {
      this.autosaveDeferred = false
      this.scheduleDebounce()
      this.emit()
    }
  }

  /** PAY: the draft now has payment activity (payment-linked protection). */
  notePaymentActivity(): void {
    if (this.paymentActivity) return
    this.paymentActivity = true
    this.dispatch('PAY')
    this.emit()
  }

  /** The server moved the draft's version through another canonical command (reroute). */
  acknowledgeServerRecord(record: WizardDraftRecord | null | undefined): void {
    if (!record || String(record.id ?? '') !== this.applicationId) return
    const version = positiveDraftVersion(record.version)
    if (version === null) return
    this.serverVersion = version
    this.assignment = draftAssignmentKey(record) ?? this.assignment
    this.pendingUpdate = null
    // Work still pending now rides on the new version and assignment, so its
    // record is re-addressed rather than left naming the old ones.
    if (this.computePendingSafe()) this.writeLocal(true, { announce: false })
    this.emit()
  }

  /**
   * The server no longer has this draft (`404`). The machine detaches from it —
   * autosave never resurrects it — and the student's answers stay in the form
   * and, when they hold edits, on this device as an unattached record. The
   * detached application's own record is cleared: the server confirmed there is
   * nothing left for it to recover into (R10.4).
   */
  detach(applicationId: string): void {
    if (!applicationId || this.applicationId !== applicationId) return
    this.applicationId = null
    this.serverVersion = null
    this.assignment = null
    this.baselineAnswers = null
    this.baselineFingerprint = null
    this.pendingUpdate = null
    this.lastOutboxFingerprint = null
    this.autoStartSuppressed = true
    try {
      this.adapters.clearLocal(applicationId)
    } catch {
      // Best effort: a surviving record is for a draft the server no longer has.
    }
    if (this.canAcceptEdits()) this.writeOutboxIfChanged()
    this.emit()
  }

  // ------------------------------------------------------------------------
  // Conflict resolution (design §8.2: conflict -> reload | explicit merge)
  // ------------------------------------------------------------------------

  /**
   * The student chose the newer version. Nothing is written to the server; the
   * stale edits in this application's outbox record are discarded — that is
   * what the explicit choice means — and the page reloads the newer version.
   */
  resolveReload(): void {
    if (this.state !== 'conflict') return
    this.clearDebounce()
    this.clearRetry()
    this.staleOutbox = null
    const applicationId = this.applicationId
    this.dispatch('RESOLVE_RELOAD')
    this.emit()
    try {
      this.adapters.clearLocal(applicationId)
    } catch {
      // Best effort: a surviving stale record reopens this conflict, never a silent pick.
    }
    this.adapters.reload()
  }

  /**
   * The student's explicit "keep my changes": read the newer server version,
   * adopt every field the student did not change, and write the student's own
   * changes on top of it. Never automatic (R10.3).
   */
  resolveMerge(): Promise<WizardDraftRecord | null> {
    if (this.state !== 'conflict' || !this.applicationId) return Promise.resolve(null)
    const applicationId = this.applicationId
    const generation = this.generation
    if (this.staleOutbox) {
      // The stale edits live in the outbox record, not the form: put them back
      // in the form (as the student's edits), with the base they were made on,
      // then merge exactly as for a live conflict.
      const restored = this.adapters.restoreStaleOutbox?.()
      if (restored) {
        this.baselineAnswers = this.staleOutbox.base
          ? { ...(this.baselineAnswers ?? {}), ...this.staleOutbox.base }
          : null
      }
      this.staleOutbox = null
    }
    return this.enqueue(async () => {
      let theirsRecord: WizardDraftRecord | null = null
      try {
        theirsRecord = await this.adapters.readDraft(applicationId)
      } catch {
        theirsRecord = null
      }
      if (generation !== this.generation || this.applicationId !== applicationId) return null
      const theirsVersion = positiveDraftVersion(theirsRecord?.version)
      if (!theirsRecord || theirsVersion === null) {
        this.saveError = WIZARD_DRAFT_MESSAGES.mergeUnavailable
        this.emit()
        return null
      }
      const theirs = this.adapters.answersFromRecord(theirsRecord)
      const { adoptedTheirs } = mergeDraftAnswerProjections({
        base: this.baselineAnswers,
        mine: this.adapters.projectAnswers(),
        theirs: theirs.answers,
      })
      const adoptions: Record<string, unknown> = {}
      for (const field of adoptedTheirs) {
        if (field in theirs.formValues) adoptions[field] = theirs.formValues[field]
      }
      if (Object.keys(adoptions).length > 0) this.adapters.applyAnswers(adoptions)
      this.serverVersion = theirsVersion
      this.assignment = draftAssignmentKey(theirsRecord) ?? this.assignment
      this.setBaseline(theirs.answers)
      this.conflictVersion = null
      this.saveError = null
      this.pendingUpdate = null
      this.dispatch('RESOLVE_MERGE')
      this.emit()
      if (!this.computePending()) {
        this.markWriteSucceeded()
        this.writeLocal(false, { announce: true })
        this.emit()
        return theirsRecord
      }
      return this.performUpdate(false, applicationId, generation)
    })
  }

  // ------------------------------------------------------------------------
  // Submit (R10.6: one legal transition; R10.4: outbox cleared on submit)
  // ------------------------------------------------------------------------

  /**
   * Run the submit command as the machine's `SUBMIT`. Pending answers are
   * written first so the server evaluates what the student sees; a second call
   * while one is running joins it rather than submitting twice.
   */
  submit<T>(run: () => Promise<T>): Promise<T> {
    if (this.submitTask) return this.submitTask as Promise<T>
    const task = this.enqueue(async () => {
      if (this.state === 'conflict') throw new WizardDraftConflictError(this.conflictVersion)
      if (!this.canAcceptEdits()) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
      if (this.computePending()) {
        const saved = await this.performSave('submit', true)
        if (!saved) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
      }
      this.clearDebounce()
      this.clearRetry()
      this.dispatch('SUBMIT')
      this.emit()
      try {
        const result = await run()
        this.dispatch('SUBMIT_OK')
        try {
          this.adapters.clearLocal(this.applicationId)
        } catch {
          // The cache adapter is best effort; the submission stands.
        }
        this.emit()
        return result
      } catch (error) {
        this.dispatch('SUBMIT_FAILED')
        this.emit()
        throw error
      }
    })
    // A second caller joins this exact task and sees the same outcome. The
    // clearing branch handles both settlements, so it adds no unhandled rejection.
    this.submitTask = task
    const clear = () => {
      if (this.submitTask === task) this.submitTask = null
    }
    task.then(clear, clear)
    return task
  }

  // ------------------------------------------------------------------------
  // Internals
  // ------------------------------------------------------------------------

  private get timers(): WizardDraftTimers {
    return this.adapters.timers ?? defaultTimers
  }

  private safeIsOnline(): boolean {
    try {
      return this.adapters.isOnline()
    } catch {
      return true
    }
  }

  private dispatch(event: WizardDraftEvent): void {
    this.state = wizardDraftTransition(this.state, event)
  }

  private resetContext(): void {
    this.clearDebounce()
    this.clearRetry()
    this.generation += 1
    this.state = INITIAL_WIZARD_DRAFT_STATE
    this.applicationId = null
    this.serverVersion = null
    this.assignment = null
    this.baselineAnswers = null
    this.baselineFingerprint = null
    this.lastOutboxFingerprint = null
    this.localRecoveryPending = false
    this.autoStartSuppressed = false
    this.staleOutbox = null
    this.saveError = null
    this.retryAttempts = 0
    this.nextSaveAt = null
    this.hydrationFailed = false
    this.conflictVersion = null
    this.pendingStart = null
    this.pendingUpdate = null
    this.startBlockedFingerprint = null
    this.rejectedFingerprint = null
    this.manualSaveDeferred = false
    this.autosaveDeferred = false
  }

  private setBaseline(answers: Record<string, unknown>): void {
    this.baselineAnswers = { ...answers }
    this.baselineFingerprint = fingerprintDraftProjection(answers)
  }

  /** States in which the form holds an editable draft the machine may persist. */
  private canAcceptEdits(): boolean {
    if (this.state === 'uninitialized' || this.state === 'loading' || this.state === 'submitting') return false
    if (isTerminalWizardDraftState(this.state)) return false
    if (this.hydrationFailed) return false
    try {
      return this.adapters.canPersist()
    } catch {
      return false
    }
  }

  private computePendingSafe(): boolean {
    try {
      return this.canAcceptEdits() && this.computePending()
    } catch {
      return false
    }
  }

  /** Whether the server — or, before a draft exists, this device — lacks the student's current work. */
  private computePending(): boolean {
    if (this.hydrationFailed) return false
    if (this.applicationId) {
      if (this.pendingUpdate?.uncertain && this.pendingUpdate.applicationId === this.applicationId) return true
      return fingerprintDraftProjection(this.adapters.projectAnswers()) !== this.baselineFingerprint
    }
    if (this.pendingStart?.uncertain) return true
    // Before a draft exists the server can take the work only once a start is
    // possible; until then it lives in the outbox (`localOnly`). After the
    // server lost the draft, only the student's Continue may start a new one.
    if (this.autoStartSuppressed) return false
    if (!this.localRecoveryPending && !this.adapters.hasUserEdits()) return false
    return this.startIsPossible()
  }

  /** Whether the outbox record holds work the server has not acknowledged. */
  private outboxPending(): boolean {
    if (this.state === 'offline.queued' || this.state === 'conflict') return true
    if (this.applicationId) return this.computePending()
    return this.localRecoveryPending || this.adapters.hasUserEdits()
  }

  /** Write the outbox record when the form's values changed since the last write. */
  private writeOutboxIfChanged(): void {
    try {
      if (!this.applicationId && !this.localRecoveryPending && !this.adapters.hasUserEdits()) {
        // A brand-new application nobody has typed into is not a draft yet.
        return
      }
      const fingerprint = fingerprintDraftProjection(this.adapters.projectLocal())
      if (fingerprint === this.lastOutboxFingerprint) return
      this.writeLocal(this.outboxPending(), { announce: false })
    } catch {
      // Best effort.
    }
  }

  private startIsPossible(): boolean {
    try {
      const payload = this.adapters.projectStart()
      if (!payload) return false
      return fingerprintDraftProjection(payload) !== this.startBlockedFingerprint
    } catch {
      return false
    }
  }

  private writeLocal(pending: boolean, options: { announce: boolean } = { announce: true }): void {
    // A conflict opened from a stale outbox keeps that record untouched until
    // the student resolves it: the form shows the server's answers, the record
    // holds the student's, and overwriting it would be the silent pick R10.3
    // forbids.
    if (this.staleOutbox) return
    try {
      if (!this.adapters.canPersist()) return
      this.adapters.persistLocal({
        applicationId: this.applicationId,
        assignment: this.applicationId ? this.assignment : null,
        serverVersion: this.serverVersion,
        pending,
        pendingBase:
          pending && this.applicationId
            ? pendingDraftBase(this.baselineAnswers, this.adapters.projectAnswers())
            : null,
        announce: options.announce,
      })
      this.lastOutboxFingerprint = fingerprintDraftProjection(this.adapters.projectLocal())
    } catch {
      // The local outbox is best effort; the server write is unaffected.
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.catch(() => undefined).then(task)
    this.chain = run.catch(() => undefined)
    return run
  }

  private scheduleDebounce(): void {
    if (!this.active) return
    if (this.paused) {
      this.autosaveDeferred = true
      return
    }
    this.clearDebounce()
    this.nextSaveAt = this.timers.now() + WIZARD_DRAFT_DEBOUNCE_MS
    this.debounceHandle = this.timers.setTimeout(() => {
      this.debounceHandle = null
      this.autosave('debounce')
    }, WIZARD_DRAFT_DEBOUNCE_MS)
  }

  private clearDebounce(): void {
    if (this.debounceHandle !== null) this.timers.clearTimeout(this.debounceHandle)
    this.debounceHandle = null
    if (this.retryHandle === null) this.nextSaveAt = null
  }

  private clearRetry(): void {
    if (this.retryHandle !== null) this.timers.clearTimeout(this.retryHandle)
    this.retryHandle = null
  }

  private tick(): void {
    if (this.computePendingSafe()) this.autosave('interval')
  }

  /** A machine-initiated save. Respects every gate and coalesces while one is queued. */
  private autosave(reason: SaveReason): void {
    if (!this.canAcceptEdits()) return
    if (this.paused) {
      this.autosaveDeferred = true
      return
    }
    if (this.state === 'conflict' || this.authExpired) {
      this.writeOutboxIfChanged()
      this.emit()
      return
    }
    if (
      this.rejectedFingerprint !== null &&
      this.rejectedFingerprint === fingerprintDraftProjection(this.adapters.projectAnswers())
    ) {
      return
    }
    if (this.autosaveQueued) return
    this.autosaveQueued = true
    void this.enqueue(async () => {
      this.autosaveQueued = false
      return this.performSave(reason, false)
    }).catch(() => undefined)
  }

  /** Move into `saving` from whichever ready/queued state the draft is in. */
  private enterSaving(manual: boolean): void {
    if (this.state === 'offline.queued') {
      this.dispatch('NETWORK_RESTORED')
      return
    }
    if (this.state === 'ready.clean' || this.state === 'ready.with_errors') this.dispatch('EDIT')
    this.dispatch(manual ? 'SAVE_NOW' : 'SAVE_DUE')
  }

  /**
   * The one place a draft command is decided. Runs inside the serialized
   * chain, so the application id and version are read at execution time.
   */
  private async performSave(reason: SaveReason, requireServer: boolean): Promise<WizardDraftRecord | null> {
    if (this.state === 'conflict') {
      if (requireServer) throw new WizardDraftConflictError(this.conflictVersion)
      return null
    }
    if (!this.canAcceptEdits()) {
      if (requireServer) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
      return null
    }
    try {
      this.adapters.onBeforeSave?.()
    } catch {
      // A UI hook never stops a save.
    }

    const generation = this.generation
    const applicationId = this.applicationId
    const pending = this.computePending()

    if (!pending) {
      if (requireServer) return this.confirmUnchanged(applicationId, generation)
      if (this.state === 'ready.dirty' || this.state === 'offline.queued') this.dispatch('REVERT')
      this.emit()
      return null
    }

    // The outbox first: whatever happens to the request, the edit survives here.
    this.writeLocal(true, { announce: true })

    if (!this.safeIsOnline()) {
      this.online = false
      if (this.state === 'ready.clean' || this.state === 'ready.with_errors') this.dispatch('EDIT')
      this.dispatch('NETWORK_LOST')
      this.saveError = null
      this.emit()
      if (requireServer) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
      return null
    }
    this.online = true

    if (this.authExpired && !requireServer && reason !== 'manual' && reason !== 'auth') {
      this.emit()
      return null
    }

    this.enterSaving(reason === 'manual' || requireServer)
    this.saveError = null
    this.emit()

    if (!applicationId) return this.performStart(requireServer, generation)
    return this.performUpdate(requireServer, applicationId, generation)
  }

  /** Continue on an unchanged draft: confirm with a read, never a write. */
  private async confirmUnchanged(
    applicationId: string | null,
    generation: number,
  ): Promise<WizardDraftRecord | null> {
    if (!this.safeIsOnline()) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
    if (!applicationId) {
      // Nothing is attached yet: Continue is exactly the moment to start it.
      this.writeLocal(true, { announce: true })
      this.enterSaving(true)
      this.emit()
      return this.performStart(true, generation)
    }
    if (this.serverVersion === null) throw new Error(WIZARD_DRAFT_MESSAGES.missingVersion)
    const record = await this.adapters.readDraft(applicationId)
    if (generation !== this.generation || this.applicationId !== applicationId) {
      throw new SupersededDraftCommand()
    }
    const version = positiveDraftVersion(record?.version)
    if (!record || version === null) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
    if (version !== this.serverVersion) {
      this.enterConflict(version)
      throw new WizardDraftConflictError(version)
    }
    this.assignment = draftAssignmentKey(record) ?? this.assignment
    return record
  }

  private async performStart(requireServer: boolean, generation: number): Promise<WizardDraftRecord | null> {
    const uncertainStart = this.pendingStart?.uncertain ? this.pendingStart : null
    let payload: Record<string, unknown> | null
    if (uncertainStart) {
      // Resolve the ambiguous start first: the exact command, under its key.
      payload = uncertainStart.payload
    } else {
      try {
        payload = this.adapters.projectStart()
      } catch (error) {
        this.dispatch('SAVE_FAILED')
        this.saveError = errorMessage(error, WIZARD_DRAFT_MESSAGES.notSavedOnline)
        this.emit()
        if (requireServer) throw error
        return null
      }
    }
    const startFingerprint = fingerprintDraftProjection(payload)
    if (!payload || (!uncertainStart && startFingerprint === this.startBlockedFingerprint)) {
      // Not creatable yet — or the student must first resolve a duplicate. The
      // work is kept on this device, and the view says so instead of failing.
      this.localRecoveryPending = false
      this.dispatch('SAVE_OK')
      this.emit()
      if (requireServer) throw new Error(WIZARD_DRAFT_MESSAGES.notSavedOnline)
      return null
    }

    const command: PendingStart =
      uncertainStart ??
      (this.pendingStart?.fingerprint === startFingerprint
        ? this.pendingStart
        : {
            fingerprint: startFingerprint as string,
            key: this.adapters.createCommandKey('start'),
            payload,
            answersAtSend: this.adapters.projectAnswers(),
            uncertain: false,
          })
    this.pendingStart = command
    const answersAtSend = command.answersAtSend

    let record: WizardDraftRecord | null
    try {
      record = await this.adapters.startDraft(payload, command.key)
    } catch (error) {
      if (generation !== this.generation) {
        if (requireServer) throw error
        return null
      }
      return this.handleWriteError(error, { phase: 'start', requireServer, startFingerprint })
    }
    if (generation !== this.generation) {
      if (requireServer) throw new SupersededDraftCommand()
      return null
    }
    const version = positiveDraftVersion(record?.version)
    const id = record?.id ? String(record.id) : null
    if (!record || !id || version === null) {
      return this.handleWriteError(new Error('The server created the draft without an optimistic version.'), {
        phase: 'start',
        requireServer,
        startFingerprint,
      })
    }
    this.pendingStart = null
    this.applicationId = id
    this.serverVersion = version
    this.assignment = draftAssignmentKey(record)
    this.setBaseline(answersAtSend)
    this.localRecoveryPending = false
    this.autoStartSuppressed = false
    try {
      this.adapters.onStarted?.(record, payload)
    } catch {
      // UI side effects never undo a committed command.
    }
    this.markWriteSucceeded()
    this.writeLocal(this.computePending(), { announce: true })
    this.afterWrite()
    return record
  }

  private async performUpdate(
    requireServer: boolean,
    applicationId: string,
    generation: number,
  ): Promise<WizardDraftRecord | null> {
    const expectedVersion = this.serverVersion
    if (expectedVersion === null) {
      this.dispatch('SAVE_FAILED')
      this.saveError = WIZARD_DRAFT_MESSAGES.missingVersion
      this.emit()
      if (requireServer) throw new Error(WIZARD_DRAFT_MESSAGES.missingVersion)
      return null
    }
    const previous = this.pendingUpdate
    const uncertain =
      previous?.uncertain && previous.applicationId === applicationId && previous.expectedVersion === expectedVersion
        ? previous
        : null
    const current = this.adapters.projectAnswers()
    const currentFingerprint = fingerprintDraftProjection(current) as string
    // An ambiguous command is resolved before anything newer is sent: the
    // exact command again, under its key, so a response lost after commit is
    // replayed instead of a second command racing it on the old version.
    const answers = uncertain ? uncertain.payload : current
    const fingerprint = uncertain ? uncertain.fingerprint : currentFingerprint
    // One stable key per exact command: a retry after a lost response replays
    // it, while a newer edit or a newer version is a new command.
    const command: PendingUpdate =
      uncertain ??
      (previous &&
      previous.applicationId === applicationId &&
      previous.expectedVersion === expectedVersion &&
      previous.fingerprint === fingerprint
        ? previous
        : {
            applicationId,
            expectedVersion,
            fingerprint,
            key: this.adapters.createCommandKey('update'),
            payload: { ...answers },
            uncertain: false,
          })
    this.pendingUpdate = command

    let record: WizardDraftRecord | null
    try {
      record = await this.adapters.updateDraft(applicationId, command.payload, expectedVersion, command.key)
    } catch (error) {
      if (generation !== this.generation || this.applicationId !== applicationId) {
        if (requireServer) throw error
        return null
      }
      return this.handleWriteError(error, { phase: 'update', requireServer, applicationId })
    }
    if (generation !== this.generation || this.applicationId !== applicationId) {
      // The draft changed while the command was in flight; its answer belongs to no open draft.
      if (requireServer) throw new SupersededDraftCommand()
      return null
    }
    const version = positiveDraftVersion(record?.version)
    if (!record || version === null) {
      return this.handleWriteError(
        new Error('The server updated the draft without returning its next version.'),
        { phase: 'update', requireServer, applicationId },
      )
    }
    this.pendingUpdate = null
    this.serverVersion = version
    this.assignment = draftAssignmentKey(record) ?? this.assignment
    this.setBaseline(answers)
    this.rejectedFingerprint = null
    this.markWriteSucceeded()
    this.writeLocal(this.computePending(), { announce: true })
    this.afterWrite()
    return record
  }

  private markWriteSucceeded(): void {
    this.clearRetry()
    this.retryAttempts = 0
    this.saveError = null
    this.authExpired = false
    this.lastSavedAt = this.timers.now()
    if (this.debounceHandle === null) this.nextSaveAt = null
    this.dispatch('SAVE_OK')
  }

  /** An edit made while the command was in flight is written next. */
  private afterWrite(): void {
    if (this.computePending()) {
      this.dispatch('EDIT')
      this.scheduleDebounce()
    }
    this.emit()
    if (this.manualSaveDeferred && !this.paused) {
      this.manualSaveDeferred = false
      void this.saveNow()
    }
  }

  private enterConflict(currentVersion: number | null): void {
    this.clearDebounce()
    this.clearRetry()
    this.pendingUpdate = null
    this.retryAttempts = 0
    this.conflictVersion = currentVersion
    this.saveError = WIZARD_DRAFT_MESSAGES.versionConflict
    this.dispatch('SERVER_CONFLICT')
    this.writeLocal(true, { announce: true })
    this.emit()
  }

  private handleWriteError(
    error: unknown,
    context: {
      phase: 'start' | 'update'
      requireServer: boolean
      startFingerprint?: string | null
      applicationId?: string
    },
  ): WizardDraftRecord | null {
    let kind: WizardDraftErrorKind
    try {
      kind = this.adapters.classifyError(error, context.phase)
    } catch {
      kind = 'retryable'
    }
    const fail = (): WizardDraftRecord | null => {
      this.emit()
      if (context.requireServer) throw error
      return null
    }

    if (kind === 'conflict') {
      this.enterConflict(conflictVersionOf(error))
      try {
        this.adapters.onConflict?.(error)
      } catch {
        // UI only.
      }
      return fail()
    }

    if (kind === 'duplicate') {
      // Never adopt the existing draft silently: the student chooses (STU-12).
      this.startBlockedFingerprint = context.startFingerprint ?? null
      this.pendingStart = null
      this.dispatch('SAVE_FAILED')
      this.writeLocal(true, { announce: true })
      this.dispatch('REVERT')
      try {
        this.adapters.onDuplicate?.(error)
      } catch {
        // UI only.
      }
      return fail()
    }

    if (kind === 'auth') {
      // The command is kept as it is: a refused attempt does not settle an
      // earlier ambiguous one, so it is offered again once the session recovers.
      this.clearRetry()
      this.retryAttempts = 0
      this.authExpired = true
      this.saveError = WIZARD_DRAFT_MESSAGES.sessionExpired
      this.dispatch('SAVE_FAILED')
      try {
        this.adapters.onAuthExpired?.()
      } catch {
        // UI only.
      }
      return fail()
    }

    if (kind === 'missing' && context.applicationId) {
      this.dispatch('SAVE_FAILED')
      this.saveError = errorMessage(error, WIZARD_DRAFT_MESSAGES.saveFailed)
      try {
        this.adapters.onMissingDraft?.(context.applicationId, error)
      } catch {
        // UI only.
      }
      this.detach(context.applicationId)
      return fail()
    }

    if (kind === 'validation') {
      // Definitive: the server did not apply it.
      if (context.phase === 'update') this.pendingUpdate = null
      else this.pendingStart = null
      this.dispatch('SAVE_FAILED')
      this.saveError = errorMessage(error, WIZARD_DRAFT_MESSAGES.saveFailed)
      this.rejectedFingerprint = fingerprintDraftProjection(this.adapters.projectAnswers())
      return fail()
    }

    // Retryable: a network or server failure. Whether the server applied the
    // command is unknown, so it is replayed — never superseded — next.
    if (context.phase === 'update' && this.pendingUpdate) this.pendingUpdate.uncertain = true
    if (context.phase === 'start' && this.pendingStart) this.pendingStart.uncertain = true
    if (!this.safeIsOnline()) {
      this.online = false
      this.dispatch('SAVE_FAILED')
      this.dispatch('NETWORK_LOST')
      this.saveError = null
      return fail()
    }
    this.retryAttempts += 1
    this.dispatch('SAVE_FAILED')
    this.saveError = errorMessage(error, WIZARD_DRAFT_MESSAGES.saveFailed)
    if (!context.requireServer && this.retryAttempts < WIZARD_DRAFT_MAX_BACKOFF_ATTEMPTS) {
      const delay = Math.min(1_000 * 2 ** (this.retryAttempts - 1), WIZARD_DRAFT_MAX_BACKOFF_MS)
      this.clearRetry()
      this.nextSaveAt = this.timers.now() + delay
      this.retryHandle = this.timers.setTimeout(() => {
        this.retryHandle = null
        this.autosave('retry')
      }, delay)
    }
    return fail()
  }

  private buildSnapshot(pending: boolean, persistedLocally: boolean): WizardDraftSnapshot {
    const unsyncedState =
      this.state === 'saving' || this.state === 'offline.queued' || this.state === 'conflict'
    return {
      state: this.state,
      applicationId: this.applicationId,
      serverVersion: this.serverVersion,
      attached: this.applicationId !== null,
      pending,
      hasUnsyncedWork: !this.hydrationFailed && (pending || unsyncedState),
      localOnly: persistedLocally,
      lastSavedAt: this.lastSavedAt,
      saveError: this.saveError,
      retryAttempts: this.retryAttempts,
      retrying:
        this.retryAttempts > 0 &&
        (this.state === 'ready.dirty' || this.state === 'saving') &&
        !this.authExpired,
      nextSaveAt: this.nextSaveAt,
      online: this.online,
      authExpired: this.authExpired,
      paused: this.paused,
      paymentActivity: this.paymentActivity,
      hydrationFailed: this.hydrationFailed,
      conflictVersion: this.conflictVersion,
    }
  }

  private emit(): void {
    let pending = false
    let persistedLocally = false
    try {
      pending = this.canAcceptEdits() ? this.computePending() : false
      persistedLocally =
        this.applicationId === null &&
        this.state === 'ready.clean' &&
        this.lastOutboxFingerprint !== null &&
        !pending &&
        (this.localRecoveryPending || this.adapters.hasUserEdits())
    } catch {
      pending = false
      persistedLocally = false
    }
    const next = this.buildSnapshot(pending, persistedLocally)
    const previous = this.snapshot
    const changed = (Object.keys(next) as Array<keyof WizardDraftSnapshot>).some(
      (key) => next[key] !== previous[key],
    )
    if (!changed) return
    this.snapshot = next
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // A view never breaks the machine.
      }
    }
  }
}

/**
 * Adapters that can do nothing. The machine is created before the wizard's
 * form and catalog hooks exist (they need the machine's `applicationId`), and
 * receives its real adapters later in the same render — before any effect or
 * event can call it.
 */
export function createInertWizardDraftAdapters(): WizardDraftAdapters {
  const nothing = async () => null
  return {
    canPersist: () => false,
    projectAnswers: () => ({}),
    projectStart: () => null,
    projectLocal: () => ({}),
    hasUserEdits: () => false,
    startDraft: nothing,
    updateDraft: nothing,
    readDraft: nothing,
    answersFromRecord: () => ({ formValues: {}, answers: {} }),
    applyAnswers: () => undefined,
    persistLocal: () => undefined,
    clearLocal: () => undefined,
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
    createCommandKey: (kind) => `${kind}-inert`,
    classifyError: () => 'retryable',
    reload: () => undefined,
  }
}
