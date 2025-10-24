import React from 'react'
import { Button } from '@/components/ui/Button'
import { BarChart3, RefreshCw } from 'lucide-react'

interface AnalyticsHeaderProps {
  totalApplications: number
  refreshing: boolean
  onRefresh: () => void
}

export const AnalyticsHeader: React.FC<AnalyticsHeaderProps> = ({
  totalApplications,
  refreshing,
  onRefresh
}) => {
  return (
    <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold break-words flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> Analytics & Reporting
          </h1>
          <p className="text-xl text-white/90 mt-2">Application statistics and trends analysis with full CRUD functionality</p>
        </div>
        <div className="flex items-center space-x-4">
          <Button
            onClick={onRefresh}
            disabled={refreshing}
            className="bg-card/80 hover:bg-card/80 text-body border-white/30"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-bold break-words">{totalApplications}</div>
            <div className="text-sm text-white/80">Total Applications</div>
          </div>
        </div>
      </div>
    </div>
  )
}
