/**
 * Metrics Tracking Service - STUBBED
 * 
 * Comprehensive metrics tracking was removed during Vercel migration.
 * These functions return empty/default data to maintain API compatibility
 * without making network requests to non-existent endpoints.
 */

import type { 
  ComprehensiveMetrics, 
  MetricsQuery, 
  MetricsCalculationResult,
  ApplicationMetrics,
  ProgramMetrics,
  ProcessingTimeMetrics,
  ConversionMetrics
} from '@/types/analytics'

class MetricsTrackingService {
  async getComprehensiveMetrics(_query: MetricsQuery): Promise<MetricsCalculationResult> {
    return {
      success: true,
      data: {} as ComprehensiveMetrics,
      calculationTime: 0
    }
  }

  async getApplicationMetrics(_timeRange: MetricsQuery['timeRange']): Promise<ApplicationMetrics> {
    return {} as ApplicationMetrics
  }

  async getProgramMetrics(_timeRange: MetricsQuery['timeRange'], _programs?: string[]): Promise<ProgramMetrics[]> {
    return []
  }

  async getProcessingTimeMetrics(_timeRange: MetricsQuery['timeRange']): Promise<ProcessingTimeMetrics> {
    return {} as ProcessingTimeMetrics
  }

  async getConversionMetrics(_timeRange: MetricsQuery['timeRange']): Promise<ConversionMetrics> {
    return {} as ConversionMetrics
  }

  async trackApplicationEvent(_event: {
    applicationId: string
    eventType: 'created' | 'submitted' | 'reviewed' | 'approved' | 'rejected'
    programId: string
    userId: string
    timestamp?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    // No-op: metrics tracking removed
  }

  async getRealTimeMetrics(): Promise<{
    activeApplications: number
    todaySubmissions: number
    pendingReviews: number
    averageProcessingTime: number
    systemLoad: number
  }> {
    return {
      activeApplications: 0,
      todaySubmissions: 0,
      pendingReviews: 0,
      averageProcessingTime: 0,
      systemLoad: 0
    }
  }
}

export const metricsTrackingService = new MetricsTrackingService()
