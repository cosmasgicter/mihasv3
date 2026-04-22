import React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { Application } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { formatDate, getStatusColor } from '@/lib/utils'
import { Clock, CheckCircle, XCircle, Calendar, CreditCard, ListOrdered, ShieldCheck, AlertTriangle, Video } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { requiresStudentPaymentAction } from '@/lib/paymentStatus'
import { applicationService } from '@/services/applications'
import type { ApplicationInterview } from '@/types/database'
import { interviewsService } from '@/services/interviews'

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
    prev.application.application_number === next.application.application_number &&
    prev.application.enrollment_confirmation_deadline === next.application.enrollment_confirmation_deadline &&
    prev.index === next.index
  )
}

export const ApplicationListItem = React.memo<ApplicationListItemProps>(function ApplicationListItem({
  application,
  index,
}) {
  const needsPayment = application.status !== 'draft' && requiresStudentPaymentAction(application.payment_status)
  const paymentHref = `/student/payment?applicationId=${encodeURIComponent(application.id)}`

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

  const enrollmentDeadline = application.enrollment_confirmation_deadline as string | undefined
  const showEnrollment = application.status === 'approved' && !!enrollmentDeadline

  // Interview query
  const { data: interviewData } = useQuery({
    queryKey: ['application-interview', application.id],
    queryFn: async () => {
      const res = await interviewsService.list(application.id)
      const active = (res?.interviews ?? []).find(i => i.status === 'scheduled' || i.status === 'rescheduled')
      return active ?? null
    },
    enabled: application.status !== 'draft' && application.status !== 'rejected',
    staleTime: 60_000,
  })

  return (
    <div
      className={`mx-3 my-3 rounded-[1.6rem] border border-slate-200/80 bg-white/88 px-4 py-4 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_26px_65px_-36px_rgba(37,99,235,0.35)] sm:mx-4 sm:px-6 sm:py-5 ${animateClasses.slideUp}`}
      style={staggerChild(index, 50)}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-0.5">{getStatusIcon(application.status)}</div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-foreground break-words leading-tight sm:text-base">
                {application.program || 'Unknown Program'}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                #{application.application_number}
              </p>
            </div>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium shadow-sm ${getStatusColor(application.status)}`}>
            {application.status.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>

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

        {/* Waitlist position badge (Req 3.10) */}
        {application.status === 'waitlisted' && waitlistData && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <ListOrdered className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="font-medium text-amber-800">
              Waitlist position: {waitlistData.position} of {waitlistData.total}
            </span>
          </div>
        )}

        {/* Enrollment confirmation (Req 10.9) */}
        {showEnrollment && (
          <div className="flex flex-col gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-success flex-shrink-0" />
              <span className="font-medium text-success">
                Confirm enrollment by {formatDate(enrollmentDeadline)}
              </span>
            </div>
            <Link to={`/student/application/${application.id}/status`}>
              <Button variant="primary" size="sm" className="min-h-9 w-full sm:w-auto">
                Confirm Enrollment
              </Button>
            </Link>
          </div>
        )}

        {/* Pending conditions list (Req 5.9) */}
        {application.status === 'conditionally_approved' && conditionsData && conditionsData.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-warning-foreground">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
              <span>Pending conditions</span>
            </div>
            <ul className="space-y-1 pl-6 text-sm text-foreground">
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
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <Video className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="font-medium text-primary">
              Interview {interviewData.status === 'rescheduled' ? '(rescheduled)' : 'scheduled'}: {interviewData.scheduled_at ? new Date(interviewData.scheduled_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'TBC'}
              {interviewData.mode && <> — {interviewData.mode.replace('_', ' ')}</>}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1 sm:order-2">
            <DocumentButtons 
              applicationId={application.id}
              applicationNumber={application.application_number}
              status={application.status}
              paymentStatus={application.payment_status ?? null}
            />
          </div>
          {needsPayment && (
            <Link to={paymentHref} className="w-full sm:order-1 sm:w-auto">
              <Button variant="warning" size="sm" className="min-h-[44px] w-full transition-all duration-200 active:scale-[0.98] sm:w-auto">
                <CreditCard className="mr-2 h-4 w-4" />
                Complete Payment
              </Button>
            </Link>
          )}
          <Link to={`/student/application/${application.id}`} className="w-full sm:order-1 sm:w-auto">
            <Button variant="primary" size="sm" className="min-h-[44px] w-full transition-all duration-200 active:scale-[0.98] sm:w-auto">
              View Details
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}, areApplicationListItemPropsEqual)
