import { useMemo } from 'react'
import { TrendingUp, Users, Clock, AlertCircle, CreditCard } from 'lucide-react'
import { normalizePaymentStatus } from '@/lib/paymentStatus'

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
    const decisionQueue = pendingReview + underReview

    const paymentNotPaid = applications.filter(
      app => normalizePaymentStatus(app.payment_status) === 'not_paid'
    ).length
    const paymentPending = applications.filter(app => normalizePaymentStatus(app.payment_status) === 'pending_review').length
    const paymentRejected = applications.filter(app => normalizePaymentStatus(app.payment_status) === 'rejected').length
    const paymentAttention = paymentNotPaid + paymentRejected

    const submissionTrend = todaySubmissions - yesterdaySubmissions

    return {
      todaySubmissions,
      submissionTrend,
      pendingReview,
      underReview,
      decisionQueue,
      paymentNotPaid,
      paymentPending,
      paymentRejected,
      paymentAttention,
    }
  }, [applications])

  const MetricCard = ({ 
    title, 
    value, 
    description,
    icon: Icon, 
    iconClass,
    iconContainerClass,
    trend 
  }: { 
    title: string
    value: number | string
    description: string
    icon: any
    iconClass: string
    iconContainerClass: string
    trend?: number 
  }) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          {trend !== undefined && (
            <div className={`flex items-center mt-1 text-sm ${
              trend > 0 ? 'text-success' : trend < 0 ? 'text-error' : 'text-muted-foreground'
            }`}>
              <TrendingUp className={`h-3 w-3 mr-1 ${trend < 0 ? 'rotate-180' : ''}`} />
              {trend > 0 ? '+' : ''}{trend} from yesterday
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${iconContainerClass}`}>
          <Icon className={`h-6 w-6 ${iconClass}`} />
        </div>
      </div>
    </div>
  )

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        title="New Today"
        value={metrics.todaySubmissions}
        icon={Users}
        description="Submitted today"
        iconClass="text-primary"
        iconContainerClass="bg-primary/10"
        trend={metrics.submissionTrend}
      />
      
      <MetricCard
        title="Decision Queue"
        value={metrics.decisionQueue}
        icon={Clock}
        description={`${metrics.pendingReview} submitted, ${metrics.underReview} under review`}
        iconClass="text-indigo-600"
        iconContainerClass="bg-indigo-100"
      />
      
      <MetricCard
        title="Proof Review"
        value={metrics.paymentPending}
        icon={CreditCard}
        description="Proof submitted and awaiting review"
        iconClass="text-orange-600"
        iconContainerClass="bg-orange-100"
      />

      <MetricCard
        title="Payment Follow-up"
        value={metrics.paymentAttention}
        icon={AlertCircle}
        description={`${metrics.paymentNotPaid} unpaid, ${metrics.paymentRejected} rejected proofs`}
        iconClass="text-rose-600"
        iconContainerClass="bg-rose-100"
      />
    </div>
  )
}
