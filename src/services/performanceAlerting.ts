import { apiClient } from './client'
import { systemMonitoringService, PerformanceAlert, SystemMetrics, DatabaseMetrics } from './systemMonitoring'

/**
 * Alert Configuration Interface
 */
export interface AlertConfiguration {
  id: string
  name: string
  type: 'response_time' | 'error_rate' | 'resource_usage' | 'database_slow' | 'system_health'
  threshold: number
  severity: 'low' | 'medium' | 'high' | 'critical'
  enabled: boolean
  escalationRules: EscalationRule[]
  cooldownPeriod: number // minutes
  metadata?: Record<string, any>
}

/**
 * Escalation Rule Interface
 */
export interface EscalationRule {
  level: number
  delayMinutes: number
  recipients: string[]
  channels: ('email' | 'sms' | 'webhook')[]
  message?: string
}

/**
 * Alert Remediation Suggestion Interface
 */
export interface RemediationSuggestion {
  alertType: string
  severity: string
  suggestions: Array<{
    action: string
    description: string
    priority: 'high' | 'medium' | 'low'
    estimatedImpact: string
    implementationSteps: string[]
  }>
}

/**
 * Automated Performance Alerting Service
 * Detects performance degradation and generates remediation suggestions
 * Validates Requirements 8.2
 */
class PerformanceAlertingService {
  private alertConfigurations: Map<string, AlertConfiguration> = new Map()
  private activeAlerts: Map<string, PerformanceAlert> = new Map()
  private alertHistory: PerformanceAlert[] = []
  private escalationTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    this.initializeDefaultAlertConfigurations()
  }

  /**
   * Initialize default alert configurations
   */
  private initializeDefaultAlertConfigurations(): void {
    const defaultConfigs: AlertConfiguration[] = [
      {
        id: 'response_time_high',
        name: 'High Response Time',
        type: 'response_time',
        threshold: 2000, // 2 seconds
        severity: 'high',
        enabled: true,
        cooldownPeriod: 15,
        escalationRules: [
          {
            level: 1,
            delayMinutes: 0,
            recipients: ['***REMOVED***'],
            channels: ['email'],
            message: 'Response time threshold exceeded'
          },
          {
            level: 2,
            delayMinutes: 10,
            recipients: ['***REMOVED***', 'tech@mihas.edu.zm'],
            channels: ['email', 'sms'],
            message: 'Critical response time issue - immediate attention required'
          }
        ]
      },
      {
        id: 'error_rate_high',
        name: 'High Error Rate',
        type: 'error_rate',
        threshold: 0.05, // 5%
        severity: 'critical',
        enabled: true,
        cooldownPeriod: 10,
        escalationRules: [
          {
            level: 1,
            delayMinutes: 0,
            recipients: ['***REMOVED***'],
            channels: ['email', 'sms'],
            message: 'Error rate threshold exceeded'
          }
        ]
      },
      {
        id: 'database_slow',
        name: 'Slow Database Queries',
        type: 'database_slow',
        threshold: 1000, // 1 second
        severity: 'medium',
        enabled: true,
        cooldownPeriod: 20,
        escalationRules: [
          {
            level: 1,
            delayMinutes: 0,
            recipients: ['***REMOVED***'],
            channels: ['email'],
            message: 'Database performance degradation detected'
          }
        ]
      }
    ]

    defaultConfigs.forEach(config => {
      this.alertConfigurations.set(config.id, config)
    })
  }

  /**
   * Start automated performance monitoring and alerting
   */
  startAutomatedAlerting(checkIntervalMs: number = 60000): () => void {
    const interval = setInterval(async () => {
      try {
        await this.checkPerformanceThresholds()
      } catch (error) {
        console.error('Automated alerting error:', error)
      }
    }, checkIntervalMs)

    return () => clearInterval(interval)
  }

  /**
   * Check performance thresholds and generate alerts
   */
  async checkPerformanceThresholds(): Promise<void> {
    try {
      // Get current system metrics
      const systemMetrics = await systemMonitoringService.getSystemMetrics()
      const databaseMetrics = await systemMonitoringService.getDatabaseMetrics()

      // Check each alert configuration
      for (const [configId, config] of this.alertConfigurations) {
        if (!config.enabled) continue

        const alertTriggered = await this.evaluateAlertCondition(config, systemMetrics, databaseMetrics)
        
        if (alertTriggered) {
          await this.handleAlertTriggered(config, systemMetrics, databaseMetrics)
        }
      }

      // Check for resolved alerts
      await this.checkResolvedAlerts(systemMetrics, databaseMetrics)
    } catch (error) {
      console.error('Error checking performance thresholds:', error)
    }
  }

  /**
   * Evaluate if an alert condition is met
   */
  private async evaluateAlertCondition(
    config: AlertConfiguration,
    systemMetrics: SystemMetrics,
    databaseMetrics: DatabaseMetrics
  ): Promise<boolean> {
    switch (config.type) {
      case 'response_time':
        return systemMetrics.responseTime.average > config.threshold

      case 'error_rate':
        return systemMetrics.errorRate.rate > config.threshold

      case 'database_slow':
        return databaseMetrics.queryPerformance.averageExecutionTime > config.threshold

      case 'resource_usage':
        return systemMetrics.resourceUtilization.cpu > config.threshold ||
               systemMetrics.resourceUtilization.memory > config.threshold

      case 'system_health':
        const systemHealth = await systemMonitoringService.getSystemHealth()
        return systemHealth.overall === 'critical' || systemHealth.overall === 'degraded'

      default:
        return false
    }
  }

  /**
   * Handle when an alert is triggered
   */
  private async handleAlertTriggered(
    config: AlertConfiguration,
    systemMetrics: SystemMetrics,
    databaseMetrics: DatabaseMetrics
  ): Promise<void> {
    const alertKey = `${config.id}_${Date.now()}`
    
    // Check cooldown period
    if (this.isInCooldownPeriod(config.id)) {
      return
    }

    // Get current value based on alert type
    const currentValue = this.getCurrentValue(config.type, systemMetrics, databaseMetrics)

    // Create alert
    const alert: PerformanceAlert = {
      id: alertKey,
      type: config.type,
      severity: config.severity,
      message: this.generateAlertMessage(config, currentValue),
      threshold: config.threshold,
      currentValue,
      timestamp: new Date().toISOString(),
      resolved: false,
      metadata: {
        configId: config.id,
        configName: config.name,
        systemMetrics,
        databaseMetrics
      }
    }

    // Store alert
    this.activeAlerts.set(alertKey, alert)
    this.alertHistory.push(alert)

    // Send alert through monitoring service
    await systemMonitoringService.createAlert(alert)

    // Start escalation process
    await this.startEscalationProcess(config, alert)

    console.log(`Alert triggered: ${config.name} - ${alert.message}`)
  }

  /**
   * Start escalation process for an alert
   */
  private async startEscalationProcess(config: AlertConfiguration, alert: PerformanceAlert): Promise<void> {
    for (const rule of config.escalationRules) {
      const escalationTimer = setTimeout(async () => {
        try {
          await this.executeEscalationRule(rule, alert, config)
        } catch (error) {
          console.error('Escalation rule execution error:', error)
        }
      }, rule.delayMinutes * 60 * 1000)

      this.escalationTimers.set(`${alert.id}_${rule.level}`, escalationTimer)
    }
  }

  /**
   * Execute an escalation rule
   */
  private async executeEscalationRule(
    rule: EscalationRule,
    alert: PerformanceAlert,
    config: AlertConfiguration
  ): Promise<void> {
    // Generate remediation suggestions
    const suggestions = this.generateRemediationSuggestions(alert)

    // Send notifications through configured channels
    for (const channel of rule.channels) {
      try {
        await this.sendAlertNotification(channel, rule, alert, config, suggestions)
      } catch (error) {
        console.error(`Failed to send alert via ${channel}:`, error)
      }
    }
  }

  /**
   * Send alert notification through specified channel
   */
  private async sendAlertNotification(
    channel: 'email' | 'sms' | 'webhook',
    rule: EscalationRule,
    alert: PerformanceAlert,
    config: AlertConfiguration,
    suggestions: RemediationSuggestion
  ): Promise<void> {
    const message = this.formatAlertMessage(alert, config, suggestions, rule.message)

    switch (channel) {
      case 'email':
        await this.sendEmailAlert(rule.recipients, message, alert)
        break
      case 'sms':
        await this.sendSMSAlert(rule.recipients, message, alert)
        break
      case 'webhook':
        await this.sendWebhookAlert(message, alert)
        break
    }
  }

  /**
   * Generate remediation suggestions for an alert
   */
  generateRemediationSuggestions(alert: PerformanceAlert): RemediationSuggestion {
    const suggestions: RemediationSuggestion = {
      alertType: alert.type,
      severity: alert.severity,
      suggestions: []
    }

    switch (alert.type) {
      case 'response_time':
        suggestions.suggestions = [
          {
            action: 'Check Database Performance',
            description: 'Review slow queries and optimize database indexes',
            priority: 'high',
            estimatedImpact: 'Reduce response time by 30-50%',
            implementationSteps: [
              'Run database performance analysis',
              'Identify slow queries from logs',
              'Add missing indexes',
              'Optimize query execution plans'
            ]
          },
          {
            action: 'Scale Resources',
            description: 'Increase server resources or enable auto-scaling',
            priority: 'medium',
            estimatedImpact: 'Improve response time by 20-40%',
            implementationSteps: [
              'Monitor resource utilization',
              'Scale up server instances',
              'Enable auto-scaling policies',
              'Load balance traffic'
            ]
          }
        ]
        break

      case 'error_rate':
        suggestions.suggestions = [
          {
            action: 'Review Error Logs',
            description: 'Analyze recent error patterns and fix critical bugs',
            priority: 'high',
            estimatedImpact: 'Reduce error rate by 60-80%',
            implementationSteps: [
              'Check application error logs',
              'Identify common error patterns',
              'Fix critical bugs',
              'Deploy hotfixes'
            ]
          },
          {
            action: 'Implement Circuit Breakers',
            description: 'Add circuit breakers to prevent cascade failures',
            priority: 'medium',
            estimatedImpact: 'Prevent system-wide failures',
            implementationSteps: [
              'Identify critical service dependencies',
              'Implement circuit breaker pattern',
              'Configure failure thresholds',
              'Add fallback mechanisms'
            ]
          }
        ]
        break

      case 'database_slow':
        suggestions.suggestions = [
          {
            action: 'Optimize Database Queries',
            description: 'Review and optimize slow-performing queries',
            priority: 'high',
            estimatedImpact: 'Improve query performance by 50-70%',
            implementationSteps: [
              'Identify slow queries using EXPLAIN',
              'Add appropriate indexes',
              'Rewrite inefficient queries',
              'Update table statistics'
            ]
          },
          {
            action: 'Database Maintenance',
            description: 'Perform routine database maintenance tasks',
            priority: 'medium',
            estimatedImpact: 'Improve overall database performance',
            implementationSteps: [
              'Run VACUUM and ANALYZE',
              'Update table statistics',
              'Check for table bloat',
              'Optimize configuration parameters'
            ]
          }
        ]
        break

      default:
        suggestions.suggestions = [
          {
            action: 'Monitor System Health',
            description: 'Review system metrics and logs for issues',
            priority: 'medium',
            estimatedImpact: 'Identify root cause of performance issues',
            implementationSteps: [
              'Check system resource usage',
              'Review application logs',
              'Monitor network connectivity',
              'Verify service dependencies'
            ]
          }
        ]
    }

    return suggestions
  }

  /**
   * Check if alerts have been resolved
   */
  private async checkResolvedAlerts(
    systemMetrics: SystemMetrics,
    databaseMetrics: DatabaseMetrics
  ): Promise<void> {
    for (const [alertKey, alert] of this.activeAlerts) {
      if (alert.resolved) continue

      const config = this.alertConfigurations.get(alert.metadata?.configId)
      if (!config) continue

      const isResolved = await this.isAlertResolved(config, alert, systemMetrics, databaseMetrics)
      
      if (isResolved) {
        await this.resolveAlert(alertKey, alert)
      }
    }
  }

  /**
   * Check if an alert condition is resolved
   */
  private async isAlertResolved(
    config: AlertConfiguration,
    alert: PerformanceAlert,
    systemMetrics: SystemMetrics,
    databaseMetrics: DatabaseMetrics
  ): Promise<boolean> {
    const currentValue = this.getCurrentValue(config.type, systemMetrics, databaseMetrics)
    
    // Alert is resolved if current value is below threshold with some buffer
    const buffer = config.threshold * 0.1 // 10% buffer
    return currentValue < (config.threshold - buffer)
  }

  /**
   * Resolve an alert
   */
  private async resolveAlert(alertKey: string, alert: PerformanceAlert): Promise<void> {
    // Mark alert as resolved
    alert.resolved = true
    alert.metadata = { ...alert.metadata, resolvedAt: new Date().toISOString() }

    // Clear escalation timers
    this.clearEscalationTimers(alertKey)

    // Remove from active alerts
    this.activeAlerts.delete(alertKey)

    // Update in monitoring service
    await systemMonitoringService.resolveAlert(alert.id)

    console.log(`Alert resolved: ${alert.message}`)
  }

  /**
   * Clear escalation timers for an alert
   */
  private clearEscalationTimers(alertKey: string): void {
    for (const [timerKey, timer] of this.escalationTimers) {
      if (timerKey.startsWith(alertKey)) {
        clearTimeout(timer)
        this.escalationTimers.delete(timerKey)
      }
    }
  }

  /**
   * Check if alert is in cooldown period
   */
  private isInCooldownPeriod(configId: string): boolean {
    const cooldownKey = `cooldown_${configId}`
    const lastAlert = this.alertHistory
      .filter(alert => alert.metadata?.configId === configId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

    if (!lastAlert) return false

    const config = this.alertConfigurations.get(configId)
    if (!config) return false

    const cooldownMs = config.cooldownPeriod * 60 * 1000
    const timeSinceLastAlert = Date.now() - new Date(lastAlert.timestamp).getTime()

    return timeSinceLastAlert < cooldownMs
  }

  /**
   * Get current value for alert type
   */
  private getCurrentValue(
    type: string,
    systemMetrics: SystemMetrics,
    databaseMetrics: DatabaseMetrics
  ): number {
    switch (type) {
      case 'response_time':
        return systemMetrics.responseTime.average
      case 'error_rate':
        return systemMetrics.errorRate.rate
      case 'database_slow':
        return databaseMetrics.queryPerformance.averageExecutionTime
      case 'resource_usage':
        return Math.max(systemMetrics.resourceUtilization.cpu, systemMetrics.resourceUtilization.memory)
      default:
        return 0
    }
  }

  /**
   * Generate alert message
   */
  private generateAlertMessage(config: AlertConfiguration, currentValue: number): string {
    const unit = this.getValueUnit(config.type)
    return `${config.name}: Current value ${currentValue}${unit} exceeds threshold ${config.threshold}${unit}`
  }

  /**
   * Get unit for value type
   */
  private getValueUnit(type: string): string {
    switch (type) {
      case 'response_time':
      case 'database_slow':
        return 'ms'
      case 'error_rate':
        return '%'
      case 'resource_usage':
        return '%'
      default:
        return ''
    }
  }

  /**
   * Format alert message for notifications
   */
  private formatAlertMessage(
    alert: PerformanceAlert,
    config: AlertConfiguration,
    suggestions: RemediationSuggestion,
    customMessage?: string
  ): string {
    let message = customMessage || alert.message
    message += `\n\nSeverity: ${alert.severity.toUpperCase()}`
    message += `\nTimestamp: ${alert.timestamp}`
    
    if (suggestions.suggestions.length > 0) {
      message += '\n\nRecommended Actions:'
      suggestions.suggestions.forEach((suggestion, index) => {
        message += `\n${index + 1}. ${suggestion.action}: ${suggestion.description}`
      })
    }

    return message
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(recipients: string[], message: string, alert: PerformanceAlert): Promise<void> {
    try {
      await apiClient.request('/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          type: 'email',
          recipients,
          subject: `MIHAS System Alert: ${alert.type}`,
          message,
          priority: alert.severity === 'critical' ? 'high' : 'normal'
        })
      })
    } catch (error) {
      console.error('Failed to send email alert:', error)
    }
  }

  /**
   * Send SMS alert
   */
  private async sendSMSAlert(recipients: string[], message: string, alert: PerformanceAlert): Promise<void> {
    try {
      await apiClient.request('/notifications/send', {
        method: 'POST',
        body: JSON.stringify({
          type: 'sms',
          recipients,
          message: message.substring(0, 160), // SMS length limit
          priority: alert.severity === 'critical' ? 'high' : 'normal'
        })
      })
    } catch (error) {
      console.error('Failed to send SMS alert:', error)
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(message: string, alert: PerformanceAlert): Promise<void> {
    try {
      // Implementation would depend on webhook configuration
      console.log('Webhook alert:', { message, alert })
    } catch (error) {
      console.error('Failed to send webhook alert:', error)
    }
  }

  /**
   * Get alert configuration
   */
  getAlertConfiguration(configId: string): AlertConfiguration | undefined {
    return this.alertConfigurations.get(configId)
  }

  /**
   * Update alert configuration
   */
  updateAlertConfiguration(configId: string, updates: Partial<AlertConfiguration>): void {
    const existing = this.alertConfigurations.get(configId)
    if (existing) {
      this.alertConfigurations.set(configId, { ...existing, ...updates })
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values())
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit: number = 100): PerformanceAlert[] {
    return this.alertHistory
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }
}

export const performanceAlertingService = new PerformanceAlertingService()