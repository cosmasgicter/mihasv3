// Predictive Analytics Types for MIHAS System

export interface PredictionModel {
  id: string
  name: string
  type: 'linear_regression' | 'time_series' | 'seasonal' | 'trend_analysis'
  description: string
  accuracy: number // 0-100 percentage
  lastTrained: string
  trainingDataPoints: number
  status: 'active' | 'training' | 'inactive' | 'error'
}

export interface ApplicationVolumePrediction {
  predictedVolume: number
  confidenceInterval: {
    lower: number
    upper: number
  }
  confidence: number // 0-100 percentage
  timeframe: string // e.g., "next_month", "next_quarter"
  breakdown: {
    program: string
    predictedApplications: number
    confidence: number
  }[]
  seasonalFactors: {
    month: number
    multiplier: number
  }[]
}

export interface ProcessingCapacityPrediction {
  currentCapacity: number
  predictedDemand: number
  capacityUtilization: number // percentage
  bottlenecks: {
    stage: string
    currentThroughput: number
    predictedDemand: number
    utilizationRate: number
  }[]
  recommendations: {
    type: 'increase_staff' | 'optimize_process' | 'redistribute_workload'
    priority: 'high' | 'medium' | 'low'
    description: string
    estimatedImpact: number
  }[]
}

export interface TrendForecast {
  metric: string
  currentValue: number
  predictedValues: {
    timeframe: string
    value: number
    confidence: number
  }[]
  trendDirection: 'increasing' | 'decreasing' | 'stable' | 'volatile'
  seasonality: {
    detected: boolean
    pattern: 'monthly' | 'quarterly' | 'yearly' | 'none'
    strength: number // 0-1
  }
  changePoints: {
    date: string
    significance: number
    description: string
  }[]
}

export interface CapacityPlanningRecommendation {
  id: string
  title: string
  description: string
  type: 'staffing' | 'infrastructure' | 'process' | 'technology'
  priority: 'critical' | 'high' | 'medium' | 'low'
  timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term'
  estimatedCost: number
  expectedBenefit: string
  riskLevel: 'low' | 'medium' | 'high'
  implementation: {
    steps: string[]
    duration: string
    resources: string[]
  }
}

export interface PredictiveAnalyticsResult {
  id: string
  generatedAt: string
  timeHorizon: string
  applicationVolumePrediction: ApplicationVolumePrediction
  processingCapacityPrediction: ProcessingCapacityPrediction
  trendForecasts: TrendForecast[]
  capacityRecommendations: CapacityPlanningRecommendation[]
  modelAccuracy: {
    overall: number
    byMetric: Record<string, number>
  }
  dataQuality: {
    completeness: number
    consistency: number
    recency: number
  }
}

export interface PredictionRequest {
  timeHorizon: 'week' | 'month' | 'quarter' | 'year'
  metrics: string[]
  includeSeasonality: boolean
  includeCapacityPlanning: boolean
  confidenceLevel: number // 0.8, 0.9, 0.95, 0.99
}

export interface HistoricalDataPoint {
  timestamp: string
  metric: string
  value: number
  metadata?: Record<string, any>
}

export interface ModelTrainingResult {
  modelId: string
  accuracy: number
  trainingTime: number
  dataPoints: number
  validationMetrics: {
    mse: number // Mean Squared Error
    mae: number // Mean Absolute Error
    r2: number // R-squared
  }
  featureImportance: {
    feature: string
    importance: number
  }[]
}