import React, { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'
import { Activity, Users, FileText, Clock, TrendingUp, RefreshCw, Zap } from 'lucide-react'

interface RealtimeMetrics {
  activeApplications: number
  todaySubmissions: number
  pendingReviews: number
  averageProcessingTime: number
  systemLoad: number
  lastUpdated: string
}

export default function RealtimeMetrics() {
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const { error: showError } = useToastStore()

  useEffect(() => {
    loadMetrics()

    // Auto-refresh every 30 seconds if enabled
    if (autoRefresh) {
      const interval = setInterval(loadMetrics, 30000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const loadMetrics = async () => {
    try {
      const response = await fetch('/analytics/realtime-metrics', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to load real-time metrics')
      }

      const data = await response.json()
      setMetrics(data)
      setLoading(false)
    } catch (error) {
      console.error('Failed to load metrics:', error)
      showError('Failed to load real-time metrics', error instanceof Error ? error.message : undefined)
      setLoading(false)
    }
  }

  const getSystemLoadColor = (load: number) => {
    if (load >= 80) return 'text-error'
    if (load >= 60) return 'text-warning'
    return 'text-success'
  }

  const getSystemLoadBg = (load: number) => {
    if (load >= 80) return 'bg-error/10'
    if (load >= 60) return 'bg-warning/10'
    return 'bg-success/10'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
                <Activity className="w-6 h-6" />
                Real-time Metrics
              </h1>
              <p className="text-sm text-white/90 mt-2">
                Live system performance and application metrics
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded border-white/30"
                />
                <span>Auto-refresh (30s)</span>
              </label>
              <Button
                onClick={loadMetrics}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Now
              </Button>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <div className="bg-card rounded-xl shadow border border-border p-4 mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock className="h-4 w-4" />
            <span>Last updated: {metrics?.lastUpdated ? new Date(metrics.lastUpdated).toLocaleTimeString() : 'N/A'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-success animate-pulse' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-600">{autoRefresh ? 'Live' : 'Paused'}</span>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Active Applications */}
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-2xl">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div className="text-right">
                <p className="text-3xl sm:text-4xl font-bold text-primary">
                  {metrics?.activeApplications || 0}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Active Applications</p>
              <p className="text-xs text-gray-600 mt-1">Draft, submitted, or under review</p>
            </div>
          </div>

          {/* Today's Submissions */}
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-success/10 rounded-2xl">
                <TrendingUp className="h-8 w-8 text-success" />
              </div>
              <div className="text-right">
                <p className="text-3xl sm:text-4xl font-bold text-success">
                  {metrics?.todaySubmissions || 0}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Today's Submissions</p>
              <p className="text-xs text-gray-600 mt-1">Applications submitted today</p>
            </div>
          </div>

          {/* Pending Reviews */}
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-warning/10 rounded-2xl">
                <Users className="h-8 w-8 text-warning" />
              </div>
              <div className="text-right">
                <p className="text-3xl sm:text-4xl font-bold text-warning">
                  {metrics?.pendingReviews || 0}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">Pending Reviews</p>
              <p className="text-xs text-gray-600 mt-1">Awaiting admin review</p>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Average Processing Time */}
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-accent/10 rounded-2xl">
                  <Clock className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Average Processing Time</p>
                  <p className="text-xs text-gray-600">Last 30 days</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-accent">
                  {metrics?.averageProcessingTime?.toFixed(1) || 0}
                </p>
                <p className="text-sm text-gray-600">days</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-accent rounded-full h-2 transition-all duration-500"
                  style={{ width: `${Math.min(100, (metrics?.averageProcessingTime || 0) * 10)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0 days</span>
                <span>10+ days</span>
              </div>
            </div>
          </div>

          {/* System Load */}
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`p-3 rounded-2xl ${getSystemLoadBg(metrics?.systemLoad || 0)}`}>
                  <Zap className={`h-6 w-6 ${getSystemLoadColor(metrics?.systemLoad || 0)}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">System Load</p>
                  <p className="text-xs text-gray-600">Current activity level</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${getSystemLoadColor(metrics?.systemLoad || 0)}`}>
                  {metrics?.systemLoad || 0}%
                </p>
                <p className="text-sm text-gray-600">
                  {(metrics?.systemLoad || 0) >= 80 ? 'High' : (metrics?.systemLoad || 0) >= 60 ? 'Medium' : 'Low'}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className={`rounded-full h-2 transition-all duration-500 ${
                    (metrics?.systemLoad || 0) >= 80 ? 'bg-error' : 
                    (metrics?.systemLoad || 0) >= 60 ? 'bg-warning' : 
                    'bg-success'
                  }`}
                  style={{ width: `${metrics?.systemLoad || 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-card rounded-2xl shadow-lg border border-border p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            System Status
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
              <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
              <div>
                <p className="text-sm font-medium text-gray-900">Database</p>
                <p className="text-xs text-gray-600">Operational</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
              <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
              <div>
                <p className="text-sm font-medium text-gray-900">API</p>
                <p className="text-xs text-gray-600">Operational</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
              <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
              <div>
                <p className="text-sm font-medium text-gray-900">Storage</p>
                <p className="text-xs text-gray-600">Operational</p>
              </div>
            </div>
            <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
              <div className="h-3 w-3 rounded-full bg-success animate-pulse" />
              <div>
                <p className="text-sm font-medium text-gray-900">Auth</p>
                <p className="text-xs text-gray-600">Operational</p>
              </div>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <Activity className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">Real-time Monitoring</p>
              <p className="text-xs text-blue-700 mt-1">
                Metrics are updated every 30 seconds when auto-refresh is enabled. 
                System load is calculated based on recent activity in the last hour.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
