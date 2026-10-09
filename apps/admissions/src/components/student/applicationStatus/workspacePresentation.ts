/**
 * The student workspace's pure label and copy derivation (admissions-v2 task
 * 12.1, MAINT-01).
 *
 * Lifted **verbatim** out of `pages/student/ApplicationStatus.tsx`. Every string
 * and every branch is the one that was there; what changes is that the page now
 * reads the answers instead of computing them between its query hooks and its
 * JSX, which is the "mixes orchestration, validation, persistence, and rendering"
 * half of MAINT-01.
 *
 * The reason to move copy selection out of a component at all: these are the
 * sentences a student reads about their own money and their own record, and a
 * page-local ternary chain is the one place nobody can test them. They are pure
 * functions of the server's status now.
 */
import type { ApplicationWithDetails } from '@/types/database'
import { formatDate } from '@/lib/dateFormat'
import {
  getPaymentStatusLabel,
  normalizePaymentStatus,
} from '@/lib/paymentStatus'

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function truncateValue(value: string | null | undefined, maxLength: number): string | null {
  if (!value) {
    return null
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}\u2026` : value
}

/**
 * What the workspace says about this application's fee.
 *
 * The `deferred` branch is the one that matters and it is task 10.6's, unchanged.
 * A deferral is a fee still owed: `requiresStudentPaymentAction` answered
 * `not_paid` and `rejected` only, so a student who chose to pay later reached this
 * workspace, read "Payment still needs attention before review can continue", and
 * was offered **nothing to do** — the dead end R13 opens by naming. It is money
 * the platform itself chases: `deferred_payment_reminder_task` emails them about
 * it every day.
 *
 * So the copy names the student's own choice rather than warning them about
 * something they forgot, and the *action* lives on the surface that owns
 * post-submission collection (R12.3, task 8.3) — this function authors no
 * affordance.
 */
export function resolvePaymentStatusDescription(input: {
  normalizedPaymentStatus: string
  hasDeferredFee: boolean
  applicationStatus: string
}): string {
  const { normalizedPaymentStatus, hasDeferredFee, applicationStatus } = input
  return normalizedPaymentStatus === 'verified'
    ? 'Your application fee has been verified and recorded successfully.'
    : normalizedPaymentStatus === 'pending_review'
      ? 'Your recent payment is awaiting review by the admissions team.'
      : normalizedPaymentStatus === 'rejected'
        ? 'Your recent payment needs attention before your application can continue.'
        : hasDeferredFee
          // Their own choice, named as such — not a warning about something they
          // forgot. Task 8.3's payment page says the same thing.
          ? 'You chose to pay this fee later. You can complete it whenever you are ready.'
          : applicationStatus === 'draft'
            ? 'Payment is completed in the wizard when you are ready to submit this draft.'
            : 'Payment still needs attention before review can continue.'
}

export interface WorkspacePresentation {
  statusLabel: string
  normalizedPaymentStatus: string
  hasDeferredFee: boolean
  paymentStatusLabel: string
  paymentStatusDescription: string
  paymentReviewNote: string | null
  institutionLabel: string
  applicationTitle: string
  applicationSubtitle: string
}

/**
 * Everything the page renders that is a pure function of the application row.
 *
 * `hasDeferredFee` is kept as a named value rather than inlined because task
 * 10.6's characterisation reads it: it earns its keep on the *copy*, while the
 * next-action gate is task 11.1's shared `requiresStudentPaymentAction`. Two
 * different questions, deliberately answered in two places.
 */
export function buildWorkspacePresentation(
  application: ApplicationWithDetails
): WorkspacePresentation {
  const statusLabel = formatStatusLabel(application.status).toUpperCase()

  const paymentReviewNote =
    typeof application.last_payment_audit_notes === 'string' && application.last_payment_audit_notes.trim().length > 0
      ? application.last_payment_audit_notes.trim()
      : null

  const normalizedPaymentStatus = normalizePaymentStatus(application.payment_status)
  const hasDeferredFee = normalizedPaymentStatus === 'deferred'

  /*
    Task 10.6 parity. The retired workspace read `institution_name ?? institution`
    off the same detail response; the canonical `Application` type does not declare
    either (they are display snapshots the backend adds — see the canonical truth
    map's note that `applications.institution` is a snapshot, not authority), so
    the read is narrowed here rather than widening the shared type with fields no
    other surface consumes.
  */
  const institutionSnapshot = application as ApplicationWithDetails & {
    institution?: string | null
    institution_name?: string | null
  }

  const applicationSubtitlePrefix = application.status === 'draft' ? 'Started on' : 'Submitted on'
  const applicationSubtitleDate = formatDate(application.status === 'draft' ? application.created_at : application.submitted_at)

  return {
    statusLabel,
    normalizedPaymentStatus,
    hasDeferredFee,
    paymentStatusLabel: getPaymentStatusLabel(application.payment_status),
    paymentStatusDescription: resolvePaymentStatusDescription({
      normalizedPaymentStatus,
      hasDeferredFee,
      applicationStatus: application.status,
    }),
    paymentReviewNote,
    institutionLabel:
      institutionSnapshot.institution_name || institutionSnapshot.institution || 'Not provided',
    applicationTitle: application.application_number
      ? `Application #${application.application_number}`
      : 'Application status',
    applicationSubtitle: `${truncateValue(application.program, 40) || 'Programme pending'} \u2022 ${applicationSubtitlePrefix} ${applicationSubtitleDate}`,
  }
}
