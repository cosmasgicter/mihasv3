// Analytics and Metrics Types for MIHAS System

export interface ApplicationMetrics {
  totalApplications: number
  completedApplications: number
  pendingApplications: number
  approvedApplications: number
  rejectedApplications: number
  completionRate: number
  approvalRate: number
  rejectionRate: number
}

export interface ProgramMetrics {
  programId: string
  programName: string
  totalApplications: number
  completedApplications: number
  approvedApplications: number
  rejectedApplications: number
  completionRate: number
  approvalRate: number
  averageProcessingTime: number // in days
}

export interface ProcessingTimeMetrics {
  averageSubmissionToReview: number // in hours
  averageReviewToDecision: number // in hours
  averageOverallProcessing: number // in hours
  medianProcessingTime: number // in hours
  percentile95ProcessingTime: number // in hours
}

export interface ConversionMetrics {
  registrationToApplication: number // percentage
  applicationToSubmission: number // percentage
  submissionToApproval: number // percentage
  overallConversionRate: number // percentage
}

export interface TimeSeriesDataPoint {
  timestamp: string
  value: number
  label?: string
}

export interface MetricsTimeRange {
  startDate: string
  endDate: string
  granularity: 'hour' | 'day' | 'week' | 'month'
}

export interface ComprehensiveMetrics {
  applicationMetrics: ApplicationMetrics
  programMetrics: ProgramMetrics[]
  processingTimeMetrics: ProcessingTimeMetrics
  conversionMetrics: ConversionMetrics
  timeSeriesData: {
    applications: TimeSeriesDataPoint[]
    approvals: TimeSeriesDataPoint[]
    processingTimes: TimeSeriesDataPoint[]
  }
  generatedAt: string
  timeRange: MetricsTimeRange
}

export interface MetricsQuery {
  timeRange: MetricsTimeRange
  programs?: string[]
  includeTimeSeries?: boolean
  includeProcessingTimes?: boolean
}

export interface MetricsCalculationResult {
  success: boolean
  data?: ComprehensiveMetrics
  error?: string
  calculationTime: number // in milliseconds
}