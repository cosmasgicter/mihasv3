/**
 * The pure presenter behind an admin record's compact command surface
 * (admissions-v2 task 11.4, R16.1-R16.2, findings ADM-01 / ADM-03).
 *
 * R16.1 permits an admin table to become "a compact record list or detail sheet
 * **without losing commands, filters, state, or pagination**". The habit this
 * module replaces is the opposite reading: a phone-width admin row would render
 * every command it had as a flat stack of equally prominent buttons — a users
 * row carried four, an applications row up to ten — so the record itself
 * scrolled off the screen under its own controls.
 *
 * Task 11.3 settled the shape for the student document surface: **status first,
 * one primary control, one counted accessible disclosure for the rest, one live
 * region outside dense rows, and a panel that is not a second card.** This is
 * the same shape spelled for an admin record, and it is deliberately the same
 * module kind — a pure, total, order-independent presenter with no hook, no
 * request, and no authority rule of its own.
 *
 * What this module does **not** decide:
 *   - **whether** a command exists. That is the platform's: the review
 *     workspace publishes `allowed_transitions` / `capabilities`, the roster's
 *     status and canonical payment status drive the transition set, and the
 *     backend re-enforces every command regardless of what is rendered.
 *   - **what** a command does. Callers keep their own handlers.
 *
 * It decides only **order and prominence**, and it states honestly how many
 * commands the disclosure is holding.
 */

/** Where a command sits once the surface is compact. */
export type AdminCommandProminence = 'primary' | 'overflow'

/** The tone vocabulary, so a caller never invents a colour. */
export type AdminCommandTone = 'default' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning'

/**
 * One authorized command on an admin record.
 *
 * `id` is stable so a browser journey can address the command the platform
 * offered rather than matching on rendered text.
 */
export interface AdminRecordCommand {
  id: string
  label: string
  prominence: AdminCommandProminence
  tone?: AdminCommandTone
  /** Disabled with a stated reason — never a control that is silently inert. */
  disabled?: boolean
  disabledReason?: string
  onSelect: () => void
}

export interface AdminRecordCommandPresentation {
  /** The one command that stays visible at every width, or `null`. */
  primary: AdminRecordCommand | null
  /** Every remaining command, in the order the caller declared them. */
  overflow: readonly AdminRecordCommand[]
  /** `overflow.length` — what the disclosure's label must state. */
  overflowCount: number
}

/**
 * Split a record's commands into the one that stays visible and the rest.
 *
 * The first command declared with `prominence: 'primary'` wins; when a caller
 * declares none, the first command becomes the primary so a record is never
 * left with a disclosure and nothing on it. Order is otherwise preserved
 * exactly — this function sorts nothing, so the caller's declaration order is
 * the reading order and the tab order.
 */
export function presentAdminRecordCommands(
  commands: readonly AdminRecordCommand[],
): AdminRecordCommandPresentation {
  if (commands.length === 0) {
    return { primary: null, overflow: [], overflowCount: 0 }
  }

  const primaryIndex = commands.findIndex((command) => command.prominence === 'primary')
  const resolvedIndex = primaryIndex >= 0 ? primaryIndex : 0
  const primary = commands[resolvedIndex] ?? null
  const overflow = commands.filter((_, index) => index !== resolvedIndex)

  return { primary, overflow, overflowCount: overflow.length }
}

/**
 * The disclosure's label, which counts what it hides.
 *
 * A trigger reading only "More" is what let the pre-11.3 student surface hide a
 * ready document behind a closed box (11.3 §6). The count is asserted honest by
 * the unit suite and by the browser journey, which opens the disclosure and
 * counts the controls it yielded.
 */
export function adminRecordOverflowLabel(count: number): string {
  if (count <= 0) return 'No other actions'
  return count === 1 ? '1 more action' : `${count} more actions`
}

/**
 * The one polite sentence an admin record's live region carries.
 *
 * `busy` is the record's own in-flight state, which the caller already tracks
 * for its optimistic UI. Empty string means "say nothing", so a resting record
 * never announces.
 */
export function announceAdminRecordState(input: {
  recordLabel: string
  busy?: boolean
  busyLabel?: string
  settledLabel?: string | null
}): string {
  if (input.busy) {
    return `${input.busyLabel ?? 'Working on'} ${input.recordLabel}…`
  }
  if (input.settledLabel) {
    return `${input.recordLabel}: ${input.settledLabel}`
  }
  return ''
}
