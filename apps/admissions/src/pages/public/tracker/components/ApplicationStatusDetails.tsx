import React from 'react'
import { Calendar, MessageSquare, CheckCircle, Clock, Target, XCircle, Rocket, Users, FileCheck, AlertTriangle } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { formatDate } from '@/lib/utils'
import { getStatusMessage } from '../utils/trackerUtils'
import { animateClasses } from '@/lib/animations'

interface ApplicationStatusDetailsProps {
  application: PublicApplicationStatus
}

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'approved':
    case 'enrolled':
      return 'bg-success/5 border-success/30'
    case 'rejected':
    case 'expired':
    case 'withdrawn':
      return 'bg-destructive/5 border-destructive/30'
    case 'under_review':
      return 'bg-primary/5 border-primary/30'
    case 'submitted':
      return 'bg-warning/5 border-warning/30'
    case 'conditionally_approved':
      return 'bg-warning/5 border-warning/30'
    case 'waitlisted':
      return 'bg-primary/5 border-primary/30'
    default:
      return 'bg-muted border-border'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved':
      return <CheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
    case 'enrolled':
      return <FileCheck className="h-8 w-8 text-success" aria-hidden="true" />
    case 'rejected':
      return <XCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
    case 'expired':
    case 'withdrawn':
      return <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
    case 'under_review':
      return <Target className="h-8 w-8 text-primary" aria-hidden="true" />
    case 'submitted':
      return <Rocket className="h-8 w-8 text-warning" aria-hidden="true" />
    case 'conditionally_approved':
      return <AlertTriangle className="h-8 w-8 text-warning" aria-hidden="true" />
    case 'waitlisted':
      return <Users className="h-8 w-8 text-primary" aria-hidden="true" />
    default:
      return <Clock className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
  }
}

const getStatusLabel = (status: string) => {
  return status.replace(/_/g, ' ').toUpperCase()
}

export const ApplicationStatusDetails: React.FC<ApplicationStatusDetailsProps> = ({ application }) => {
  return (
    <div className="xl:col-span-2 space-y-6">
      {/* Current Status Card */}
      <div className={animateClasses.slideUp}>
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" aria-hidden="true" />
          Current Status
        </h3>
        
        <div className={`rounded-lg border p-5 sm:p-6 ${getStatusStyles(application.status)}`}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="flex-shrink-0">
              {getStatusIcon(application.status)}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-bold text-xl text-foreground mb-2">
                {getStatusLabel(application.status)}
              </p>
              <p className="text-muted-foreground text-base leading-7">
                {getStatusMessage(application.status)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Feedback */}
      {application.admin_feedback && (
        <div
          className={animateClasses.slideUp}
          style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
        >
          <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-success" aria-hidden="true" />
            Message from Admissions
          </h3>
          
          <div className="rounded-lg border border-success/30 bg-success/5 p-5 sm:p-6">
            <div className="mb-4 rounded-lg border border-success/20 bg-card p-4">
              <p className="text-foreground text-base leading-7">
                {application.admin_feedback}
              </p>
            </div>
            {application.admin_feedback_date && (
              <p className="text-muted-foreground text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                <span>Provided on {formatDate(application.admin_feedback_date)}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
