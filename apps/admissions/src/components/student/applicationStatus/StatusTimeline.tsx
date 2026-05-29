import React from 'react'
import { CheckCircle, Clock, XCircle, AlertCircle, Calendar } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { formatDate } from '@/lib/dateFormat'

interface ApplicationTimeline {
  status: string
  date: string | undefined
  description: string
  completed: boolean
}

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

interface StatusTimelineProps {
  timeline: ApplicationTimeline[]
}

export function StatusTimeline({ timeline }: StatusTimelineProps) {
  return (
    <div className="space-y-1">
      {timeline.map((step, index) => {
        const isActive = !step.completed && index === timeline.findIndex(s => !s.completed)
        const isFuture = !step.completed && !isActive
        return (
          <div
            key={`${step.status}-${index}`}
            className={`flex items-start gap-4 rounded-lg border-l-2 px-3 py-3 ${
              isActive
                ? 'border-l-primary bg-primary/5'
                : step.completed
                  ? 'border-l-success/40'
                  : 'border-l-border'
            } ${animateClasses.slideUp}`}
            style={staggerChild(index, 50)}
          >
            <div
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                step.completed
                  ? 'bg-success/10 text-success'
                  : isActive
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {step.completed ? <CheckCircle className="h-5 w-5" /> : getStatusIcon(step.status)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${isFuture ? 'text-muted-foreground' : 'text-foreground'}`}>
                {step.description}
              </p>
              {step.date && (
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(step.date)}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
