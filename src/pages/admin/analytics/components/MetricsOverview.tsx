import React from 'react'
import { FileText, CheckCircle, TrendingUp, Users } from 'lucide-react'

interface MetricsOverviewProps {
  totalApplications: number
  overallApprovalRate: number
  avgEligibilitySuccess: number
  uniqueUsers: number
}

export const MetricsOverview: React.FC<MetricsOverviewProps> = ({
  totalApplications,
  overallApprovalRate,
  avgEligibilitySuccess,
  uniqueUsers
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">Total Applications</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{totalApplications}</p>
            <p className="text-xs text-gray-900 mt-1">+12% from last month</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-2xl">
            <FileText className="h-8 w-8 text-primary" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">Approval Rate</p>
            <p className="text-2xl sm:text-3xl font-bold text-accent break-words">{overallApprovalRate}%</p>
            <p className="text-xs text-gray-900 mt-1">+5% from last month</p>
          </div>
          <div className="p-3 bg-accent/10 rounded-2xl">
            <CheckCircle className="h-8 w-8 text-accent" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">Eligibility Success</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{avgEligibilitySuccess}%</p>
            <p className="text-xs text-gray-900 mt-1">+8% from last month</p>
          </div>
          <div className="p-3 bg-secondary/10 rounded-2xl">
            <TrendingUp className="h-8 w-8 text-secondary" />
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">Active Users</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 break-words">{uniqueUsers}</p>
            <p className="text-xs text-gray-900 mt-1">+15% from last month</p>
          </div>
          <div className="p-3 bg-primary/10 rounded-2xl">
            <Users className="h-8 w-8 text-secondary" />
          </div>
        </div>
      </div>
    </div>
  )
}
