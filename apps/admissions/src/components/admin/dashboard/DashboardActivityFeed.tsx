import { formatTimestamp } from '@/lib/dateFormat'
import { FadeIn } from '@/components/motion'

export interface DashboardActivityItem {
  id: string
  message: string
  timestamp: string
  type: 'status_change' | 'payment' | 'application' | 'approval' | 'rejection' | 'system' | 'review'
  user?: string
  application_number?: string
  old_status?: string
  new_status?: string
  actor_name?: string
}

interface DashboardActivityFeedProps {
  items: DashboardActivityItem[]
}

export function DashboardActivityFeed({ items }: DashboardActivityFeedProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-sm">
      <div className="px-6 py-4 border-b border-border/40">
        <h3 className="text-lg font-bold text-foreground">Recent Activity</h3>
      </div>
      <div className="p-6 space-y-4">
        {items.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No recent activity</p>
          </div>
        ) : (
          items.slice(0, 10).map((activity, index) => (
            <FadeIn key={activity.id} delay={index * 0.05}>
            <div className="flex gap-3 border-b border-border/40 pb-3 last:border-b-0 last:pb-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/50 text-xs font-medium text-muted-foreground">
                {(activity.actor_name || activity.user || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                {activity.application_number && (
                  <div className="text-xs font-medium text-primary mb-0.5">
                    {activity.application_number}
                  </div>
                )}
                <div className="text-sm text-foreground">{activity.message}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatTimestamp(activity.timestamp)}
                  {activity.actor_name ? ` · ${activity.actor_name}` : activity.user ? ` · ${activity.user}` : ''}
                </div>
              </div>
            </div>
            </FadeIn>
          ))
        )}
      </div>
    </div>
  )
}
