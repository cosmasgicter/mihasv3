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

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-foreground break-words">
          {totalCount}
        </div>
        <div className="text-sm text-muted-foreground">Total Applications</div>
        <div className="text-xs text-muted-foreground mt-1">
          Showing {loadedCount} loaded
        </div>
      </div>

      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-primary break-words">
          {applications.filter(app => app.status === 'submitted').length}
        </div>
        <div className="text-sm text-muted-foreground">Submitted (loaded)</div>
      </div>

      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-accent break-words">
          {applications.filter(app => app.payment_status === 'pending_review').length}
        </div>
        <div className="text-sm text-muted-foreground">Pending Payment Review (loaded)</div>
      </div>

      <div className="bg-card rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-accent break-words">
          {applications.filter(app => app.status === 'approved').length}
        </div>
        <div className="text-sm text-muted-foreground">Approved (loaded)</div>
      </div>
    </div>
  )
}