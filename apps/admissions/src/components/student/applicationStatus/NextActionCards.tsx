import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  LogOut,
  ShieldCheck,
} from 'lucide-react'
import { canWithdraw } from '@/lib/withdrawalEligibility'
import { enrollmentMessage, formatEnrollmentCountdown } from '@/lib/enrollmentReadiness'
import { studentApplicationNewPath } from '@/routes/routeRegistry'
import type { EnrollmentReadiness } from '@/types/database'

interface NextActionCardsProps {
  applicationStatus: string
  onWithdrawClick: () => void
  waitlistPosition?: { position: number; total: number } | null
  /**
   * Server-authored enrollment readiness (task 10.3, R13.9, STU-15). `null` when
   * the platform did not publish one — rendered as unknown, never as "confirmed"
   * and never as a silently missing control.
   */
  enrollment?: EnrollmentReadiness | null
  onEnrollClick?: () => void
  enrollPending?: boolean
  enrollError?: string | null
}

export function NextActionCards({
  applicationStatus,
  onWithdrawClick,
  waitlistPosition,
  enrollment,
  onEnrollClick,
  enrollPending,
  enrollError,
}: NextActionCardsProps) {
  const enrollmentCountdown = formatEnrollmentCountdown(enrollment)
  const enrollmentNote = enrollmentMessage(enrollment)
  return (
    <>
      <SectionCard title="Next actions" description="Stay in control of your application." icon={<FileText className="h-5 w-5" />}>
        <div className="flex flex-col gap-3">
          {/*
            Task 11.3 (R13.1, R16.5): the fee affordance is **not** here any more.

            This card carried a second copy of the payment action — the page
            derived `{href, label}` from `requiresStudentPaymentAction` and the
            application status and handed it down. Task 11.3 puts the platform's
            own next action first on this workspace, read through task 11.1's
            resolver, and a deferred fee is exactly the action that resolver
            answers with (`complete-payment`, the server's label, and the
            `/student/payment` route R12.3 gives ownership of collection to). Two
            controls for one action on one page is the duplicate affordance R16.5
            names, so the derived one is gone and the read one stays.
          */}
          {/*
            Task 10.6 (R13.13, STU-23): "View full application details" used to
            link to `/student/application/:id` — a second workspace over the same
            application. There is one workspace now, and this component renders
            inside it, so the control was a link to the page the student is
            already on. It is removed rather than repointed: a self-link is not an
            action.
          */}
          <Button asChild variant="outline" className="w-full">
            <Link to={studentApplicationNewPath()}>
              Start new application
            </Link>
          </Button>
          {canWithdraw(applicationStatus) && (
            <Button
              variant="ghost"
              className="w-full text-destructive hover:bg-destructive/5"
              onClick={onWithdrawClick}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Withdraw application
            </Button>
          )}
          <Button asChild variant="ghost" className="w-full">
            <Link to="/student/dashboard">
              Back to dashboard
            </Link>
          </Button>
        </div>
      </SectionCard>

      {applicationStatus === 'under_review' && (
        <SectionCard
          title="Application under review"
          description="Our admissions team is reviewing your information. We'll notify you by email when a decision is ready."
          icon={<Clock className="h-5 w-5" />}
        />
      )}

      {applicationStatus === 'approved' && (
        <SectionCard
          title="Congratulations!"
          description="Your application has been approved. Confirm your enrollment to secure your place."
          icon={<CheckCircle className="h-5 w-5 text-success" />}
        />
      )}

      {/*
        Enrollment (task 10.3, R13.9, finding STU-15).

        The affordance is driven by the server's readiness state, not by a status
        string. That is the finding: the backend has always accepted a
        conditionally approved offer once its conditions were resolved, and this
        surface only ever offered confirmation for `approved` — so a student who
        had satisfied every condition was shown nothing to do. The blocked branch
        exists for the same reason in reverse: a refusal has to be readable here
        rather than only after the request fails.
      */}
      {(enrollment?.state === 'confirmable' || enrollment?.state === 'blocked') && (
        <SectionCard
          title="Confirm your enrollment"
          description={enrollment.definition}
          icon={
            enrollment.state === 'confirmable'
              ? <ShieldCheck className="h-5 w-5 text-success" />
              : <AlertCircle className="h-5 w-5 text-warning" />
          }
        >
          <div className="space-y-3" data-testid={`enrollment-${enrollment.state}`}>
            {enrollment.deadline && (
              <p className="text-sm text-muted-foreground">
                Deadline:{' '}
                <time dateTime={enrollment.deadline} className="text-foreground">
                  {new Date(enrollment.deadline).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                </time>
                {enrollmentCountdown && <span className="block">{enrollmentCountdown}</span>}
              </p>
            )}

            {enrollment.state === 'blocked' && enrollmentNote && (
              <p className="flex items-start gap-2 text-sm text-warning-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" aria-hidden="true" />
                <span data-testid="enrollment-blocker">{enrollmentNote.message}</span>
              </p>
            )}

            {enrollment.can_confirm && (
              <Button
                variant="primary"
                onClick={onEnrollClick}
                disabled={enrollPending}
                className="w-full sm:w-auto"
              >
                {enrollPending ? 'Confirming\u2026' : 'Confirm Enrollment'}
              </Button>
            )}

            {/*
              The server's own next actions. A blocked student always has at
              least one, so this surface never dead-ends — 6.5's rule.
            */}
            {!enrollment.can_confirm && enrollment.allowed_actions.length > 0 && (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {enrollment.allowed_actions.map(action => (
                  <li key={action.action} className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>{action.label}</span>
                  </li>
                ))}
              </ul>
            )}

            {enrollError && <p className="text-sm text-error">{enrollError}</p>}
          </div>
        </SectionCard>
      )}

      {applicationStatus === 'waitlisted' && (
        <SectionCard
          title="You're on the waitlist"
          description="Your application is on the waitlist. We'll notify you by email if a spot becomes available."
          icon={<Clock className="h-5 w-5 text-amber-600" />}
        >
          {waitlistPosition && waitlistPosition.position > 0 && (
            <p className="text-sm font-medium text-amber-800">
              Position {waitlistPosition.position} of {waitlistPosition.total}
            </p>
          )}
        </SectionCard>
      )}

      {applicationStatus === 'conditionally_approved' && (
        <SectionCard
          title="Conditionally approved"
          description="Your application has been conditionally approved. Please review and fulfill the pending conditions listed on your application."
          icon={<AlertCircle className="h-5 w-5 text-warning" />}
        />
      )}

      {applicationStatus === 'withdrawn' && (
        <SectionCard
          title="Application withdrawn"
          description="This application has been withdrawn. You may submit a new application for future intakes."
          icon={<XCircle className="h-5 w-5 text-muted-foreground" />}
        />
      )}

      {applicationStatus === 'enrolled' && (
        <SectionCard
          title="Enrollment confirmed"
          description="Your enrollment has been confirmed."
          icon={<CheckCircle className="h-5 w-5 text-success" />}
        />
      )}

      {applicationStatus === 'rejected' && (
        <SectionCard
          title="Application update"
          description="Unfortunately this application was not successful. You're welcome to apply again for future intakes."
          icon={<XCircle className="h-5 w-5 text-error" />}
        />
      )}
    </>
  )
}
