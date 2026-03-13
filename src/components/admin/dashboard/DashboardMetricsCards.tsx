import { Calendar, CheckCircle, Clock, Zap } from 'lucide-react'

export interface DashboardMetricsSummary {
  todayApplications: number
  pendingApplications: number
  approvalRate: number
  avgProcessingTime: number
}

interface DashboardMetricsCardsProps {
  metrics: DashboardMetricsSummary
}

export function DashboardMetricsCards({ metrics }: DashboardMetricsCardsProps) {
  const items = [
    {
      title: 'New Applications',
      subtitle: 'Today',
      value: metrics.todayApplications,
      icon: Calendar,
      tone: 'bg-primary/10 text-primary'
    },
    {
      title: 'Decision Queue',
      subtitle: 'Pending',
      value: metrics.pendingApplications,
      icon: Clock,
      tone: 'bg-warning/10 text-warning'
    },
    {
      title: 'Approval Rate',
      subtitle: 'Total',
      value: `${metrics.approvalRate}%`,
      icon: CheckCircle,
      tone: 'bg-success/10 text-success'
    },
    {
      title: 'Avg Processing',
      subtitle: 'Days',
      value: metrics.avgProcessingTime,
      icon: Zap,
      tone: 'bg-secondary/10 text-secondary'
    }
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.title} className="bg-card rounded-xl p-6 shadow-lg border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className={`p-3 rounded-xl ${item.tone}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-foreground">{item.value}</div>
                <div className="text-xs text-muted-foreground">{item.subtitle}</div>
              </div>
            </div>
            <div className="text-sm font-medium text-foreground">{item.title}</div>
          </div>
        )
      })}
    </div>
  )
}
