import React from 'react'
import { Link } from 'react-router-dom'
import type { Application } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { DocumentButtons } from '@/components/student/DocumentButtons'
import { formatDate, getStatusColor } from '@/lib/utils'
import { Clock, CheckCircle, XCircle, Calendar } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'

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
    prev.index === next.index
  )
}

export const ApplicationListItem = React.memo<ApplicationListItemProps>(function ApplicationListItem({
  application,
  index,
}) {
  return (
    <div
      className={`border-l-4 border-l-transparent px-6 py-6 transition-colors hover:border-l-primary hover:bg-muted/30 ${animateClasses.slideUp}`}
      style={staggerChild(index, 50)}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">{getStatusIcon(application.status)}</div>
            <div className="flex-1 min-w-0">
              <h4 className="text-lg font-bold text-foreground break-words leading-tight">
                {application.program || 'Unknown Program'}
              </h4>
              <p className="text-sm font-medium text-muted-foreground mt-1">
                Application #{application.application_number}
              </p>
            </div>
          </div>
          <span className={`rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap ${getStatusColor(application.status)}`}>
            {application.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-muted-foreground">Intake:</span>
            <span className="text-foreground break-words">{application.intake || 'Unknown Intake'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium text-muted-foreground">Submitted:</span>
            <span className="text-foreground">{formatDate(application.submitted_at)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 border-t border-border pt-2 sm:flex-row">
          <div className="flex-1">
            <DocumentButtons 
              applicationId={application.id}
              applicationNumber={application.application_number}
              status={application.status}
              paymentStatus={application.payment_status ?? null}
            />
          </div>
          <Link to={`/student/application/${application.id}`} className="sm:w-auto">
            <Button variant="outline" size="sm" className="w-full sm:w-auto">
              View Details
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}, areApplicationListItemPropsEqual)
