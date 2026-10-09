/**
 * The applications roster row's command enumeration (admissions-v2 task 11.4,
 * R8.3, R16.1, finding ADM-01).
 *
 * Why this exists: task 11.4 puts the roster row's decision block behind **one
 * counted disclosure**, and 11.3 established that the count on such a trigger
 * must be *honest* — a trigger reading only "More" is how the pre-11.3 student
 * surface hid a ready document behind a closed box. Counting requires an
 * enumeration, so this module states, as data, which commands
 * `ApplicationApprovalActions` offers for a given `(status, paymentStatus,
 * canVerifyPayment)`.
 *
 * It is a **mirror, not an authority**:
 *   - `ApplicationApprovalActions` remains the renderer and keeps its own
 *     per-status branches (other lanes' preservation tests read that file's
 *     source, and this task changes none of those branches);
 *   - the backend is the authority on every transition and every payment
 *     decision, and re-enforces both regardless of what is rendered;
 *   - the review workspace publishes `allowed_transitions` / `capabilities` for
 *     the *detail* surface — the roster's list contract carries no command
 *     matrix, which is why the row derives the same set the renderer derives.
 *
 * Because it is a mirror it is **drift-guarded**: `adminMobileCompleteness`
 * renders the real component across the whole `(status × paymentStatus ×
 * canVerifyPayment)` cross-product and asserts the rendered buttons and this
 * enumeration are the same set. If either side gains or loses a command, the
 * guard fails rather than the count quietly lying.
 */
import { normalizePaymentStatus, type CanonicalPaymentStatus } from '@/lib/paymentStatus'
import type { ApplicationStatus } from '@/types/applicationStatus'

/** One command the decision block offers, named by the label it renders. */
export interface AdminApplicationCommand {
  /** Stable id — `status:<target>` or `payment:<target>`. */
  id: string
  /** The rendered label, which is what the drift guard compares. */
  label: string
  kind: 'status' | 'payment'
  /** The status/payment value the command asks the backend to move to. */
  target: string
}

/**
 * The status transitions the decision block offers from `status`.
 *
 * These are the renderer's own branches, restated. Terminal statuses
 * (`approved`, `rejected`, `enrolled`, `withdrawn`, `expired`,
 * `enrollment_expired`) offer none: the block renders a badge for them, which is
 * status, not a command.
 */
export function applicationStatusCommands(
  status: ApplicationStatus | string,
): AdminApplicationCommand[] {
  switch (status) {
    case 'draft':
      return [{ id: 'status:submitted', label: 'Force Submit', kind: 'status', target: 'submitted' }]
    case 'submitted':
      return [{ id: 'status:under_review', label: 'Review', kind: 'status', target: 'under_review' }]
    case 'under_review':
      return [
        { id: 'status:approved', label: 'Approve', kind: 'status', target: 'approved' },
        { id: 'status:rejected', label: 'Reject', kind: 'status', target: 'rejected' },
        {
          id: 'status:conditionally_approved',
          label: 'Conditional',
          kind: 'status',
          target: 'conditionally_approved',
        },
        { id: 'status:waitlisted', label: 'Waitlist', kind: 'status', target: 'waitlisted' },
      ]
    case 'conditionally_approved':
    case 'waitlisted':
      return [
        { id: 'status:approved', label: 'Approve', kind: 'status', target: 'approved' },
        { id: 'status:rejected', label: 'Reject', kind: 'status', target: 'rejected' },
      ]
    default:
      return []
  }
}

/**
 * The payment decisions the block offers for `paymentStatus`.
 *
 * `canVerifyPayment` is the server's own answer from the published command
 * matrix (AUTH-02): without it the block renders a stated read-only sentence and
 * **no** payment command, so the enumeration is empty too.
 */
export function applicationPaymentCommands(
  paymentStatus: CanonicalPaymentStatus,
  canVerifyPayment: boolean,
): AdminApplicationCommand[] {
  if (!canVerifyPayment) return []

  switch (paymentStatus) {
    case 'not_paid':
      return [{ id: 'payment:verified', label: 'Mark as Paid', kind: 'payment', target: 'verified' }]
    case 'pending_review':
      return [
        { id: 'payment:verified', label: 'Verify', kind: 'payment', target: 'verified' },
        { id: 'payment:rejected', label: 'Reject', kind: 'payment', target: 'rejected' },
        { id: 'payment:deferred', label: 'Defer', kind: 'payment', target: 'deferred' },
      ]
    case 'rejected':
    case 'deferred':
      return [
        {
          id: 'payment:pending_review',
          label: 'Reopen Review',
          kind: 'payment',
          target: 'pending_review',
        },
      ]
    default:
      return []
  }
}

/**
 * Every command the decision block offers for one application, status
 * transitions first and payment decisions second — the order the renderer uses.
 *
 * Pure and total: any string is accepted for either status, and an unrecognised
 * one yields no commands rather than throwing.
 */
export function applicationDecisionCommands(input: {
  status: ApplicationStatus | string
  paymentStatus?: string | null
  canVerifyPayment?: boolean
}): AdminApplicationCommand[] {
  return [
    ...applicationStatusCommands(input.status),
    ...applicationPaymentCommands(
      normalizePaymentStatus(input.paymentStatus),
      input.canVerifyPayment !== false,
    ),
  ]
}

/** How many commands a roster row's disclosure is holding from the block. */
export function applicationDecisionCommandCount(input: {
  status: ApplicationStatus | string
  paymentStatus?: string | null
  canVerifyPayment?: boolean
}): number {
  return applicationDecisionCommands(input).length
}
