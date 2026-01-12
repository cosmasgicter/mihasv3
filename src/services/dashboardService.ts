import { apiClient } from './client'
import { metricsTrackingService } from './metricsTracking'
import type { 
  DashboardLayout, 
  DashboardConfig, 
  ExecutiveSummaryReport,
  DashboardWidget,
  DashboardKPI,
  DashboardChart,
  DashboardAlert
} from '@/types/dashboard'
import type { MetricsQuery } from '@/types/analytics'

/**
 * Real-time Dashboard Service
 * Generates dynamic dashboards with current KPIs and real-time updates
 * Validates Requirements 5.2
 */
class DashboardService {
  private refreshIntervals: Map<string, NodeJS.Timeout> = new Map()
  private dataCache: Map<string, { data: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 30000 // 30 seconds

  /**
   * Generate a complete dashboard layout with real-time data
   */
  async generateDashboard(config: {
    layoutId?: string
    timeRange?: MetricsQuery['timeRange']
    includeAlerts?: boolean
  }): Promise<DashboardLayout> {
    const { layoutId = 'default', timeRange, includeAlerts = true } = config

    // Get real-time metrics
    const realTimeMetrics = await metricsTrackingService.getRealTimeMetrics()
    
    // Get comprehensive metrics if time range provided
    let comprehensiveMetrics = null
    if (timeRange) {
      const result = await metricsTrackingService.getComprehensiveMetrics({
        timeRange,
        includeTimeSeries: true,
        includeProcessingTimes: true
      })
      comprehensiveMetrics = result.data
    }

    // Generate KPI widgets
    const kpiWidgets = this.generateKPIWidgets(realTimeMetrics, comprehensiveMetrics)
    
    // Generate chart widgets
    const chartWidgets = this.generateChartWidgets(comprehensiveMetrics)
    
    // Generate alert widgets
    const alertWidgets = includeAlerts ? await this.generateAlertWidgets() : []

    const widgets: DashboardWidget[] = [
      ...kpiWidgets,
      ...chartWidgets,
      ...alertWidgets
    ]

    return {
      id: layoutId,
      name: 'MIHAS Analytics Dashboard',
      description: 'Real-time analytics and metrics for the MIHAS application system',
      widgets,
      refreshInterval: 30, // 30 seconds
      autoRefresh: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  /**
   * Generate executive summary report for administrators
   */
  async generateExecutiveSummary(timeRange: MetricsQuery['timeRange']): Promise<ExecutiveSummaryReport> {
    const result = await metricsTrackingService.getComprehensiveMetrics({
      timeRange,
      includeTimeSeries: true,
      includeProcessingTimes: true
    })

    if (!result.success || !result.data) {
      throw new Error('Failed to generate executive summary: ' + result.error)
    }

    const metrics = result.data
    const realTimeMetrics = await metricsTrackingService.getRealTimeMetrics()

    // Calculate system health score
    const systemHealth = this.calculateSystemHealth(metrics, realTimeMetrics)
    
    // Generate key metrics
    const keyMetrics: DashboardKPI[] = [
      {
        id: 'total-applications',
        title: 'Total Applications',
        value: metrics.applicationMetrics.totalApplications,
        format: 'number',
        color: 'primary'
      },
      {
        id: 'completion-rate',
        title: 'Completion Rate',
        value: metrics.applicationMetrics.completionRate,
        format: 'percentage',
        color: 'success'
      },
      {
        id: 'approval-rate',
        title: 'Approval Rate',
        value: metrics.applicationMetrics.approvalRate,
        format: 'percentage',
        color: 'info'
      },
      {
        id: 'avg-processing-time',
        title: 'Avg Processing Time',
        value: metrics.processingTimeMetrics.averageOverallProcessing,
        format: 'duration',
        color: 'warning'
      }
    ]

    // Generate trends
    const trends = {
      applications: this.calculateTrend(metrics.timeSeriesData.applications),
      approvals: this.calculateTrend(metrics.timeSeriesData.approvals),
      processingTime: this.calculateTrend(metrics.timeSeriesData.processingTimes)
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(metrics, realTimeMetrics)

    // Get current alerts
    const alerts = await this.generateAlertWidgets()

    return {
      id: `exec-summary-${Date.now()}`,
      title: 'MIHAS System Executive Summary',
      generatedAt: new Date().toISOString(),
      timeRange: {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
        label: this.formatTimeRangeLabel(timeRange)
      },
      summary: {
        totalApplications: metrics.applicationMetrics.totalApplications,
        completionRate: metrics.applicationMetrics.completionRate,
        approvalRate: metrics.applicationMetrics.approvalRate,
        averageProcessingTime: metrics.processingTimeMetrics.averageOverallProcessing,
        systemHealth
      },
      keyMetrics,
      trends,
      recommendations,
      alerts: alerts.map(widget => widget.data as DashboardAlert)
    }
  }

  /**
   * Start real-time data updates for a dashboard
   */
  startRealTimeUpdates(dashboardId: string, callback: (layout: DashboardLayout) => void, intervalSeconds = 30): void {
    // Clear existing interval if any
    this.stopRealTimeUpdates(dashboardId)

    const interval = setInterval(async () => {
      try {
        const layout = await this.generateDashboard({ layoutId: dashboardId })
        callback(layout)
      } catch (error) {
        console.error('Failed to update dashboard:', error)
      }
    }, intervalSeconds * 1000)

    this.refreshIntervals.set(dashboardId, interval)
  }

  /**
   * Stop real-time updates for a dashboard
   */
  stopRealTimeUpdates(dashboardId: string): void {
    const interval = this.refreshIntervals.get(dashboardId)
    if (interval) {
      clearInterval(interval)
      this.refreshIntervals.delete(dashboardId)
    }
  }

  /**
   * Get cached data or fetch fresh data
   */
  private async getCachedData<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.dataCache.get(key)
    const now = Date.now()

    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      return cached.data as T
    }

    const data = await fetcher()
    this.dataCache.set(key, { data, timestamp: now })
    return data
  }

  /**
   * Generate KPI widgets from metrics data
   */
  private generateKPIWidgets(realTimeMetrics: any, comprehensiveMetrics: any): DashboardWidget[] {
    const widgets: DashboardWidget[] = [
      {
        id: 'active-applications',
        title: 'Active Applications',
        type: 'kpi',
        size: 'small',
        position: { row: 0, col: 0 },
        data: {
          id: 'active-applications',
          title: 'Active Applications',
          value: realTimeMetrics.activeApplications,
          format: 'number',
          color: 'primary',
          icon: 'applications'
        } as DashboardKPI,
        refreshInterval: 30
      },
      {
        id: 'today-submissions',
        title: "Today's Submissions",
        type: 'kpi',
        size: 'small',
        position: { row: 0, col: 1 },
        data: {
          id: 'today-submissions',
          title: "Today's Submissions",
          value: realTimeMetrics.todaySubmissions,
          format: 'number',
          color: 'success',
          icon: 'submit'
        } as DashboardKPI,
        refreshInterval: 30
      },
      {
        id: 'pending-reviews',
        title: 'Pending Reviews',
        type: 'kpi',
        size: 'small',
        position: { row: 0, col: 2 },
        data: {
          id: 'pending-reviews',
          title: 'Pending Reviews',
          value: realTimeMetrics.pendingReviews,
          format: 'number',
          color: 'warning',
          icon: 'review'
        } as DashboardKPI,
        refreshInterval: 30
      },
      {
        id: 'avg-processing-time',
        title: 'Avg Processing Time',
        type: 'kpi',
        size: 'small',
        position: { row: 0, col: 3 },
        data: {
          id: 'avg-processing-time',
          title: 'Avg Processing Time',
          value: `${realTimeMetrics.averageProcessingTime} days`,
          format: 'duration',
          color: 'info',
          icon: 'clock'
        } as DashboardKPI,
        refreshInterval: 30
      }
    ]

    // Add comprehensive metrics KPIs if available
    if (comprehensiveMetrics) {
      widgets.push({
        id: 'completion-rate',
        title: 'Completion Rate',
        type: 'kpi',
        size: 'small',
        position: { row: 1, col: 0 },
        data: {
          id: 'completion-rate',
          title: 'Completion Rate',
          value: comprehensiveMetrics.applicationMetrics.completionRate,
          format: 'percentage',
          color: 'success',
          icon: 'check'
        } as DashboardKPI,
        refreshInterval: 300
      })

      widgets.push({
        id: 'approval-rate',
        title: 'Approval Rate',
        type: 'kpi',
        size: 'small',
        position: { row: 1, col: 1 },
        data: {
          id: 'approval-rate',
          title: 'Approval Rate',
          value: comprehensiveMetrics.applicationMetrics.approvalRate,
          format: 'percentage',
          color: 'primary',
          icon: 'approve'
        } as DashboardKPI,
        refreshInterval: 300
      })
    }

    return widgets
  }

  /**
   * Generate chart widgets from metrics data
   */
  private generateChartWidgets(comprehensiveMetrics: any): DashboardWidget[] {
    if (!comprehensiveMetrics) return []

    const widgets: DashboardWidget[] = []

    // Applications over time chart
    if (comprehensiveMetrics.timeSeriesData.applications.length > 0) {
      widgets.push({
        id: 'applications-timeline',
        title: 'Applications Over Time',
        type: 'chart',
        size: 'large',
        position: { row: 2, col: 0 },
        data: {
          id: 'applications-timeline',
          title: 'Applications Over Time',
          type: 'line',
          data: comprehensiveMetrics.timeSeriesData.applications.map((point: any) => ({
            x: new Date(point.timestamp).toLocaleDateString(),
            y: point.value,
            label: `${point.value} applications`
          })),
          xAxisLabel: 'Date',
          yAxisLabel: 'Applications',
          showLegend: false
        } as DashboardChart,
        refreshInterval: 300
      })
    }

    // Program distribution chart
    if (comprehensiveMetrics.programMetrics.length > 0) {
      widgets.push({
        id: 'program-distribution',
        title: 'Applications by Program',
        type: 'chart',
        size: 'medium',
        position: { row: 2, col: 2 },
        data: {
          id: 'program-distribution',
          title: 'Applications by Program',
          type: 'pie',
          data: comprehensiveMetrics.programMetrics.map((program: any) => ({
            x: program.programName,
            y: program.totalApplications,
            label: `${program.programName}: ${program.totalApplications}`
          })),
          showLegend: true
        } as DashboardChart,
        refreshInterval: 300
      })
    }

    return widgets
  }

  /**
   * Generate alert widgets based on system conditions
   */
  private async generateAlertWidgets(): Promise<DashboardWidget[]> {
    const alerts: DashboardAlert[] = []
    const realTimeMetrics = await metricsTrackingService.getRealTimeMetrics()

    // Check for high pending reviews
    if (realTimeMetrics.pendingReviews > 50) {
      alerts.push({
        id: 'high-pending-reviews',
        title: 'High Pending Reviews',
        message: `${realTimeMetrics.pendingReviews} applications are pending review. Consider allocating more review resources.`,
        severity: 'warning',
        timestamp: new Date().toISOString(),
        actionable: true,
        actionUrl: '/admin/applications?status=submitted'
      })
    }

    // Check for high system load
    if (realTimeMetrics.systemLoad > 80) {
      alerts.push({
        id: 'high-system-load',
        title: 'High System Load',
        message: `System load is at ${realTimeMetrics.systemLoad}%. Monitor performance closely.`,
        severity: 'error',
        timestamp: new Date().toISOString(),
        actionable: true,
        actionUrl: '/admin/system-health'
      })
    }

    // Check for slow processing times
    if (realTimeMetrics.averageProcessingTime > 7) {
      alerts.push({
        id: 'slow-processing',
        title: 'Slow Processing Times',
        message: `Average processing time is ${realTimeMetrics.averageProcessingTime} days. Review workflow efficiency.`,
        severity: 'warning',
        timestamp: new Date().toISOString(),
        actionable: true,
        actionUrl: '/admin/workflow-analysis'
      })
    }

    return alerts.map((alert, index) => ({
      id: `alert-${index}`,
      title: alert.title,
      type: 'alert' as const,
      size: 'medium' as const,
      position: { row: 3 + Math.floor(index / 2), col: index % 2 },
      data: alert,
      refreshInterval: 60
    }))
  }

  /**
   * Calculate system health score
   */
  private calculateSystemHealth(metrics: any, realTimeMetrics: any): 'excellent' | 'good' | 'fair' | 'poor' {
    let score = 100

    // Deduct points for low completion rate
    if (metrics.applicationMetrics.completionRate < 80) score -= 20
    else if (metrics.applicationMetrics.completionRate < 90) score -= 10

    // Deduct points for slow processing
    if (realTimeMetrics.averageProcessingTime > 10) score -= 30
    else if (realTimeMetrics.averageProcessingTime > 7) score -= 15

    // Deduct points for high system load
    if (realTimeMetrics.systemLoad > 90) score -= 25
    else if (realTimeMetrics.systemLoad > 80) score -= 10

    // Deduct points for high pending reviews
    if (realTimeMetrics.pendingReviews > 100) score -= 20
    else if (realTimeMetrics.pendingReviews > 50) score -= 10

    if (score >= 90) return 'excellent'
    if (score >= 75) return 'good'
    if (score >= 60) return 'fair'
    return 'poor'
  }

  /**
   * Calculate trend direction from time series data
   */
  private calculateTrend(timeSeriesData: any[]): 'up' | 'down' | 'stable' {
    if (timeSeriesData.length < 2) return 'stable'

    const recent = timeSeriesData.slice(-5) // Last 5 data points
    const older = timeSeriesData.slice(-10, -5) // Previous 5 data points

    if (recent.length === 0 || older.length === 0) return 'stable'

    const recentAvg = recent.reduce((sum, point) => sum + point.value, 0) / recent.length
    const olderAvg = older.reduce((sum, point) => sum + point.value, 0) / older.length

    const change = ((recentAvg - olderAvg) / olderAvg) * 100

    if (change > 5) return 'up'
    if (change < -5) return 'down'
    return 'stable'
  }

  /**
   * Generate recommendations based on metrics
   */
  private generateRecommendations(metrics: any, realTimeMetrics: any): string[] {
    const recommendations: string[] = []

    if (metrics.applicationMetrics.completionRate < 80) {
      recommendations.push('Consider improving the application process to increase completion rates')
    }

    if (realTimeMetrics.averageProcessingTime > 7) {
      recommendations.push('Review and optimize the application review workflow to reduce processing times')
    }

    if (realTimeMetrics.pendingReviews > 50) {
      recommendations.push('Allocate additional resources to application review to reduce backlog')
    }

    if (metrics.conversionMetrics.registrationToApplication < 50) {
      recommendations.push('Improve user onboarding to increase registration to application conversion')
    }

    if (realTimeMetrics.systemLoad > 80) {
      recommendations.push('Monitor system performance and consider scaling resources during peak usage')
    }

    return recommendations
  }

  /**
   * Format time range label for display
   */
  private formatTimeRangeLabel(timeRange: MetricsQuery['timeRange']): string {
    const start = new Date(timeRange.startDate).toLocaleDateString()
    const end = new Date(timeRange.endDate).toLocaleDateString()
    return `${start} - ${end}`
  }
}

export const dashboardService = new DashboardService()