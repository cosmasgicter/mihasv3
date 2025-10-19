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
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 break-words">
          {totalCount}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-500">Total Applications</div>
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Showing {loadedCount} loaded
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 break-words">
          {applications.filter(app => app.status === 'submitted').length}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-500">Submitted (loaded)</div>
      </div>

      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400 dark:text-yellow-500 break-words">
          {applications.filter(app => app.payment_status === 'pending_review').length}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-500">Pending Payment Review (loaded)</div>
      </div>

      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg shadow p-6">
        <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 break-words">
          {applications.filter(app => app.status === 'approved').length}
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-500">Approved (loaded)</div>
      </div>
    </div>
  )
}