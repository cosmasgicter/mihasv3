// @ts-nocheck
import React, { useCallback, useEffect, useState } from 'react'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { adminDashboardService } from '@/services/admin/dashboard'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useIsMobile } from '@/hooks/use-mobile'
import { useAdminDashboardRefresh } from '@/hooks/useManualRefresh'
import { useToastStore } from '@/components/ui/Toast'
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
import { useAdminDashboardPolling } from '@/hooks/useAdminDashboardPolling'
import { EnhancedDashboard, type EnhancedDashboardMetrics } from '@/components/admin/EnhancedDashboard'
import { QuickActionsPanel } from '@/components/admin/QuickActionsPanel'
import { RealtimeMetricsDisplay } from '@/components/admin/RealtimeMetricsDisplay'
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Use polling hook for dashboard data updates (replaces Supabase Realtime)
  const { 
    stats: pollingStats, 
    isPolling, 
    refresh: pollingRefresh,
    lastUpdated: pollingLastUpdated 
  } = useAdminDashboardPolling({
    enabled: !!user?.id,
    pollingInterval: 30000, // 30 seconds
    onDataChange: (newStats) => {
      // Update local stats when polling returns new data
      setStats(prev => ({
        ...prev,
        totalApplications: newStats.totalApplications,
        pendingApplications: newStats.pendingApplications,
        approvedApplications: newStats.approvedApplications,
        rejectedApplications: newStats.rejectedApplications,
        todayApplications: newStats.todayApplications,
        weekApplications: newStats.weekApplications,
      }))
      setLastUpdated(new Date())
    }
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
      setLastUpdated(new Date())
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

  // Manual refresh hook for React Query cache invalidation
  // Requirements: 1.5 - Manual refresh button that forces data reload
  const { forceRefresh, isRefreshing: isManualRefreshing } = useAdminDashboardRefresh({
    onSuccess: () => {
      // Also reload local dashboard data after cache invalidation
      loadDashboardStats({ refresh: true })
    },
    onError: (err) => {
      console.error('Manual refresh failed:', err)
      useToastStore.getState().addToast('error', 'Failed to refresh data')
    }
  })

  // Handler for manual refresh button - invalidates React Query cache and reloads data
  const handleManualRefresh = useCallback(async () => {
    await forceRefresh()
  }, [forceRefresh])

  useEffect(() => {
    trackPageView('admin_dashboard')
  }, [trackPageView])

  useEffect(() => {
    logger.log('[Dashboard] useEffect triggered', { hasUser: !!user, hasProfile: !!profile, userId: user?.id, profileId: profile?.id })
    
    if (!user || !profile) {
      logger.log('[Dashboard] Skipping load - missing user or profile')
      return
    }

    let mounted = true

    const load = async () => {
      if (mounted) {
        logger.log('[Dashboard] Loading dashboard stats...')
        await loadDashboardStats()
      }
    }

    void load()

    const intervalId = window.setInterval(() => {
      if (mounted) {
        void loadDashboardStats({ refresh: true })
      }
    }, 300000)

    return () => {
      mounted = false
      window.clearInterval(intervalId)
    }
  }, [loadDashboardStats, profile, user])

  useEffect(() => {
    if (!user || !profile) return

    // Fallback refresh if polling is not active
    if (!isPolling) {
      const timeoutId = window.setTimeout(() => {
        void loadDashboardStats({ refresh: true })
      }, 60000)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [isPolling, loadDashboardStats, profile, user])

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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Authentication Required</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">Please sign in to access the admin dashboard.</p>
          <Button onClick={() => window.location.href = '/auth/signin'}>Sign In</Button>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Profile Loading</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">Setting up your profile...</p>
          <LoadingSpinner size="lg" />
        </div>
      </div>
    )
  }

  const COLOR_CLASSES = {
    blue: 'bg-primary text-white',
    yellow: 'bg-warning text-white',
    green: 'bg-success text-white',
    red: 'bg-error text-white',
    purple: 'bg-secondary text-white',
    indigo: 'bg-secondary text-white'
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
    <div className="page-container bg-gradient-to-br from-background via-primary/5 to-secondary/5 transition-colors duration-500">
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
                    Welcome back, {profile?.full_name?.split(' ')[0] || profile?.first_name || 'Admin'}
                  </h1>
                  <p className="text-sm sm:text-base md:text-lg text-white/90 mb-4 break-words">
                    Here&apos;s your system overview for today
                  </p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        stats.systemHealth === 'excellent' ? 'bg-success/80' :
                        stats.systemHealth === 'good' ? 'bg-primary/80' :
                        stats.systemHealth === 'warning' ? 'bg-warning/80' : 'bg-error/80'
                      }`}></div>
                      <span>System {stats.systemHealth}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Activity className="h-4 w-4" />
                      <span>{stats.activeUsers} active users</span>
                    </div>
                    {/* Polling status indicator */}
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
                      <span className="text-xs">{isPolling ? 'Live' : 'Paused'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-2 flex-shrink-0">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold break-words text-white">{stats.totalApplications}</div>
                  <div className="text-sm sm:text-base text-white/90">Total Applications</div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualRefresh}
                    disabled={isRefreshing || isManualRefreshing}
                    className="bg-card/80 border-white/30 text-gray-900 hover:bg-white/90 flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${(isRefreshing || isManualRefreshing) ? 'animate-spin' : ''}`} />
                    {(isRefreshing || isManualRefreshing) ? 'Refreshing...' : 'Refresh'}
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
              className="rounded-xl bg-destructive/5 border border-destructive/30 p-4 sm:p-6 mb-6 shadow-lg"
            >
              <div className="flex items-center space-x-3">
                <AlertTriangle className="h-6 w-6 text-error flex-shrink-0" />
                <div className="text-sm sm:text-base text-error font-medium">
                  <strong>Error:</strong> {error}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {(isRefreshing || isManualRefreshing) && (
          <div className="mb-6">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-info-strong">
                  <LoadingSpinner size="sm" />
                  <span>Refreshing dashboard metrics…</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10 sm:w-56">
                  <div className="h-full w-1/2 animate-pulse bg-primary/80" />
                </div>
              </div>
            </div>
          </div>
        )}



        {/* Real-time Metrics Display with Animated Counters */}
        {/* Requirements: 6.2, 6.4 - Real-time metrics display with animated counters and visual indicators */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 sm:mb-8"
        >
          <RealtimeMetricsDisplay
            todayApplications={stats.todayApplications}
            pendingApplications={stats.pendingApplications}
            approvedApplications={stats.approvedApplications}
            rejectedApplications={stats.rejectedApplications}
            totalApplications={stats.totalApplications}
            avgProcessingTime={stats.avgProcessingTime}
            activeUsers={stats.activeUsers}
            isConnected={isPolling}
            lastUpdated={lastUpdated}
            onRefresh={handleManualRefresh}
            isRefreshing={isRefreshing || isManualRefreshing}
            showSystemHealth={true}
            systemHealth={{
              database: stats.systemHealth === 'excellent' || stats.systemHealth === 'good' ? 'healthy' : stats.systemHealth === 'warning' ? 'degraded' : 'down',
              api: stats.systemHealth === 'excellent' || stats.systemHealth === 'good' ? 'healthy' : stats.systemHealth === 'warning' ? 'degraded' : 'down',
              storage: 'healthy',
              auth: 'healthy',
            }}
          />
        </motion.div>

        {/* Enhanced Dashboard Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-2">
            <EnhancedDashboard
              metrics={enhancedMetrics}
              recentActivity={recentActivity}
              onRefresh={handleManualRefresh}
              isRefreshing={isRefreshing || isManualRefreshing}
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
          className="mt-8 bg-card rounded-2xl shadow-lg border border-border"
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
                <div className="text-2xl sm:text-3xl font-bold text-primary">{stats.weekApplications}</div>
                <div className="text-sm font-semibold text-foreground">Applications This Week</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{stats.avgProcessingTime}</div>
                <div className="text-sm font-semibold text-foreground">Avg Processing Days</div>
                <div className="text-xs font-medium text-success mt-1">-12% improvement</div>
              </div>
              <div className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-success">
                  {stats.approvedApplications + stats.rejectedApplications > 0 
                    ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
                    : 0}%
                </div>
                <div className="text-sm font-semibold text-foreground">Success Rate</div>
                <div className="text-xs font-medium text-primary mt-1">Stable performance</div>
              </div>
            </div>
          </div>
        </motion.div>

        </div>
      </main>
      

    </div>
  )
}