import { useParams, Link } from 'react-router-dom'
import { Seo } from '@/components/seo/Seo'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import { useAuth } from '@/contexts/AuthContext'
import { Skeleton, SkeletonCard } from '@/components/ui'
import { DocumentChecklist } from '@/components/student/applicationStatus/DocumentChecklist'
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Download,
  AlertTriangle,
  Edit3,
  History,
} from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { PageShell } from '@/components/ui/PageShell'
import { StatusTimeline } from '@/components/student/applicationStatus/StatusTimeline'
import { ConditionsTimeline } from '@/components/student/applicationStatus/ConditionsTimeline'
import { AmendmentForm } from '@/components/student/applicationStatus/AmendmentForm'
import { AmendmentHistory } from '@/components/student/applicationStatus/AmendmentHistory'
import { WithdrawDialog, EnrollDialog } from '@/components/student/applicationStatus/WithdrawEnrollDialogs'
import { ApplicationHistory } from '@/components/student/applicationStatus/ApplicationHistory'
// Task 10.6 (R13.13, STU-23): the affordances the retired `/student/application/:id`
// workspace owned, brought onto the canonical one rather than deleted with it.
import { InterviewDetails } from '@/components/student/InterviewDetails'
import {
  pathFor,
  studentApplicationNewPath,
  studentApplicationWorkspacePath,
} from '@/routes/routeRegistry'
// Task 11.3 (R13.1, R16.1): the workspace's status/next-action header is task
// 11.1's panel and task 11.1's resolver, not a second implementation of either.
import { NextActionPanel } from '@/components/student/dashboard/NextActionPanel'
import { useStudentNextAction } from '@/hooks/useStudentNextAction'
/*
  Task 12.1 (R14.3-R14.5, R17.5; finding MAINT-01): this page was 807 lines that
  fetched, mutated, validated, derived and rendered. The four concerns now have
  four owners and the page is the composition:

    - `useApplicationWorkspace`  — the four server reads, the four commands, and
      the state each command owns (`hooks/student/`, task 9.4's shape).
    - `buildApplicationTimeline` — the derived progress list (pure).
    - `buildWorkspacePresentation` — every label and sentence that is a function
      of the application row (pure).
    - `ApplicationDetailsSection` / `WorkspaceAside` — two sections that were
      inline JSX.

  Nothing about what a student sees or can do changed; the split is by bounded
  workflow, which is MAINT-01's own remedy.
*/
import {
  AMENDABLE_STATUSES,
  useApplicationWorkspace,
} from '@/hooks/student/useApplicationWorkspace'
import { buildApplicationTimeline } from '@/components/student/applicationStatus/applicationTimeline'
import { buildWorkspacePresentation } from '@/components/student/applicationStatus/workspacePresentation'
import { ApplicationDetailsSection } from '@/components/student/applicationStatus/ApplicationDetailsSection'
import { WorkspaceAside } from '@/components/student/applicationStatus/WorkspaceAside'
// Task 13.6 remediation L5 (GATE-13.3-09, STU-23): the bare `/student/status`
// route's own shape — see the block comment on `ApplicationStatus` below.
import { ApplicationWorkspaceIndex } from '@/components/student/applicationStatus/ApplicationWorkspaceIndex'

function getStatusIcon(status: string) {
  switch (status) {
    case 'approved':
    case 'enrolled':
      return <CheckCircle className="h-5 w-5 text-success" />
    case 'conditionally_approved':
      return <AlertCircle className="h-5 w-5 text-amber-600" />
    case 'rejected':
      return <XCircle className="h-5 w-5 text-error" />
    case 'withdrawn':
    case 'expired':
    case 'enrollment_expired':
      return <XCircle className="h-5 w-5 text-muted-foreground" />
    case 'under_review':
      return <Clock className="h-5 w-5 text-primary" />
    case 'submitted':
      return <AlertCircle className="h-5 w-5 text-warning" />
    case 'waitlisted':
      return <Clock className="h-5 w-5 text-amber-600" />
    case 'interview_scheduled':
      return <Calendar className="h-5 w-5 text-primary" />
    case 'draft':
      return <Clock className="h-5 w-5 text-muted-foreground" />
    default:
      return <Clock className="h-5 w-5 text-secondary" />
  }
}

/**
 * The canonical student application workspace route (task 10.6, R13.13).
 *
 * Four registered paths reach it and only three of them carry an `:id`. The
 * fourth is the bare `/student/status` — the nav item's own target, and the
 * target of the `/student/application-status` redirect. Task 13.3 measured that
 * path for a student who owned **two** applications and was shown *"Application
 * Not Found"* (**GATE-13.3-09**, blocking item **B7**, register finding
 * **STU-23**).
 *
 * The cause was a missing branch rather than a broken read: with no `:id`,
 * `useApplicationWorkspace`'s `enabled: !!id && enabled` predicate is false, so
 * the query never ran, `application` stayed `null`, `loading` stayed `false`, and
 * the page fell into the error branch below. An absent *parameter* was reported
 * as an absent *application*.
 *
 * So the route now has two shapes, and the workspace itself is untouched:
 *
 * * **no id** — `ApplicationWorkspaceIndex`: the student's own applications, with
 *   a redirect when there is exactly one, a chooser when there are several, and a
 *   real empty state when there are none.
 * * **an id** — `ApplicationWorkspaceView`, which is this file's original body,
 *   unchanged except that `id` arrives as a prop it can rely on.
 */
export default function ApplicationStatus() {
  const { id } = useParams<{ id: string }>()

  // A route parameter that is absent is not an application that is missing.
  if (!id) return <ApplicationWorkspaceIndex />

  return <ApplicationWorkspaceView id={id} />
}

function ApplicationWorkspaceView({ id }: { id: string }) {
  const { user } = useAuth()
  const { brandName } = usePortalBrand()

  const workspace = useApplicationWorkspace(id, !!user)
  const {
    application,
    statusHistory,
    loading,
    error,
    loadApplicationDetails,
    conditions,
    amendmentPage,
    amendmentsLoading,
    waitlistPosition,
  } = workspace

  /*
    The platform's next action for *this* application (task 11.3, R13.1).

    Task 11.1's hook and resolver, reused verbatim: it selects whichever server
    contract governs this application's lifecycle point — task 6.5's readiness
    while it is a draft, task 10.3's enrollment readiness once a decision exists,
    or the canonical payment status for a fee still owed — and it authors no verb,
    label or blocker sentence of its own. Passing the single application makes
    `selectNextActionSubject` a no-op selection, and the readiness request only
    fires for a draft.
  */
  const {
    nextAction,
    isLoading: nextActionLoading,
    readinessUnavailable,
  } = useStudentNextAction(application ? [application] : [])

  if (loading) {
    return (
      <>
      <Seo title={brandedPageTitle('Application Status', brandName)} description="Track the status and progress of your admissions application." path={id ? studentApplicationWorkspacePath(id) : pathFor('student.status')} siteName={brandName} noindex />
      <PageShell title="Application Status" subtitle="Loading...">
        <div className="space-y-6 sm:space-y-8" role="status" aria-label="Loading application status">
          <Skeleton className="h-8 w-40 rounded-full" />
          <SkeletonCard />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            <div className="lg:col-span-2 space-y-6">
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <div className="space-y-6">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
          <span className="sr-only">Loading application status</span>
        </div>
      </PageShell>
      </>
    )
  }

  if (error || !application) {
    return (
      <>
      <Seo title={brandedPageTitle('Application Status', brandName)} description="Track the status and progress of your admissions application." path={id ? studentApplicationWorkspacePath(id) : pathFor('student.status')} siteName={brandName} noindex />
      <PageShell title="Application Status">
        <ErrorDisplay variant="section" title="Application Not Found" message={error || 'Application not found or access denied'} onRetry={() => loadApplicationDetails()} className="max-w-2xl" />
      </PageShell>
      </>
    )
  }

  const timeline = buildApplicationTimeline(application)
  const interview = application.interview
  const hasActiveInterview = Boolean(interview && interview.status !== 'cancelled')
  const presentation = buildWorkspacePresentation(application)
  const workspacePath = studentApplicationWorkspacePath(application.id)

  return (
    <>
      <Seo title={brandedPageTitle('Application Status', brandName)} description="Track the status and progress of your admissions application." path={id ? studentApplicationWorkspacePath(id) : pathFor('student.status')} siteName={brandName} noindex />
    <PageShell
      title={presentation.applicationTitle}
      eyebrow="Application Status"
      subtitle={presentation.applicationSubtitle}
      maxWidth="7xl"
      tone="student"
      /*
        No `metrics` (admissions-v2 task 11.3, R13.1, R16.1, R16.5).

        `PageShell` renders `metrics` *between* the page title and the children,
        so this array was literally four passive tiles above the student's own
        status and action on a 320 px screen. Two of them restated the header
        badge and the payment block below; "Interview" restated the interview
        card; and "Next move" **derived a next action in the browser** —
        "Resolve payment" / "Confirm enrollment" / "Monitor progress" — from a
        payment helper and a status string, which is the STU-04 defect task 11.1
        removed from the dashboard, on a second surface. The platform's own next
        action is now the first thing on the page.
      */
      actions={<div className="flex items-center gap-2">{getStatusIcon(application.status)}<span className="text-sm font-bold">{presentation.statusLabel}</span></div>}
    >
      <div className="space-y-6 sm:space-y-8">
        <Link to="/student/dashboard" className="inline-flex min-h-touch items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {/*
          Status, then the platform's own next action — first (admissions-v2 task
          11.3, R13.1, R16.1, R16.5; finding STU-05).

          What stood here was a hero block ("A single view of where your
          application stands and what happens next", three explanatory pills and a
          paragraph describing how the page is organised) beside a "Decision
          snapshot" card whose two tiles restated the status badge in the header
          and **derived a priority in the browser** — "Resolve payment" /
          "Prepare for interview" / "Confirm enrollment" / "Watch review
          progress". PRODUCT.md names the first one directly ("Hero headlines that
          compete with the action"), and the second is the STU-04 derivation task
          11.1 removed from the dashboard.

          `NextActionPanel` is 11.1's, unchanged in what it renders: the server's
          own label, the server's own blocker sentence, and the rest of the
          server's actions in the server's order. `useStudentNextAction` reads task
          6.5's readiness only while this application is still a draft; for every
          other lifecycle point the answer is already on the row this page
          already read — task 10.3's enrollment readiness, or the canonical
          payment status — so the panel costs no extra request here.
        */}
        <NextActionPanel
          nextAction={nextAction}
          isLoading={nextActionLoading}
          readinessUnavailable={readinessUnavailable}
          applicationCount={1}
          onRetry={() => loadApplicationDetails()}
          startApplicationHref={studentApplicationNewPath()}
          selfHref={workspacePath}
        />

        {/*
          Task 10.6 (R13.13, STU-23): one interview renderer.

          The two workspaces drew the same interview two ways, and the difference
          was not cosmetic — the retired page used `InterviewDetails`, which turns
          a virtual interview's `location` into a **clickable meeting link**, while
          this page printed the same value as plain text. A student with a video
          interview therefore got a joinable link on one URL and an unclickable
          string on the other, which is precisely STU-23's "different actions".
          The richer renderer wins and the inline copy is gone.
        */}
        {hasActiveInterview && interview ? (
          <InterviewDetails
            interview={{
              ...interview,
              location: interview.location ?? '',
              notes: interview.notes ?? undefined,
            }}
          />
        ) : null}

        {!hasActiveInterview && (
          <SectionCard title="Interview status" description="Our admissions team will contact you if a new interview is required." icon={<Calendar className="h-5 w-5" />}>
            <p className="text-sm text-foreground">If you have questions, please reach out to admissions support.</p>
          </SectionCard>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          <div className="lg:col-span-2 space-y-6 sm:space-y-8">
            <SectionCard title="Application progress" description="Track how far along your application is in the review process." icon={<CheckCircle className="h-5 w-5" />}>
              <StatusTimeline timeline={timeline} />
            </SectionCard>

            {/*
              The record, not the progress bar (task 10.6, R13.2 / R13.13).

              `StatusTimeline` above is derived from this application's own
              timestamp columns and includes steps that have not happened. This
              section is the platform's `ApplicationStatusHistory` — one row per
              committed transition, with the note the actor left and their name
              where the reader is permitted it. It existed on
              `GET /applications/{id}/summary/` and no student surface read it, so
              "who moved my application, when, and did they say why" had no answer
              on either of the two old workspaces.
            */}
            <SectionCard
              title="Recorded changes"
              description="Every change the admissions team has committed to this application."
              icon={<History className="h-5 w-5" />}
            >
              <ApplicationHistory rows={statusHistory} isLoading={loading} />
            </SectionCard>

            <ApplicationDetailsSection
              application={application}
              paymentStatusLabel={presentation.paymentStatusLabel}
              paymentStatusDescription={presentation.paymentStatusDescription}
            />

            <SectionCard title="Supporting documents" description="Access the files you uploaded with this application." icon={<Download className="h-5 w-5" />}>
              <DocumentChecklist resultSlipUrl={application.result_slip_url} extraKycUrl={application.extra_kyc_url} />
            </SectionCard>

            {application.status === 'conditionally_approved' && conditions.length > 0 && (
              <SectionCard title="Admission conditions" description="You must fulfill these conditions to complete your admission." icon={<AlertTriangle className="h-5 w-5" />}>
                <ConditionsTimeline
                  conditions={conditions}
                  onSubmitEvidence={(conditionId, file, comment) =>
                    workspace.submitConditionEvidence({ conditionId, file, comment })
                  }
                  pendingConditionId={workspace.pendingConditionId}
                  errors={workspace.conditionErrors}
                />
              </SectionCard>
            )}

            {AMENDABLE_STATUSES.has(application.status) && (
              <SectionCard title="Request an amendment" description="Request a change to your personal details. Amendments require admin approval." icon={<Edit3 className="h-5 w-5" />}>
                <AmendmentForm
                  amendField={workspace.amendField}
                  amendValue={workspace.amendValue}
                  amendReason={workspace.amendReason}
                  amendError={workspace.amendError}
                  amendSuccess={workspace.amendSuccess}
                  isPending={workspace.amendPending}
                  onFieldChange={workspace.setAmendField}
                  onValueChange={(v) => { workspace.setAmendValue(v); if (workspace.amendError) workspace.setAmendError('') }}
                  onReasonChange={workspace.setAmendReason}
                  onSubmit={workspace.handleAmendSubmit}
                />
              </SectionCard>
            )}
            {AMENDABLE_STATUSES.has(application.status) && (
              <SectionCard title="Your amendment requests" description="Track the changes you have asked for and where each one stands." icon={<Edit3 className="h-5 w-5" />}>
                <AmendmentHistory
                  amendments={amendmentPage?.results ?? []}
                  totalCount={amendmentPage?.totalCount}
                  isLoading={amendmentsLoading}
                />
              </SectionCard>
            )}
          </div>

          <WorkspaceAside
            application={application}
            institutionLabel={presentation.institutionLabel}
            paymentReviewNote={presentation.paymentReviewNote}
            waitlistPosition={waitlistPosition}
            onWithdrawClick={() => workspace.setShowWithdrawDialog(true)}
            onEnrollClick={() => workspace.setShowEnrollDialog(true)}
            enrollPending={workspace.enrollPending}
            enrollError={workspace.enrollError}
          />
        </div>
      </div>
    </PageShell>

    <WithdrawDialog
      open={workspace.showWithdrawDialog}
      onOpenChange={(open) => { if (!open) { workspace.setShowWithdrawDialog(false); workspace.setWithdrawalReason('') } }}
      reason={workspace.withdrawalReason}
      onReasonChange={workspace.setWithdrawalReason}
      onConfirm={workspace.handleWithdraw}
      isPending={workspace.withdrawPending}
      error={workspace.withdrawError}
    />
    <EnrollDialog
      open={workspace.showEnrollDialog}
      onOpenChange={(open) => { if (!open) workspace.setShowEnrollDialog(false) }}
      onConfirm={() => workspace.confirmEnrollment(undefined, { onSuccess: () => workspace.setShowEnrollDialog(false) })}
      isPending={workspace.enrollPending}
      error={workspace.enrollDialogError}
    />
    </>
  )
}
