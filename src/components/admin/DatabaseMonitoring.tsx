// Database Monitoring and Maintenance Dashboard
import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useErrorHandling } from '@/hooks/useErrorHandling'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AlertTriangle, CheckCircle, Database, RefreshCw, Archive, Shield } from 'lucide-react'

interface DatabaseMetric {
  metric: string
  current_value: number
  status: 'normal' | 'warning' | 'critical'
  message: string
}

interface ErrorStatistic {
  error_code: string
  error_count: number
  last_occurrence: string
  recovery_rate: number
}

interface IntegrityIssue {
  issue_type: string
  issue_count: number
  repaired_count: number
  description: string
}

export default function DatabaseMonitoring() {
  const [metrics, setMetrics] = useState<DatabaseMetric[]>([])
  const [errorStats, setErrorStats] = useState<ErrorStatistic[]>([])
  const [integrityResults, setIntegrityResults] = useState<IntegrityIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [maintenanceRunning, setMaintenanceRunning] = useState(false)
  const [archiveRunning, setArchiveRunning] = useState(false)
  
  const { executeWithErrorHandling, errorState } = useErrorHandling()

  useEffect(() => {
    loadDashboardData()
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const loadDashboardData = async () => {
    setLoading(true)
    
    await Promise.all([
      loadHealthMetrics(),
      loadErrorStatistics(),
      loadIntegrityStatus()
    ])
    
    setLoading(false)
  }

  const loadHealthMetrics = async () => {
    const result = await executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase.rpc('check_database_health')
        if (error) throw error
        return data
      },
      'load_health_metrics'
    )
    
    if (result) {
      setMetrics(result)
    }
  }

  const loadErrorStatistics = async () => {
    const result = await executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase.rpc('get_error_statistics', { p_hours: 24 })
        if (error) throw error
        return data
      },
      'load_error_statistics'
    )
    
    if (result) {
      setErrorStats(result)
    }
  }

  const loadIntegrityStatus = async () => {
    const result = await executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase.rpc('check_data_integrity')
        if (error) throw error
        return data
      },
      'load_integrity_status'
    )
    
    if (result) {
      setIntegrityResults(result)
    }
  }

  const runMaintenance = async () => {
    setMaintenanceRunning(true)
    
    const result = await executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase.rpc('perform_maintenance')
        if (error) throw error
        return data
      },
      'run_maintenance'
    )
    
    if (result) {
      alert('Maintenance completed successfully')
      await loadDashboardData()
    }
    
    setMaintenanceRunning(false)
  }

  const archiveOldApplications = async () => {
    setArchiveRunning(true)
    
    const result = await executeWithErrorHandling(
      async () => {
        const { data, error } = await supabase.rpc('archive_old_applications')
        if (error) throw error
        return data
      },
      'archive_applications'
    )
    
    if (result) {
      alert(`Archived ${result} old applications`)
      await loadDashboardData()
    }
    
    setArchiveRunning(false)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'normal':
        return <CheckCircle className="w-5 h-5 text-success" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-warning" />
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-error" />
      default:
        return <Database className="w-5 h-5 text-foreground" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'normal':
        return 'bg-green-50 border-green-200'
      case 'warning':
        return 'bg-yellow-50 border-yellow-200'
      case 'critical':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-muted border-border'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Database Monitoring</h1>
        <div className="flex space-x-3">
          <Button
            onClick={loadDashboardData}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={runMaintenance}
            variant="outline"
            size="sm"
            disabled={maintenanceRunning}
          >
            <Database className="w-4 h-4 mr-2" />
            {maintenanceRunning ? 'Running...' : 'Run Maintenance'}
          </Button>
          <Button
            onClick={archiveOldApplications}
            variant="outline"
            size="sm"
            disabled={archiveRunning}
          >
            <Archive className="w-4 h-4 mr-2" />
            {archiveRunning ? 'Archiving...' : 'Archive Old Data'}
          </Button>
        </div>
      </div>

      {errorState.hasError && (
        <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-error mr-2" />
            <span className="text-error">
              Error: {errorState.error?.message}
            </span>
          </div>
        </div>
      )}

      {/* Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${getStatusColor(metric.status)}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-foreground">
                {metric.metric.replace(/_/g, ' ').toUpperCase()}
              </h3>
              {getStatusIcon(metric.status)}
            </div>
            <p className="text-2xl font-bold text-foreground">
              {metric.current_value.toLocaleString()}
            </p>
            <p className="text-sm text-foreground mt-1">
              {metric.message}
            </p>
          </div>
        ))}
      </div>

      {/* Error Statistics */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center">
          <Shield className="w-5 h-5 mr-2" />
          Error Statistics (Last 24 Hours)
        </h2>
        
        {errorStats.length === 0 ? (
          <p className="text-foreground">No errors recorded in the last 24 hours</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Error Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Count
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Last Occurrence
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-foreground uppercase tracking-wider">
                    Recovery Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {errorStats.map((stat, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                      {stat.error_code}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {stat.error_count}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {new Date(stat.last_occurrence).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {stat.recovery_rate ? `${stat.recovery_rate}%` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Data Integrity */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Data Integrity Status
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrityResults.map((issue, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                issue.issue_count > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-foreground">
                  {issue.issue_type.replace(/_/g, ' ').toUpperCase()}
                </h3>
                {issue.issue_count > 0 ? (
                  <AlertTriangle className="w-5 h-5 text-warning" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-success" />
                )}
              </div>
              <p className="text-sm text-foreground mb-2">
                {issue.description}
              </p>
              <div className="flex justify-between text-sm">
                <span>Issues Found: {issue.issue_count}</span>
                <span>Repaired: {issue.repaired_count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}