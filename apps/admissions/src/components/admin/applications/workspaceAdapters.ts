/**
 * One-way projections from the workspace payload onto the existing panel props
 * (Admissions V2, task 9.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4
 * Requirements: R8.5 · Findings: API-02, MAINT-01.
 *
 * Why this module exists, and what it deliberately is not
 * ------------------------------------------------------
 *
 * Task 9.4 replaced six per-application reads with one. The five detail panels
 * (`ApplicationDetailPayment`, `ApplicationDetailDocuments`,
 * `ApplicationDetailInterview`, `ApplicationDetailTimeline`, and the grades
 * display) already render the facts those six reads supplied, and they render
 * them correctly. Rewriting all five to consume the new payload shape would be a
 * large behaviour-neutral change on top of a behavioural one — exactly the mix
 * MAINT-01 warns about.
 *
 * So the transport changed and the panels did not: these functions project the
 * one server payload onto the props those panels already take.
 *
 * The important property is the **direction**. These are total, pure projections
 * from the server's answer to a view shape. There is no merge, no fallback
 * between two sources, and no `??` chain across payloads — which is what the
 * modal used to do (`{...application, ...summary.application}`, and
 * `applicationData?.application?.x ?? application.x` in dozens of places) and
 * what API-02 records as hiding backend drift. If a field is absent here, the
 * server said it was absent.
 */
import type {
  ReviewWorkspace,
  WorkspaceDocument,
  WorkspaceHistoryRecord,
} from '@/services/admin/reviewWorkspace'
import type {
  ApplicationWithDetails,
  DocumentItem,
  Grade,
  PaymentRecord,
  StatusHistoryItem,
} from './applicationDetailTypes'
import type { ApplicationInterview } from '@/types/database'

/** The application row the panels read, projected from the workspace sections. */
export function toApplicationWithDetails(workspace: ReviewWorkspace): ApplicationWithDetails {
  const { identity, answers, assignment, payment, communication } = workspace
  return {
    id: workspace.application_id,
    user_id: identity.student_user_id ?? undefined,
    application_number: identity.application_number ?? '',
    full_name: identity.full_name ?? '',
    email: identity.email ?? '',
    phone: identity.phone ?? undefined,
    date_of_birth: identity.date_of_birth ?? undefined,
    sex: identity.sex ?? undefined,
    nrc_number: identity.nrc_number ?? undefined,
    passport_number: identity.passport_number ?? undefined,
    residence_town: answers.residence_town ?? undefined,
    next_of_kin_name: answers.next_of_kin_name ?? undefined,
    program: assignment.program_offering_name ?? answers.declared_program ?? '',
    intake: assignment.intake_name ?? answers.declared_intake ?? '',
    institution: assignment.institution_name ?? answers.declared_institution ?? undefined,
    application_fee: payment.application_fee ? Number(payment.application_fee) : undefined,
    payment_status: payment.application_payment_status ?? undefined,
    status: workspace.status,
    submitted_at: assignment.submitted_at ?? undefined,
    created_at: assignment.created_at ?? undefined,
    updated_at: assignment.updated_at ?? undefined,
    admin_feedback: communication.admin_feedback ?? undefined,
    admin_feedback_date: communication.admin_feedback_at,
    admin_feedback_by: communication.admin_feedback_by?.name ?? null,
    intake_capacity: assignment.intake_capacity,
    intake_enrollment: assignment.intake_enrollment,
    assigned_reviewer_id: assignment.assigned_reviewer?.id ?? null,
    assigned_reviewer_name: assignment.assigned_reviewer?.name ?? null,
    is_late_submission: assignment.is_late_submission,
    fee_waiver: payment.fee_waiver
      ? {
          waiver_type: payment.fee_waiver.waiver_type,
          reason_code: payment.fee_waiver.reason_code,
          discount_percentage: payment.fee_waiver.discount_percentage,
        }
      : null,
    pending_amendments: workspace.amendments.records
      .filter((row) => row.status === 'pending')
      .map((row) => ({
        id: row.id,
        field_name: row.field_name,
        new_value: row.new_value,
        reason: row.reason,
        status: row.status,
        created_at: row.created_at ?? '',
      })),
    /**
     * `total_subjects` / `points` / `grades_summary` are deliberately absent.
     * Task 9.1 §10 recorded that the roster row carries triage fields only and
     * left the per-application academic numbers to this task; the workspace
     * publishes the persisted grades themselves (`evidence.grades`), and the
     * grades display computes the best-five view from them. Restating a
     * server-side summary here would give a reviewer two numbers for one fact.
     */
  }
}

/** The evidence documents, projected onto the documents panel's row shape. */
export function toDocumentItems(workspace: ReviewWorkspace): DocumentItem[] {
  return workspace.evidence.documents.map((row: WorkspaceDocument) => ({
    id: row.id,
    document_type: row.document_type,
    document_name: row.document_name,
    // The workspace read does not mint signed URLs: a download is its own
    // authorised request, and putting a URL in a list read would hand every
    // opened workspace a bundle of live object links. The panel resolves one on
    // demand.
    file_url: '',
    file_size: row.file_size ?? undefined,
    mime_type: row.mime_type ?? undefined,
    verification_status: row.verification_status ?? 'pending',
    verified_by: row.verified_by?.name ?? undefined,
    verified_at: row.verified_at ?? undefined,
    verification_notes: row.verification_notes ?? undefined,
    system_generated: row.system_generated,
    uploaded_at: row.uploaded_at ?? undefined,
  }))
}

/** The persisted canonical grades. */
export function toGrades(workspace: ReviewWorkspace): Grade[] {
  return workspace.evidence.grades.map((row) => ({
    subject_id: row.subject_id ?? '',
    grade: row.grade,
    subject_name: row.subject_name ?? undefined,
  }))
}

/** The status history, most recent first (the server's order). */
export function toStatusHistory(workspace: ReviewWorkspace): StatusHistoryItem[] {
  return workspace.history.records.map((row: WorkspaceHistoryRecord) => ({
    id: row.id,
    status: row.status ?? undefined,
    old_status: row.old_status,
    new_status: row.new_status,
    changed_by: row.changed_by?.id ?? null,
    changed_by_name: row.changed_by?.name ?? null,
    notes: row.notes ?? undefined,
    created_at: row.created_at ?? '',
  }))
}

/** The current interview, or null. "Current" is the server's determination. */
export function toCurrentInterview(workspace: ReviewWorkspace): ApplicationInterview | null {
  const row = workspace.interview.current
  if (!row) return null
  return {
    id: row.id,
    application_id: workspace.application_id,
    scheduled_at: row.scheduled_at ?? '',
    mode: row.mode ?? '',
    location: row.location ?? undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
  } as ApplicationInterview
}

/** The payment ledger rows the payment panel lists. */
export function toPaymentRecords(workspace: ReviewWorkspace): PaymentRecord[] {
  return workspace.payment.records.map((row) => ({
    id: row.id,
    status: row.status,
    amount: (row.amount as number | string | null) ?? null,
    currency: row.currency ?? null,
    payment_method: row.payment_method ?? null,
    transaction_reference: row.transaction_reference ?? null,
    created_at: row.created_at ?? '',
  }))
}
