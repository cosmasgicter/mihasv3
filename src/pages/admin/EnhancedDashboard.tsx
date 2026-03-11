import React, { useState } from 'react'
import { animateClasses } from '@/lib/animations'
import { EnhancedDashboard, type EnhancedDashboardMetrics } from '@/components/admin/EnhancedDashboard'
import { QuickActionsPanel } from '@/components/admin/QuickActionsPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { Button } from '@/components/ui/Button'
import { useQuery } from '@tanstack/react-query'
import { adminDashboardService } from '@/services/admin/dashboard'
import { getAdminDisplayName, shouldLoadAdminDashboard } from '@/pages/admin/lib/dashboardBootstrap'
import { PageShell } from '@/components/ui/PageShell'
import { 
  BarChart3, 
  Activity, 
  Settings, 
  Bell, 
  RefreshCw,
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Rocket,
  TrendingUp
} from 'lucide-react'

export default function EnhancedAdminDashboard() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [activeTab, setActiveTab] = useState<'overview' | 'monitoring' | 'analytics'>('overview')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showNotifications, setShowNotifications] = useState(true)
  
  // Data hooks
  const { data: dashboardData, isLoading: metricsLoading, isFetching, refetch: refetchMetrics } = useQuery({
    queryKey: ['analytics', 'admin-metrics'],
    queryFn: () => adminDashboardService.getMetrics(),
    staleTime: 30000,
    refetchInterval: 60000,
  })

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
      <PageShell title="Enhanced Admin Dashboard" subtitle="Loading..." maxWidth="7xl">
        <div className="flex items-center justify-center py-16">
          <div className={`text-center ${animateClasses.scaleIn}`}>
            <UnifiedLoader variant="inline" size="lg" label="Loading dashboard" />
            <p className="mt-4 text-lg text-foreground font-medium">Loading dashboard...</p>
          </div>
        </div>
      </PageShell>
    )
  }

  if (!shouldLoadAdminDashboard(user)) {
    return (
      <PageShell title="Enhanced Admin Dashboard" subtitle="Authentication required" maxWidth="7xl">
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-foreground mb-2">Authentication Required</h2>
            <p className="text-foreground mb-4">Please sign in to access the admin dashboard.</p>
            <Button onClick={() => window.location.href = '/auth/signin'}>Sign In</Button>
          </div>
        </div>
      </PageShell>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 }
  ]

  return (
    <PageShell
      title="Enhanced Admin Dashboard"
      subtitle={`Welcome back, ${getAdminDisplayName(profile, user)}! Here's your system overview`}
      maxWidth="7xl"
      actions={
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshDashboard}
            loading={isFetching}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      }
    >
      <div>
        {/* System Status */}
        <div className={`mb-6 ${animateClasses.slideUp}`}>
          <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-success/80 animate-pulse"></div>
                  <span className="text-foreground">System Online</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-foreground">{stats.activeUsers} active users</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-foreground">{stats.totalApplications}</span>
                <span className="text-sm ml-2 text-muted-foreground">Total Applications</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div 
          className={`mb-6 ${animateClasses.slideUp}`}
        >
          <div className="bg-card rounded-xl shadow-lg border border-border p-2">
            <div className="flex space-x-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all duration-200 ${
                      activeTab === tab.id
                        ? 'bg-gradient-to-r from-blue-600/90 to-indigo-600/85 text-white shadow-lg'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Notifications Bar */}
          {showNotifications && stats.pendingApplications > 0 && (
            <div
              className={`mb-6 bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-200 rounded-xl p-4 ${animateClasses.fadeIn}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bell className="h-5 w-5 text-accent" />
                  <div>
                    <p className="font-semibold text-accent-foreground">
                      {stats.pendingApplications} applications need your attention
                    </p>
                    <p className="text-sm text-warning-strong">
                      Review pending applications to keep the process moving smoothly
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.location.href = '/admin/applications?status=submitted'}
                    className="text-yellow-700 border-yellow-300 hover:bg-accent/10"
                  >
                    Review Now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNotifications(false)}
                    aria-label="Hide notifications"
                  >
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          )}

        {/* Tab Content */}
          {activeTab === 'overview' && (
            <div
              className={`grid grid-cols-1 lg:grid-cols-4 gap-6 ${animateClasses.fadeIn}`}
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
            </div>
          )}

          {activeTab === 'monitoring' && (
            <div className={animateClasses.fadeIn}>
              <p className="text-muted-foreground text-sm">System monitoring has been removed.</p>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div
              className={`text-center py-6 sm:py-12 ${animateClasses.fadeIn}`}
            >
              <div className="text-6xl mb-4"><BarChart3 className="w-5 h-5" /></div>
              <h3 className="text-2xl font-bold text-foreground mb-2">Analytics</h3>
              <p className="text-foreground mb-6">Application statistics are available on the dashboard</p>
              <Button onClick={() => window.location.href = '/admin/dashboard'}>
                View Dashboard
              </Button>
            </div>
          )}

        {/* Quick Stats Footer */}
        <div 
          className={`mt-8 bg-card rounded-xl shadow-lg border border-border p-6 ${animateClasses.slideUp}`}
        >
          <h3 className="text-lg font-bold text-foreground mb-4"><TrendingUp className="w-5 h-5" /> Quick Insights</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-info-strong">
                {stats.approvedApplications + stats.rejectedApplications > 0 
                  ? Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)
                  : 0}%
              </div>
              <div className="text-sm text-foreground">Approval Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning-strong">{stats.avgProcessingTime} days</div>
              <div className="text-sm text-foreground">Avg Processing</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{stats.activeIntakes}</div>
              <div className="text-sm text-foreground">Active Intakes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">99.9%</div>
              <div className="text-sm text-foreground">System Uptime</div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
