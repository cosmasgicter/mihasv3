/**
 * Official-document availability gate — the single pure source of truth for
 * which student official documents are offered for a given application state.
 *
 * Spec: `multi-tenant-beanola-remediation` — Phase 3, Requirement 5 / 7.
 * Mirrors the backend status/payment gate (`official_document_views._student_gate_open`,
 * R5.2–R5.5) so the frontend never offers an action the backend would 404-mask:
 *
 *   application_slip   → a non-draft submitted status   (R5.2)
 *   acceptance_letter  → `approved`                      (R5.3)
 *   conditional_offer  → `conditionally_approved`        (R5.4)
 *   payment_receipt    → a verified/completed payment    (R5.5)
 *   finance_receipt    → staff-only, never student-offered
 *
 * R17.1 ("UI reflects backend truth"): the `application_slip` gate mirrors the
 * backend's *closed* submitted-state allowlist
 * (`official_document_views._NON_DRAFT_SUBMITTED_STATUSES`), not a broad
 * `!== 'draft'` test. Terminal statuses (`enrolled`, `rejected`, `withdrawn`,
 * `expired`, `enrollment_expired`) are not "submitted" states, so the backend
 * 404-masks a slip request for them — and so must the UI, rather than offering
 * an action that degrades to a `Failed` state.
 *
 * Extracted as a pure function so both the rewired student components
 * (`DocumentButtons`, `DownloadReceiptButton`, `ApplicationSlipActions`) and the
 * Property 18 frontend mirror test share one authority (no behavior duplication
 * / drift).
 *
 * @module officialDocumentGate
 */

import { isPaymentVerified } from './paymentStatus'

/** The official-document types subject to a student status/payment gate. */
export type OfficialDocumentGateType =
  | 'application_slip'
  | 'acceptance_letter'
  | 'conditional_offer'
  | 'payment_receipt'
  | 'finance_receipt'

/**
 * The closed set of non-draft *submitted* statuses in which the application
 * slip is offered (R5.2 / R17.1). Byte-for-byte mirror of the backend
 * `official_document_views._NON_DRAFT_SUBMITTED_STATUSES`. Terminal statuses
 * (`enrolled`, `rejected`, `withdrawn`, `expired`, `enrollment_expired`) are
 * deliberately excluded — the backend 404-masks them, so the UI must not offer
 * the action.
 */
export const NON_DRAFT_SUBMITTED_STATUSES: ReadonlySet<string> = new Set([
  'submitted',
  'under_review',
  'waitlisted',
  'conditionally_approved',
  'approved',
])

/**
 * Whether the official document of `documentType` is offered/enabled for an
 * application in `applicationStatus` with `paymentStatus`.
 *
 * Returns `false` for unknown document types — fail closed, never offer an
 * action the backend would reject.
 */
export function isOfficialDocumentOffered(
  documentType: OfficialDocumentGateType | string,
  applicationStatus: string,
  paymentStatus: string | null,
): boolean {
  switch (documentType) {
    case 'application_slip':
      return NON_DRAFT_SUBMITTED_STATUSES.has(applicationStatus)
    case 'acceptance_letter':
      return applicationStatus === 'approved'
    case 'conditional_offer':
      return applicationStatus === 'conditionally_approved'
    case 'payment_receipt':
      return isPaymentVerified(paymentStatus)
    case 'finance_receipt':
      return false
    default:
      return false
  }
}
