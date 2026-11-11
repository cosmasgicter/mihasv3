/**
 * The admin review workspace (Admissions V2, task 9.4).
 *
 * Platform-simplification task 30.2 (R17.2, R17.7): this was `ApplicationDetailModal`,
 * a dialog over the queue. It is now the body of the `/admin/applications/:applicationId`
 * route, rendered beside the queue (`layout="pane"`, 1024 px and wider) or as a page
 * (`layout="page"`). Every control, guard and confirmation is kept; the seven tabs
 * became sections with a section list, and the decision bar sticks to the bottom.
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4 — "Build one
 * deterministic admin review workspace".
 * Requirements: **R8.3** (every command enforces the authority matrix in the
 * backend), **R8.4** (each command returns allowed next actions), **R8.5** (one
 * detail query, no parallel legacy detail calls), **R8.7** (Reviewer and
 * Tenant_Admin journeys complete their allowed work and prove denied work without
 * relying on UI hiding), **R11.3** (deterministic reviewer readiness).
 * Findings: **AUTH-01**, **AUTH-02**, **AUTH-03**, **API-02**, **MAINT-01**.
 * Design: §11.1.
 *
 * What changed here, and why
 * --------------------------
 *
 * 1. **One read.** This component used to issue six requests per open
 *    application — `/details/`, `/documents/`, `/grades/`, `/summary/`,
 *    `/interviews/`, `/payments/?application_id=` — and merge two overlapping
 *    copies of the application row with `{...application, ...summary.application}`,
 *    so which value a reviewer saw depended on response order. It now reads
 *    `GET /api/v1/admin/applications/{id}/` once and renders the sections the
 *    server named.
 *
 * 2. **No model.** The "AI" tab called `/admin-summary/`, which task 7.4 deleted
 *    from the backend (R11.1). It is replaced by `ReviewReadinessPanel` — the
 *    deterministic checklist the server computes with the same evaluator
 *    submission re-runs under its row locks.
 *
 * 3. **Every write is a versioned command.** Each control sends the `version` the
 *    read returned. A stale command is refused with 409 `VERSION_CONFLICT`, and
 *    this surface says so and reloads rather than reporting a generic failure —
 *    someone else decided first, and the reviewer needs to see that decision.
 *
 * 4. **Controls are gated on the backend's own answer.** `workspace.capabilities`
 *    is the per-command capability matrix `AdminCapabilityService` resolved for
 *    this application's institution. Hiding is *not* the boundary — the backend
 *    re-enforces every check — but a control that is shown is now one the backend
 *    will accept, which is what AUTH-02 asks for.
 *
 * 5. **The amendment and condition paths exist.** Pending amendments used to be
 *    rendered read-only with no way to act on them, and offer conditions were not
 *    shown at all, even though both commands existed on the backend. An admin
 *    path that cannot be reached is not a completed path (R8.3).
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Building,
  Calendar,
  CheckCircle,
  ClipboardCheck,
  Clock,
  CreditCard,
  Eye,
  FileText,
  GraduationCap,
  History,
  Mail,
  MapPin,
  Phone,
  Send,
  Shield,
  Tag,
  User,
  Users
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui'
import { formatDate } from '@/lib/dateFormat'
import { getPaymentStatusLabel } from '@/lib/paymentStatus'
import { formatApplicationStatus } from '@/types/applicationStatus'
import { toError } from '@/lib/toError'

import { AdminOfficialDocumentsPanel } from './AdminOfficialDocumentsPanel'
import { ApplicationApprovalActions } from './ApplicationApprovalActions'
import { ApplicationDetailDocuments } from './ApplicationDetailDocuments'
import { ApplicationDetailHeader } from './ApplicationDetailHeader'
import { ApplicationDetailInterview } from './ApplicationDetailInterview'
import { ApplicationDetailPayment, FeeWaiverDialog } from './ApplicationDetailPayment'
import { ApplicationDetailTimeline } from './ApplicationDetailTimeline'
import { CapacityWarning } from './CapacityWarning'
import { ReviewReadinessPanel } from './ReviewReadinessPanel'
import { SendNotificationModal } from './SendNotificationModal'
import { getInstitutionName, type ApplicationWithDetails } from './applicationDetailTypes'
/*
  Task 12.1 (R14.3-R14.5, R17.5; finding MAINT-01). Task 9.4 §15 recorded plainly
  that it had moved the *orchestration* out of this file and that rendering had
  stayed and grown — 846 → 1,365 lines — so MAINT-01 was explicitly **not** claimed
  done for it. This task moves the rendering: four sub-components that were
  declared inline, lifted verbatim into their own files, plus the command plumbing
  into a hook. Their props, state, service calls, copy and markup are unchanged.
*/
import { AssignReviewerControl } from './AssignReviewerControl'
import { GradesDisplay } from './GradesDisplay'
import { AmendmentReviewList, ConditionReviewList } from './ReviewDecisionLists'
import { useReviewWorkspaceSession } from '@/hooks/admin/useReviewWorkspaceSession'
import type { StatusCommandOptions } from '@/types/statusCommand'

// ---------------------------------------------------------------------------
// The workspace
// ---------------------------------------------------------------------------

interface ApplicationReviewWorkspaceProps {
  /** The application to review (the route's `:applicationId`). */
  applicationId: string
  /** The queue row, when the review was opened from it; the read replaces it. */
  seed: ApplicationWithDetails | null
  /** `pane` beside the queue (1024 px and wider), `page` as a full page below. */
  layout: 'pane' | 'page'
  updating: string | null
  /** Close the pane, or go back to the queue from the page. */
  onClose: () => void
  onSendNotification: (title: string, message: string) => Promise<void>
  onUpdateStatus: (
    id: string,
    status: string,
    options?: StatusCommandOptions,
  ) => Promise<unknown>
}

/**
 * The seven sections, in reading order. They were tabs; the labels are the same
 * words, so nothing a reviewer knows is renamed.
 */
export const REVIEW_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'readiness', label: 'Readiness', icon: ClipboardCheck },
  { id: 'grades', label: 'Academic', icon: GraduationCap },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'payment', label: 'Payment', icon: CreditCard },
  { id: 'interview', label: 'Interview', icon: Calendar },
  { id: 'history', label: 'History', icon: History },
] as const

type SectionId = (typeof REVIEW_SECTIONS)[number]['id']

const sectionDomId = (id: SectionId) => `review-section-${id}`

function ReviewSection({
  id,
  title,
  children,
}: {
  id: SectionId
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      id={sectionDomId(id)}
      aria-labelledby={`${sectionDomId(id)}-heading`}
      data-review-section={id}
      className="scroll-mt-4 space-y-4"
    >
      <h2
        id={`${sectionDomId(id)}-heading`}
        className="text-base font-semibold text-foreground sm:text-lg"
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

/** True when the backend answered 404, which it does for "not yours" and "not there". */
const isNotAvailable = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: unknown }).status === 404,
  )

export function ApplicationReviewWorkspace({
  applicationId: routeApplicationId,
  seed,
  layout,
  updating,
  onClose,
  onSendNotification,
  onUpdateStatus,
}: ApplicationReviewWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<SectionId>('overview')
  const [showNotificationModal, setShowNotificationModal] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  /*
    One read, eleven versioned commands, and the state those commands own
    (task 12.1, MAINT-01). Extracted verbatim into `useReviewWorkspaceSession`;
    what stays here is the layout, the section list and the markup.
  */
  const session = useReviewWorkspaceSession({
    application: seed,
    applicationId: routeApplicationId,
    show: true,
    onUpdateStatus,
  })
  const {
    applicationId,
    workspace,
    isLoading,
    isError,
    workspaceError,
    command,
    refreshWorkspace,
    detail,
    documents,
    grades,
    statusHistory,
    paymentRecords,
    currentInterview,
    can,
    adminFeedback,
    setAdminFeedback,
    savingFeedback,
    handleSaveFeedback,
    feeWaiverOpen,
    setFeeWaiverOpen,
    handleApplyFeeWaiver,
    handleAmendmentDecision,
    handleConditionReview,
    handleDocumentVerify,
    handlePaymentDecision,
    handleInterviewSchedule,
    handleInterviewUpdate,
    handleInterviewCancel,
    paymentWarning,
    setPaymentWarning,
    handleStatusWithWarning,
    handlePaymentWarningConfirm,
  } = session

  const rootRef = useRef<HTMLElement>(null)

  // A different application starts at the top, and focus moves to the review
  // (task 30.2): the shell does not refocus <main> for a review, because beside
  // the queue that would scroll the queue away. As a page (task 30.3) the window
  // also starts at the top.
  useEffect(() => {
    setActiveSection('overview')
    scrollRef.current?.scrollTo?.({ top: 0 })
    if (layout === 'page' && typeof window !== 'undefined') window.scrollTo?.(0, 0)
    rootRef.current?.focus({ preventScroll: layout === 'pane' })
  }, [applicationId, layout])

  // Keep the section list's current item in step with what is on screen.
  useEffect(() => {
    const root = scrollRef.current
    if (!root || !workspace || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        const id = visible?.target.getAttribute('data-review-section') as SectionId | null
        if (id) setActiveSection(id)
      },
      { root, rootMargin: '0px 0px -65% 0px' },
    )
    root.querySelectorAll('[data-review-section]').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [workspace])

  const goToSection = (id: SectionId) => {
    setActiveSection(id)
    document.getElementById(sectionDomId(id))?.scrollIntoView?.({ block: 'start' })
  }

  const rootClassName =
    layout === 'pane'
      ? 'flex max-h-[calc(100dvh-7rem)] min-h-[32rem] flex-col overflow-hidden rounded-lg border border-border bg-card'
      : 'flex h-[calc(100dvh-4rem)] flex-col overflow-hidden bg-card'

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      data-testid="review-workspace"
      data-workspace-version={workspace?.version ?? ''}
      data-review-layout={layout}
      aria-label={detail ? `Application review for ${detail.full_name}` : 'Application review'}
      className={`${rootClassName} focus:outline-none`}
    >
      {detail ? (
        <ApplicationDetailHeader
          application={detail}
          onClose={onClose}
          variant={layout === 'page' ? 'back' : 'close'}
        />
      ) : (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-card p-4 sm:p-6">
          <h1 className="text-base font-semibold text-foreground sm:text-xl">Application review</h1>
          <Button variant="outline" size="sm" onClick={onClose}>
            {layout === 'page' ? 'Back to applications' : 'Close'}
          </Button>
        </div>
      )}

      {workspace && detail && (
        <nav
          aria-label="Review sections"
          className="flex-shrink-0 overflow-x-auto border-b border-border bg-card"
        >
          <ul className="flex min-w-max gap-1 px-2 sm:px-6">
            {REVIEW_SECTIONS.map((section) => {
              const Icon = section.icon
              const current = activeSection === section.id
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => goToSection(section.id)}
                    aria-current={current ? 'true' : undefined}
                    className={`flex min-h-touch min-w-touch items-center justify-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium leading-tight transition-colors ${
                      current
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>{section.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-muted/50">
        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div
              className="flex items-center justify-center py-12"
              role="status"
              aria-label="Loading application details"
            >
              <div className="w-full max-w-lg space-y-4">
                <Skeleton className="h-32 w-full rounded-lg" />
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>
            </div>
          ) : isError && isNotAvailable(workspaceError) ? (
            <div className="rounded-lg border border-border bg-card p-6" role="alert" data-testid="review-not-available">
              <p className="text-sm font-semibold text-foreground">This application is not available</p>
              <p className="mt-1 text-sm text-muted-foreground">
                It may have been removed, or it may not be part of the schools you work with.
              </p>
            </div>
          ) : isError || !workspace || !detail ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6" role="alert">
              <p className="text-sm font-semibold text-foreground">
                This application could not be loaded
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {toError(workspaceError).message ||
                  'The review workspace is unavailable for this application.'}
              </p>
              <Button size="sm" variant="outline" className="mt-3" onClick={refreshWorkspace}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-8">
              <ReviewSection id="overview" title="Overview">
                <div className="space-y-6">
                    <CapacityWarning
                      intake_capacity={workspace.assignment.intake_capacity}
                      intake_enrollment={workspace.assignment.intake_enrollment}
                    />

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          {workspace.status === 'approved' ? (
                            <CheckCircle className="h-5 w-5 text-accent-foreground" />
                          ) : workspace.status === 'under_review' ? (
                            <Eye className="h-5 w-5 text-accent-foreground" />
                          ) : workspace.status === 'submitted' ? (
                            <AlertCircle className="h-5 w-5 text-primary" />
                          ) : (
                            <Clock className="h-5 w-5 text-foreground" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">Application status</p>
                            <p className="text-lg font-bold text-foreground">
                              {formatApplicationStatus(workspace.status)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-5 w-5 text-accent-foreground" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Payment status</p>
                            <p className="text-lg font-bold text-foreground">
                              {getPaymentStatusLabel(
                                workspace.payment.application_payment_status ?? undefined,
                              )}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-5 w-5 text-secondary" />
                          <div>
                            <p className="text-sm font-medium text-foreground">Submitted</p>
                            <p className="text-lg font-bold text-secondary-foreground">
                              {workspace.assignment.submitted_at || workspace.assignment.created_at
                                ? formatDate(
                                    (workspace.assignment.submitted_at ??
                                      workspace.assignment.created_at) as string,
                                  )
                                : 'Not available'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {workspace.interview.current && (
                      <div className="flex flex-col gap-4 rounded-lg border border-primary/20 bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-10 w-10 text-primary" />
                          <div>
                            <p className="text-sm text-foreground">Upcoming interview</p>
                            <p className="text-base font-semibold text-foreground">
                              {workspace.interview.current.scheduled_at
                                ? new Date(workspace.interview.current.scheduled_at).toLocaleString()
                                : 'Not scheduled'}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-foreground">
                          <p className="font-medium text-foreground">
                            Mode: {(workspace.interview.current.mode ?? 'Not specified').replace(/_/g, ' ')}
                          </p>
                          <p>Status: {workspace.interview.current.status.replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {workspace.assignment.assigned_reviewer?.name ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-info/25 bg-info/10 px-3 py-1.5 text-xs font-medium text-info">
                          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                          Reviewer: {workspace.assignment.assigned_reviewer.name}
                        </span>
                      ) : (
                        can.assign_reviewer && (
                          <AssignReviewerControl
                            applicationId={workspace.application_id}
                            expectedVersion={workspace.version}
                            onAssigned={refreshWorkspace}
                          />
                        )
                      )}
                      {workspace.payment.fee_waiver ? (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-success/25 bg-success/10 px-3 py-1.5 text-xs font-medium text-success">
                          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                          Fee waiver: {workspace.payment.fee_waiver.reason_code.replace(/_/g, ' ')}
                          {workspace.payment.fee_waiver.discount_percentage !== 100 && (
                            <> ({workspace.payment.fee_waiver.discount_percentage}%)</>
                          )}
                        </span>
                      ) : (
                        can.grant_fee_waiver && (
                          <button
                            type="button"
                            onClick={() => setFeeWaiverOpen(true)}
                            data-testid="fee-waiver-open"
                            className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                            Apply fee waiver
                          </button>
                        )
                      )}
                      {workspace.assignment.is_late_submission && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/25 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          Late submission
                        </span>
                      )}
                    </div>

                    <FeeWaiverDialog
                      open={feeWaiverOpen}
                      onClose={() => setFeeWaiverOpen(false)}
                      onApply={(form) => {
                        void handleApplyFeeWaiver(form)
                      }}
                      saving={command.isPending}
                    />

                    <div className="rounded-lg border border-border bg-card p-6">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                        <User className="h-5 w-5 text-primary" />
                        Personal information
                      </h3>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-foreground" />
                            <div>
                              <p className="text-sm text-foreground">Email</p>
                              <p className="font-medium text-foreground">
                                {workspace.identity.email ?? 'Not provided'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Phone className="h-4 w-4 text-foreground" />
                            <div>
                              <p className="text-sm text-foreground">Phone</p>
                              <p className="font-medium text-foreground">
                                {workspace.identity.phone ?? 'Not provided'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-foreground" />
                            <div>
                              <p className="text-sm text-foreground">Date of Birth</p>
                              <p className="font-medium text-foreground">
                                {workspace.identity.date_of_birth
                                  ? formatDate(workspace.identity.date_of_birth)
                                  : 'Not provided'}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-foreground" />
                            <div>
                              <p className="text-sm text-foreground">Residence</p>
                              <p className="font-medium text-foreground">
                                {workspace.answers.residence_town ?? 'Not provided'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Users className="h-4 w-4 text-foreground" />
                            <div>
                              <p className="text-sm text-foreground">Next of Kin</p>
                              <p className="font-medium text-foreground">
                                {workspace.answers.next_of_kin_name ?? 'Not provided'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-foreground" />
                            <div>
                              <p className="text-sm text-foreground">NRC / Passport</p>
                              <p className="font-medium text-foreground">
                                {workspace.identity.nrc_number ??
                                  workspace.identity.passport_number ??
                                  'Not provided'}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-card p-6">
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        Programme information
                      </h3>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div className="flex items-center gap-3">
                          <GraduationCap className="h-4 w-4 text-foreground" />
                          <div>
                            <p className="text-sm text-foreground">Programme</p>
                            <p className="font-medium text-foreground">
                              {workspace.assignment.program_offering_name ?? 'Not specified'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Building className="h-4 w-4 text-foreground" />
                          <div>
                            <p className="text-sm text-foreground">Institution</p>
                            <p className="font-medium text-foreground">
                              {getInstitutionName(workspace.assignment.institution_name ?? undefined)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 text-foreground" />
                          <div>
                            <p className="text-sm text-foreground">Intake</p>
                            <p className="font-medium text-foreground">
                              {workspace.assignment.intake_name ?? 'Not specified'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {can.review_decision && (
                      <div className="rounded-lg border border-primary/20 bg-card p-6">
                        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
                          <AlertCircle className="h-5 w-5" />
                          Admin feedback
                        </h3>
                        <div className="space-y-4">
                          <label htmlFor="admin-feedback" className="sr-only">
                            Feedback for the applicant
                          </label>
                          <textarea
                            id="admin-feedback"
                            value={adminFeedback}
                            onChange={(e) => setAdminFeedback(e.target.value)}
                            placeholder="Add feedback for the applicant…"
                            rows={4}
                            className="w-full rounded-lg border border-primary/30 px-3 py-2 text-sm focus:border-primary focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-info-strong">
                              {workspace.communication.admin_feedback_at && (
                                <span>
                                  Last updated:{' '}
                                  {formatDate(workspace.communication.admin_feedback_at)}
                                </span>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={handleSaveFeedback}
                              loading={savingFeedback}
                              disabled={!adminFeedback.trim() || savingFeedback}
                              variant="primary"
                            >
                              Save feedback
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    <AmendmentReviewList
                      workspace={workspace}
                      canReview={can.review_amendment}
                      busy={command.isPending}
                      onDecide={handleAmendmentDecision}
                    />

                    <ConditionReviewList
                      workspace={workspace}
                      canVerify={can.verify_condition}
                      busy={command.isPending}
                      onReview={handleConditionReview}
                    />

                </div>
              </ReviewSection>

              <ReviewSection id="readiness" title="Readiness">
                  <ReviewReadinessPanel
                    readiness={workspace.readiness}
                    definition={workspace.definitions.readiness}
                  />
              </ReviewSection>

              <ReviewSection id="grades" title="Academic">
                <GradesDisplay grades={grades} loading={false} />
              </ReviewSection>

              <ReviewSection id="documents" title="Documents">
                  <div className="space-y-6">
                    <ApplicationDetailDocuments
                      documents={documents}
                      loading={false}
                      application={detail}
                      applicationId={workspace.application_id}
                      canVerify={can.verify_document}
                      verifying={command.isPending}
                      onVerify={handleDocumentVerify}
                    />
                    <div className="border-t border-border pt-6">
                      <AdminOfficialDocumentsPanel applicationId={workspace.application_id} />
                    </div>
                  </div>
              </ReviewSection>

              <ReviewSection id="payment" title="Payment">
                  <ApplicationDetailPayment
                    application={detail}
                    applicationData={{ application: detail, interview: currentInterview }}
                    paymentRecords={paymentRecords}
                    loadingPayments={false}
                    onShowNotificationModal={() => setShowNotificationModal(true)}
                  />
              </ReviewSection>

              <ReviewSection id="interview" title="Interview">
                  <ApplicationDetailInterview
                    application={detail}
                    applicationData={{ application: detail, interview: currentInterview }}
                    canManage={can.manage_interview}
                    busy={command.isPending}
                    onSchedule={handleInterviewSchedule}
                    onUpdate={handleInterviewUpdate}
                    onCancel={handleInterviewCancel}
                  />
              </ReviewSection>

              <ReviewSection id="history" title="History">
                  <ApplicationDetailTimeline history={statusHistory} loading={false} />
              </ReviewSection>
            </div>
          )}
        </div>
      </div>

      {detail && (
        <div className="max-h-[45dvh] flex-shrink-0 overflow-y-auto overscroll-contain border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:max-h-none sm:p-5 sm:pb-5">
          {can.review_decision ? (
            <ApplicationApprovalActions
              applicationId={detail.id}
              currentStatus={workspace?.status ?? detail.status}
              currentPaymentStatus={
                workspace?.payment.application_payment_status ?? detail.payment_status ?? 'not_paid'
              }
              onStatusUpdate={handleStatusWithWarning}
              onPaymentStatusUpdate={handlePaymentDecision}
              canVerifyPayment={can.verify_payment}
              disabled={updating === detail.id || command.isPending}
            />
          ) : (
            <p
              className="rounded-lg border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
              data-testid="review-read-only"
            >
              You have read access to this application. Recording a decision requires the review
              permission for this school.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNotificationModal(true)}
              className="flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              Notify
            </Button>
            <div className="ml-auto">
              <Button variant="outline" size="sm" onClick={onClose}>
                {layout === 'page' ? 'Back to applications' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {paymentWarning && (
        <div className="fixed inset-0 z-modal-stacked flex items-center justify-center bg-scrim/60 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-md animate-in fade-in zoom-in-95 duration-200">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-2">
                <AlertCircle className="h-5 w-5 text-warning" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Payment not verified</h3>
            </div>
            <p className="mb-6 text-sm text-foreground">
              Payment has not been verified for this application. Are you sure you want to approve
              it? This action can be overridden.
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setPaymentWarning(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  void handlePaymentWarningConfirm()
                }}
              >
                Approve anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <SendNotificationModal
          show={showNotificationModal}
          applicationNumber={detail.application_number}
          studentName={detail.full_name}
          onClose={() => setShowNotificationModal(false)}
          onSend={onSendNotification}
        />
      )}
    </section>
  )
}
