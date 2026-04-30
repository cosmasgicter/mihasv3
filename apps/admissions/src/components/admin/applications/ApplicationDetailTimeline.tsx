import { formatDate } from '@/lib/dateFormat'
import { XCircle, Clock, CheckCircle, Eye, History } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import type { StatusHistoryItem } from './applicationDetailTypes'

interface ApplicationDetailTimelineProps {
  history: StatusHistoryItem[]
  loading: boolean
}

export function ApplicationDetailTimeline({ history, loading }: ApplicationDetailTimelineProps) {
  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading status history">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-4 rounded-lg border border-border bg-white p-4">
            <Skeleton className="w-8 h-8 rounded-md flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-foreground">
        <History className="h-8 w-8 mx-auto mb-2 text-foreground" />
        <p className="text-sm">No status changes recorded</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {history.map((item, index) => {
        const status = item.status || item.new_status || 'unknown'
        const actor = item.changed_by_profile?.full_name || item.changed_by_profile?.email || item.changed_by_name || item.changed_by || 'System'
        const transition = item.old_status && item.new_status
          ? `${item.old_status.replace('_', ' ')} → ${item.new_status.replace('_', ' ')}`
          : status.replace('_', ' ')
        return (
          <div key={item.id || `${status}-${item.created_at}-${index}`} className="flex gap-4 p-4 rounded-lg border border-border bg-white">
            <div className="flex-shrink-0">
              <div className={`w-8 h-8 rounded-md flex items-center justify-center ${
                status === 'approved' ? 'bg-green-100' :
                status === 'rejected' ? 'bg-red-100' :
                status === 'under_review' ? 'bg-blue-100' :
                'bg-primary/10'
              }`}>
                {status === 'approved' ? <CheckCircle className="h-4 w-4 text-accent" /> :
                  status === 'rejected' ? <XCircle className="h-4 w-4 text-destructive" /> :
                  status === 'under_review' ? <Eye className="h-4 w-4 text-primary" /> :
                  <Clock className="h-4 w-4 text-primary" />}
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-foreground capitalize">{transition}</p>
                <p className="text-xs text-foreground">{formatDate(item.created_at)}</p>
              </div>
              <p className="text-sm text-foreground mb-2">Changed by {actor}</p>
              {item.notes && (
                <p className="text-sm text-foreground bg-muted p-2 rounded">{item.notes}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
