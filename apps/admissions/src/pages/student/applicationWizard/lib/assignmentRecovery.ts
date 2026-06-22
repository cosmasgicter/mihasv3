import { cachedGetItem, cachedSetItem } from '@/lib/localStorageCache'
import { BROWSER_KEYS, LEGACY_BROWSER_KEYS } from '@/lib/browserNamespace'

/**
 * Recoverable assignment-failure guidance (R10.4, R2.6, R2.7).
 *
 * When the program-first assignment cannot resolve a school — either at the
 * assigned-school checkpoint (`NO_ELIGIBLE_OFFERING`, R2.6) or when submission
 * re-runs assignment (`OFFERING_NO_LONGER_AVAILABLE` / `OFFERING_CAPACITY_FULL`,
 * R2.7) — the wizard must present a recoverable path and never dead-end the
 * student. This module is the single source of truth that maps each stable
 * backend code to user-facing guidance plus an ordered set of recovery actions.
 *
 * Codes mirror `backend/apps/common/error_codes.py` (registered in the frontend
 * mirror fixture `tests/unit/__fixtures__/errorCodesBackendMirror.ts`).
 */

export const ASSIGNMENT_FAILURE_CODES = [
  'NO_ELIGIBLE_OFFERING',
  'OFFERING_NO_LONGER_AVAILABLE',
  'OFFERING_CAPACITY_FULL',
] as const

export type AssignmentFailureCode = (typeof ASSIGNMENT_FAILURE_CODES)[number]

/** Ordered recovery actions a student can take. Never empty — never a dead-end. */
export type AssignmentRecoveryActionKey = 'change-intake' | 'interest-list' | 'contact-admissions'

export interface AssignmentRecoveryGuidance {
  /** The stable code that triggered recovery (or `null` for a transient/unknown failure). */
  code: AssignmentFailureCode | null
  title: string
  /** Plain-English explanation of what happened and that the student can still proceed. */
  message: string
  /** Ordered recovery actions. Guaranteed non-empty so the student is never dead-ended. */
  actions: AssignmentRecoveryActionKey[]
}

/**
 * Narrow an arbitrary string to a known assignment-failure code, or `null`.
 */
export function asAssignmentFailureCode(value: unknown): AssignmentFailureCode | null {
  return typeof value === 'string' && (ASSIGNMENT_FAILURE_CODES as readonly string[]).includes(value)
    ? (value as AssignmentFailureCode)
    : null
}

/**
 * Extract the stable assignment-failure code from a thrown API error.
 *
 * `apiClient` attaches the raw response body to `error.data` (which carries
 * `code`) and, for some paths, a top-level `error.code`. Returns `null` for
 * transient/network failures so callers fall back to a plain retry path.
 */
export function getAssignmentFailureCode(error: unknown): AssignmentFailureCode | null {
  if (!error || typeof error !== 'object') return null
  const candidate =
    (error as { data?: { code?: unknown } }).data?.code ??
    (error as { code?: unknown }).code
  return asAssignmentFailureCode(candidate)
}

interface ResolveRecoveryArgs {
  code: AssignmentFailureCode | null
  programName?: string | null
  intakeName?: string | null
}

/**
 * Map a stable assignment-failure code to recoverable guidance. Always returns
 * a non-empty `actions` list so the UI can never present a dead-end (R10.4).
 */
export function resolveAssignmentRecovery({
  code,
  programName,
  intakeName,
}: ResolveRecoveryArgs): AssignmentRecoveryGuidance {
  const program = programName?.trim() || 'this programme'
  const intake = intakeName?.trim() || 'this intake'

  switch (code) {
    case 'NO_ELIGIBLE_OFFERING':
      return {
        code,
        title: 'No school is assigned for this choice yet',
        message: `We could not find a school accepting ${program} for ${intake} based on your details. You can choose a different intake, join the interest list so we can notify you when a place opens, or contact admissions for help.`,
        actions: ['change-intake', 'interest-list', 'contact-admissions'],
      }
    case 'OFFERING_NO_LONGER_AVAILABLE':
      return {
        code,
        title: 'Your assigned school is no longer available',
        message: `The school assigned for ${program} (${intake}) is no longer accepting applications for this intake. Your details are saved. Choose another intake to continue, or contact admissions and we will help you find a place.`,
        actions: ['change-intake', 'contact-admissions', 'interest-list'],
      }
    case 'OFFERING_CAPACITY_FULL':
      return {
        code,
        title: 'Your assigned school is now full',
        message: `The school assigned for ${program} (${intake}) filled its remaining places before your application was submitted. Your details are saved. Choose another intake to continue, join the interest list for the next opening, or contact admissions.`,
        actions: ['change-intake', 'interest-list', 'contact-admissions'],
      }
    default:
      return {
        code: null,
        title: "We couldn't confirm your school yet",
        message:
          'We could not confirm your assigned school for this programme and intake. You can try again, choose another intake, or contact admissions for help.',
        actions: ['change-intake', 'contact-admissions'],
      }
  }
}

/**
 * Build a `mailto:` URL for the "contact admissions" recovery action. Includes
 * a non-PII subject/body referencing the programme + intake so admissions has
 * enough context. Falls back to `null` when no admissions address is known, so
 * the caller can route to the in-app contact page instead.
 */
export function buildAdmissionsMailto({
  email,
  programName,
  intakeName,
}: {
  email?: string | null
  programName?: string | null
  intakeName?: string | null
}): string | null {
  const address = email?.trim()
  if (!address) return null
  const subject = 'Help finding a place for my application'
  const lines = [
    'Hello Admissions team,',
    '',
    `I was unable to be assigned a school for ${programName?.trim() || 'my chosen programme'} (${intakeName?.trim() || 'my chosen intake'}).`,
    'Please help me find an available place.',
  ]
  const params = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`
  return `mailto:${address}?${params}`
}

// ── Interest list (client-side affordance) ────────────────────────────────
// There is no backend interest-list endpoint yet. To avoid fabricating an API
// (and to keep the recovery path real and honest), interest is recorded
// client-side in localStorage as an intent marker. The UI clearly labels this
// as a notification request and still points the student at contact admissions.

const INTEREST_STORE_KEY = BROWSER_KEYS.assignmentInterest
const LEGACY_INTEREST_STORE_KEY = LEGACY_BROWSER_KEYS.assignmentInterest

interface StoredInterestEntry {
  programId: string
  intakeId: string
  code: AssignmentFailureCode | null
  recordedAt: string
}

function interestKey(programId: string, intakeId: string): string {
  return `${programId}::${intakeId}`
}

function readInterestStore(): Record<string, StoredInterestEntry> {
  try {
    let raw = cachedGetItem(INTEREST_STORE_KEY)
    if (!raw) {
      raw = cachedGetItem(LEGACY_INTEREST_STORE_KEY)
      if (raw) {
        cachedSetItem(INTEREST_STORE_KEY, raw)
      }
    }
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, StoredInterestEntry>) : {}
  } catch {
    return {}
  }
}

/**
 * Record (client-side) that the student wants to be notified when a place opens
 * for the given program + intake. Idempotent per program+intake. Returns `true`
 * when persisted. No PII is stored — only the catalog IDs and the failure code.
 */
export function recordAssignmentInterest({
  programId,
  intakeId,
  code,
}: {
  programId?: string | null
  intakeId?: string | null
  code?: AssignmentFailureCode | null
}): boolean {
  const pid = programId?.trim()
  const iid = intakeId?.trim()
  if (!pid || !iid) return false
  try {
    const store = readInterestStore()
    store[interestKey(pid, iid)] = {
      programId: pid,
      intakeId: iid,
      code: code ?? null,
      recordedAt: new Date().toISOString(),
    }
    cachedSetItem(INTEREST_STORE_KEY, JSON.stringify(store))
    try {
      localStorage.removeItem(LEGACY_INTEREST_STORE_KEY)
    } catch {
      // best effort legacy cleanup
    }
    return true
  } catch {
    return false
  }
}

/** Whether interest has already been recorded for this program + intake. */
export function hasRecordedAssignmentInterest({
  programId,
  intakeId,
}: {
  programId?: string | null
  intakeId?: string | null
}): boolean {
  const pid = programId?.trim()
  const iid = intakeId?.trim()
  if (!pid || !iid) return false
  return Boolean(readInterestStore()[interestKey(pid, iid)])
}
