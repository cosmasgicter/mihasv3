import { formatTimestamp } from '@/lib/dateFormat'

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
    <div className="bg-card rounded-xl shadow-lg border border-border">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-lg font-bold text-foreground">Recent Activity</h3>
      </div>
      <div className="p-6 space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        ) : (
          items.slice(0, 8).map((activity) => (
            <div key={activity.id} className="border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
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
          ))
        )}
      </div>
    </div>
  )
}
