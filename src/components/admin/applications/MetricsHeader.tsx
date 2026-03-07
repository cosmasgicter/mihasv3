import React from 'react'

interface ApplicationSummary {
  status: string
  payment_status: string
}

interface MetricsHeaderProps {
  applications: ApplicationSummary[]
  totalCount: number
}

export function MetricsHeader({ applications, totalCount }: MetricsHeaderProps) {
  const loadedCount = applications.length
  const submitted = applications.filter(app => app.status === 'submitted').length
  const underReview = applications.filter(app => app.status === 'under_review').length
  const paymentPending = applications.filter(app => app.payment_status === 'pending_review').length
  const paymentAttention = applications.filter(
    app => !app.payment_status || app.payment_status === 'not_paid' || app.payment_status === 'rejected'
  ).length

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-foreground break-words">
          {totalCount}
        </div>
        <div className="text-sm text-foreground">Total Applications</div>
        <div className="text-xs text-foreground mt-1">
          Showing {loadedCount} loaded
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-primary break-words">
          {submitted + underReview}
        </div>
        <div className="text-sm text-foreground">Decision Queue (loaded)</div>
        <div className="text-xs text-foreground mt-1">
          {submitted} submitted, {underReview} under review
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-accent break-words">
          {paymentPending}
        </div>
        <div className="text-sm text-foreground">Proof Review Queue (loaded)</div>
        <div className="text-xs text-foreground mt-1">
          Payments already submitted for review
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-destructive break-words">
          {paymentAttention}
        </div>
        <div className="text-sm text-foreground">Payment Follow-up (loaded)</div>
        <div className="text-xs text-foreground mt-1">
          Unpaid or rejected payment submissions
        </div>
      </div>
    </div>
  )
}
