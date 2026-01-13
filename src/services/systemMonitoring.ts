import { apiClient } from './client'

/**
 * System Performance Metrics Interface
 */
export interface SystemMetrics {
  timestamp: string
  responseTime: {
    average: number
    p95: number
    p99: number
  }
  errorRate: {
    total: number
    rate: number
    byEndpoint: Record<string, number>
  }
  resourceUtilization: {
    cpu: number
    memory: number
    database: {
      connections: number
      queryTime: number
      slowQueries: number
    }
  }
  throughput: {
    requestsPerSecond: number
    requestsPerMinute: number
  }
}

/**
 * Database Performance Metrics Interface
 */
export interface DatabaseMetrics {
  timestamp: string
  queryPerformance: {
    averageExecutionTime: number
    slowQueries: Array<{
      query: string
      executionTime: number
      frequency: number
    }>
    totalQueries: number
  }
  connectionPool: {
    active: number
    idle: number
    waiting: number
    maxConnections: number
  }
  tableStats: Array<{
    tableName: string
    size: string
    rowCount: number
    indexUsage: number
  }>
}

/**
 * Performance Alert Interface
 */
export interface PerformanceAlert {
  id: string
  type: 'response_time' | 'error_rate' | 'resource_usage' | 'database_slow' | 'system_health'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  threshold: number
  currentValue: number
  timestamp: string
  resolved: boolean
  metadata?: Record<string, any>
}

/**
 * System Health Status Interface
 */
export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical'
  components: {
    api: 'healthy' | 'degraded' | 'down'
    database: 'healthy' | 'degraded' | 'down'
    storage: 'healthy' | 'degraded' | 'down'
    notifications: 'healthy' | 'degraded' | 'down'
  }
  uptime: number
  lastCheck: string
}

/**
 * Comprehensive System Monitoring Service
 * Tracks response times, error rates, and resource utilization
 * Validates Requirements 8.1
 */
class SystemMonitoringService {
  private metricsBuffer: SystemMetrics[] = []
  private alertsBuffer: PerformanceAlert[] = []
  private readonly maxBufferSize = 1000
  private monitoringInterval: NodeJS.Timeout | null = null

  /**
   * Get current system performance metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    try {
      const response = await apiClient.request('/monitoring/system-metrics')
      return response as SystemMetrics
    } catch (error) {
      throw new Error(`Failed to fetch system metrics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get database performance metrics and query execution times
   */
  async getDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
      const response = await apiClient.request('/monitoring/database-metrics')
      return response as DatabaseMetrics
    } catch (error) {
      throw new Error(`Failed to fetch database metrics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get system health status across all components
   */
  async getSystemHealth(): Promise<SystemHealth> {
    try {
      const response = await apiClient.request('/monitoring/health')
      return response as SystemHealth
    } catch (error) {
      throw new Error(`Failed to fetch system health: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get active performance alerts
   */
  async getActiveAlerts(): Promise<PerformanceAlert[]> {
    try {
      const response = await apiClient.request('/monitoring/alerts')
      return response as PerformanceAlert[]
    } catch (error) {
      throw new Error(`Failed to fetch alerts: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Track API response time for monitoring
   */
  trackResponseTime(endpoint: string, responseTime: number, statusCode: number): void {
    // Store in local buffer for real-time monitoring
    const timestamp = new Date().toISOString()
    
    // Send to monitoring endpoint asynchronously
    this.sendMetricAsync({
      type: 'response_time',
      endpoint,
      value: responseTime,
      statusCode,
      timestamp
    })
  }

  /**
   * Track error occurrence for monitoring
   */
  trackError(endpoint: string, error: Error, statusCode?: number): void {
    const timestamp = new Date().toISOString()
    
    // Send to monitoring endpoint asynchronously
    this.sendMetricAsync({
      type: 'error',
      endpoint,
      error: error.message,
      statusCode: statusCode || 500,
      timestamp
    })
  }

  /**
   * Track resource utilization metrics
   */
  async trackResourceUtilization(): Promise<void> {
    try {
      // Get current resource usage
      const metrics = await this.getSystemMetrics()
      
      // Check for threshold violations
      await this.checkResourceThresholds(metrics)
      
      // Store in buffer
      this.addToBuffer(metrics)
    } catch (error) {
      console.error('Failed to track resource utilization:', error)
    }
  }

  /**
   * Get historical metrics for a time range
   */
  async getHistoricalMetrics(
    startTime: string,
    endTime: string,
    granularity: 'minute' | 'hour' | 'day' = 'hour'
  ): Promise<SystemMetrics[]> {
    try {
      const response = await apiClient.request('/monitoring/historical-metrics', {
        method: 'POST',
        body: JSON.stringify({
          startTime,
          endTime,
          granularity
        })
      })
      return response as SystemMetrics[]
    } catch (error) {
      throw new Error(`Failed to fetch historical metrics: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Create a performance alert
   */
  async createAlert(alert: Omit<PerformanceAlert, 'id' | 'timestamp' | 'resolved'>): Promise<PerformanceAlert> {
    try {
      const response = await apiClient.request('/monitoring/alerts', {
        method: 'POST',
        body: JSON.stringify({
          ...alert,
          timestamp: new Date().toISOString(),
          resolved: false
        })
      })
      return response as PerformanceAlert
    } catch (error) {
      throw new Error(`Failed to create alert: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Resolve a performance alert
   */
  async resolveAlert(alertId: string): Promise<void> {
    try {
      await apiClient.request(`/monitoring/alerts/${alertId}/resolve`, {
        method: 'PATCH'
      })
    } catch (error) {
      throw new Error(`Failed to resolve alert: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get real-time monitoring dashboard data
   */
  async getDashboardData(): Promise<{
    systemHealth: SystemHealth
    currentMetrics: SystemMetrics
    databaseMetrics: DatabaseMetrics
    activeAlerts: PerformanceAlert[]
    recentTrends: {
      responseTime: number[]
      errorRate: number[]
      throughput: number[]
    }
  }> {
    try {
      const [systemHealth, currentMetrics, databaseMetrics, activeAlerts] = await Promise.all([
        this.getSystemHealth(),
        this.getSystemMetrics(),
        this.getDatabaseMetrics(),
        this.getActiveAlerts()
      ])

      // Get recent trends from buffer
      const recentMetrics = this.metricsBuffer.slice(-24) // Last 24 data points
      const recentTrends = {
        responseTime: recentMetrics.map(m => m.responseTime.average),
        errorRate: recentMetrics.map(m => m.errorRate.rate),
        throughput: recentMetrics.map(m => m.throughput.requestsPerSecond)
      }

      return {
        systemHealth,
        currentMetrics,
        databaseMetrics,
        activeAlerts,
        recentTrends
      }
    } catch (error) {
      throw new Error(`Failed to fetch dashboard data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Start real-time monitoring with specified interval
   */
  startRealTimeMonitoring(intervalMs: number = 60000): () => void {
    // Clear existing interval if any
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.trackResourceUtilization()
      } catch (error) {
        console.error('Real-time monitoring error:', error)
      }
    }, intervalMs)

    // Return cleanup function
    return () => {
      if (this.monitoringInterval) {
        clearInterval(this.monitoringInterval)
        this.monitoringInterval = null
      }
    }
  }

  /**
   * Private method to send metrics asynchronously
   */
  private async sendMetricAsync(metric: any): Promise<void> {
    try {
      await apiClient.request('/monitoring/track-metric', {
        method: 'POST',
        body: JSON.stringify(metric)
      })
    } catch (error) {
      // Log error but don't throw to avoid disrupting main application flow
      console.error('Failed to send metric:', error)
    }
  }

  /**
   * Private method to check resource thresholds and create alerts
   */
  private async checkResourceThresholds(metrics: SystemMetrics): Promise<void> {
    const alerts: Omit<PerformanceAlert, 'id' | 'timestamp' | 'resolved'>[] = []

    // Check response time threshold (>2000ms)
    if (metrics.responseTime.average > 2000) {
      alerts.push({
        type: 'response_time',
        severity: metrics.responseTime.average > 5000 ? 'critical' : 'high',
        message: `Average response time is ${metrics.responseTime.average}ms`,
        threshold: 2000,
        currentValue: metrics.responseTime.average
      })
    }

    // Check error rate threshold (>5%)
    if (metrics.errorRate.rate > 0.05) {
      alerts.push({
        type: 'error_rate',
        severity: metrics.errorRate.rate > 0.1 ? 'critical' : 'high',
        message: `Error rate is ${(metrics.errorRate.rate * 100).toFixed(2)}%`,
        threshold: 0.05,
        currentValue: metrics.errorRate.rate
      })
    }

    // Check database query time threshold (>1000ms)
    if (metrics.resourceUtilization.database.queryTime > 1000) {
      alerts.push({
        type: 'database_slow',
        severity: metrics.resourceUtilization.database.queryTime > 3000 ? 'critical' : 'high',
        message: `Database query time is ${metrics.resourceUtilization.database.queryTime}ms`,
        threshold: 1000,
        currentValue: metrics.resourceUtilization.database.queryTime
      })
    }

    // Create alerts
    for (const alert of alerts) {
      try {
        const createdAlert = await this.createAlert(alert)
        this.addAlertToBuffer(createdAlert)
      } catch (error) {
        console.error('Failed to create alert:', error)
      }
    }
  }

  /**
   * Private method to add metrics to buffer
   */
  private addToBuffer(metrics: SystemMetrics): void {
    this.metricsBuffer.push(metrics)
    
    // Keep buffer size manageable
    if (this.metricsBuffer.length > this.maxBufferSize) {
      this.metricsBuffer = this.metricsBuffer.slice(-this.maxBufferSize)
    }
  }

  /**
   * Add alert to buffer for local tracking
   */
  private addAlertToBuffer(alert: PerformanceAlert): void {
    this.alertsBuffer.push(alert)
    
    // Keep buffer size manageable
    if (this.alertsBuffer.length > this.maxBufferSize) {
      this.alertsBuffer = this.alertsBuffer.slice(-this.maxBufferSize)
    }
  }

  /**
   * Get buffered alerts
   */
  getBufferedAlerts(): PerformanceAlert[] {
    return [...this.alertsBuffer]
  }

  /**
   * Clear resolved alerts from buffer
   */
  clearResolvedAlerts(): void {
    this.alertsBuffer = this.alertsBuffer.filter(alert => !alert.resolved)
  }
}

export const systemMonitoringService = new SystemMonitoringService()