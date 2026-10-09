import React from 'react'
import { CheckCircle, Clock, Target, XCircle, Rocket, Users, FileCheck, AlertTriangle } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
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

      {/*
        admissions-v2 task 10.5 (R13.12, STU-22): the "Message from Admissions"
        panel that used to sit here read `admin_feedback` / `admin_feedback_date`
        — reviewer-authored notes the public tracking contract has never published
        and must never publish. It rendered nothing in practice, because the
        backend never sent them; it was a leak waiting for someone to "fix" the
        missing field. Decision correspondence belongs to the student's own
        authenticated communications history.
      */}
    </div>
  )
}
