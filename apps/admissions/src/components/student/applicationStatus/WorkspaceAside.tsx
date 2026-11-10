/**
 * The workspace's right-hand column (admissions-v2 task 12.1, MAINT-01).
 *
 * Lifted **verbatim** out of `pages/student/ApplicationStatus.tsx`: documents and
 * records, the latest payment review note, quick information, public tracking,
 * the route to the one communications inbox, and `NextActionCards` — in that
 * order, with the same guards and the same copy. The long comments that explain
 * *why* three of these live here (tasks 10.5, 10.6, 10.1) moved with them,
 * because they are the record of decisions a future reader would otherwise
 * re-litigate.
 */
import { Link } from 'react-router-dom'
import { CreditCard, Download, Link2, MessageSquare, User } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { TrackingLinkAction } from '@/components/student/TrackingLinkAction'
import {
  DetailRow,
} from '@/components/student/applicationStatus/ApplicationDetailsSection'
import { NextActionCards } from '@/components/student/applicationStatus/NextActionCards'
import { formatDate } from '@/lib/dateFormat'
import { enrollmentReadinessOf } from '@/lib/enrollmentReadiness'
import { pathFor } from '@/routes/routeRegistry'
import type { ApplicationWithDetails } from '@/types/database'

interface WorkspaceAsideProps {
  application: ApplicationWithDetails
  institutionLabel: string
  paymentReviewNote: string | null
  waitlistPosition: { position: number; total: number } | undefined
  onWithdrawClick: () => void
  onEnrollClick: () => void
  enrollPending: boolean
  enrollError: string | null
}

export function WorkspaceAside({
  application,
  institutionLabel,
  paymentReviewNote,
  waitlistPosition,
  onWithdrawClick,
  onEnrollClick,
  enrollPending,
  enrollError,
}: WorkspaceAsideProps) {
  return (
    <div className="space-y-6">
      <SectionCard title="Documents and records" description="Download your application slip and other available documents." icon={<Download className="h-5 w-5" />}>
        <DocumentButtons applicationId={application.id} applicationNumber={application.application_number} status={application.status} paymentStatus={application.payment_status ?? null} />
      </SectionCard>

      {paymentReviewNote && (
        <SectionCard title="Latest payment review note" description="Use this guidance if you need to correct or complete payment." icon={<CreditCard className="h-5 w-5" />}>
          <p className="text-base sm:text-sm text-foreground">{paymentReviewNote}</p>
        </SectionCard>
      )}

      <SectionCard title="Quick information" description="Essential application details at a glance." icon={<User className="h-5 w-5" />}>
        <dl className="space-y-3 text-base sm:text-sm">
          <DetailRow label="Application number" value={application.application_number ? `#${application.application_number}` : 'Not assigned'} />
          <DetailRow label="Program" value={application.program || 'Not provided'} />
          {/* Task 10.6 parity: the retired workspace named the institution. */}
          <DetailRow label="Institution" value={institutionLabel} />
          <DetailRow label="Intake" value={application.intake || 'Not provided'} />
          <DetailRow label={application.status === 'draft' ? 'Started' : 'Submitted'} value={formatDate(application.status === 'draft' ? application.created_at : application.submitted_at)} />
          <DetailRow label="Last updated" value={formatDate(application.updated_at)} />
        </dl>
      </SectionCard>

      {/*
        Public tracking (task 10.5, R13.12 / STU-22), brought onto the
        canonical workspace by task 10.6.

        This control only ever existed on the retired `/student/application/:id`
        page, so consolidating the two workspaces without moving it would have
        deleted the student's only way to obtain a tracking link — and the
        application number printed on their slip authorises nothing since 10.5.
        A draft has nothing to track, so the control is offered from submission
        onwards.
      */}
      {application.status !== 'draft' && (
        <SectionCard
          title="Public tracking"
          description="Share this application's status without sharing your account."
          icon={<Link2 className="h-5 w-5" />}
        >
          <TrackingLinkAction applicationId={application.id} />
        </SectionCard>
      )}

      {/*
        Communications (R13.2, R13.13). The workspace *reaches* the one
        inbox rather than growing a second one: task 10.1 made
        `/student/communications` the single communications/inbox history
        and it is the only surface that holds a message's delivery state.
        A per-application message feed here would be exactly the duplicate
        inbox finding STU-14 closed — and `notifications` carries no
        application column to scope one by, so building it would mean
        inventing a contract instead of reusing one.
      */}
      <SectionCard
        title="Messages and notifications"
        description="Every message the admissions team has sent you, with its delivery state."
        icon={<MessageSquare className="h-5 w-5" />}
      >
        <Button asChild variant="outline" className="w-full">
          <Link to={pathFor('student.communications')}>Open your communications history</Link>
        </Button>
      </SectionCard>

      <NextActionCards
        applicationStatus={application.status}
        onWithdrawClick={onWithdrawClick}
        waitlistPosition={waitlistPosition}
        enrollment={enrollmentReadinessOf(application)}
        onEnrollClick={onEnrollClick}
        enrollPending={enrollPending}
        enrollError={enrollError}
      />
    </div>
  )
}
