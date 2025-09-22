import { supabase } from './supabase'
import { sanitizeForLog } from './security'

export interface PredictiveDashboardApiMetrics {
  avgAdmissionProbability?: number
  totalApplications?: number
  avgProcessingTime?: number
  efficiency?: number
  applicationTrend?: string
  peakTimes?: string[]
  bottlenecks?: string[]
  generatedAt?: string | null
}

export interface PredictiveDashboardWorkflowMetrics {
  totalExecutions?: number
  successfulExecutions?: number
  failedExecutions?: number
  ruleStats?: Record<string, number>
  generatedAt?: string | null
}

export interface PredictiveDashboardApiResponse {
  predictive?: PredictiveDashboardApiMetrics
  workflow?: PredictiveDashboardWorkflowMetrics
  generatedAt?: string
  source?: {
    predictive?: string | null
    workflow?: string | null
  }
}

export async function fetchPredictiveDashboardMetrics(): Promise<PredictiveDashboardApiResponse | null> {
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError) {
      console.error('Failed to resolve session for predictive dashboard:', sanitizeForLog(sessionError.message))
      return null
    }

    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      return null
    }

    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const response = await fetch(`${apiBase}/api/analytics/predictive-dashboard`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      console.error('Predictive dashboard API returned an error:', response.status, response.statusText)
      return null
    }

    const payload = await response.json()
    return payload as PredictiveDashboardApiResponse
  } catch (error) {
    console.error('Predictive dashboard API fetch failed:', sanitizeForLog(error instanceof Error ? error.message : String(error)))
    return null
  }
}
