/**
 * Canonical wizard draft state machine (admissions-v2 task 6.3, R10.1-R10.4/R10.7).
 *
 * This is the ONE documented state machine for a student's online application
 * draft. It is a pure, framework-neutral transition function so the lifecycle
 * (hydration, edit, debounced autosave, manual save, offline outbox, retry,
 * conflict, delete, payment gate, submit) is unit- and property-testable
 * without React. Hooks/components are thin adapters/views around it — they feed
 * events in and render the returned state; they never re-implement the graph.
 *
 * Design references:
 * - design.md §8.2 Frontend Draft Machine (the exact state graph + event names
 *   below, and "local records are addressed by (user_id, application_id,
 *   assignment_id) … Cleanup is application-scoped").
 * - design.md §14.2 Idempotency And Concurrency (stale version -> conflict with
 *   reload/merge recovery, never a silent latest-timestamp pick).
 * - requirements R10.1 (explicit new/resume intent, Application.id identity),
 *   R10.2 (one machine owns the lifecycle), R10.3 (versioned; conflict not
 *   timestamp arbitration), R10.4 (local pending keyed by user/offering/draft,
 *   cleared on logout/sync/delete/submit), R10.7 (visible saving/saved/offline/
 *   retrying/conflict without blocking typing).
 *
 * Privacy (R10.4): an attached draft's local record is addressed by the triple
 * below and holds only its pending answers, their base and version, and retry
 * metadata — and exists only while the server lacks an edit (task 6.3 M14,
 * `applicationWizard/lib/draftOutbox.ts`). The storage slot is keyed by user +
 * application; the assignment is carried in the record and matched on every
 * read. An unattached new application keeps its whole form, because all of it
 * is pending. No record ever contains authentication secrets or raw uploaded
 * documents (the persistence adapter, `draftLocalCache.ts`).
 */

/**
 * The canonical draft lifecycle states (design §8.2). Dotted names mirror the
 * design's nested notation (`ready.clean`, `offline.queued`, …) as flat string
 * literals so the machine stays a plain, serialisable value.
 */
export type WizardDraftState =
  | 'uninitialized'
  | 'loading'
  | 'ready.clean'
  | 'ready.dirty'
  | 'saving'
  | 'offline.queued'
  | 'conflict'
  | 'deleting'
  | 'deleted'
  | 'submitting'
  | 'submitted'
  | 'ready.with_errors'

/**
 * Events the machine accepts. The first group is the design's named events
 * (§8.2). The remaining events are the completion signals for the asynchronous
 * effects those named events trigger — they are the concrete edges of the
 * design arrows (e.g. `saving -> ready.clean`, `submitting -> submitted |
 * ready.with_errors`, `conflict -> reload | merge`, `deleting -> deleted`).
 * They are not new domain concepts; they are how an adapter reports the result
 * of the API/outbox call it made on the machine's behalf.
 */
export type WizardDraftEvent =
  // Design §8.2 named events
  | 'START_NEW'
  | 'RESUME'
  | 'EDIT'
  | 'SAVE_DUE'
  | 'SAVE_NOW'
  | 'NETWORK_LOST'
  | 'NETWORK_RESTORED'
  | 'SERVER_CONFLICT'
  | 'DELETE'
  | 'PAY'
  | 'SUBMIT'
  // Async effect-completion edges of the design arrows
  | 'LOADED'
  | 'LOAD_FAILED'
  // `ready.clean <-> ready.dirty`: the student's edit was undone, so the answers
  // equal what the server last acknowledged and nothing is left to write.
  | 'REVERT'
  | 'SAVE_OK'
  | 'SAVE_FAILED'
  | 'RESOLVE_RELOAD'
  | 'RESOLVE_MERGE'
  | 'DELETE_OK'
  | 'DELETE_BLOCKED'
  | 'SUBMIT_OK'
  | 'SUBMIT_FAILED'

export const INITIAL_WIZARD_DRAFT_STATE: WizardDraftState = 'uninitialized'

/**
 * Local record identity (design §8.2). A draft's local recovery cache is
 * addressed by the authenticated user, the online application id (the draft
 * identity, R10.1), and the immutable assignment/offering the draft is bound
 * to. `applicationId === null` denotes the not-yet-attached "new" draft.
 */
export interface WizardDraftAddress {
  userId?: string | null
  applicationId?: string | null
  assignmentId?: string | null
}

/**
 * The full transition table. A missing (state, event) pair is an intentional
 * no-op: the machine stays put. This is what makes "other modules are pure
 * adapters" safe — an event that does not apply in the current state is simply
 * ignored rather than corrupting the lifecycle.
 */
const TRANSITIONS: Partial<Record<WizardDraftState, Partial<Record<WizardDraftEvent, WizardDraftState>>>> = {
  uninitialized: {
    START_NEW: 'ready.clean',
    RESUME: 'loading',
  },
  loading: {
    LOADED: 'ready.clean',
    LOAD_FAILED: 'ready.with_errors',
    SERVER_CONFLICT: 'conflict',
    NETWORK_LOST: 'offline.queued',
  },
  'ready.clean': {
    EDIT: 'ready.dirty',
    DELETE: 'deleting',
    SUBMIT: 'submitting',
    SERVER_CONFLICT: 'conflict',
    // Payment activity does not change the persistence lifecycle; the draft
    // stays where it is. It only sets the payment-linked protection flag that
    // the cache adapter enforces (a payment-linked draft is never cleared by
    // cleanup / bulk-clear).
    PAY: 'ready.clean',
    // Nothing is queued while clean, so losing the network keeps it clean.
    NETWORK_LOST: 'ready.clean',
  },
  'ready.dirty': {
    EDIT: 'ready.dirty',
    // design §8.2 `ready.clean <-> ready.dirty`: an undone edit leaves nothing to save.
    REVERT: 'ready.clean',
    SAVE_DUE: 'saving',
    SAVE_NOW: 'saving',
    NETWORK_LOST: 'offline.queued',
    SERVER_CONFLICT: 'conflict',
    DELETE: 'deleting',
    SUBMIT: 'submitting',
    PAY: 'ready.dirty',
  },
  saving: {
    SAVE_OK: 'ready.clean',
    SAVE_FAILED: 'ready.dirty',
    // A fresh edit while a save is in flight is coalesced by the adapter; the
    // machine stays in `saving` and the adapter re-schedules on SAVE_OK.
    EDIT: 'saving',
    NETWORK_LOST: 'offline.queued',
    SERVER_CONFLICT: 'conflict',
  },
  'offline.queued': {
    NETWORK_RESTORED: 'saving',
    EDIT: 'offline.queued',
    // Undone while offline: the queue is empty again.
    REVERT: 'ready.clean',
    // Manual save while offline cannot reach the server; work stays queued.
    SAVE_NOW: 'offline.queued',
    SERVER_CONFLICT: 'conflict',
  },
  conflict: {
    // design §8.2: conflict -> reload | explicit merge
    RESOLVE_RELOAD: 'loading',
    RESOLVE_MERGE: 'saving',
  },
  deleting: {
    DELETE_OK: 'deleted',
    // Payment-linked drafts cannot be deleted (server returns
    // DRAFT_HAS_PAYMENT_ACTIVITY). The draft is left intact and editable.
    DELETE_BLOCKED: 'ready.clean',
  },
  submitting: {
    SUBMIT_OK: 'submitted',
    SUBMIT_FAILED: 'ready.with_errors',
    SERVER_CONFLICT: 'conflict',
  },
  'ready.with_errors': {
    EDIT: 'ready.dirty',
    REVERT: 'ready.clean',
    SUBMIT: 'submitting',
    SAVE_DUE: 'saving',
    SAVE_NOW: 'saving',
    DELETE: 'deleting',
    RESUME: 'loading',
  },
  // Terminal states: every event keeps the machine put (handled by the
  // absorbing check below; listed here for documentation completeness).
  deleted: {},
  submitted: {},
}

/** Terminal states have no outgoing transitions. */
const TERMINAL_STATES: ReadonlySet<WizardDraftState> = new Set<WizardDraftState>(['deleted', 'submitted'])

/**
 * Pure transition function. Total over (state, event): an undefined edge (or
 * any event from a terminal state) returns the current state unchanged.
 */
export function wizardDraftTransition(
  state: WizardDraftState,
  event: WizardDraftEvent,
): WizardDraftState {
  if (TERMINAL_STATES.has(state)) return state
  return TRANSITIONS[state]?.[event] ?? state
}

/** Fold a sequence of events from an optional starting state. */
export function runWizardDraftEvents(
  events: readonly WizardDraftEvent[],
  from: WizardDraftState = INITIAL_WIZARD_DRAFT_STATE,
): WizardDraftState {
  return events.reduce(wizardDraftTransition, from)
}

/** A terminal state (submitted or deleted) accepts no further transitions. */
export function isTerminalWizardDraftState(state: WizardDraftState): boolean {
  return TERMINAL_STATES.has(state)
}

/**
 * States that hold work which a page unload / navigation would lose or leave
 * unsynchronised. Drives the single `beforeunload` guard and the "unsaved
 * changes" affordance (R10.7).
 */
export function isUnsyncedWizardDraftState(state: WizardDraftState): boolean {
  return (
    state === 'ready.dirty' ||
    state === 'saving' ||
    state === 'offline.queued' ||
    state === 'conflict' ||
    state === 'ready.with_errors'
  )
}

/** True when edits are queued locally awaiting a reconnect. */
export function hasQueuedWizardDraftWork(state: WizardDraftState): boolean {
  return state === 'offline.queued'
}

/**
 * The user-visible save-state label family (R10.7): saving / saved / offline /
 * retrying / conflict. Pure projection used by save indicators. Never blocks
 * typing — it only describes the current machine state.
 */
export type WizardDraftSaveLabel =
  | 'idle'
  | 'editing'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'conflict'
  | 'error'
  | 'submitting'
  | 'submitted'
  | 'deleting'
  | 'deleted'

export function wizardDraftSaveLabel(state: WizardDraftState): WizardDraftSaveLabel {
  switch (state) {
    case 'uninitialized':
    case 'loading':
      return 'idle'
    case 'ready.clean':
      return 'saved'
    case 'ready.dirty':
      return 'editing'
    case 'saving':
      return 'saving'
    case 'offline.queued':
      return 'offline'
    case 'conflict':
      return 'conflict'
    case 'ready.with_errors':
      return 'error'
    case 'submitting':
      return 'submitting'
    case 'submitted':
      return 'submitted'
    case 'deleting':
      return 'deleting'
    case 'deleted':
      return 'deleted'
    default:
      return 'idle'
  }
}

/** Every state the machine can occupy (for exhaustive tests/introspection). */
export const WIZARD_DRAFT_STATES: readonly WizardDraftState[] = [
  'uninitialized',
  'loading',
  'ready.clean',
  'ready.dirty',
  'saving',
  'offline.queued',
  'conflict',
  'deleting',
  'deleted',
  'submitting',
  'submitted',
  'ready.with_errors',
]

/** Every event the machine accepts (for exhaustive tests/introspection). */
export const WIZARD_DRAFT_EVENTS: readonly WizardDraftEvent[] = [
  'START_NEW',
  'RESUME',
  'EDIT',
  'SAVE_DUE',
  'SAVE_NOW',
  'NETWORK_LOST',
  'NETWORK_RESTORED',
  'SERVER_CONFLICT',
  'DELETE',
  'PAY',
  'SUBMIT',
  'LOADED',
  'LOAD_FAILED',
  'REVERT',
  'SAVE_OK',
  'SAVE_FAILED',
  'RESOLVE_RELOAD',
  'RESOLVE_MERGE',
  'DELETE_OK',
  'DELETE_BLOCKED',
  'SUBMIT_OK',
  'SUBMIT_FAILED',
]
