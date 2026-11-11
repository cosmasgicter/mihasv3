/**
 * Draft selection change (reroute) — decision + recovery guidance.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` — task 6.4
 * Requirements: R7.2, R10.5 · Findings: STU-01, DATA-01
 * Design: design.md §7.2 — "Generic PATCH never accepts assignment identifiers
 * or their display snapshots. Before any payment exists, `ChangeSelectionCommand`
 * may atomically reassign the draft … Payment activity makes assignment
 * immutable."
 *
 * The wizard used to PATCH `program`/`intake`/`institution` onto an existing
 * draft, which moved the display labels while the canonical routing ids stayed
 * behind (finding STU-01). Those fields are now server-derived and read-only, so
 * the wizard must:
 *
 *  1. decide whether the student's selection actually changed
 *     (:func:`resolveSelectionChangeIntent`), and
 *  2. call the one reroute command, translating every stable rejection code into
 *     a recoverable, never-dead-end message
 *     (:func:`resolveSelectionChangeRecovery`).
 *
 * Pure module: no network, no React — so both halves are directly testable.
 */

/** The canonical selection a draft is currently persisted against. */
export interface PersistedSelection {
  programId?: string | null
  intakeId?: string | null
  /** Display snapshots — the only identity a pre-canonical legacy draft has. */
  programName?: string | null
  intakeName?: string | null
  assignmentVersion?: number | null
}

/** The canonical selection the student has chosen in the wizard. */
export interface TargetSelection {
  programId: string
  intakeId: string
  programName?: string | null
  intakeName?: string | null
}

export type SelectionChangeIntent =
  /** Nothing to send: the draft already holds this canonical selection. */
  | { kind: 'noop' }
  /** Send the reroute command (canonical ids only). */
  | { kind: 'change'; programId: string; intakeId: string; assignmentVersion?: number }

const norm = (value?: string | null) => String(value ?? '').trim().toLowerCase()

/**
 * Decide whether the wizard must send the reroute command.
 *
 * A reroute is sent when the target canonical ids differ from the persisted
 * ones, or when the draft has no canonical ids at all *and* its display
 * snapshots differ from the target (a legacy draft whose selection changed).
 * A legacy draft whose display selection is unchanged is left alone — the
 * server repairs its canonical identity through its own canonicalisation path,
 * and the wizard should not turn a page-advance into an assignment command.
 */
export function resolveSelectionChangeIntent({
  persisted,
  target,
}: {
  persisted: PersistedSelection
  target: TargetSelection
}): SelectionChangeIntent {
  if (!target.programId || !target.intakeId) return { kind: 'noop' }

  const change: SelectionChangeIntent = {
    kind: 'change',
    programId: target.programId,
    intakeId: target.intakeId,
    ...(typeof persisted.assignmentVersion === 'number'
      ? { assignmentVersion: persisted.assignmentVersion }
      : {}),
  }

  const hasCanonical = Boolean(persisted.programId && persisted.intakeId)
  if (hasCanonical) {
    const same =
      String(persisted.programId) === String(target.programId) &&
      String(persisted.intakeId) === String(target.intakeId)
    return same ? { kind: 'noop' } : change
  }

  // Legacy / not-yet-canonical draft: compare what identity it does have.
  const displayKnown = Boolean(norm(persisted.programName) || norm(persisted.intakeName))
  if (!displayKnown) return change
  const displaySame =
    norm(persisted.programName) === norm(target.programName) &&
    norm(persisted.intakeName) === norm(target.intakeName)
  return displaySame ? { kind: 'noop' } : change
}

/** Stable backend codes the reroute command can reject with. */
export const SELECTION_CHANGE_CODES = [
  'ASSIGNMENT_LOCKED_BY_PAYMENT',
  'DUPLICATE_APPLICATION',
  'VERSION_CONFLICT',
  'NO_ELIGIBLE_OFFERING',
  'INTAKE_NOT_OPEN',
  'INTAKE_DEADLINE_PASSED',
  'INSTITUTION_OVERRIDE_NOT_PERMITTED',
  'CONFIGURATION_UNAVAILABLE',
] as const

export type SelectionChangeCode = (typeof SELECTION_CHANGE_CODES)[number]

export interface SelectionChangeRecoveryAction {
  action: string
  label: string
  href?: string
}

export interface SelectionChangeRecovery {
  code: SelectionChangeCode | null
  title: string
  message: string
  /** Whether the same command may safely be retried as-is. */
  retryable: boolean
  /** Ordered recovery actions. Never empty — never a dead end. */
  actions: SelectionChangeRecoveryAction[]
}

function narrowCode(value: unknown): SelectionChangeCode | null {
  return typeof value === 'string' && (SELECTION_CHANGE_CODES as readonly string[]).includes(value)
    ? (value as SelectionChangeCode)
    : null
}

/** Extract the stable code from a thrown `apiClient` error. */
export function getSelectionChangeCode(error: unknown): SelectionChangeCode | null {
  if (!error || typeof error !== 'object') return null
  const candidate =
    (error as { data?: { code?: unknown } }).data?.code ?? (error as { code?: unknown }).code
  return narrowCode(candidate)
}

const KEEP_EDITING: SelectionChangeRecoveryAction = {
  action: 'keep-editing',
  label: 'Keep my current programme and intake',
}
const CONTACT_ADMISSIONS: SelectionChangeRecoveryAction = {
  action: 'contact-admissions',
  label: 'Contact admissions',
  href: '/contact',
}

/**
 * Translate a reroute rejection into recoverable guidance.
 *
 * When the backend supplies its own `recovery.actions` (the payment lock does),
 * those are used verbatim so the server stays the source of truth for the
 * recovery path; otherwise a code-specific default is returned. The action list
 * is guaranteed non-empty.
 */
export function resolveSelectionChangeRecovery(
  error: unknown,
  context: { programName?: string | null; intakeName?: string | null } = {},
): SelectionChangeRecovery {
  const code = getSelectionChangeCode(error)
  const body = (error && typeof error === 'object'
    ? ((error as { data?: Record<string, unknown> }).data ?? {})
    : {}) as Record<string, unknown>
  const serverRecovery = body.recovery as
    | { actions?: SelectionChangeRecoveryAction[] }
    | undefined
  const serverActions = Array.isArray(serverRecovery?.actions)
    ? serverRecovery.actions.filter(entry => entry && typeof entry.action === 'string')
    : []
  const programme = context.programName?.trim() || 'the programme you chose'
  const intake = context.intakeName?.trim() || 'that intake'
  const serverMessage = typeof body.error === 'string' ? body.error.trim() : ''

  switch (code) {
    case 'ASSIGNMENT_LOCKED_BY_PAYMENT':
      return {
        code,
        title: 'This application is locked to its current choice',
        message:
          serverMessage ||
          'This application already has payment activity, so its programme and intake can no longer be changed.',
        retryable: false,
        actions: serverActions.length
          ? serverActions
          : [
              KEEP_EDITING,
              {
                action: 'start-new-application',
                label: 'Start a separate application for the other choice',
                href: '/student/application-wizard?mode=new',
              },
              CONTACT_ADMISSIONS,
            ],
      }
    case 'DUPLICATE_APPLICATION': {
      const existingId = typeof body.existing_id === 'string' ? body.existing_id : null
      return {
        code,
        title: 'You already have an application for that choice',
        message: `You already have an application for ${programme} (${intake}). Continue that application, or pick a different programme or intake here.`,
        retryable: false,
        actions: [
          ...(existingId
            ? [
                {
                  action: 'continue-existing',
                  label: 'Continue the existing application',
                  href: `/student/application-wizard?mode=resume&draftId=${existingId}`,
                },
              ]
            : []),
          KEEP_EDITING,
        ],
      }
    }
    case 'VERSION_CONFLICT':
      return {
        code,
        title: 'This application changed somewhere else',
        message:
          'This application was updated in another tab or device. Reload it and choose again. Nothing you entered here is lost.',
        retryable: false,
        actions: [{ action: 'reload-draft', label: 'Reload this application' }, KEEP_EDITING],
      }
    case 'NO_ELIGIBLE_OFFERING':
      return {
        code,
        title: 'No school is available for that choice',
        message: `We could not find a school offering ${programme} for ${intake}. Choose a different intake or programme, or contact admissions for help.`,
        retryable: false,
        actions: [KEEP_EDITING, CONTACT_ADMISSIONS],
      }
    case 'INTAKE_NOT_OPEN':
    case 'INTAKE_DEADLINE_PASSED':
      return {
        code,
        title: 'That intake is not open',
        message: serverMessage || `Applications for ${intake} are not open. Choose another intake to continue.`,
        retryable: false,
        actions: [KEEP_EDITING, CONTACT_ADMISSIONS],
      }
    case 'INSTITUTION_OVERRIDE_NOT_PERMITTED':
      return {
        code,
        title: 'That choice belongs to another school',
        message:
          'The programme you selected is not offered on this site. Choose one of the programmes listed here.',
        retryable: false,
        actions: [KEEP_EDITING, CONTACT_ADMISSIONS],
      }
    case 'CONFIGURATION_UNAVAILABLE':
      return {
        code,
        title: 'That choice is temporarily unavailable',
        message:
          serverMessage ||
          'This programme is temporarily unavailable while its configuration is checked. Please try again shortly.',
        retryable: true,
        actions: [{ action: 'retry', label: 'Try again' }, KEEP_EDITING],
      }
    default:
      return {
        code: null,
        title: "We couldn't change your programme selection",
        message:
          'We could not change your programme and intake just now. Your saved details are unchanged. Try again, or contact admissions for help.',
        retryable: true,
        actions: [{ action: 'retry', label: 'Try again' }, KEEP_EDITING, CONTACT_ADMISSIONS],
      }
  }
}
