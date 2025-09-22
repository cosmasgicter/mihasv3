import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Calendar,
  Users,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'

import { analyticsData } from '@/data/analytics'

interface AnalyticsData {
  applications: {
    total: number
    approved: number
    rejected: number
    pending: number
    thisWeek: number
    lastWeek: number
  }
  trends: {
    approvalRate: number
    processingTime: number
    weeklyGrowth: number
  }
}

interface AnalyticsChartsProps {
  data: AnalyticsData
}

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
  const {
    activeUsers,
    dailyCounts,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError
  } = analyticsData.useTrafficOverview()

  const approvalRate = data.applications.total > 0
    ? Math.round((data.applications.approved / (data.applications.approved + data.applications.rejected)) * 100)
    : 0

  const weeklyGrowth = data.applications.lastWeek > 0
    ? Math.round(((data.applications.thisWeek - data.applications.lastWeek) / data.applications.lastWeek) * 100)
    : 0

  const maxDailyCount = dailyCounts.reduce((max, day) => Math.max(max, day.count), 0)
  const fallbackMessage = isAnalyticsError ? 'Analytics data is currently unavailable.' : 'Loading analytics data...'
  const activeUsersDisplay = isAnalyticsError ? '—' : isAnalyticsLoading ? '...' : activeUsers.toLocaleString()
  const activeUsersStatus = isAnalyticsError
    ? 'Analytics unavailable'
    : isAnalyticsLoading
      ? 'Fetching latest data'
      : 'Online now'
  const activeUsersStatusClass = isAnalyticsError ? 'text-red-600' : 'text-indigo-600'

  const chartData = [
    { label: 'Approved', value: data.applications.approved, color: 'bg-green-500', percentage: Math.round((data.applications.approved / data.applications.total) * 100) },
    { label: 'Rejected', value: data.applications.rejected, color: 'bg-red-500', percentage: Math.round((data.applications.rejected / data.applications.total) * 100) },
    { label: 'Pending', value: data.applications.pending, color: 'bg-yellow-500', percentage: Math.round((data.applications.pending / data.applications.total) * 100) }
  ]

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Approval Rate</p>
              <p className="text-2xl font-bold text-green-600">{approvalRate}%</p>
              <div className="flex items-center mt-2 text-xs">
                {approvalRate >= 70 ? (
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                )}
                <span className={approvalRate >= 70 ? 'text-green-600' : 'text-red-600'}>
                  {approvalRate >= 70 ? 'Good' : 'Needs attention'}
                </span>
              </div>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Weekly Growth</p>
              <p className="text-2xl font-bold text-blue-600">{weeklyGrowth}%</p>
              <div className="flex items-center mt-2 text-xs">
                {weeklyGrowth >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500 mr-1" />
                )}
                <span className={weeklyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}>
                  vs last week
                </span>
              </div>
            </div>
            <BarChart3 className="h-8 w-8 text-blue-500" />
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Processing Time</p>
              <p className="text-2xl font-bold text-purple-600">3.2 days</p>
              <div className="flex items-center mt-2 text-xs">
                <TrendingDown className="h-3 w-3 text-green-500 mr-1" />
                <span className="text-green-600">15% faster</span>
              </div>
            </div>
            <Clock className="h-8 w-8 text-purple-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Users</p>
              <p className="text-2xl font-bold text-indigo-600">{activeUsersDisplay}</p>
              <div className="flex items-center mt-2 text-xs">
                <Users className={`h-3 w-3 mr-1 ${isAnalyticsError ? 'text-red-500' : 'text-indigo-500'}`} />
                <span className={activeUsersStatusClass}>{activeUsersStatus}</span>
              </div>
            </div>
            <Users className="h-8 w-8 text-indigo-500" />
          </div>
        </motion.div>
      </div>

      {/* Application Status Distribution */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <PieChart className="h-5 w-5 mr-2" />
            Application Status Distribution
          </h3>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart Visualization */}
            <div className="space-y-4">
              {chartData.map((item, index) => (
                <motion.div 
                  key={item.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center space-x-4"
                >
                  <div className="flex items-center space-x-3 flex-1">
                    <div className={`w-4 h-4 rounded-full ${item.color}`}></div>
                    <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <motion.div 
                        className={`h-2 rounded-full ${item.color}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${item.percentage}%` }}
                        transition={{ delay: index * 0.2, duration: 0.8 }}
                      ></motion.div>
                    </div>
                    <span className="text-sm font-bold text-gray-900 w-12 text-right">{item.value}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Summary Stats */}
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Applications</span>
                    <span className="font-semibold">{data.applications.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Success Rate</span>
                    <span className="font-semibold text-green-600">{approvalRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Pending Review</span>
                    <span className="font-semibold text-yellow-600">{data.applications.pending}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Performance</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">This Week</span>
                    <span className="font-semibold">{data.applications.thisWeek}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Last Week</span>
                    <span className="font-semibold">{data.applications.lastWeek}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Growth</span>
                    <span className={`font-semibold ${weeklyGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {weeklyGrowth >= 0 ? '+' : ''}{weeklyGrowth}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Weekly Trend */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Weekly Application Trend
          </h3>
        </div>
        
        <div className="p-6">
          {isAnalyticsLoading ? (
            <div className="grid grid-cols-7 gap-2 mb-4">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="text-center">
                  <div className="text-xs text-gray-300 mb-2">---</div>
                  <div className="h-16 w-full rounded-lg bg-gray-200 animate-pulse mx-auto"></div>
                  <div className="text-xs font-semibold text-gray-300 mt-2">--</div>
                </div>
              ))}
            </div>
          ) : isAnalyticsError || dailyCounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-500">
              <XCircle className="h-6 w-6 text-red-400 mb-2" />
              <p>{fallbackMessage}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {dailyCounts.map((day, index) => {
                  const height = maxDailyCount > 0 ? Math.max(12, Math.round((day.count / maxDailyCount) * 80)) : 12

                  return (
                    <div key={day.date} className="text-center">
                      <div className="text-xs text-gray-500 mb-2">{day.label}</div>
                      <motion.div
                        className="bg-gradient-to-t from-primary to-secondary rounded-lg mx-auto"
                        style={{ width: '100%' }}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}px` }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                      ></motion.div>
                      <div className="text-xs font-semibold text-gray-700 mt-2">
                        {day.count.toLocaleString()}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="text-center text-sm text-gray-600">
                Page views for the last 7 days
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}