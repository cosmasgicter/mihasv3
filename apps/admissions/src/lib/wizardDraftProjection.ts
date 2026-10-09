/**
 * Pure rules the wizard draft machine decides with (admissions-v2 task 6.3 —
 * R10.2, R10.3, R10.4, R10.7; findings STU-02, MAINT-01).
 *
 * The machine (`wizardDraftController.ts`) owns every draft write. Three of its
 * decisions are worth isolating as total, side-effect-free functions so they can
 * be property-tested over their whole input space:
 *
 *   1. **Is there anything to write?** A write is due only when the canonical
 *      answer projection differs from the projection the server last
 *      acknowledged. Equality is by a stable fingerprint, so key order and
 *      `undefined` members never manufacture a difference. This is the rule that
 *      removes the same-value projection write M9 observed on resume and step
 *      navigation: an unchanged draft has an unchanged fingerprint.
 *   2. **Explicit merge after a conflict** (design §8.2 `conflict -> reload |
 *      explicit merge`). A field-level three-way merge: what the student changed
 *      since the version they loaded is kept, everything else adopts the newer
 *      server value. It runs only when the student asks for it — never silently
 *      (R10.3).
 *   3. **May a local outbox record be replayed?** Only when it holds pending
 *      edits made on top of exactly the version the server still has, under the
 *      assignment the server still reports. The decision is by optimistic
 *      version and address, never by timestamp (R10.3): a record based on an
 *      older version, or addressed to another assignment, is not applied.
 */

/** The canonical answer projection: the exact draft PATCH body, minus `expected_version`. */
export type DraftAnswerProjection = Readonly<Record<string, unknown>>

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const member = (value as Record<string, unknown>)[key]
      if (member === undefined) continue
      out[key] = stableValue(member)
    }
    return out
  }
  return value
}

/**
 * A stable fingerprint of a projection. Keys are sorted and `undefined` members
 * dropped, so two projections that would serialise to the same request body
 * always share a fingerprint. `null`/`undefined` input has no fingerprint.
 */
export function fingerprintDraftProjection(
  projection: Record<string, unknown> | null | undefined,
): string | null {
  if (!projection) return null
  return JSON.stringify(stableValue(projection))
}

/** Whether two projections would produce the same request body. */
export function sameDraftProjection(
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined,
): boolean {
  return fingerprintDraftProjection(left) === fingerprintDraftProjection(right)
}

function sameMember(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
}

export interface DraftMergeInput {
  /** The answers the student's session last had acknowledged by the server. */
  base: DraftAnswerProjection | null
  /** The student's current answers. */
  mine: DraftAnswerProjection
  /** The newer answers the server holds now. */
  theirs: DraftAnswerProjection
}

export interface DraftMergeResult {
  /** The answers to send, on top of the server's newer version. */
  merged: Record<string, unknown>
  /** Fields where the student's own change is kept. */
  keptMine: string[]
  /** Fields that adopt the newer server value. */
  adoptedTheirs: string[]
}

/**
 * Field-level three-way merge for the student's explicit "keep my changes".
 *
 * - a field the student changed since `base` keeps the student's value (also
 *   when the other device changed it too — that is what the explicit choice
 *   means);
 * - every other field adopts `theirs`.
 *
 * With no `base` (the session never saw a server acknowledgement) there is no
 * way to tell "changed" from "unchanged", so every field that differs from
 * `theirs` is treated as the student's change. Pure and total.
 */
export function mergeDraftAnswerProjections({ base, mine, theirs }: DraftMergeInput): DraftMergeResult {
  const reference = base ?? theirs
  const fields = new Set<string>([...Object.keys(reference), ...Object.keys(mine), ...Object.keys(theirs)])
  const merged: Record<string, unknown> = {}
  const keptMine: string[] = []
  const adoptedTheirs: string[] = []
  for (const field of [...fields].sort()) {
    const mineChanged = !sameMember(mine[field], reference[field])
    if (mineChanged) {
      if (mine[field] !== undefined) merged[field] = mine[field]
      if (!sameMember(mine[field], theirs[field])) keptMine.push(field)
    } else {
      if (theirs[field] !== undefined) merged[field] = theirs[field]
      if (!sameMember(mine[field], theirs[field])) adoptedTheirs.push(field)
    }
  }
  return { merged, keptMine, adoptedTheirs }
}

/**
 * The assignment a draft is bound to, as the server reports it: the canonical
 * offering and intake (`program_offering_id` + `intake_id`, both on every draft
 * row and command response). It is the third part of a local outbox record's
 * address (design §8.2: `(user_id, application_id, assignment_id)`, task 6.3
 * M14). `null` when the row does not carry both — a legacy draft without a
 * canonical binding — in which case the version rule alone decides.
 */
export function draftAssignmentKey(record: Record<string, unknown> | null | undefined): string | null {
  if (!record || typeof record !== 'object') return null
  const offering = typeof record.program_offering_id === 'string' ? record.program_offering_id.trim() : ''
  const intake = typeof record.intake_id === 'string' ? record.intake_id.trim() : ''
  return offering && intake ? `${offering}|${intake}` : null
}

/** The address and retry metadata a local outbox record carries next to its pending answers. */
export interface LocalDraftOutboxRecord {
  userId?: unknown
  applicationId?: unknown
  /** `draftAssignmentKey` of the server draft the pending answers were made against. */
  assignment?: unknown
  serverVersion?: unknown
  pending?: unknown
}

export interface LocalDraftOutboxTarget {
  userId: string | null | undefined
  applicationId: string
  serverVersion: number
  /** The assignment the freshly loaded server draft reports, when it reports one. */
  assignment?: string | null
}

/**
 * What to do with a local outbox record when its draft is freshly loaded from
 * the server (R10.3, R10.4):
 *
 * - `none`       — nothing to recover: not this user's or this application's
 *                  record, not marked `pending` (a clean recovery copy is never
 *                  replayed, which keeps a reload write-free), or its pending
 *                  answers are already what the server holds;
 * - `reassigned` — pending edits addressed to a different assignment than the
 *                  one the server now reports (a reroute happened elsewhere).
 *                  Never replayed: the record is not this draft's address. It is
 *                  surfaced as an explicit conflict, like `stale`;
 * - `replay`     — pending edits made on top of exactly the version the server
 *                  still has, under the same assignment: re-apply them as the
 *                  student's edits, so they are sent;
 * - `stale`      — pending edits made on an older (or unknown) version: the server
 *                  moved on. This is a stale command, and a stale command is a
 *                  conflict — surfaced for an explicit reload or merge, never
 *                  silently applied and never silently dropped.
 *
 * A record that names no assignment (one written before task 6.3 M14) is judged
 * by version alone. That is sound because every reroute advances the draft's
 * version (`change_selection_service` bumps `version` with `assignment_version`),
 * so a record made on the version the server still has cannot predate a reroute.
 */
export type LocalDraftOutboxDisposition = 'none' | 'replay' | 'stale' | 'reassigned'

export function classifyLocalDraftOutbox(
  record: LocalDraftOutboxRecord | null | undefined,
  target: LocalDraftOutboxTarget,
  hasRecoverableAnswers: boolean,
): LocalDraftOutboxDisposition {
  if (!record || typeof record !== 'object') return 'none'
  if (record.pending !== true) return 'none'
  if (typeof record.applicationId !== 'string' || record.applicationId !== target.applicationId) return 'none'
  if (target.userId && record.userId !== target.userId) return 'none'
  if (!hasRecoverableAnswers) return 'none'
  const recordAssignment = typeof record.assignment === 'string' && record.assignment ? record.assignment : null
  if (recordAssignment && target.assignment && recordAssignment !== target.assignment) return 'reassigned'
  return positiveDraftVersion(record.serverVersion) === target.serverVersion ? 'replay' : 'stale'
}

/**
 * Read a `pendingBase` back from a stored record: `null` members (JSON's
 * stand-in for "was blank") become `undefined` again, so a restored base
 * compares equal to the projection it was taken from. Non-objects are `null`.
 */
export function restoreDraftBase(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, unknown> = {}
  for (const [field, member] of Object.entries(value as Record<string, unknown>)) {
    out[field] = member === null ? undefined : member
  }
  return out
}

/**
 * For each answer the student changed relative to `base`, the base value — the
 * minimum a later three-way merge needs to tell "the student changed this"
 * from "another device changed this", and the list of fields an outbox replay
 * may re-apply. Unchanged answers are not recorded. `null` when there is no
 * acknowledged base to compare with.
 */
export function pendingDraftBase(
  base: DraftAnswerProjection | null,
  current: DraftAnswerProjection,
): Record<string, unknown> | null {
  if (!base) return null
  const out: Record<string, unknown> = {}
  for (const field of new Set([...Object.keys(base), ...Object.keys(current)])) {
    if (!sameMember(base[field], current[field])) out[field] = base[field] ?? null
  }
  return out
}

/** A positive integer optimistic version, or null. */
export function positiveDraftVersion(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}
