import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { adminDashboardService } from '@/services/admin/dashboard'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useIsMobile } from '@/hooks/use-mobile'
import { 
  Users, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  GraduationCap,
  Calendar,
  Settings,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Activity,
  Database,
  Shield,
  Zap,
  Bell,
  RefreshCw,
  Eye,
  Download,
  Filter,
  Search,
  Plus,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useAdminRealtimeMetrics } from '@/hooks/admin'
import type { AdminApplicationChange, AdminMetricsDelta } from '@/hooks/admin/useAdminRealtimeMetrics'
import { EnhancedDashboard, type EnhancedDashboardMetrics } from '@/components/admin/EnhancedDashboard'
import { QuickActionsPanel } from '@/components/admin/QuickActionsPanel'
import { PredictiveDashboard } from '@/components/admin/PredictiveDashboard'
import { workflowAutomation } from '@/lib/workflowAutomation'
import { sanitizeForDisplay } from '@/lib/sanitize'
import OfflineAdminDashboard from '@/components/admin/OfflineAdminDashboard'

import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { DashboardSkeleton } from '@/components/admin/DashboardSkeleton'

interface DashboardStats {
  totalApplications: number
  pendingApplications: number
  approvedApplications: number
  rejectedApplications: number
  totalPrograms: number
  activeIntakes: number
  totalStudents: number
  todayApplications: number
  weekApplications: number
  monthApplications: number
  avgProcessingTime: number
  systemHealth: 'excellent' | 'good' | 'warning' | 'critical'
  activeUsers: number
}

interface RecentActivity {
  id: string
  type: 'application' | 'approval' | 'rejection' | 'system'
  message: string
  timestamp: string
  user?: string
}

export default function AdminDashboard() {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { trackPageView } = useAnalytics()
  const [stats, setStats] = useState<DashboardStats>({
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
  })
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [error, setError] = useState('')
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [networkError, setNetworkError] = useState(false)

  const updateStatsFromRealtime = useCallback((delta: AdminMetricsDelta) => {
    setStats(prev => ({
      ...prev,
      totalApplications: Math.max(prev.totalApplications + delta.totalApplications, 0),
      pendingApplications: Math.max(prev.pendingApplications + delta.pendingApplications, 0),
      approvedApplications: Math.max(prev.approvedApplications + delta.approvedApplications, 0),
      rejectedApplications: Math.max(prev.rejectedApplications + delta.rejectedApplications, 0),
      todayApplications: Math.max(prev.todayApplications + delta.todayApplications, 0),
      weekApplications: Math.max(prev.weekApplications + delta.weekApplications, 0),
      monthApplications: Math.max(prev.monthApplications + delta.monthApplications, 0)
    }))
  }, [])

  const handleRealtimeChange = useCallback((change: AdminApplicationChange) => {
    updateStatsFromRealtime(change.metricsDelta)

    if (change.activity) {
      const activity = change.activity
      setRecentActivity(prev => {
        const filtered = prev.filter(item => item.id !== activity.id)
        return [activity, ...filtered].slice(0, 10)
      })
    }
  }, [updateStatsFromRealtime])

  const { isConnected } = useAdminRealtimeMetrics({
    currentUserId: user?.id ?? null,
    onChange: handleRealtimeChange
  })

  const loadDashboardStats = useCallback(async (options?: { refresh?: boolean }) => {
    const isRefresh = options?.refresh ?? false
    try {
      if (isRefresh) {
        setIsRefreshing(true)
      } else {
        setIsInitialLoading(true)
      }
      setError('')
      setNetworkError(false)

      const response = await adminDashboardService.getMetrics()
      setStats(response.stats)
      setRecentActivity(response.recentActivity || [])
    } catch (error: any) {
      console.error('Error loading dashboard stats:', error)

      // Check if it's a network error
      if (error.message.includes('fetch failed') || error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
        setNetworkError(true)
        setError('Network connectivity issues detected. Showing offline mode.')
      } else {
        setError(`Failed to load dashboard data: ${error.message}`)
      }
    } finally {
      if (isRefresh) {
        setIsRefreshing(false)
      } else {
        setIsInitialLoading(false)
      }
    }
  }, [])



  const refreshDashboard = useCallback(async () => {
    await loadDashboardStats({ refresh: true })
  }, [loadDashboardStats])

  useEffect(() => {
    trackPageView('admin_dashboard')
  }, [trackPageView])

  useEffect(() => {
    if (!user || !profile) {
      return
    }

    let mounted = true

    const load = async () => {
      if (mounted) {
        await loadDashboardStats()
      }
    }

    void load()

    const intervalId = window.setInterval(() => {
      if (mounted) {
        void loadDashboardStats({ refresh: true })
      }
    }, 180000)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [loadDashboardStats, profile, user])

  useEffect(() => {
    if (!user || !profile) return
    if (isConnected) return

    const timeoutId = window.setTimeout(() => {
      void loadDashboardStats({ refresh: true })
    }, 60000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isConnected, loadDashboardStats, profile, user])

  if (isInitialLoading) {
    return <DashboardSkeleton />
  }

  // Show offline dashboard if network error
  if (networkError) {
    return <OfflineAdminDashboard />
  }

  // Fallback if user or profile is missing
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">Please sign in to access the admin dashboard.</p>
          <Button onClick={() => window.location.href = '/auth/signin'}>Sign In</Button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Profile Loading</h2>
          <p className="text-muted-foreground mb-4">Setting up your profile...</p>
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  const COLOR_CLASSES = {
    blue: 'bg-primary text-white',
    yellow: 'bg-yellow-500 text-white',
    green: 'bg-green-500 text-white',
    red: 'bg-red-500 text-white',
    purple: 'bg-purple-500 text-white',
    indigo: 'bg-indigo-500 text-white'
  } as const



  const gridClasses = isMobile ? 'grid-cols-1 gap-4' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'

  const enhancedMetrics: EnhancedDashboardMetrics = {
    todayApplications: stats.todayApplications,
    pendingApplications: stats.pendingApplications,
    approvalRate: stats.approvedApplications + stats.rejectedApplications > 0
      ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
      : 0,
    avgProcessingTime: stats.avgProcessingTime,
    activeUsers: stats.activeUsers
  }

  return (
    <div className="page-container bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-blue-950 dark:to-purple-950 transition-colors duration-500">
      <main className="w-full max-w-full overflow-x-hidden">
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 safe-area-bottom">
        {/* Enhanced Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                <div>
                  <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-2 break-words">
                    Welcome back, {sanitizeForDisplay(profile?.full_name?.split(' ')[0]) || 'Admin'}
                  </h1>
                  <p className="text-sm sm:text-base md:text-lg text-white/90 mb-4 break-words">
                    Here's your system overview for today
                  </p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        stats.systemHealth === 'excellent' ? 'bg-green-400' :
                        stats.systemHealth === 'good' ? 'bg-blue-400' :
                        stats.systemHealth === 'warning' ? 'bg-yellow-400' : 'bg-red-400'
                      }`}></div>
                      <span>System {stats.systemHealth}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4" />
                      <span>{stats.activeUsers} active users</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-2 flex-shrink-0">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold break-words">{stats.totalApplications}</div>
                  <div className="text-sm sm:text-base text-white/80">Total Applications</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refreshDashboard}
                    loading={isRefreshing}
                    className="bg-white/10 dark:bg-gray-800/20 border-white/30 text-gray-900 dark:text-white hover:bg-white/90 dark:hover:bg-gray-800/30"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 sm:p-6 mb-6 shadow-lg"
            >
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0" />
                <div className="text-sm sm:text-base text-red-700 dark:text-red-300 font-medium">
                  <strong>Error:</strong> {error}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {isRefreshing && (
          <div className="mb-6">
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                  <LoadingSpinner size="sm" />
                  <span>Refreshing dashboard metrics…</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/30 sm:w-56">
                  <div className="h-full w-1/2 animate-pulse bg-blue-400" />
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Enhanced Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8"
        >
          {/* Today's Applications */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 dark:border-gray-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-blue-600/20 rounded-bl-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.todayApplications}</div>
                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">Today</div>
                </div>
              </div>
              <div className="text-sm font-medium text-muted-foreground">New Applications</div>
              {stats.todayApplications > 0 && (
                <div className="flex items-center mt-2 text-xs">
                  <ArrowUp className="h-3 w-3 text-green-500 mr-1" />
                  <span className="text-green-600 dark:text-green-400">Today</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Pending Reviews */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 dark:border-gray-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-yellow-500/10 to-orange-600/20 rounded-bl-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl">
                  <Clock className="h-6 w-6 text-yellow-600 dark:text-yellow-400 dark:text-yellow-500" />
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.pendingApplications}</div>
                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">Pending</div>
                </div>
              </div>
              <div className="text-sm font-medium text-muted-foreground">Awaiting Review</div>
              {stats.pendingApplications > 0 && (
                <Link to="/admin/applications?status=submitted" className="text-xs text-primary hover:underline mt-2 block">
                  Review now →
                </Link>
              )}
            </div>
          </motion.div>

          {/* Processing Time */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 dark:border-gray-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/10 to-purple-600/20 rounded-bl-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                  <Zap className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.avgProcessingTime}</div>
                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">Days</div>
                </div>
              </div>
              <div className="text-sm font-medium text-muted-foreground">Avg Processing</div>
              <div className="flex items-center mt-2 text-xs">
                <ArrowDown className="h-3 w-3 text-green-500 mr-1" />
                <span className="text-green-600 dark:text-green-400">Improved by 15%</span>
              </div>
            </div>
          </motion.div>

          {/* Approval Rate */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 dark:border-gray-700 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/10 to-green-600/20 rounded-bl-full"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-xl">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-bold text-foreground break-words">
                    {stats.approvedApplications + stats.rejectedApplications > 0 
                      ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
                      : 0}%
                  </div>
                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">Rate</div>
                </div>
              </div>
              <div className="text-sm font-medium text-muted-foreground">Approval Rate</div>
              <div className="flex items-center mt-2 text-xs">
                <TrendingUp className="h-3 w-3 text-green-500 mr-1" />
                <span className="text-green-600 dark:text-green-400">Stable performance</span>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* AI-Powered Predictive Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-8"
        >
          <PredictiveDashboard />
        </motion.div>

        {/* Enhanced Dashboard Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <EnhancedDashboard
              metrics={enhancedMetrics}
              recentActivity={recentActivity}
              onRefresh={refreshDashboard}
              isRefreshing={isRefreshing}
            />
          </div>

          {/* Enhanced Sidebar */}
          <div>
            <QuickActionsPanel stats={{
              pendingApplications: stats.pendingApplications,
              totalPrograms: stats.totalPrograms,
              totalStudents: stats.totalStudents
            }} />
          </div>
        </div>
        {/* Weekly Overview */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8 bg-card rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700"
        >
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Weekly Overview
            </h3>
          </div>
          
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-primary break-words">{stats.weekApplications}</div>
                <div className="text-sm text-muted-foreground">Applications This Week</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400 break-words">{stats.avgProcessingTime}</div>
                <div className="text-sm text-muted-foreground">Avg Processing Days</div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">-12% improvement</div>
              </div>
              <div className="text-center">
                <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 break-words">
                  {stats.approvedApplications + stats.rejectedApplications > 0 
                    ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
                    : 0}%
                </div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
                <div className="text-xs text-primary mt-1">Stable performance</div>
              </div>
            </div>
          </div>
        </motion.div>

        </div>
      </main>
      

    </div>
  )
}