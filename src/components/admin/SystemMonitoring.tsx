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
        return 'text-success bg-accent/10'
      case 'warning':
        return 'text-warning bg-accent/10'
      case 'critical':
        return 'text-error bg-destructive/10'
      default:
        return 'text-foreground bg-accent'
    }
  }

  const getPerformanceColor = (value: number) => {
    if (value < 50) return 'bg-success'
    if (value < 80) return 'bg-warning'
    return 'bg-error'
  }

  return (
    <div className="space-y-6">
      {/* System Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-accent/10 rounded-xl">
              <Database className="h-6 w-6 text-accent" />
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(metrics.database.status)}`}>
              {metrics.database.status.toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-foreground mb-2">Database</h3>
          <div className="space-y-1 text-sm text-foreground">
            <div>Connections: {metrics.database.connections}</div>
            <div>Response: {metrics.database.responseTime}ms</div>
            <div>Uptime: {metrics.database.uptime}</div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary-foreground">
              OPTIMAL
            </span>
          </div>
          <h3 className="font-semibold text-foreground mb-2">Performance</h3>
          <div className="space-y-1 text-sm text-foreground">
            <div>CPU: {metrics.performance.cpu}%</div>
            <div>Memory: {metrics.performance.memory}%</div>
            <div>Storage: {metrics.performance.storage}%</div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-secondary/10 rounded-xl">
              <Shield className="h-6 w-6 text-secondary" />
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(metrics.security.status)}`}>
              {metrics.security.status.toUpperCase()}
            </span>
          </div>
          <h3 className="font-semibold text-foreground mb-2">Security</h3>
          <div className="space-y-1 text-sm text-foreground">
            <div>Last Scan: {metrics.security.lastScan}</div>
            <div>Threats: {metrics.security.threats}</div>
            <div>Updates: {metrics.security.updates}</div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Users className="h-6 w-6 text-secondary" />
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-indigo-800">
              ACTIVE
            </span>
          </div>
          <h3 className="font-semibold text-foreground mb-2">Users</h3>
          <div className="space-y-1 text-sm text-foreground">
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
        className="bg-card rounded-xl shadow-lg border border-border"
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground flex items-center">
            <Zap className="h-5 w-5 mr-2" />
            Performance Metrics
          </h3>
          <button
            onClick={refreshMetrics}
            disabled={refreshing}
            className="p-2 text-foreground hover:text-foreground transition-colors"
          >
            <Activity className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">CPU Usage</span>
                </div>
                <span className="text-sm font-bold text-foreground">{metrics.performance.cpu}%</span>
              </div>
              <div className="w-full bg-skeleton rounded-full h-2">
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
                  <span className="text-sm font-medium text-foreground">Memory</span>
                </div>
                <span className="text-sm font-bold text-foreground">{metrics.performance.memory}%</span>
              </div>
              <div className="w-full bg-skeleton rounded-full h-2">
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
                  <HardDrive className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-foreground">Storage</span>
                </div>
                <span className="text-sm font-bold text-foreground">{metrics.performance.storage}%</span>
              </div>
              <div className="w-full bg-skeleton rounded-full h-2">
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
                  <span className="text-sm font-medium text-foreground">Network</span>
                </div>
                <span className="text-sm font-bold text-foreground">{metrics.performance.network}%</span>
              </div>
              <div className="w-full bg-skeleton rounded-full h-2">
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
        className="bg-card rounded-xl shadow-lg border border-border"
      >
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2" />
            System Health
          </h3>
        </div>
        
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-4 bg-accent/10 rounded-xl border border-accent/30">
              <CheckCircle className="h-5 w-5 text-accent" />
              <div className="flex-1">
                <p className="font-medium text-accent-foreground">All Systems Operational</p>
                <p className="text-sm text-accent">No critical issues detected</p>
              </div>
              <span className="text-xs text-accent">Just now</span>
            </div>

            <div className="flex items-center space-x-3 p-4 bg-primary/5 rounded-xl border border-primary/30">
              <Clock className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-primary-foreground">Scheduled Maintenance</p>
                <p className="text-sm text-primary">Database optimization planned for tonight</p>
              </div>
              <span className="text-xs text-primary">2 hours</span>
            </div>

            <div className="flex items-center space-x-3 p-4 bg-accent/5 rounded-xl border border-yellow-200">
              <TrendingUp className="h-5 w-5 text-accent" />
              <div className="flex-1">
                <p className="font-medium text-accent-foreground">High Memory Usage</p>
                <p className="text-sm text-accent">Memory usage is above 65% threshold</p>
              </div>
              <span className="text-xs text-accent">5 min ago</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Real-time Activity */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="bg-card rounded-xl shadow-lg border border-border"
      >
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-foreground flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Real-time Activity
          </h3>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl">
              <div className="text-2xl font-bold text-primary">{metrics.users.active}</div>
              <div className="text-sm text-foreground">Active Users</div>
              <div className="flex items-center justify-center mt-2 text-xs text-accent">
                <TrendingUp className="h-3 w-3 mr-1" />
                +12% from yesterday
              </div>
            </div>

            <div className="text-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
              <div className="text-2xl font-bold text-accent">{metrics.database.connections}</div>
              <div className="text-sm text-foreground">DB Connections</div>
              <div className="flex items-center justify-center mt-2 text-xs text-primary">
                <Activity className="h-3 w-3 mr-1" />
                Normal load
              </div>
            </div>

            <div className="text-center p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl">
              <div className="text-2xl font-bold text-foreground">{metrics.database.responseTime}ms</div>
              <div className="text-sm text-foreground">Response Time</div>
              <div className="flex items-center justify-center mt-2 text-xs text-accent">
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