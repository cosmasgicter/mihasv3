import React from 'react'
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
} from 'lucide-react'
import { canWithdraw } from '@/lib/withdrawalEligibility'

interface NextActionCardsProps {
  applicationId: string
  applicationStatus: string
  paymentAction: { href: string; label: string } | null
  onWithdrawClick: () => void
  waitlistPosition?: { position: number; total: number } | null
  showEnrollButton?: boolean
  onEnrollClick?: () => void
  enrollPending?: boolean
  enrollError?: string | null
}

export function NextActionCards({
  applicationId,
  applicationStatus,
  paymentAction,
  onWithdrawClick,
  waitlistPosition,
  showEnrollButton,
  onEnrollClick,
  enrollPending,
  enrollError,
}: NextActionCardsProps) {
  return (
    <>
      <SectionCard title="Next actions" description="Stay in control of your application." icon={<FileText className="h-5 w-5" />}>
        <div className="flex flex-col gap-3">
          {paymentAction && (
            <Button asChild variant="outline" className="w-full">
              <Link to={paymentAction.href}>
                {paymentAction.label}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="w-full">
            <Link to={`/student/application/${applicationId}`}>
              View full application details
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link to="/student/application-wizard">
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
        <div className="space-y-3">
          <SectionCard
            title="Congratulations!"
            description="Your application has been approved. Confirm your enrollment to secure your place."
            icon={<CheckCircle className="h-5 w-5 text-success" />}
          />
          {showEnrollButton && (
            <Button
              variant="primary"
              onClick={onEnrollClick}
              disabled={enrollPending}
              className="w-full sm:w-auto"
            >
              {enrollPending ? 'Confirming\u2026' : 'Confirm Enrollment'}
            </Button>
          )}
          {enrollError && (
            <p className="text-sm text-error">{enrollError}</p>
          )}
        </div>
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
