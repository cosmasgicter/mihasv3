import { apiClient } from './client'
import type { 
  PredictiveAnalyticsResult,
  PredictionRequest,
  ApplicationVolumePrediction,
  ProcessingCapacityPrediction,
  TrendForecast,
  CapacityPlanningRecommendation,
  ModelTrainingResult,
  PredictionModel
} from '@/types/predictive'

/**
 * Predictive Analytics Service
 * Analyzes historical data for trend forecasting and capacity planning
 * Validates Requirements 5.3
 */
class PredictiveAnalyticsService {
  /**
   * Generate comprehensive predictive analytics report
   */
  async generatePredictiveAnalytics(request: PredictionRequest): Promise<PredictiveAnalyticsResult> {
    const response = await apiClient.request('/analytics/predictive/generate', {
      method: 'POST',
      body: JSON.stringify(request)
    })
    
    return response as PredictiveAnalyticsResult
  }

  /**
   * Predict future application volumes based on historical data
   */
  async predictApplicationVolume(timeHorizon: string, includeSeasonality = true): Promise<ApplicationVolumePrediction> {
    const response = await apiClient.request('/analytics/predictive/application-volume', {
      method: 'POST',
      body: JSON.stringify({ timeHorizon, includeSeasonality })
    })
    
    return response as ApplicationVolumePrediction
  }

  /**
   * Predict processing capacity needs and identify bottlenecks
   */
  async predictProcessingCapacity(timeHorizon: string): Promise<ProcessingCapacityPrediction> {
    const response = await apiClient.request('/analytics/predictive/processing-capacity', {
      method: 'POST',
      body: JSON.stringify({ timeHorizon })
    })
    
    return response as ProcessingCapacityPrediction
  }

  /**
   * Generate trend forecasts for specific metrics
   */
  async generateTrendForecasts(metrics: string[], timeHorizon: string): Promise<TrendForecast[]> {
    const response = await apiClient.request('/analytics/predictive/trend-forecasts', {
      method: 'POST',
      body: JSON.stringify({ metrics, timeHorizon })
    })
    
    return response as TrendForecast[]
  }

  /**
   * Generate capacity planning recommendations
   */
  async generateCapacityRecommendations(currentMetrics: any): Promise<CapacityPlanningRecommendation[]> {
    const response = await apiClient.request('/analytics/predictive/capacity-recommendations', {
      method: 'POST',
      body: JSON.stringify({ currentMetrics })
    })
    
    return response as CapacityPlanningRecommendation[]
  }

  /**
   * Train prediction models with historical data
   */
  async trainPredictionModels(modelTypes: string[]): Promise<ModelTrainingResult[]> {
    const response = await apiClient.request('/analytics/predictive/train-models', {
      method: 'POST',
      body: JSON.stringify({ modelTypes })
    })
    
    return response as ModelTrainingResult[]
  }

  /**
   * Get available prediction models and their status
   */
  async getPredictionModels(): Promise<PredictionModel[]> {
    const response = await apiClient.request('/analytics/predictive/models')
    return response as PredictionModel[]
  }

  /**
   * Get model accuracy metrics and validation results
   */
  async getModelAccuracy(modelId: string): Promise<{
    accuracy: number
    validationMetrics: any
    lastValidated: string
  }> {
    const response = await apiClient.request(`/analytics/predictive/models/${modelId}/accuracy`)
    return response
  }

  /**
   * Analyze seasonal patterns in historical data
   */
  async analyzeSeasonalPatterns(metric: string, years = 2): Promise<{
    seasonality: {
      detected: boolean
      pattern: string
      strength: number
    }
    monthlyFactors: { month: number; factor: number }[]
    yearlyTrend: { year: number; growth: number }[]
  }> {
    const response = await apiClient.request('/analytics/predictive/seasonal-analysis', {
      method: 'POST',
      body: JSON.stringify({ metric, years })
    })
    
    return response
  }

  /**
   * Detect anomalies and change points in time series data
   */
  async detectAnomalies(metric: string, sensitivity = 0.95): Promise<{
    anomalies: {
      timestamp: string
      value: number
      expectedValue: number
      severity: 'low' | 'medium' | 'high'
    }[]
    changePoints: {
      timestamp: string
      significance: number
      description: string
    }[]
  }> {
    const response = await apiClient.request('/analytics/predictive/anomaly-detection', {
      method: 'POST',
      body: JSON.stringify({ metric, sensitivity })
    })
    
    return response
  }

  /**
   * Generate what-if scenarios for capacity planning
   */
  async generateWhatIfScenarios(scenarios: {
    name: string
    parameters: Record<string, number>
  }[]): Promise<{
    scenario: string
    predictions: {
      metric: string
      currentValue: number
      predictedValue: number
      impact: number
    }[]
    recommendations: string[]
  }[]> {
    const response = await apiClient.request('/analytics/predictive/what-if-scenarios', {
      method: 'POST',
      body: JSON.stringify({ scenarios })
    })
    
    return response
  }

  /**
   * Get real-time prediction updates
   */
  async getRealTimePredictions(): Promise<{
    nextWeekApplications: number
    nextMonthApplications: number
    capacityUtilization: number
    bottleneckAlerts: string[]
    lastUpdated: string
  }> {
    const response = await apiClient.request('/analytics/predictive/realtime')
    return response
  }
}

export const predictiveAnalyticsService = new PredictiveAnalyticsService()