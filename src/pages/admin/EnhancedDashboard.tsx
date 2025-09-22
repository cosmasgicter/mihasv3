import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
import { EnhancedDashboard, type EnhancedDashboardMetrics } from '@/components/admin/EnhancedDashboard'
import { QuickActionsPanel } from '@/components/admin/QuickActionsPanel'
import { SystemMonitoring } from '@/components/admin/SystemMonitoring'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { analyticsData } from '@/data/analytics'
import { 
  BarChart3, 
  Activity, 
  Settings, 
  Bell, 
  RefreshCw,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff
} from 'lucide-react'

export default function EnhancedAdminDashboard() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [activeTab, setActiveTab] = useState<'overview' | 'monitoring' | 'analytics'>('overview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(true)
  
  // Data hooks
  const { data: dashboardData, isLoading: metricsLoading, isFetching, refetch: refetchMetrics } = analyticsData.useAdminMetrics()

  const stats = dashboardData?.stats || {
    totalApplications: 0,
    pendingApplications: 0,
    approvedApplications: 0,
    rejectedApplications: 0,
    totalPrograms: 0,
    activeIntakes: 0,
    totalStudents: 0,
    todayApplications: 0,
    weekApplications: 0,
    monthApplications: 0,
    avgProcessingTime: 0,
    systemHealth: 'good',
    activeUsers: 0
  }

  const recentActivity = dashboardData?.recentActivity || []

  const loading = metricsLoading

  const refreshDashboard = () => {
    refetchMetrics()
  }

  const enhancedMetrics: EnhancedDashboardMetrics = {
    todayApplications: stats.todayApplications || 0,
    pendingApplications: stats.pendingApplications || 0,
    approvalRate: stats.approvedApplications + stats.rejectedApplications > 0
      ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
      : 0,
    avgProcessingTime: stats.avgProcessingTime || 0,
    activeUsers: stats.activeUsers || 0
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-lg text-gray-600 font-medium">Loading dashboard...</p>
        </motion.div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600 mb-4">Please sign in to access the admin dashboard.</p>
          <Button onClick={() => window.location.href = '/auth/signin'}>Sign In</Button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 }
  ]

  return (
    <div className={`min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 ${isFullscreen ? 'p-0' : ''}`}>
      {!isFullscreen && <AdminNavigation />}
      
      <main className={`${isFullscreen ? 'p-4' : 'container-mobile py-4 sm:py-6 lg:py-8'} safe-area-bottom`}>
        {/* Enhanced Header */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="bg-gradient-to-r from-primary via-secondary to-accent rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                <div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
                    🚀 Enhanced Admin Dashboard
                  </h1>
                  <p className="text-lg sm:text-xl text-white/90">
                    Welcome back, {profile?.full_name || 'Admin'}! Here's your system overview
                  </p>
                  <div className="flex items-center space-x-4 mt-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                      <span>System Online</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4" />
                      <span>{stats.activeUsers} active users</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-3xl sm:text-4xl font-bold">{stats.totalApplications}</div>
                    <div className="text-sm sm:text-base text-white/80">Total Applications</div>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={refreshDashboard}
                      loading={isFetching}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsFullscreen(!isFullscreen)}
                      className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Navigation Tabs */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-2">
            <div className="flex space-x-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </motion.div>

        {/* Notifications Bar */}
        <AnimatePresence>
          {showNotifications && stats.pendingApplications > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bell className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-semibold text-yellow-800">
                      {stats.pendingApplications} applications need your attention
                    </p>
                    <p className="text-sm text-yellow-600">
                      Review pending applications to keep the process moving smoothly
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.href = '/admin/applications?status=submitted'}
                    className="text-yellow-700 border-yellow-300 hover:bg-yellow-100"
                  >
                    Review Now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNotifications(false)}
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-4 gap-6"
            >
              <div className="lg:col-span-3">
                <EnhancedDashboard
                  metrics={enhancedMetrics}
                  recentActivity={recentActivity}
                  onRefresh={refreshDashboard}
                  isRefreshing={isFetching}
                />
              </div>
              <div>
                <QuickActionsPanel stats={{
                  pendingApplications: stats.pendingApplications,
                  totalPrograms: stats.totalPrograms,
                  totalStudents: stats.totalStudents
                }} />
              </div>
            </motion.div>
          )}

          {activeTab === 'monitoring' && (
            <motion.div
              key="monitoring"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <SystemMonitoring />
            </motion.div>
          )}

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="text-center py-12"
            >
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Advanced Analytics</h3>
              <p className="text-gray-600 mb-6">Detailed analytics and reporting features coming soon</p>
              <Button onClick={() => window.location.href = '/admin/analytics'}>
                View Current Analytics
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Quick Stats Footer */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8 bg-white rounded-xl shadow-lg border border-gray-100 p-6"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">📈 Quick Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stats.approvedApplications + stats.rejectedApplications > 0 
                  ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
                  : 0}%
              </div>
              <div className="text-sm text-gray-600">Approval Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.avgProcessingTime} days</div>
              <div className="text-sm text-gray-600">Avg Processing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.activeIntakes}</div>
              <div className="text-sm text-gray-600">Active Intakes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">99.9%</div>
              <div className="text-sm text-gray-600">System Uptime</div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}