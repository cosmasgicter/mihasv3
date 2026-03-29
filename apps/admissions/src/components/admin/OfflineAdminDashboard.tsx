import React from 'react'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { Button } from '@/components/ui/Button'
import { 
  Users, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  GraduationCap,
  Calendar,
  TrendingUp,
  AlertTriangle,
  RefreshCw
} from 'lucide-react'
import { Link } from 'react-router-dom'

export default function OfflineAdminDashboard() {
  const { profile } = useProfileQuery()

  // Mock data for offline mode
  const stats = {
    totalApplications: 156,
    pendingApplications: 23,
    approvedApplications: 98,
    rejectedApplications: 12,
    totalPrograms: 3,
    activeIntakes: 2,
    totalStudents: 134,
    todayApplications: 5,
    weekApplications: 18,
    monthApplications: 67,
    avgProcessingTime: 3,
    systemHealth: 'good' as const,
    activeUsers: 12
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">

      <main className="container mx-auto px-4 py-6 lg:py-8">
        {/* Network Status Banner */}
        <div
          className="rounded-xl bg-accent/5 border border-yellow-200 p-4 mb-6 shadow-lg"
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-warning flex-shrink-0" />
            <div className="text-sm text-yellow-700">
              <strong>Offline Mode:</strong> Network connectivity issues detected. Showing cached data.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.assign(window.location.pathname)}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>

        {/* Welcome Section */}
        <div
          className="mb-8"
        >
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                <div>
                  <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold mb-2 break-words">
                     Welcome back, {profile?.full_name || 'Admin'}!
                  </h1>
                  <p className="text-base sm:text-lg md:text-xl text-white/90 mb-4 break-words">
                    Here's your system overview for today
                  </p>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-warning/80"></div>
                      <span>System offline</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>{stats.activeUsers} active users</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-bold break-words">{stats.totalApplications}</div>
                  <div className="text-base text-white/80">Total Applications</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          {/* Today's Applications */}
          <div
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.todayApplications}</div>
                <div className="text-xs text-foreground">Today</div>
              </div>
            </div>
            <div className="text-sm font-medium text-foreground">New Applications</div>
          </div>

          {/* Decision Queue */}
          <div
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-accent/10 rounded-xl">
                <Clock className="h-6 w-6 text-accent" />
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.pendingApplications}</div>
                <div className="text-xs text-foreground">Queue</div>
              </div>
            </div>
            <div className="text-sm font-medium text-foreground">Decision Queue</div>
            <Link to="/admin/applications?status=submitted" className="text-xs text-primary hover:underline mt-2 block">
              Open queue →
            </Link>
          </div>

          {/* Approved Applications */}
          <div
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-accent/10 rounded-xl">
                <CheckCircle className="h-6 w-6 text-accent" />
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.approvedApplications}</div>
                <div className="text-xs text-foreground">Approved</div>
              </div>
            </div>
            <div className="text-sm font-medium text-foreground">Successful Applications</div>
          </div>

          {/* Processing Time */}
          <div
            className="bg-card rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-secondary/10 rounded-xl">
                <TrendingUp className="h-6 w-6 text-secondary" />
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-bold text-foreground break-words">{stats.avgProcessingTime}</div>
                <div className="text-xs text-foreground">Days</div>
              </div>
            </div>
            <div className="text-sm font-medium text-foreground">Avg Processing</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          <Link to="/admin/applications" className="block">
            <div className="bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border hover:border-primary/20">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Manage Applications</h3>
                  <p className="text-sm text-foreground">Review and process applications</p>
                </div>
              </div>
            </div>
          </Link>

          <Link to="/admin/users" className="block">
            <div className="bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border hover:border-primary/20">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-accent/10 rounded-xl">
                  <Users className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">User Management</h3>
                  <p className="text-sm text-foreground">Manage users and roles</p>
                </div>
              </div>
            </div>
          </Link>

          <Link to="/admin/programs" className="block">
            <div className="bg-card rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-border hover:border-primary/20">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-secondary/10 rounded-xl">
                  <GraduationCap className="h-6 w-6 text-secondary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Programs & Intakes</h3>
                  <p className="text-sm text-foreground">Manage academic programs</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* System Status */}
        <div
          className="bg-card rounded-2xl shadow-lg border border-border p-6"
        >
          <h3 className="text-lg font-bold text-foreground mb-4">System Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-info-strong">{stats.weekApplications}</div>
              <div className="text-sm text-foreground">Applications This Week</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{stats.avgProcessingTime}</div>
              <div className="text-sm text-foreground">Avg Processing Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning-strong">
                {Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)}%
              </div>
              <div className="text-sm text-foreground">Success Rate</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
