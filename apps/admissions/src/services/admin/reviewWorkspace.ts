/**
 * The admin review workspace: one read, and one versioned command per write
 * (Admissions V2, task 9.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4 — "Build one
 * deterministic admin review workspace".
 * Requirements: **R8.3** (every command enforces the authority matrix and valid
 * transitions in the backend), **R8.4** (each command locks its rows, records
 * actor/reason/before/after, and returns allowed next actions), **R8.5** (the
 * review surface shows identity, answers, evidence, payment, interview,
 * communication and history *without parallel legacy detail calls*), **R11.3**
 * (the reviewer readiness checklist comes from deterministic services).
 * Findings: **AUTH-01**, **AUTH-02**, **AUTH-03**, **API-02**, **MAINT-01**.
 *
 * What this module replaces
 * -------------------------
 *
 * `ApplicationDetailModal` used to compose its own view of an application from
 * six requests — `/details/`, `/documents/`, `/grades/`, `/summary/`,
 * `/interviews/`, and `/payments/?application_id=` — plus a seventh for a
 * generative `/admin-summary/` that task 7.4 had already deleted from the
 * backend. Two of those were actively harmful: `/summary/` returned a *second*
 * copy of the application which the browser merged over the first
 * (`{...application, ...summary.application}`), so which value a reviewer saw
 * depended on response order; and the "AI" tab was calling a route that no longer
 * existed.
 *
 * There is now one read. Its shape is the server's, its sections are named, and
 * its `readiness` block is the deterministic checklist — so this module does not
 * merge, reconcile, or fall back between payloads. That absence is the point:
 * API-02 is about a frontend that accepted many incompatible shapes and thereby
 * hid backend drift.
 *
 * Every write is its own command carrying the `version` the read returned. A
 * command whose version is stale is refused with 409 `VERSION_CONFLICT`, so two
 * reviewers on the same application cannot have the later decision silently
 * overwritten by the earlier one still on screen.
 */
import { apiClient } from '../client'
import { logApiError } from '@/lib/apiErrorLogger'

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

/** A staff actor as the server renders them: an id and a display name. */
export interface WorkspacePerson {
  id: string | null
  name: string | null
}

export interface WorkspaceIdentity {
  application_id: string
  application_number: string | null
  public_tracking_code: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  date_of_birth: string | null
  sex: string | null
  nationality: string | null
  nrc_number: string | null
  passport_number: string | null
  student_user_id: string | null
}

export interface WorkspaceAnswers {
  residence_town: string | null
  address_line_1: string | null
  address_line_2: string | null
  postal_code: string | null
  next_of_kin_name: string | null
  next_of_kin_phone: string | null
  additional_subjects: unknown
  declared_program: string | null
  declared_intake: string | null
  declared_institution: string | null
}

export interface WorkspaceAssignment {
  institution_id: string | null
  institution_name: string | null
  institution_code: string | null
  canonical_program_id: string | null
  canonical_program_name: string | null
  program_offering_id: string | null
  program_offering_name: string | null
  intake_id: string | null
  intake_name: string | null
  configuration_version: string | null
  assignment_version: number | null
  assigned_reviewer: WorkspacePerson | null
  is_late_submission: boolean
  waitlist_position: number | null
  submitted_at: string | null
  created_at: string | null
  updated_at: string | null
  enrollment_confirmation_deadline: string | null
  intake_capacity: number | null
  intake_enrollment: number | null
}

export interface WorkspaceDocument {
  id: string
  document_type: string
  document_name: string
  verification_status: string | null
  verified_by: WorkspacePerson | null
  verified_at: string | null
  verification_notes: string | null
  version: number | null
  is_current: boolean
  lifecycle_state: string | null
  file_size: number | null
  mime_type: string | null
  system_generated: boolean
  uploaded_at: string | null
}

export interface WorkspaceGrade {
  id: string
  subject_id: string | null
  subject_name: string | null
  grade: number
}

export interface WorkspaceEvidence {
  documents: WorkspaceDocument[]
  documents_truncated: boolean
  current_document_count: number
  verified_document_count: number
  grades: WorkspaceGrade[]
  grade_count: number
}

export interface WorkspaceFeeWaiver {
  id: string
  waiver_type: string
  reason_code: string
  discount_percentage: number
  approved_by: WorkspacePerson | null
  notes: string | null
  created_at: string | null
}

export interface WorkspacePaymentRecord {
  id: string
  amount: string | number | null
  currency: string | null
  payment_method: string | null
  transaction_reference: string | null
  status: string
  /** Who is being waited on — the server's derivation, never the UI's (task 8.2). */
  phase: string | null
  phase_timeout_seconds: number | null
  receipt_number: string | null
  verified_at: string | null
  created_at: string | null
  [key: string]: unknown
}

export interface WorkspacePayment {
  application_payment_status: string | null
  application_fee: string | null
  records: WorkspacePaymentRecord[]
  record_count: number
  fee_waiver: WorkspaceFeeWaiver | null
}

export interface WorkspaceInterviewRecord {
  id: string
  scheduled_at: string | null
  mode: string | null
  location: string | null
  status: string
  notes: string | null
  created_by: WorkspacePerson | null
  updated_by: WorkspacePerson | null
  created_at: string | null
  updated_at: string | null
}

export interface WorkspaceInterview {
  current: WorkspaceInterviewRecord | null
  records: WorkspaceInterviewRecord[]
  record_count: number
}

export interface WorkspaceCondition {
  id: string
  description: string
  condition_type: string
  deadline: string | null
  status: string
  met_at: string | null
  verified_by: WorkspacePerson | null
  notes: string | null
  created_at: string | null
}

export interface WorkspaceConditions {
  records: WorkspaceCondition[]
  record_count: number
  open_count: number
}

export interface WorkspaceAmendment {
  id: string
  field_name: string
  old_value: string | null
  new_value: string
  reason: string
  status: string
  reviewed_by: WorkspacePerson | null
  reviewed_at: string | null
  created_at: string | null
}

export interface WorkspaceAmendments {
  records: WorkspaceAmendment[]
  record_count: number
  pending_count: number
}

export interface WorkspaceNotification {
  id: string
  title: string | null
  type: string | null
  is_read: boolean
  created_at: string | null
}

export interface WorkspaceCommunication {
  admin_feedback: string | null
  admin_feedback_at: string | null
  admin_feedback_by: WorkspacePerson | null
  notifications: WorkspaceNotification[]
  notification_count: number
}

export interface WorkspaceHistoryRecord {
  id: string
  status: string | null
  old_status: string | null
  new_status: string | null
  notes: string | null
  changes: unknown
  changed_by: WorkspacePerson | null
  created_at: string | null
}

export interface WorkspaceHistory {
  records: WorkspaceHistoryRecord[]
  record_count: number
  truncated: boolean
}

/** One deterministic readiness check (R11.3). No prose, no score. */
export interface ReadinessCheck {
  code: string
  label: string
  state: 'satisfied' | 'attention' | 'blocked'
  detail: Record<string, unknown>
}

export interface WorkspaceReadiness {
  application_id: string
  status: string
  programme: string | null
  intake: string | null
  institution: string | null
  checks: ReadinessCheck[]
  blocked_checks: string[]
  attention_checks: string[]
  can_submit: boolean
  allowed_next_actions: Array<Record<string, unknown>>
  evaluated_at: string | null
}

/** Which commands the **backend** will accept from this actor (AUTH-02). */
export interface WorkspaceCapabilities {
  review_decision: boolean
  verify_document: boolean
  verify_payment: boolean
  review_amendment: boolean
  verify_condition: boolean
  manage_interview: boolean
  assign_reviewer: boolean
  grant_fee_waiver: boolean
  bulk_review: boolean
  export: boolean
}

export interface WorkspaceRedaction {
  applied: boolean
  withheld_fields: string[]
}

export interface ReviewWorkspace {
  application_id: string
  /** The value every command must carry. A stale one is refused with 409. */
  version: number
  status: string
  identity: WorkspaceIdentity
  answers: WorkspaceAnswers
  assignment: WorkspaceAssignment
  evidence: WorkspaceEvidence
  payment: WorkspacePayment
  interview: WorkspaceInterview
  conditions: WorkspaceConditions
  amendments: WorkspaceAmendments
  communication: WorkspaceCommunication
  history: WorkspaceHistory
  /**
   * `null` — never a zeroed checklist — when the canonical configuration could
   * not be evaluated. A workspace that rendered that as "nothing outstanding"
   * would invite exactly the decision the fail-closed submission path refuses to
   * make (R8.6, R11.6).
   */
  readiness: WorkspaceReadiness | null
  allowed_next_actions: Array<Record<string, unknown>>
  allowed_transitions: string[]
  capabilities: WorkspaceCapabilities
  redaction: WorkspaceRedaction
  definitions: Record<string, string>
  row_limit: number
  /** Platform-only cross-tenant context; withheld for a tenant actor. */
  other_tenant_application_count?: number | null
}

export const REVIEW_WORKSPACE_ENDPOINT = '/admin/applications/'

/** No capability until the server says so. Fail closed, in the browser too. */
export const NO_WORKSPACE_CAPABILITIES: WorkspaceCapabilities = {
  review_decision: false,
  verify_document: false,
  verify_payment: false,
  review_amendment: false,
  verify_condition: false,
  manage_interview: false,
  assign_reviewer: false,
  grant_fee_waiver: false,
  bulk_review: false,
  export: false,
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Every command carries the version its caller read. */
export interface VersionedCommand {
  expected_version: number
}

export interface CommandOutcome {
  version?: number
  allowed_transitions?: string[]
  [key: string]: unknown
}

/**
 * A refused command, distinguishable from every other failure.
 *
 * `VERSION_CONFLICT` is not an error the reviewer caused; it means someone else
 * decided first. The caller reloads the workspace and shows what changed, rather
 * than reporting a failure.
 */
export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT'
  constructor(message = 'This application changed since you loaded it.') {
    super(message)
    this.name = 'VersionConflictError'
  }
}

export function isVersionConflict(error: unknown): boolean {
  if (error instanceof VersionConflictError) return true
  if (!error || typeof error !== 'object') return false
  const candidate = error as { status?: number; code?: string; data?: { code?: string } }
  return (
    candidate.status === 409 ||
    candidate.code === 'VERSION_CONFLICT' ||
    candidate.data?.code === 'VERSION_CONFLICT'
  )
}

async function command(
  path: string,
  body: Record<string, unknown>,
  method: 'POST' | 'PATCH' | 'DELETE' = 'POST',
): Promise<CommandOutcome> {
  try {
    const outcome = await apiClient.request<CommandOutcome>(path, {
      method,
      body: JSON.stringify(body),
    })
    // A 204-style empty body still means the command was accepted. `{}` is the
    // honest representation of "accepted, nothing to report" — the caller reads
    // `version` / `allowed_transitions` as optional, and the workspace refetch is
    // what supplies the new version either way.
    return outcome ?? {}
  } catch (error) {
    if (isVersionConflict(error)) {
      logApiError('admin-review-workspace-conflict', path, error)
      throw new VersionConflictError()
    }
    logApiError('admin-review-workspace', path, error)
    throw error
  }
}

export const reviewWorkspaceService = {
  /**
   * The one workspace read.
   *
   * One request, named sections, the deterministic readiness checklist, the
   * actor's command authority, and the version a command must carry. Nothing is
   * merged, defaulted, or reconciled here — if a section is absent the server
   * said so.
   */
  get: async (applicationId: string): Promise<ReviewWorkspace> => {
    const endpoint = `${REVIEW_WORKSPACE_ENDPOINT}${encodeURIComponent(applicationId)}/`
    try {
      const workspace = await apiClient.request<ReviewWorkspace>(endpoint)
      if (!workspace) {
        // An empty body is not a workspace. Fabricating a default shape here is
        // exactly what R8.6 forbids: a reviewer would read an invented empty
        // application as a real one. Fail, and let the surface say it failed.
        throw new Error('The review workspace returned no data for this application.')
      }
      return workspace
    } catch (error) {
      logApiError('admin-review-workspace', endpoint, error)
      throw error
    }
  },

  /** The decision command: a status transition the server validates. */
  decide: (
    applicationId: string,
    input: VersionedCommand & {
      new_status: string
      notes?: string
      force?: boolean
      reason?: string
      conditions?: Array<Record<string, unknown>>
    },
  ) => command(`/applications/${encodeURIComponent(applicationId)}/review/`, { ...input }),

  /** The payment-review command (verify / reject / defer / reopen). */
  reviewPayment: (
    applicationId: string,
    input: VersionedCommand & { payment_status: string; notes?: string },
  ) => command(`/applications/${encodeURIComponent(applicationId)}/review/`, { ...input }),

  /** The document-verification command. */
  verifyDocument: (
    applicationId: string,
    input: VersionedCommand & { documentId: string; status: string; notes?: string },
  ) =>
    command(`/applications/${encodeURIComponent(applicationId)}/verify-document/`, { ...input }),

  /** The amendment-review command. */
  reviewAmendment: (
    applicationId: string,
    amendmentId: string,
    input: VersionedCommand & { status: 'approved' | 'rejected'; notes?: string },
  ) =>
    command(
      `/applications/${encodeURIComponent(applicationId)}/amendments/${encodeURIComponent(amendmentId)}/review/`,
      { ...input },
    ),

  /**
   * The canonical condition-review command (admissions-v2 task 10.6, R13.9 /
   * R13.13, findings STU-23 / MAINT-01).
   *
   * This used to be `verifyCondition`, pointed at
   * `…/conditions/{cid}/verify/` — the two-outcome front door. There were two,
   * and the short one could not express `changes_required`, so a reviewer who
   * needed *different* evidence had to either accept what they were given or
   * reject the whole offer. That is STU-16, and this is the client half of
   * closing it.
   *
   * `reason` is what the student reads. The server requires it for
   * `changes_required` and `waived` (design §11.2's "explicit authorized
   * reason") and ignores it for `met`.
   */
  reviewCondition: (
    applicationId: string,
    conditionId: string,
    input: VersionedCommand & {
      outcome: 'met' | 'changes_required' | 'waived'
      reason?: string
    },
  ) =>
    command(
      `/applications/${encodeURIComponent(applicationId)}/conditions/${encodeURIComponent(conditionId)}/review/`,
      { ...input },
    ),

  /** The interview commands. */
  scheduleInterview: (
    applicationId: string,
    input: VersionedCommand & {
      scheduled_at: string
      mode: string
      location?: string
      notes?: string
    },
  ) => command(`/applications/${encodeURIComponent(applicationId)}/interviews/`, { ...input }),

  updateInterview: (
    applicationId: string,
    input: VersionedCommand & Record<string, unknown>,
  ) =>
    command(
      `/applications/${encodeURIComponent(applicationId)}/interviews/`,
      { ...input },
      'PATCH',
    ),

  cancelInterview: (
    applicationId: string,
    input: VersionedCommand & { notes?: string },
  ) =>
    command(
      `/applications/${encodeURIComponent(applicationId)}/interviews/`,
      { ...input },
      'DELETE',
    ),

  /** The reviewer-assignment command (AUTH-03: a real candidate id, always). */
  assignReviewer: (
    applicationId: string,
    input: VersionedCommand & { reviewer_id: string },
  ) => command(`/applications/${encodeURIComponent(applicationId)}/assign/`, { ...input }),

  /** The fee-waiver command (platform authority). */
  grantFeeWaiver: (
    applicationId: string,
    input: VersionedCommand & {
      waiver_type: string
      reason_code: string
      discount_percentage: number
      notes?: string
    },
  ) => command(`/applications/${encodeURIComponent(applicationId)}/fee-waiver/`, { ...input }),
}
