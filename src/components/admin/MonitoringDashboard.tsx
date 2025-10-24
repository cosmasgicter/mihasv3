import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Activity, Database, AlertCircle, TrendingUp, Users, FileText } from 'lucide-react'

interface Metrics {
  system: { status: string; uptime: number; lastCheck: string }
  performance: { applications24h: number; applications1h: number; avgResponseTime: number; activeUsers: number }
  database: { status: string; totalApplications: number; totalUsers: number; connections: number }
  errors: { count24h: number; critical: number; warnings: number }
  activity: { auditLogs24h: number; workflows24h: number; notifications24h: number }
}

export function MonitoringDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchMetrics = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch('/api/monitoring/metrics', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
      })
      
      if (response.ok) {
        const data = await response.json()
        setMetrics(data)
      }
    } catch (error) {
      console.error('Failed to fetch metrics:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className="text-center py-8">Loading metrics...</div>
  }

  if (!metrics) {
    return <div className="text-center py-8 text-destructive">Failed to load metrics</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">System Monitoring</h2>
        <span className="text-sm text-muted-foreground">Last updated: {new Date(metrics.system.lastCheck).toLocaleTimeString()}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">System Status</p>
              <p className="text-2xl font-bold text-success">{metrics.system.status}</p>
              <p className="text-xs text-muted-foreground mt-1">Uptime: {metrics.system.uptime}%</p>
            </div>
            <Activity className="h-8 w-8 text-success" />
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Database</p>
              <p className="text-2xl font-bold text-success">{metrics.database.status}</p>
              <p className="text-xs text-muted-foreground mt-1">{metrics.database.connections} connections</p>
            </div>
            <Database className="h-8 w-8 text-success" />
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Errors (24h)</p>
              <p className="text-2xl font-bold text-warning">{metrics.errors.count24h}</p>
              <p className="text-xs text-muted-foreground mt-1">{metrics.errors.critical} critical</p>
            </div>
            <AlertCircle className="h-8 w-8 text-warning" />
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Active Users</p>
              <p className="text-2xl font-bold">{metrics.performance.activeUsers}</p>
              <p className="text-xs text-muted-foreground mt-1">of {metrics.database.totalUsers} total</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Performance Metrics
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Applications (24h)</span>
              <span className="font-semibold">{metrics.performance.applications24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Applications (1h)</span>
              <span className="font-semibold">{metrics.performance.applications1h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Response Time</span>
              <span className="font-semibold">{metrics.performance.avgResponseTime}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Applications</span>
              <span className="font-semibold">{metrics.database.totalApplications}</span>
            </div>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Activity (24h)
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Audit Logs</span>
              <span className="font-semibold">{metrics.activity.auditLogs24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Workflows Executed</span>
              <span className="font-semibold">{metrics.activity.workflows24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Notifications Sent</span>
              <span className="font-semibold">{metrics.activity.notifications24h}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Failed Workflows</span>
              <span className="font-semibold text-warning">{metrics.errors.warnings}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}