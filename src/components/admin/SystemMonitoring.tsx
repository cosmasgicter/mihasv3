import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  Activity, 
  Database, 
  Shield, 
  Zap, 
  Users, 
  Server, 
  Wifi, 
  HardDrive,
  Cpu,
  MemoryStick,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react'

interface SystemMetrics {
  database: {
    status: 'healthy' | 'warning' | 'critical'
    connections: number
    responseTime: number
    uptime: string
  }
  performance: {
    cpu: number
    memory: number
    storage: number
    network: number
  }
  security: {
    status: 'secure' | 'warning' | 'critical'
    lastScan: string
    threats: number
    updates: number
  }
  users: {
    active: number
    total: number
    sessions: number
    avgSessionTime: number
  }
}

export function SystemMonitoring() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    database: {
      status: 'healthy',
      connections: 45,
      responseTime: 120,
      uptime: '99.9%'
    },
    performance: {
      cpu: 35,
      memory: 68,
      storage: 42,
      network: 78
    },
    security: {
      status: 'secure',
      lastScan: '2 hours ago',
      threats: 0,
      updates: 3
    },
    users: {
      active: 23,
      total: 156,
      sessions: 31,
      avgSessionTime: 18
    }
  })

  const [refreshing, setRefreshing] = useState(false)

  const refreshMetrics = async () => {
    setRefreshing(true)
    // Simulate API call
    setTimeout(() => {
      setMetrics(prev => ({
        ...prev,
        performance: {
          cpu: Math.floor(Math.random() * 40) + 20,
          memory: Math.floor(Math.random() * 30) + 50,
          storage: Math.floor(Math.random() * 20) + 35,
          network: Math.floor(Math.random() * 40) + 60
        },
        users: {
          ...prev.users,
          active: Math.floor(Math.random() * 20) + 15,
          sessions: Math.floor(Math.random() * 15) + 20
        }
      }))
      setRefreshing(false)
    }, 1000)
  }

  useEffect(() => {
    const interval = setInterval(refreshMetrics, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'secure':
        return 'text-green-600 bg-green-100'
      case 'warning':
        return 'text-yellow-600 bg-yellow-100'
      case 'critical':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getPerformanceColor = (value: number) => {
    if (value < 50) return 'bg-green-500'
    if (value < 80) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-6">
      {/* System Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-xl">
              <Database className="h-6 w-6 text-green-600" />
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(metrics.database.status)}`}>
              {metrics.database.status.toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Database</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div>Connections: {metrics.database.connections}</div>
            <div>Response: {metrics.database.responseTime}ms</div>
            <div>Uptime: {metrics.database.uptime}</div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-xl">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
              OPTIMAL
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Performance</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div>CPU: {metrics.performance.cpu}%</div>
            <div>Memory: {metrics.performance.memory}%</div>
            <div>Storage: {metrics.performance.storage}%</div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-xl">
              <Shield className="h-6 w-6 text-purple-600" />
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(metrics.security.status)}`}>
              {metrics.security.status.toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Security</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div>Last Scan: {metrics.security.lastScan}</div>
            <div>Threats: {metrics.security.threats}</div>
            <div>Updates: {metrics.security.updates}</div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl p-6 shadow-lg border border-gray-100"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-indigo-100 rounded-xl">
              <Users className="h-6 w-6 text-indigo-600" />
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              ACTIVE
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Users</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div>Active: {metrics.users.active}</div>
            <div>Sessions: {metrics.users.sessions}</div>
            <div>Avg Time: {metrics.users.avgSessionTime}min</div>
          </div>
        </motion.div>
      </div>

      {/* Performance Metrics */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Zap className="h-5 w-5 mr-2" />
            Performance Metrics
          </h3>
          <button
            onClick={refreshMetrics}
            disabled={refreshing}
            className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Activity className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium text-gray-700">CPU Usage</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{metrics.performance.cpu}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div 
                  className={`h-2 rounded-full ${getPerformanceColor(metrics.performance.cpu)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.performance.cpu}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <MemoryStick className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium text-gray-700">Memory</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{metrics.performance.memory}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div 
                  className={`h-2 rounded-full ${getPerformanceColor(metrics.performance.memory)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.performance.memory}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <HardDrive className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-gray-700">Storage</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{metrics.performance.storage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div 
                  className={`h-2 rounded-full ${getPerformanceColor(metrics.performance.storage)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.performance.storage}%` }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wifi className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-gray-700">Network</span>
                </div>
                <span className="text-sm font-bold text-gray-900">{metrics.performance.network}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <motion.div 
                  className={`h-2 rounded-full ${getPerformanceColor(metrics.performance.network)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${metrics.performance.network}%` }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* System Health Alerts */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            System Health
          </h3>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-4 bg-green-50 rounded-xl border border-green-200">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="font-medium text-green-800">All Systems Operational</p>
                <p className="text-sm text-green-600">No critical issues detected</p>
              </div>
              <span className="text-xs text-green-600">Just now</span>
            </div>

            <div className="flex items-center space-x-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <Clock className="h-5 w-5 text-blue-600" />
              <div className="flex-1">
                <p className="font-medium text-blue-800">Scheduled Maintenance</p>
                <p className="text-sm text-blue-600">Database optimization planned for tonight</p>
              </div>
              <span className="text-xs text-blue-600">2 hours</span>
            </div>

            <div className="flex items-center space-x-3 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <TrendingUp className="h-5 w-5 text-yellow-600" />
              <div className="flex-1">
                <p className="font-medium text-yellow-800">High Memory Usage</p>
                <p className="text-sm text-yellow-600">Memory usage is above 65% threshold</p>
              </div>
              <span className="text-xs text-yellow-600">5 min ago</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Real-time Activity */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-white rounded-xl shadow-lg border border-gray-100"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Real-time Activity
          </h3>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
              <div className="text-2xl font-bold text-blue-600">{metrics.users.active}</div>
              <div className="text-sm text-gray-600">Active Users</div>
              <div className="flex items-center justify-center mt-2 text-xs text-green-600">
                <TrendingUp className="h-3 w-3 mr-1" />
                +12% from yesterday
              </div>
            </div>

            <div className="text-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
              <div className="text-2xl font-bold text-green-600">{metrics.database.connections}</div>
              <div className="text-sm text-gray-600">DB Connections</div>
              <div className="flex items-center justify-center mt-2 text-xs text-blue-600">
                <Activity className="h-3 w-3 mr-1" />
                Normal load
              </div>
            </div>

            <div className="text-center p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
              <div className="text-2xl font-bold text-purple-600">{metrics.database.responseTime}ms</div>
              <div className="text-sm text-gray-600">Response Time</div>
              <div className="flex items-center justify-center mt-2 text-xs text-green-600">
                <TrendingDown className="h-3 w-3 mr-1" />
                -5ms improvement
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}