import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Application } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { formatDate, getStatusColor } from '@/lib/utils'
import { ArrowRight, Clock, CheckCircle, XCircle, Calendar, ListOrdered, ShieldCheck, AlertTriangle, Video } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { enrollmentReadinessOf, formatEnrollmentCountdown } from '@/lib/enrollmentReadiness'
import { resolveStudentNextAction } from '@/lib/studentNextAction'
import { applicationService } from '@/services/applications'
import { interviewsService } from '@/services/interviews'
import { studentApplicationWorkspacePath } from '@/routes/routeRegistry'

interface ApplicationListItemProps {
  application: Application
  index: number
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved':
      return <CheckCircle className="h-5 w-5 text-success" />
    case 'rejected':
      return <XCircle className="h-5 w-5 text-destructive" />
    case 'under_review':
      return <Clock className="h-5 w-5 text-primary" />
    default:
      return <Clock className="h-5 w-5 text-warning" />
  }
}

function areApplicationListItemPropsEqual(
  prev: ApplicationListItemProps,
  next: ApplicationListItemProps
): boolean {
  return (
    prev.application.id === next.application.id &&
    prev.application.status === next.application.status &&
    prev.application.payment_status === next.application.payment_status &&
    prev.application.submitted_at === next.application.submitted_at &&
    prev.application.updated_at === next.application.updated_at &&
    prev.application.created_at === next.application.created_at &&
    prev.application.application_number === next.application.application_number &&
    prev.application.enrollment_confirmation_deadline === next.application.enrollment_confirmation_deadline &&
    // Task 10.3: the readiness the server published drives the enrollment card,
    // so a change in `state` / `can_confirm` must re-render even when the
    // deadline itself has not moved (a condition being accepted is exactly that).
    prev.application.enrollment?.state === next.application.enrollment?.state &&
    prev.application.enrollment?.can_confirm === next.application.enrollment?.can_confirm &&
    prev.index === next.index
  )
}

export const ApplicationListItem = React.memo<ApplicationListItemProps>(function ApplicationListItem({
  application,
  index,
}) {
  /*
    The row's one action is the platform's (admissions-v2 task 11.3, R13.1,
    R16.1, finding STU-05).

    This row used to carry **two** browser-derived commands beside the document
    stack: a "Complete Payment" button behind `requiresStudentPaymentAction(...)`
    and a "Confirm Enrollment" button behind `can_confirm && deadline`. Both are
    now read from the same resolver task 11.1 built for the dashboard panel, which
    takes its verb, its label and its blocker sentence from whichever server
    contract governs this application — task 10.3's enrollment readiness published
    on the row, or the canonical payment status routed to the surface task 8.3
    owns. Nothing here derives an action, and no readiness request is made: a
    submitted application's next action is already on the row, and a *draft's*
    next action belongs to the dashboard's own panel and the wizard, which is why
    this row asks for no readiness of its own.
  */
  const nextAction = resolveStudentNextAction({ application })

  // Waitlist position query (Req 3.10)
  const { data: waitlistData } = useQuery<{ position: number; total: number }>({
    queryKey: ['waitlist-position', application.id],
    queryFn: async () => {
      const res = await applicationService.getWaitlistPosition(application.id)
      return res ?? { position: 0, total: 0 }
    },
    enabled: application.status === 'waitlisted',
    staleTime: 60_000,
  })

  // Conditions query (Req 5.9)
  const { data: conditionsData } = useQuery<Array<{ id: string; description: string; deadline: string; status: string }>>({
    queryKey: ['application-conditions', application.id],
    queryFn: async () => {
      const res = await applicationService.getConditions(application.id)
      return (res ?? []) as Array<{ id: string; description: string; deadline: string; status: string }>
    },
    enabled: application.status === 'conditionally_approved',
    staleTime: 60_000,
  })

  // Enrollment readiness is the server's answer (task 10.3, R13.9, STU-15).
  // Before 10.3 this row tested `status === 'approved'` against a deadline field
  // the server never sent, so the card could not render at all — and the rule it
  // encoded was narrower than the backend's, which has always accepted a
  // conditionally approved offer once its conditions are resolved.
  //
  // Task 11.3 keeps the *deadline* here, as status, and hands the *command* to
  // the next action above: one row, one action.
  const enrollment = enrollmentReadinessOf(application)
  const enrollmentDeadline = enrollment?.deadline ?? null
  const countdown = formatEnrollmentCountdown(enrollment)
  const showEnrollment = enrollment?.can_confirm === true && !!enrollmentDeadline

  // Interview query
  const { data: interviewData } = useQuery({
    queryKey: ['application-interview', application.id],
    queryFn: async () => {
      const res = await interviewsService.list(application.id)
      const active = (res?.interviews ?? []).find(i => i.status === 'scheduled' || i.status === 'rescheduled')
      return active ?? null
    },
    enabled: false, // Disabled: Dashboard fetches all interviews via ?mine=true
    staleTime: 60_000,
  })

  return (
    /*
      A flat row inside its section's one container (admissions-v2 task 11.5,
      R16.4).

      This root used to be `mx-3 my-3 rounded-lg border border-border/80 bg-card
      … shadow-sm` — a bordered, shadowed card rendered *inside*
      `ApplicationsGrid`'s `SectionCard`, which is itself a bordered card. Task
      11.3 recorded the nesting in its §11 and named this task as its owner; it is
      visible in 11.3's own `dashboard-row-320-mobile-required.png`.

      The section already separates its rows with `divide-y divide-border`, so the
      border and the margins were doing the divider's job a second time while
      costing 24 px of horizontal room at 320 px. Padding stays — the row still
      needs breathing space inside the divider.
    */
    <div
      className={`px-4 py-4 sm:px-6 sm:py-5 ${animateClasses.slideUp}`}
      style={staggerChild(index, 50)}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-0.5">{getStatusIcon(application.status)}</div>
            <div className="flex-1 min-w-0">
              {/*
                `h3`, not `h4` (GATE-13.3-08, 13.6 §8.1 item L6; WCAG 1.3.1).

                This row is rendered inside `ApplicationsGrid`'s `SectionCard`,
                whose title is an `h2`, so an `h4` here skipped `h3` — task 13.3
                measured the dashboard sequence as `… h2 x4 -> h4 -> h2 x2` and
                traced the skip to this line. Nothing visual changes: the size
                comes from `text-sm`/`sm:text-base`, not from the tag.
              */}
              <h3 className="text-sm font-bold text-foreground break-words leading-tight sm:text-base">
                {application.program || 'Unknown programme'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                #{application.application_number}
              </p>
            </div>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium shadow-sm ${getStatusColor(application.status)}`}>
            {application.status.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>

        {/*
          Status, then the next action — before the details grid, the waitlist
          block and the documents (R16.1, task 11.3). The label and the sentence
          are the server's; this row authors neither.
        */}
        {nextAction && (
          <div
            data-testid="application-row-next-action"
            className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next action</p>
              <p className="break-words text-base sm:text-sm font-medium text-foreground">{nextAction.label}</p>
              {nextAction.blockerMessage && (
                <p className="break-words text-xs text-muted-foreground">{nextAction.blockerMessage}</p>
              )}
            </div>
            {nextAction.href && (
              <Button asChild variant="primary" size="sm" className="min-h-touch w-full sm:w-auto">
                <Link to={nextAction.href} data-testid="application-row-next-action-link">
                  {nextAction.label}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            )}
          </div>
        )}

        <div className="h-px ambient-divider" />

        {/* Details Grid */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Intake: <span className="text-foreground">{application.intake || 'Unknown'}</span></span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Submitted: <span className="text-foreground">{formatDate(application.submitted_at)}</span></span>
          </div>
        </div>

        {/*
          Waitlist position (Req 3.10). Design tokens, not raw palette steps
          (admissions-v2 task 11.5, R16.4): this block was
          `border-amber-200 bg-amber-50 text-amber-600 text-amber-800` while the
          enrollment and interview blocks immediately below it already used the
          semantic `warning` / `success` / `primary` tokens. Same meaning, same
          vocabulary now, and the palette step cannot drift from the theme.
        */}
        {application.status === 'waitlisted' && waitlistData && (
          <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-base sm:text-sm">
            <ListOrdered className="h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
            <span className="font-medium text-warning">
              Waitlist position: {waitlistData.position} of {waitlistData.total}
            </span>
          </div>
        )}

        {/* Enrollment deadline (Req 10.9; task 10.3, R13.9) — status, not a second command */}
        {showEnrollment && (
          <div
            data-testid="enrollment-confirmable"
            className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-base sm:text-sm"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" aria-hidden="true" />
            <span className="font-medium text-success">
              Confirm enrollment by {formatDate(enrollmentDeadline)}
              {countdown && (
                <span className="block font-normal text-muted-foreground">{countdown}</span>
              )}
            </span>
          </div>
        )}

        {/* Pending conditions list (Req 5.9) */}
        {application.status === 'conditionally_approved' && conditionsData && conditionsData.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-3">
            <div className="flex items-center gap-2 mb-2 text-base sm:text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
              <span>Pending conditions</span>
            </div>
            <ul className="space-y-1 pl-6 text-base sm:text-sm text-foreground">
              {conditionsData.filter(c => c.status === 'pending').map(condition => (
                <li key={condition.id} className="list-disc">
                  {condition.description}
                  <span className="ml-1 text-muted-foreground">— due {formatDate(condition.deadline)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Interview details */}
        {interviewData && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-base sm:text-sm">
            <Video className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="font-medium text-primary">
              Interview {interviewData.status === 'rescheduled' ? '(rescheduled)' : 'scheduled'}: {interviewData.scheduled_at ? new Date(interviewData.scheduled_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'TBC'}
              {interviewData.mode && <> — {interviewData.mode.replace('_', ' ')}</>}
            </span>
          </div>
        )}

        {/*
          Actions (task 11.3, STU-05). The row used to end in up to seven
          controls: four official-document buttons plus an email form inside a
          collapsed disclosure, a payment button and a details link. It is the
          workspace link and one counted document control now — the documents
          keep every command, inside the disclosure, and their live status stays
          inside it rather than in the row.
        */}
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-start">
          <Link to={studentApplicationWorkspacePath(application.id)} className="w-full sm:w-auto">
            <Button variant="outline" size="sm" className="min-h-touch w-full transition-all duration-200 active:scale-[0.98] sm:w-auto">
              View details
            </Button>
          </Link>
          <div className="min-w-0 flex-1">
            <DocumentButtons
              applicationId={application.id}
              applicationNumber={application.application_number}
              status={application.status}
              paymentStatus={application.payment_status ?? null}
              density="row"
            />
          </div>
        </div>
      </div>
    </div>
  )
}, areApplicationListItemPropsEqual)
