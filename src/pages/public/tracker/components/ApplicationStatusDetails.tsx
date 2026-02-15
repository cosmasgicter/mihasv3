import React from 'react'
import { Calendar, MessageSquare, CheckCircle, Clock, Target, XCircle, Rocket } from 'lucide-react'
import { PublicApplicationStatus } from '../hooks/useApplicationTracker'
import { formatDate } from '@/lib/utils'
import { getStatusEmoji, getStatusMessage } from '../utils/trackerUtils'
import { animateClasses } from '@/lib/animations'

interface ApplicationStatusDetailsProps {
  application: PublicApplicationStatus
}

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'approved': return 'bg-success/5 border-success/30'
    case 'rejected': return 'bg-error/5 border-error/30'
    case 'under_review': return 'bg-primary/5 border-primary/30'
    case 'submitted': return 'bg-warning/5 border-warning/30'
    default: return 'bg-muted border-border'
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved': return <CheckCircle className="h-8 w-8 text-success" />
    case 'rejected': return <XCircle className="h-8 w-8 text-error" />
    case 'under_review': return <Target className="h-8 w-8 text-primary" />
    case 'submitted': return <Rocket className="h-8 w-8 text-warning" />
    default: return <Clock className="h-8 w-8 text-muted-foreground" />
  }
}

export const ApplicationStatusDetails: React.FC<ApplicationStatusDetailsProps> = ({ application }) => {
  return (
    <div className="xl:col-span-2 space-y-6">
      {/* Current Status Card */}
      <div className={animateClasses.slideUp}>
        <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Current Status
        </h4>
        
        <div className={`rounded-xl border-2 p-6 ${getStatusStyles(application.status)}`}>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
            <div className="flex-shrink-0">
              {getStatusIcon(application.status)}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-bold text-xl text-gray-900 mb-2">
                {application.status.replace('_', ' ').toUpperCase()}
              </p>
              <p className="text-gray-700 text-base leading-relaxed">
                {getStatusMessage(application.status)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Feedback - conditional rendering replaces AnimatePresence */}
      {application.admin_feedback && (
        <div
          className={animateClasses.slideUp}
          style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}
        >
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-success" />
            Message from Admissions
          </h4>
          
          <div className="rounded-xl border-2 border-success/30 bg-success/5 p-6">
            <div className="bg-white/80 rounded-lg p-4 mb-4 border border-success/20">
              <p className="text-gray-900 text-base leading-relaxed">
                {application.admin_feedback}
              </p>
            </div>
            {application.admin_feedback_date && (
              <p className="text-gray-700 text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Provided on {formatDate(application.admin_feedback_date)}</span>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
