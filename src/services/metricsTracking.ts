import { apiClient } from './client'
import type { 
  ComprehensiveMetrics, 
  MetricsQuery, 
  MetricsCalculationResult,
  ApplicationMetrics,
  ProgramMetrics,
  ProcessingTimeMetrics,
  ConversionMetrics
} from '@/types/analytics'

/**
 * Comprehensive Metrics Tracking Service
 * Tracks application completion rates, processing times, and success metrics
 * Validates Requirements 5.1
 */
class MetricsTrackingService {
  /**
   * Get comprehensive metrics for the specified time range and filters
   */
  async getComprehensiveMetrics(query: MetricsQuery): Promise<MetricsCalculationResult> {
    try {
      const startTime = Date.now()
      
      const response = await apiClient.request('/analytics/comprehensive-metrics', {
        method: 'POST',
        body: JSON.stringify(query)
      })
      
      const calculationTime = Date.now() - startTime
      
      return {
        success: true,
        data: response as ComprehensiveMetrics,
        calculationTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate metrics',
        calculationTime: Date.now() - Date.now()
      }
    }
  }

  /**
   * Get application completion rates across all programs
   */
  async getApplicationMetrics(timeRange: MetricsQuery['timeRange']): Promise<ApplicationMetrics> {
    const response = await apiClient.request('/analytics/application-metrics', {
      method: 'POST',
      body: JSON.stringify({ timeRange })
    })
    
    return response as ApplicationMetrics
  }

  /**
   * Get program-specific metrics and completion rates
   */
  async getProgramMetrics(timeRange: MetricsQuery['timeRange'], programs?: string[]): Promise<ProgramMetrics[]> {
    const response = await apiClient.request('/analytics/program-metrics', {
      method: 'POST',
      body: JSON.stringify({ timeRange, programs })
    })
    
    return response as ProgramMetrics[]
  }

  /**
   * Get processing time metrics from submission to decision
   */
  async getProcessingTimeMetrics(timeRange: MetricsQuery['timeRange']): Promise<ProcessingTimeMetrics> {
    const response = await apiClient.request('/analytics/processing-time-metrics', {
      method: 'POST',
      body: JSON.stringify({ timeRange })
    })
    
    return response as ProcessingTimeMetrics
  }

  /**
   * Get conversion metrics and success rates
   */
  async getConversionMetrics(timeRange: MetricsQuery['timeRange']): Promise<ConversionMetrics> {
    const response = await apiClient.request('/analytics/conversion-metrics', {
      method: 'POST',
      body: JSON.stringify({ timeRange })
    })
    
    return response as ConversionMetrics
  }

  /**
   * Track a new application event for metrics calculation
   */
  async trackApplicationEvent(event: {
    applicationId: string
    eventType: 'created' | 'submitted' | 'reviewed' | 'approved' | 'rejected'
    programId: string
    userId: string
    timestamp?: string
    metadata?: Record<string, any>
  }): Promise<void> {
    await apiClient.request('/analytics/track-event', {
      method: 'POST',
      body: JSON.stringify({
        ...event,
        timestamp: event.timestamp || new Date().toISOString()
      })
    })
  }

  /**
   * Get real-time metrics summary for dashboard display
   */
  async getRealTimeMetrics(): Promise<{
    activeApplications: number
    todaySubmissions: number
    pendingReviews: number
    averageProcessingTime: number
    systemLoad: number
  }> {
    const response = await apiClient.request('/analytics/realtime-metrics')
    return response
  }
}

export const metricsTrackingService = new MetricsTrackingService()