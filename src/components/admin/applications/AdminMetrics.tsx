import { useMemo } from 'react'
import { TrendingUp, Users, Clock, CheckCircle, XCircle, CreditCard } from 'lucide-react'

interface ApplicationSummary {
  status: string
  payment_status: string
  submitted_at: string
  created_at: string
}

interface AdminMetricsProps {
  applications: ApplicationSummary[]
}

export function AdminMetrics({ applications }: AdminMetricsProps) {
  const metrics = useMemo(() => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    const todayStr = today.toDateString()
    const yesterdayStr = yesterday.toDateString()
    
    const todaySubmissions = applications.filter(app => 
      new Date(app.submitted_at || app.created_at).toDateString() === todayStr
    ).length
    
    const yesterdaySubmissions = applications.filter(app => 
      new Date(app.submitted_at || app.created_at).toDateString() === yesterdayStr
    ).length
    
    const pendingReview = applications.filter(app => app.status === 'submitted').length
    const underReview = applications.filter(app => app.status === 'under_review').length
    const approved = applications.filter(app => app.status === 'approved').length
    const rejected = applications.filter(app => app.status === 'rejected').length
    
    const paymentPending = applications.filter(app => app.payment_status === 'pending_review').length
    const paymentVerified = applications.filter(app => app.payment_status === 'verified').length
    
    const submissionTrend = todaySubmissions - yesterdaySubmissions
    const approvalRate = applications.length > 0 ? (approved / applications.length) * 100 : 0
    
    return {
      todaySubmissions,
      submissionTrend,
      pendingReview,
      underReview,
      approved,
      rejected,
      paymentPending,
      paymentVerified,
      approvalRate,
      total: applications.length
    }
  }, [applications])

  const MetricCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color, 
    trend 
  }: { 
    title: string
    value: number | string
    icon: any
    color: string
    trend?: number 
  }) => (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground mb-1">{title}</p>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {trend !== undefined && (
            <div className={`flex items-center mt-1 text-sm ${
              trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-muted-foreground'
            }`}>
              <TrendingUp className={`h-3 w-3 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
              {trend > 0 ? '+' : ''}{trend} from yesterday
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${color.replace('text-', 'bg-').replace('-600', '-100')}`}>
          <Icon className={`h-6 w-6 ${color}`} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <MetricCard
        title="Today's Submissions"
        value={metrics.todaySubmissions}
        icon={Users}
        color="text-primary"
        trend={metrics.submissionTrend}
      />
      
      <MetricCard
        title="Pending Review"
        value={metrics.pendingReview}
        icon={Clock}
        color="text-accent"
      />
      
      <MetricCard
        title="Approval Rate"
        value={`${metrics.approvalRate.toFixed(1)}%`}
        icon={CheckCircle}
        color="text-accent"
      />
      
      <MetricCard
        title="Payment Pending"
        value={metrics.paymentPending}
        icon={CreditCard}
        color="text-orange-600"
      />
    </div>
  )
}