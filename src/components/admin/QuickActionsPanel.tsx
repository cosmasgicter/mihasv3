import React from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  FileText, 
  BarChart3, 
  GraduationCap, 
  Users, 
  Settings,
  Download,
  Activity,
  Bell,
  Shield,
  Zap,
  ScrollText
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface QuickActionsPanelProps {
  stats: {
    pendingApplications: number
    totalPrograms: number
    totalStudents: number
  }
}

export function QuickActionsPanel({ stats }: QuickActionsPanelProps) {
  const quickActions = [
    {
      title: 'Applications',
      description: `${stats.pendingApplications} pending review`,
      icon: FileText,
      href: '/admin/applications',
      color: 'from-primary to-secondary',
      urgent: stats.pendingApplications > 0
    },
    {
      title: 'Analytics',
      description: 'View insights & reports',
      icon: BarChart3,
      href: '/admin/analytics',
      color: 'from-green-500 to-emerald-600',
      urgent: false
    },
    {
      title: 'Programs',
      description: `${stats.totalPrograms} active programs`,
      icon: GraduationCap,
      href: '/admin/programs',
      color: 'from-purple-500 to-indigo-600',
      urgent: false
    },
    {
      title: 'Users',
      description: `${stats.totalStudents} students`,
      icon: Users,
      href: '/admin/users',
      color: 'from-blue-500 to-cyan-600',
      urgent: false
    }
  ]

  const systemActions = [
    {
      title: 'Settings',
      icon: Settings,
      href: '/admin/settings',
      description: 'System configuration'
    },
    {
      title: 'Monitoring',
      icon: Activity,
      href: '/admin/monitoring',
      description: 'System health'
    },
    {
      title: 'Security',
      icon: Shield,
      href: '/admin/security',
      description: 'Security settings'
    },
    {
      title: 'Audit trail',
      icon: ScrollText,
      href: '/admin/audit',
      description: 'Review system activity'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">⚡ Quick Actions</h3>
          <p className="text-sm text-gray-600 mt-1">Manage your system efficiently</p>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon
              return (
                <Link key={action.title} to={action.href}>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="group relative"
                  >
                    <Button 
                      className={`w-full h-24 flex flex-col items-center justify-center space-y-2 bg-gradient-to-r ${action.color} hover:shadow-xl transition-all duration-300 relative overflow-hidden`}
                    >
                      {action.urgent && (
                        <div className="absolute top-2 right-2">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        </div>
                      )}
                      <Icon className="h-6 w-6 group-hover:scale-110 transition-transform" />
                      <span className="font-semibold text-sm">{action.title}</span>
                      {action.urgent && (
                        <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                          {action.description}
                        </span>
                      )}
                    </Button>
                  </motion.div>
                </Link>
              )
            })}
          </div>
        </div>
      </motion.div>

      {/* System Tools */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-white rounded-2xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">🛠️ System Tools</h3>
        </div>
        
        <div className="p-6 space-y-3">
          {systemActions.map((action, index) => {
            const Icon = action.icon
            return (
              <Link key={action.title} to={action.href}>
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button 
                    variant="outline" 
                    className="w-full justify-start h-12 border-2 hover:border-primary hover:bg-primary/5 transition-all duration-300"
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    <div className="text-left">
                      <div className="font-medium">{action.title}</div>
                      <div className="text-xs text-gray-500">{action.description}</div>
                    </div>
                  </Button>
                </motion.div>
              </Link>
            )
          })}
          
          {/* Quick Export */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <Button 
              variant="outline" 
              className="w-full justify-start h-12 border-2 hover:border-accent hover:bg-accent/5 transition-all duration-300"
              onClick={() => {
                // Export functionality
                console.log('Export data')
              }}
            >
              <Download className="h-4 w-4 mr-3" />
              <div className="text-left">
                <div className="font-medium">Export Data</div>
                <div className="text-xs text-gray-500">Download reports</div>
              </div>
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200"
      >
        <h3 className="text-lg font-bold text-gray-900 mb-4">📊 Quick Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.pendingApplications}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.totalPrograms}</div>
            <div className="text-sm text-gray-600">Programs</div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}