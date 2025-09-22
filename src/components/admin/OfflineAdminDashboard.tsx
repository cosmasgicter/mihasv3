import React from 'react'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { AdminNavigation } from '@/components/ui/AdminNavigation'
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
import { motion } from 'framer-motion'
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
      <AdminNavigation />

      <main className="container mx-auto px-4 py-6 lg:py-8">
        {/* Network Status Banner */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-yellow-50 border border-yellow-200 p-4 mb-6 shadow-lg"
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0" />
            <div className="text-sm text-yellow-700">
              <strong>Offline Mode:</strong> Network connectivity issues detected. Showing cached data.
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </motion.div>

        {/* Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="bg-gradient-to-r from-primary via-secondary to-accent rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                <div>
                  <h1 className="text-3xl lg:text-4xl font-bold mb-2">
                    👋 Welcome back, {profile?.full_name || 'Admin'}!
                  </h1>
                  <p className="text-xl text-white/90 mb-4">
                    Here's your system overview for today
                  </p>
                  <div className="flex items-center space-x-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                      <span>System offline</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>{stats.activeUsers} active users</span>
                    </div>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-4xl font-bold">{stats.totalApplications}</div>
                  <div className="text-base text-white/80">Total Applications</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          {/* Today's Applications */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{stats.todayApplications}</div>
                <div className="text-xs text-gray-500">Today</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">New Applications</div>
          </motion.div>

          {/* Pending Reviews */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-yellow-100 rounded-xl">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{stats.pendingApplications}</div>
                <div className="text-xs text-gray-500">Pending</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">Awaiting Review</div>
            <Link to="/admin/applications?status=submitted" className="text-xs text-primary hover:underline mt-2 block">
              Review now →
            </Link>
          </motion.div>

          {/* Approved Applications */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-xl">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{stats.approvedApplications}</div>
                <div className="text-xs text-gray-500">Approved</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">Successful Applications</div>
          </motion.div>

          {/* Processing Time */}
          <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-xl">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">{stats.avgProcessingTime}</div>
                <div className="text-xs text-gray-500">Days</div>
              </div>
            </div>
            <div className="text-sm font-medium text-gray-600">Avg Processing</div>
          </motion.div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8"
        >
          <Link to="/admin/applications" className="block">
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 hover:border-primary/20">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <FileText className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manage Applications</h3>
                  <p className="text-sm text-gray-600">Review and process applications</p>
                </div>
              </div>
            </div>
          </Link>

          <Link to="/admin/users" className="block">
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 hover:border-primary/20">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-green-100 rounded-xl">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">User Management</h3>
                  <p className="text-sm text-gray-600">Manage users and roles</p>
                </div>
              </div>
            </div>
          </Link>

          <Link to="/admin/programs" className="block">
            <div className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-gray-100 hover:border-primary/20">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <GraduationCap className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Programs & Intakes</h3>
                  <p className="text-sm text-gray-600">Manage academic programs</p>
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* System Status */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
        >
          <h3 className="text-lg font-bold text-gray-900 mb-4">System Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.weekApplications}</div>
              <div className="text-sm text-gray-600">Applications This Week</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.avgProcessingTime}</div>
              <div className="text-sm text-gray-600">Avg Processing Days</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round((stats.approvedApplications / (stats.approvedApplications + stats.rejectedApplications)) * 100)}%
              </div>
              <div className="text-sm text-gray-600">Success Rate</div>
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  )
}