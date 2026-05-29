import React from 'react'
import { CheckCircle, Clock, XCircle } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { formatDate } from '@/lib/dateFormat'

interface ApplicationCondition {
  id: string
  description: string
  deadline: string
  status: string
  condition_type: string
  met_at: string | null
}

interface ConditionsTimelineProps {
  conditions: ApplicationCondition[]
}

export function ConditionsTimeline({ conditions }: ConditionsTimelineProps) {
  return (
    <div className="space-y-4">
      {conditions.map((condition, index) => (
        <div
          key={condition.id}
          className={`flex items-start gap-3 rounded-lg border p-3 ${
            condition.status === 'met' || condition.status === 'waived'
              ? 'border-success/30 bg-success/5'
              : condition.status === 'expired'
                ? 'border-destructive/30 bg-destructive/5'
                : 'border-warning/30 bg-warning/5'
          } ${animateClasses.slideUp}`}
          style={staggerChild(index, 50)}
        >
          <div className="flex-shrink-0 mt-0.5">
            {condition.status === 'met' || condition.status === 'waived' ? (
              <CheckCircle className="h-5 w-5 text-success" />
            ) : condition.status === 'expired' ? (
              <XCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Clock className="h-5 w-5 text-warning" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{condition.description}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Deadline: {formatDate(condition.deadline)}
              {condition.met_at && ` \u2022 Fulfilled: ${formatDate(condition.met_at)}`}
            </p>
            <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              condition.status === 'met' || condition.status === 'waived'
                ? 'bg-success/10 text-success'
                : condition.status === 'expired'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-warning/10 text-warning'
            }`}>
              {condition.status.toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
