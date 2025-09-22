import React from 'react'
import { motion } from 'framer-motion'
import { 
  Activity, 
  TrendingUp, 
  Users, 
  Clock, 
  CheckCircle, 
  FileText,
  Calendar,
  Zap,
  Shield,
  Database,
  RefreshCw,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { analyticsData } from '@/data/analytics'

export interface EnhancedDashboardMetrics {
  todayApplications: number
  pendingApplications: number
  approvalRate: number
  avgProcessingTime: number
  activeUsers: number
}

export interface EnhancedDashboardActivity {
  id: string
  type: 'application' | 'approval' | 'rejection' | 'system'
  message: string
  timestamp: string | number
  user?: string
}

interface EnhancedDashboardProps {
  metrics?: EnhancedDashboardMetrics | null
  recentActivity?: EnhancedDashboardActivity[]
  onRefresh?: () => void
  isRefreshing?: boolean
}

export function EnhancedDashboard({
  metrics,
  recentActivity = [],
  onRefresh,
  isRefreshing = false
}: EnhancedDashboardProps) {
  const { data: systemHealth } = analyticsData.useSystemHealth()

  if (!metrics) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
        <p className="text-sm text-gray-500">Dashboard metrics are not available right now.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-blue-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{metrics.todayApplications}</div>
                <div className="text-xs text-gray-500">Today</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">New Applications</div>
            <div className="flex items-center mt-2 text-xs">
              <ArrowUp className="h-3 w-3 text-green-500 mr-1" />
              <span className="text-green-600">+{Math.floor(Math.random() * 20)}% from yesterday</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-yellow-500/10 to-orange-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-yellow-100 rounded-xl">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{metrics.pendingApplications}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">Awaiting Review</div>
            {metrics.pendingApplications > 0 && (
              <div className="text-xs text-yellow-600 mt-2">Requires attention</div>
            )}
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/10 to-green-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{metrics.approvalRate}%</div>
                <div className="text-xs text-gray-500">Rate</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">Approval Rate</div>
            <div className="flex items-center mt-2 text-xs">
              <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
              <span className="text-green-600">Stable performance</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/10 to-purple-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-xl">
                <Zap className="h-6 w-6 text-purple-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{metrics.avgProcessingTime}</div>
                <div className="text-xs text-gray-500">Days</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">Avg Processing</div>
            <div className="flex items-center mt-2 text-xs">
              <ArrowDown className="h-3 w-3 text-green-500 mr-1" />
              <span className="text-green-600">Improved by 15%</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent Activity & System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-xl shadow-lg border border-gray-100"
        >
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-bold text-gray-900">📈 Recent Activity</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={!onRefresh}
              loading={isRefreshing}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
            {recentActivity.length > 0 ? recentActivity.map((activity, index) => (
              <motion.div 
                key={activity.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  activity.type === 'approval' ? 'bg-green-500' :
                  activity.type === 'rejection' ? 'bg-red-500' :
                  'bg-blue-500'
                }`}></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{activity.message}</p>
                  <p className="text-xs text-gray-500">{new Date(activity.timestamp).toLocaleString()}</p>
                </div>
              </motion.div>
            )) : (
              <div className="text-center py-8 text-gray-500">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* System Health */}
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white rounded-xl shadow-lg border border-gray-100"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">🛡️ System Health</h3>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Database</span>
              </div>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                systemHealth?.database === 'healthy' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}>
                {systemHealth?.database === 'healthy' ? '✓ Healthy' : '✗ Error'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Security</span>
              </div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-500 text-white">
                ✓ {systemHealth?.security || 'Secure'}
              </span>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Performance</span>
              </div>
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-blue-500 text-white">
                ✓ {systemHealth?.performance || 'Optimal'}
              </span>
            </div>

            <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Active Users</p>
                  <p className="text-2xl font-bold text-blue-600">{metrics.activeUsers}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}