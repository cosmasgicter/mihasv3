import { apiClient } from './client'
import { systemMonitoringService, SystemMetrics } from './systemMonitoring'

/**
 * Scaling Configuration Interface
 */
export interface ScalingConfiguration {
  id: string
  name: string
  enabled: boolean
  triggers: ScalingTrigger[]
  actions: ScalingAction[]
  cooldownPeriod: number // minutes
  minInstances: number
  maxInstances: number
  targetMetrics: {
    cpuUtilization: number
    memoryUtilization: number
    responseTime: number
    errorRate: number
    requestsPerSecond: number
  }
}

/**
 * Scaling Trigger Interface
 */
export interface ScalingTrigger {
  id: string
  metric: 'cpu' | 'memory' | 'response_time' | 'error_rate' | 'requests_per_second' | 'queue_depth'
  operator: 'greater_than' | 'less_than' | 'equals'
  threshold: number
  duration: number // minutes - how long condition must persist
  action: 'scale_up' | 'scale_down'
}

/**
 * Scaling Action Interface
 */
export interface ScalingAction {
  id: string
  type: 'horizontal_scale' | 'vertical_scale' | 'load_balance' | 'circuit_breaker'
  parameters: {
    instanceCount?: number
    resourceMultiplier?: number
    distributionStrategy?: 'round_robin' | 'least_connections' | 'weighted'
    healthCheckInterval?: number
  }
  executionOrder: number
}

/**
 * Load Balancing Strategy Interface
 */
export interface LoadBalancingStrategy {
  id: string
  name: string
  type: 'round_robin' | 'least_connections' | 'weighted_round_robin' | 'ip_hash' | 'geographic'
  enabled: boolean
  healthCheck: {
    enabled: boolean
    interval: number // seconds
    timeout: number // seconds
    healthyThreshold: number
    unhealthyThreshold: number
    path: string
  }
  servers: LoadBalancingServer[]
}

/**
 * Load Balancing Server Interface
 */
export interface LoadBalancingServer {
  id: string
  url: string
  weight: number
  status: 'healthy' | 'unhealthy' | 'draining'
  currentConnections: number
  responseTime: number
  lastHealthCheck: string
  metadata?: Record<string, any>
}

/**
 * Capacity Planning Interface
 */
export interface CapacityPlan {
  id: string
  name: string
  timeHorizon: 'week' | 'month' | 'quarter' | 'year'
  projectedLoad: {
    requestsPerSecond: number[]
    peakHours: string[]
    seasonalFactors: Record<string, number>
  }
  resourceRequirements: {
    cpuCores: number
    memoryGB: number
    storageGB: number
    networkBandwidth: number
  }
  scalingRecommendations: {
    immediateActions: string[]
    shortTermActions: string[]
    longTermActions: string[]
  }
  costProjections: {
    currentMonthlyCost: number
    projectedMonthlyCost: number
    savingsOpportunities: string[]
  }
}

/**
 * Auto-scaling and Load Balancing Service
 * Implements automatic scaling and load balancing strategies
 * Validates Requirements 8.4
 */
export class AutoScalingService {
  private scalingConfigurations: Map<string, ScalingConfiguration> = new Map()
  private loadBalancingStrategies: Map<string, LoadBalancingStrategy> = new Map()
  private scalingHistory: Array<{
    timestamp: string
    action: string
    trigger: string
    result: string
  }> = []
  private activeScalingOperations: Set<string> = new Set()

  constructor() {
    this.initializeDefaultConfigurations()
  }

  /**
   * Initialize default scaling configurations
   */
  private initializeDefaultConfigurations(): void {
    // Default auto-scaling configuration
    const defaultScalingConfig: ScalingConfiguration = {
      id: 'default_scaling',
      name: 'Default Auto-scaling',
      enabled: true,
      cooldownPeriod: 10,
      minInstances: 2,
      maxInstances: 10,
      targetMetrics: {
        cpuUtilization: 70,
        memoryUtilization: 80,
        responseTime: 2000,
        errorRate: 0.05,
        requestsPerSecond: 100
      },
      triggers: [
        {
          id: 'cpu_scale_up',
          metric: 'cpu',
          operator: 'greater_than',
          threshold: 80,
          duration: 5,
          action: 'scale_up'
        },
        {
          id: 'cpu_scale_down',
          metric: 'cpu',
          operator: 'less_than',
          threshold: 30,
          duration: 10,
          action: 'scale_down'
        },
        {
          id: 'response_time_scale_up',
          metric: 'response_time',
          operator: 'greater_than',
          threshold: 3000,
          duration: 3,
          action: 'scale_up'
        }
      ],
      actions: [
        {
          id: 'horizontal_scale_up',
          type: 'horizontal_scale',
          parameters: {
            instanceCount: 2
          },
          executionOrder: 1
        },
        {
          id: 'load_balance_update',
          type: 'load_balance',
          parameters: {
            distributionStrategy: 'least_connections',
            healthCheckInterval: 30
          },
          executionOrder: 2
        }
      ]
    }

    // Default load balancing strategy
    const defaultLoadBalancing: LoadBalancingStrategy = {
      id: 'default_lb',
      name: 'Default Load Balancing',
      type: 'least_connections',
      enabled: true,
      healthCheck: {
        enabled: true,
        interval: 30,
        timeout: 5,
        healthyThreshold: 2,
        unhealthyThreshold: 3,
        path: '/health'
      },
      servers: [
        {
          id: 'server_1',
          url: 'https://mihasv3.pages.dev',
          weight: 100,
          status: 'healthy',
          currentConnections: 45,
          responseTime: 150,
          lastHealthCheck: new Date().toISOString()
        }
      ]
    }

    this.scalingConfigurations.set(defaultScalingConfig.id, defaultScalingConfig)
    this.loadBalancingStrategies.set(defaultLoadBalancing.id, defaultLoadBalancing)
  }

  /**
   * Start auto-scaling monitoring
   */
  startAutoScaling(checkIntervalMs: number = 60000): () => void {
    const interval = setInterval(async () => {
      try {
        await this.evaluateScalingTriggers()
      } catch (error) {
        console.error('Auto-scaling evaluation error:', error)
      }
    }, checkIntervalMs)

    return () => clearInterval(interval)
  }

  /**
   * Evaluate scaling triggers and execute actions
   */
  async evaluateScalingTriggers(): Promise<void> {
    try {
      // Get current system metrics
      const metrics = await systemMonitoringService.getSystemMetrics()

      // Check each scaling configuration
      for (const [configId, config] of this.scalingConfigurations) {
        if (!config.enabled) continue

        // Check if we're in cooldown period
        if (this.isInCooldownPeriod(configId)) {
          continue
        }

        // Evaluate triggers
        const triggeredActions = await this.evaluateConfigurationTriggers(config, metrics)

        // Execute triggered actions
        for (const action of triggeredActions) {
          await this.executeScalingAction(config, action, metrics)
        }
      }
    } catch (error) {
      console.error('Error evaluating scaling triggers:', error)
    }
  }

  /**
   * Evaluate triggers for a specific configuration
   */
  private async evaluateConfigurationTriggers(
    config: ScalingConfiguration,
    metrics: SystemMetrics
  ): Promise<ScalingAction[]> {
    const triggeredActions: ScalingAction[] = []

    for (const trigger of config.triggers) {
      const isTriggered = await this.evaluateTrigger(trigger, metrics)
      
      if (isTriggered) {
        // Find corresponding actions
        const actions = config.actions.filter(action => {
          if (trigger.action === 'scale_up') {
            return action.type === 'horizontal_scale' && (action.parameters.instanceCount || 0) > 0
          } else if (trigger.action === 'scale_down') {
            return action.type === 'horizontal_scale' && (action.parameters.instanceCount || 0) < 0
          }
          return false
        })

        triggeredActions.push(...actions)
      }
    }

    // Sort by execution order
    return triggeredActions.sort((a, b) => a.executionOrder - b.executionOrder)
  }

  /**
   * Evaluate a single trigger
   */
  private async evaluateTrigger(trigger: ScalingTrigger, metrics: SystemMetrics): Promise<boolean> {
    let currentValue: number

    switch (trigger.metric) {
      case 'cpu':
        currentValue = metrics.resourceUtilization.cpu
        break
      case 'memory':
        currentValue = metrics.resourceUtilization.memory
        break
      case 'response_time':
        currentValue = metrics.responseTime.average
        break
      case 'error_rate':
        currentValue = metrics.errorRate.rate * 100 // Convert to percentage
        break
      case 'requests_per_second':
        currentValue = metrics.throughput.requestsPerSecond
        break
      default:
        return false
    }

    // Check if condition is met
    let conditionMet = false
    switch (trigger.operator) {
      case 'greater_than':
        conditionMet = currentValue > trigger.threshold
        break
      case 'less_than':
        conditionMet = currentValue < trigger.threshold
        break
      case 'equals':
        conditionMet = Math.abs(currentValue - trigger.threshold) < 0.01
        break
    }

    // In a real implementation, we would track duration
    // For now, we'll assume the condition has persisted long enough
    return conditionMet
  }

  /**
   * Execute a scaling action
   */
  private async executeScalingAction(
    config: ScalingConfiguration,
    action: ScalingAction,
    metrics: SystemMetrics
  ): Promise<void> {
    const operationId = `${config.id}_${action.id}_${Date.now()}`
    
    try {
      this.activeScalingOperations.add(operationId)

      switch (action.type) {
        case 'horizontal_scale':
          await this.executeHorizontalScaling(action, config)
          break
        case 'vertical_scale':
          await this.executeVerticalScaling(action, config)
          break
        case 'load_balance':
          await this.updateLoadBalancing(action, config)
          break
        case 'circuit_breaker':
          await this.activateCircuitBreaker(action, config)
          break
      }

      // Record scaling action
      this.scalingHistory.push({
        timestamp: new Date().toISOString(),
        action: `${action.type}: ${JSON.stringify(action.parameters)}`,
        trigger: `Config: ${config.name}`,
        result: 'success'
      })

      console.log(`Scaling action executed: ${action.type} for config ${config.name}`)
    } catch (error) {
      console.error(`Failed to execute scaling action ${action.type}:`, error)
      
      this.scalingHistory.push({
        timestamp: new Date().toISOString(),
        action: `${action.type}: ${JSON.stringify(action.parameters)}`,
        trigger: `Config: ${config.name}`,
        result: `error: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    } finally {
      this.activeScalingOperations.delete(operationId)
    }
  }

  /**
   * Execute horizontal scaling
   */
  private async executeHorizontalScaling(action: ScalingAction, config: ScalingConfiguration): Promise<void> {
    const instanceChange = action.parameters.instanceCount || 0
    
    // In a real implementation, this would interact with cloud provider APIs
    console.log(`Horizontal scaling: ${instanceChange > 0 ? 'Adding' : 'Removing'} ${Math.abs(instanceChange)} instances`)
    
    // Simulate API call to cloud provider
    await this.simulateCloudProviderCall('horizontal_scale', {
      instanceChange,
      minInstances: config.minInstances,
      maxInstances: config.maxInstances
    })
  }

  /**
   * Execute vertical scaling
   */
  private async executeVerticalScaling(action: ScalingAction, config: ScalingConfiguration): Promise<void> {
    const resourceMultiplier = action.parameters.resourceMultiplier || 1
    
    console.log(`Vertical scaling: Adjusting resources by ${resourceMultiplier}x`)
    
    await this.simulateCloudProviderCall('vertical_scale', {
      resourceMultiplier
    })
  }

  /**
   * Update load balancing configuration
   */
  private async updateLoadBalancing(action: ScalingAction, config: ScalingConfiguration): Promise<void> {
    const strategy = action.parameters.distributionStrategy || 'round_robin'
    
    console.log(`Updating load balancing strategy to: ${strategy}`)
    
    // Update load balancing configuration
    for (const [lbId, lbConfig] of this.loadBalancingStrategies) {
      if (lbConfig.enabled) {
        lbConfig.type = strategy as any
        lbConfig.healthCheck.interval = action.parameters.healthCheckInterval || lbConfig.healthCheck.interval
      }
    }
  }

  /**
   * Activate circuit breaker
   */
  private async activateCircuitBreaker(action: ScalingAction, config: ScalingConfiguration): Promise<void> {
    console.log('Activating circuit breaker to prevent cascade failures')
    
    // In a real implementation, this would configure circuit breaker patterns
    await this.simulateCloudProviderCall('circuit_breaker', {
      enabled: true,
      failureThreshold: 5,
      timeout: 60000
    })
  }

  /**
   * Perform health checks on load balanced servers
   */
  async performHealthChecks(): Promise<void> {
    for (const [strategyId, strategy] of this.loadBalancingStrategies) {
      if (!strategy.enabled || !strategy.healthCheck.enabled) continue

      await Promise.all(strategy.servers.map(async (server) => {
        try {
          const healthStatus = await this.checkServerHealth(server, strategy.healthCheck)
          server.status = healthStatus.healthy ? 'healthy' : 'unhealthy'
          server.responseTime = healthStatus.responseTime
          server.lastHealthCheck = new Date().toISOString()
        } catch (error) {
          console.error(`Health check failed for server ${server.id}:`, error)
          server.status = 'unhealthy'
          server.lastHealthCheck = new Date().toISOString()
        }
      }))
    }
  }

  /**
   * Check individual server health
   */
  private async checkServerHealth(
    server: LoadBalancingServer,
    healthCheck: LoadBalancingStrategy['healthCheck']
  ): Promise<{ healthy: boolean; responseTime: number }> {
    const startTime = Date.now()
    
    try {
      // Simulate health check
      const response = await fetch(`${server.url}${healthCheck.path}`, {
        method: 'GET',
        timeout: healthCheck.timeout * 1000
      })
      
      const responseTime = Date.now() - startTime
      const healthy = response.ok && responseTime < healthCheck.timeout * 1000
      
      return { healthy, responseTime }
    } catch (error) {
      return { healthy: false, responseTime: Date.now() - startTime }
    }
  }

  /**
   * Generate capacity planning recommendations
   */
  async generateCapacityPlan(timeHorizon: 'week' | 'month' | 'quarter' | 'year'): Promise<CapacityPlan> {
    try {
      // Get historical metrics for trend analysis
      const historicalMetrics = await this.getHistoricalMetrics(timeHorizon)
      
      // Analyze trends and project future load
      const projectedLoad = this.projectFutureLoad(historicalMetrics, timeHorizon)
      
      // Calculate resource requirements
      const resourceRequirements = this.calculateResourceRequirements(projectedLoad)
      
      // Generate scaling recommendations
      const scalingRecommendations = this.generateScalingRecommendations(projectedLoad, resourceRequirements)
      
      // Calculate cost projections
      const costProjections = this.calculateCostProjections(resourceRequirements)

      return {
        id: `capacity_plan_${Date.now()}`,
        name: `Capacity Plan - ${timeHorizon}`,
        timeHorizon,
        projectedLoad,
        resourceRequirements,
        scalingRecommendations,
        costProjections
      }
    } catch (error) {
      console.error('Error generating capacity plan:', error)
      throw new Error(`Capacity planning failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get load balancing statistics
   */
  async getLoadBalancingStats(): Promise<{
    strategies: LoadBalancingStrategy[]
    overallHealth: 'healthy' | 'degraded' | 'critical'
    totalServers: number
    healthyServers: number
    averageResponseTime: number
    requestDistribution: Record<string, number>
  }> {
    const strategies = Array.from(this.loadBalancingStrategies.values())
    const allServers = strategies.flatMap(s => s.servers)
    const healthyServers = allServers.filter(s => s.status === 'healthy')
    
    const averageResponseTime = allServers.length > 0 
      ? allServers.reduce((sum, s) => sum + s.responseTime, 0) / allServers.length
      : 0

    const healthRatio = allServers.length > 0 ? healthyServers.length / allServers.length : 1
    const overallHealth = healthRatio >= 0.8 ? 'healthy' : healthRatio >= 0.5 ? 'degraded' : 'critical'

    // Simulate request distribution
    const requestDistribution: Record<string, number> = {}
    allServers.forEach(server => {
      requestDistribution[server.id] = Math.floor(Math.random() * 100) + 50
    })

    return {
      strategies,
      overallHealth,
      totalServers: allServers.length,
      healthyServers: healthyServers.length,
      averageResponseTime: Math.round(averageResponseTime),
      requestDistribution
    }
  }

  /**
   * Get scaling history
   */
  getScalingHistory(limit: number = 50): Array<{
    timestamp: string
    action: string
    trigger: string
    result: string
  }> {
    return this.scalingHistory
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  /**
   * Helper methods
   */
  private isInCooldownPeriod(configId: string): boolean {
    const lastAction = this.scalingHistory
      .filter(action => action.trigger.includes(configId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]

    if (!lastAction) return false

    const config = this.scalingConfigurations.get(configId)
    if (!config) return false

    const cooldownMs = config.cooldownPeriod * 60 * 1000
    const timeSinceLastAction = Date.now() - new Date(lastAction.timestamp).getTime()

    return timeSinceLastAction < cooldownMs
  }

  private async simulateCloudProviderCall(operation: string, parameters: any): Promise<void> {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    console.log(`Cloud provider API call: ${operation}`, parameters)
  }

  private async getHistoricalMetrics(timeHorizon: string): Promise<any[]> {
    // In a real implementation, this would fetch historical data
    return []
  }

  private projectFutureLoad(historicalMetrics: any[], timeHorizon: string): CapacityPlan['projectedLoad'] {
    // Simplified projection logic
    return {
      requestsPerSecond: [100, 120, 150, 180, 200],
      peakHours: ['09:00', '12:00', '15:00', '18:00'],
      seasonalFactors: {
        'application_season': 2.5,
        'exam_period': 1.8,
        'holiday': 0.6
      }
    }
  }

  private calculateResourceRequirements(projectedLoad: CapacityPlan['projectedLoad']): CapacityPlan['resourceRequirements'] {
    const maxRPS = Math.max(...projectedLoad.requestsPerSecond)
    
    return {
      cpuCores: Math.ceil(maxRPS / 50), // Rough estimate: 50 RPS per core
      memoryGB: Math.ceil(maxRPS / 25), // Rough estimate: 25 RPS per GB
      storageGB: 100 + Math.ceil(maxRPS * 0.1), // Base + growth
      networkBandwidth: maxRPS * 10 // 10 Mbps per RPS
    }
  }

  private generateScalingRecommendations(
    projectedLoad: CapacityPlan['projectedLoad'],
    resourceRequirements: CapacityPlan['resourceRequirements']
  ): CapacityPlan['scalingRecommendations'] {
    return {
      immediateActions: [
        'Monitor current resource utilization',
        'Set up auto-scaling triggers',
        'Configure health checks'
      ],
      shortTermActions: [
        'Implement horizontal scaling policies',
        'Optimize database queries',
        'Add CDN for static assets'
      ],
      longTermActions: [
        'Consider microservices architecture',
        'Implement caching strategies',
        'Plan for geographic distribution'
      ]
    }
  }

  private calculateCostProjections(resourceRequirements: CapacityPlan['resourceRequirements']): CapacityPlan['costProjections'] {
    // Simplified cost calculation
    const currentMonthlyCost = 500 // Base cost
    const projectedMonthlyCost = currentMonthlyCost + (resourceRequirements.cpuCores * 50) + (resourceRequirements.memoryGB * 20)
    
    return {
      currentMonthlyCost,
      projectedMonthlyCost,
      savingsOpportunities: [
        'Use reserved instances for predictable workloads',
        'Implement auto-scaling to reduce idle resources',
        'Optimize resource allocation based on usage patterns'
      ]
    }
  }
}

export const autoScalingService = new AutoScalingService()